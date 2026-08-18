import { randomUUID } from "node:crypto";

const ACTIVE_STATUSES = new Set(["queued", "processing"]);

function mapRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    userId: row.user_id,
    type: row.type,
    status: row.status,
    stage: row.stage,
    progress: Number(row.progress) || 0,
    payload: row.payload || {},
    result: row.result || null,
    error: row.error || null,
    errorCode: row.error_code || null,
    attempts: Number(row.attempts) || 0,
    consumedAt: row.consumed_at || null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    expiresAt: row.expires_at
  };
}

export function publicAiJob(job) {
  if (!job) return null;
  return {
    id: job.id,
    type: job.type,
    status: job.status,
    stage: job.stage,
    progress: job.progress,
    result: job.status === "completed" ? job.result : null,
    error: job.status === "failed" ? job.error : null,
    errorCode: job.status === "failed" ? job.errorCode : null,
    createdAt: job.createdAt,
    updatedAt: job.updatedAt
  };
}

export class AiJobRepository {
  constructor({ database, ttlMs = 24 * 60 * 60 * 1000 } = {}) {
    this.database = database;
    this.ttlMs = ttlMs;
    this.jobs = new Map();
  }

  async create({ userId, type, payload }) {
    const id = randomUUID();
    const now = new Date();
    const expiresAt = new Date(now.getTime() + this.ttlMs);
    if (this.database) {
      const result = await this.database.query(`
        INSERT INTO ai_jobs (id, user_id, type, payload, expires_at)
        VALUES ($1, $2, $3, $4::jsonb, $5)
        RETURNING *
      `, [id, userId, type, JSON.stringify(payload || {}), expiresAt]);
      return mapRow(result.rows[0]);
    }
    const job = {
      id, userId, type, status: "queued", stage: "queued", progress: 5,
      payload: payload || {}, result: null, error: null, errorCode: null,
      attempts: 0, consumedAt: null, createdAt: now.toISOString(),
      updatedAt: now.toISOString(), expiresAt: expiresAt.toISOString()
    };
    this.jobs.set(id, job);
    return job;
  }

  async get(id, userId = null) {
    if (this.database) {
      const params = [id];
      const owner = userId ? " AND user_id = $2" : "";
      if (userId) params.push(userId);
      const result = await this.database.query(`SELECT * FROM ai_jobs WHERE id = $1${owner}`, params);
      return mapRow(result.rows[0]);
    }
    const job = this.jobs.get(id) || null;
    return job && (!userId || job.userId === userId) ? job : null;
  }

  async findRunning(userId, type) {
    if (this.database) {
      const result = await this.database.query(`
        SELECT * FROM ai_jobs
        WHERE user_id = $1 AND type = $2 AND status IN ('queued', 'processing')
          AND consumed_at IS NULL AND expires_at > now()
        ORDER BY created_at DESC LIMIT 1
      `, [userId, type]);
      return mapRow(result.rows[0]);
    }
    return [...this.jobs.values()]
      .filter((job) => job.userId === userId && job.type === type && ACTIVE_STATUSES.has(job.status) && !job.consumedAt && new Date(job.expiresAt) > new Date())
      .sort((left, right) => new Date(right.createdAt) - new Date(left.createdAt))[0] || null;
  }

  async findLatestRecoverable(userId, type) {
    if (this.database) {
      const result = await this.database.query(`
        SELECT * FROM ai_jobs
        WHERE user_id = $1 AND type = $2 AND consumed_at IS NULL AND expires_at > now()
        ORDER BY created_at DESC LIMIT 1
      `, [userId, type]);
      return mapRow(result.rows[0]);
    }
    return [...this.jobs.values()]
      .filter((job) => job.userId === userId && job.type === type && !job.consumedAt && new Date(job.expiresAt) > new Date())
      .sort((left, right) => new Date(right.createdAt) - new Date(left.createdAt))[0] || null;
  }

