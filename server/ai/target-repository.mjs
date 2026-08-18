import { randomUUID } from "node:crypto";

function publicSession(value) {
  if (!value) return null;
  return {
    id: value.id, resumeId: value.resumeId, baseRevision: value.baseRevision,
    jobDescription: value.jobDescription, target: value.target || {}, diagnosis: value.diagnosis || {},
    plan: value.plan || [], status: value.status, createdAt: value.createdAt, updatedAt: value.updatedAt
  };
}

export class TargetAgentRepository {
  constructor({ database }) {
    this.database = database;
    this.sessions = new Map();
    this.versions = new Map();
    this.changes = new Map();
  }

  async createSession({ resumeId, ownerId, baseRevision, jobDescription, diagnosis }) {
    const id = randomUUID();
    const now = new Date().toISOString();
    const value = { id, resumeId, ownerId, baseRevision, jobDescription, target: diagnosis.target || {}, diagnosis, plan: diagnosis.plan || [], status: "awaiting_plan_approval", createdAt: now, updatedAt: now };
    if (this.database) {
      await this.database.query(`INSERT INTO target_sessions (id,resume_id,owner_id,base_revision,job_description,target_profile,diagnosis,plan,status) VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7::jsonb,$8::jsonb,$9)`, [id, resumeId, ownerId, baseRevision, jobDescription, JSON.stringify(value.target), JSON.stringify(diagnosis), JSON.stringify(value.plan), value.status]);
    } else this.sessions.set(id, value);
    return publicSession(value);
  }

  async getSession(id, ownerId) {
    if (!this.database) {
      const value = this.sessions.get(id);
      return value && value.ownerId === ownerId ? publicSession(value) : null;
    }
    const result = await this.database.query(`SELECT id,resume_id,base_revision,job_description,target_profile,diagnosis,plan,status,created_at,updated_at FROM target_sessions WHERE id=$1 AND owner_id=$2`, [id, ownerId]);
    const row = result.rows[0];
    return row ? publicSession({ id: row.id, resumeId: row.resume_id, baseRevision: row.base_revision, jobDescription: row.job_description, target: row.target_profile, diagnosis: row.diagnosis, plan: row.plan, status: row.status, createdAt: row.created_at, updatedAt: row.updated_at }) : null;
  }

  async latest(resumeId, ownerId) {
    if (!this.database) {
      return [...this.sessions.values()].filter((value) => value.resumeId === resumeId && value.ownerId === ownerId && value.status !== "cancelled").sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt)).map(publicSession)[0] || null;
    }
    const result = await this.database.query(`SELECT id FROM target_sessions WHERE resume_id=$1 AND owner_id=$2 AND status <> 'cancelled' ORDER BY updated_at DESC LIMIT 1`, [resumeId, ownerId]);
    return result.rows[0] ? this.getSession(result.rows[0].id, ownerId) : null;
  }

  async updateSession(id, ownerId, { plan, status, diagnosis }) {
    if (!this.database) {
      const value = this.sessions.get(id);
      if (!value || value.ownerId !== ownerId) return null;
      if (plan) value.plan = plan;
      if (status) value.status = status;
      if (diagnosis) value.diagnosis = diagnosis;
      value.updatedAt = new Date().toISOString();
      return publicSession(value);
    }
    const result = await this.database.query(`UPDATE target_sessions SET plan=COALESCE($3::jsonb,plan),diagnosis=COALESCE($4::jsonb,diagnosis),status=COALESCE($5,status),updated_at=now() WHERE id=$1 AND owner_id=$2 RETURNING id`, [id, ownerId, plan ? JSON.stringify(plan) : null, diagnosis ? JSON.stringify(diagnosis) : null, status || null]);
    return result.rows[0] ? this.getSession(id, ownerId) : null;
  }

  async createVersion({ resumeId, revision, sessionId = null, label, createdBy, data, changeSet = [] }) {
    const id = randomUUID();
    const now = new Date().toISOString();
    const value = { id, resumeId, revision, sessionId, label, createdBy, data, changeSet, createdAt: now };
    if (this.database) await this.database.query(`INSERT INTO resume_versions (id,resume_id,revision,target_session_id,label,created_by,data,change_set) VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb,$8::jsonb)`, [id, resumeId, revision, sessionId, label, createdBy, JSON.stringify(data), JSON.stringify(changeSet)]);
    else this.versions.set(id, value);
    return value;
  }

  async listVersions(resumeId) {
    if (!this.database) return [...this.versions.values()].filter((value) => value.resumeId === resumeId).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    const result = await this.database.query(`SELECT id,resume_id,revision,target_session_id,label,created_by,data,change_set,created_at FROM resume_versions WHERE resume_id=$1 ORDER BY created_at DESC LIMIT 100`, [resumeId]);
    return result.rows.map((row) => ({ id: row.id, resumeId: row.resume_id, revision: row.revision, sessionId: row.target_session_id, label: row.label, createdBy: row.created_by, data: row.data, changeSet: row.change_set, createdAt: row.created_at }));
  }

  async recordChange({ sessionId, planItemId, patch, evidenceRefs = [] }) {
    const id = randomUUID();
    const value = { id, sessionId, planItemId, status: "proposed", patch, evidenceRefs, createdAt: new Date().toISOString() };
    if (this.database) await this.database.query(`INSERT INTO target_plan_changes (id,target_session_id,plan_item_id,forward_patch,evidence_refs) VALUES ($1,$2,$3,$4::jsonb,$5::jsonb) ON CONFLICT (target_session_id,plan_item_id) DO UPDATE SET forward_patch=EXCLUDED.forward_patch,evidence_refs=EXCLUDED.evidence_refs,status='proposed',updated_at=now()`, [id, sessionId, planItemId, JSON.stringify(patch), JSON.stringify(evidenceRefs)]);
    else this.changes.set(`${sessionId}:${planItemId}`, value);
    return value;
  }

  async setChangeStatus(sessionId, planItemId, status) {
    if (this.database) await this.database.query(`UPDATE target_plan_changes SET status=$3,updated_at=now() WHERE target_session_id=$1 AND plan_item_id=$2`, [sessionId, planItemId, status]);
    else { const value = this.changes.get(`${sessionId}:${planItemId}`); if (value) value.status = status; }
  }
}

export { publicSession };