  async claim(id) {
    if (this.database) {
      const result = await this.database.query(`
        UPDATE ai_jobs SET status = 'processing', stage = 'model', progress = 35,
          attempts = attempts + 1, updated_at = now()
        WHERE id = $1 AND status = 'queued' AND consumed_at IS NULL AND expires_at > now()
        RETURNING *
      `, [id]);
      return mapRow(result.rows[0]);
    }
    const job = this.jobs.get(id);
    if (!job || job.status !== "queued" || job.consumedAt || new Date(job.expiresAt) <= new Date()) return null;
    Object.assign(job, { status: "processing", stage: "model", progress: 35, attempts: job.attempts + 1, updatedAt: new Date().toISOString() });
    return job;
  }

  async complete(id, resultValue) {
    if (this.database) {
      const result = await this.database.query(`
        UPDATE ai_jobs SET status = 'completed', stage = 'completed', progress = 100,
          result = $2::jsonb, payload = '{}'::jsonb, error = NULL, error_code = NULL, updated_at = now()
        WHERE id = $1 RETURNING *
      `, [id, JSON.stringify(resultValue || {})]);
      return mapRow(result.rows[0]);
    }
    const job = this.jobs.get(id);
    if (!job) return null;
    Object.assign(job, { status: "completed", stage: "completed", progress: 100, payload: {}, result: resultValue || {}, error: null, errorCode: null, updatedAt: new Date().toISOString() });
    return job;
  }

  async updateProgress(id, stage, progress) {
    const safeStage = String(stage || "processing").slice(0, 40);
    const safeProgress = Math.min(99, Math.max(0, Number(progress) || 0));
    if (this.database) {
      const result = await this.database.query(`
        UPDATE ai_jobs SET stage = $2, progress = $3, updated_at = now()
        WHERE id = $1 AND status = 'processing' RETURNING *
      `, [id, safeStage, safeProgress]);
      return mapRow(result.rows[0]);
    }
    const job = this.jobs.get(id);
    if (!job || job.status !== "processing") return null;
    Object.assign(job, { stage: safeStage, progress: safeProgress, updatedAt: new Date().toISOString() });
    return job;
  }

  async fail(id, error, errorCode = "ai_job_failed") {
    const message = String(error || "AI 任务失败").slice(0, 500);
    const code = String(errorCode || "ai_job_failed").slice(0, 80);
    if (this.database) {
      const result = await this.database.query(`
        UPDATE ai_jobs SET status = 'failed', stage = 'failed', progress = 100,
          payload = '{}'::jsonb, error = $2, error_code = $3, updated_at = now()
        WHERE id = $1 RETURNING *
      `, [id, message, code]);
      return mapRow(result.rows[0]);
    }
    const job = this.jobs.get(id);
    if (!job) return null;
    Object.assign(job, { status: "failed", stage: "failed", progress: 100, payload: {}, error: message, errorCode: code, updatedAt: new Date().toISOString() });
    return job;
  }

  async consume(id, userId) {
    if (this.database) {
      const result = await this.database.query(`
        UPDATE ai_jobs SET consumed_at = COALESCE(consumed_at, now()), updated_at = now()
        WHERE id = $1 AND user_id = $2 RETURNING *
      `, [id, userId]);
      return mapRow(result.rows[0]);
    }
    const job = await this.get(id, userId);
    if (!job) return null;
    job.consumedAt ||= new Date().toISOString();
    job.updatedAt = new Date().toISOString();
    return job;
  }

  async listRunnable() {
    if (this.database) {
      await this.database.query(`
        UPDATE ai_jobs SET status = 'queued', stage = 'queued', progress = 5, updated_at = now()
        WHERE status = 'processing' AND updated_at < now() - interval '5 minutes'
          AND consumed_at IS NULL AND expires_at > now()
      `);
      const result = await this.database.query(`
        SELECT * FROM ai_jobs WHERE status = 'queued' AND consumed_at IS NULL AND expires_at > now()
        ORDER BY created_at ASC LIMIT 50
      `);
      return result.rows.map(mapRow);
    }
    return [...this.jobs.values()].filter((job) => job.status === "queued" && !job.consumedAt && new Date(job.expiresAt) > new Date());
  }

  async cleanup() {
    if (this.database) {
      await this.database.query("DELETE FROM ai_jobs WHERE expires_at <= now()");
      return;
    }
    const now = new Date();
    for (const [id, job] of this.jobs) if (new Date(job.expiresAt) <= now) this.jobs.delete(id);
  }
}
