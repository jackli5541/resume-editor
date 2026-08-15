import { randomUUID } from "node:crypto";

const TYPES = new Set(["bug", "suggestion", "question", "other"]);
const STATUSES = new Set(["open", "in_progress", "resolved", "closed"]);

export class FeedbackRepository {
  constructor({ database } = {}) {
    this.database = database;
    this.memory = [];
  }

  async create({ userId = null, type = "suggestion", content }) {
    const safeType = TYPES.has(type) ? type : "suggestion";
    const safeContent = String(content || "").slice(0, 4000);
    const id = randomUUID();
    if (this.database) {
      await this.database.query(
        `INSERT INTO feedbacks (id, user_id, type, content) VALUES ($1, $2, $3, $4)`,
        [id, userId || null, safeType, safeContent]
      );
    } else {
      const now = new Date().toISOString();
      this.memory.unshift({
        id, userId: userId || null, type: safeType, content: safeContent,
        status: "open", reply: "", repliedBy: null, createdAt: now, updatedAt: now
      });
      if (this.memory.length > 2000) this.memory.length = 2000;
    }
    return this.get(id);
  }

  async list({ status = "", search = "", limit = 100, offset = 0 } = {}) {
    const safeLimit = Math.min(Math.max(Number(limit) || 100, 1), 500);
    const safeOffset = Math.max(Number(offset) || 0, 0);
    const term = String(search || "").trim();

    if (!this.database) {
      let items = [...this.memory];
      if (status) items = items.filter((f) => f.status === status);
      if (term) {
        const needle = term.toLowerCase();
        items = items.filter((f) =>
          (f.content || "").toLowerCase().includes(needle)
          || (f.type || "").toLowerCase().includes(needle)
          || (f.userId || "").toLowerCase().includes(needle)
        );
      }
      items.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
      return { total: items.length, feedbacks: items.slice(safeOffset, safeOffset + safeLimit) };
    }

    const conditions = [];
    const params = [];
    if (status) {
      params.push(status);
      conditions.push(`f.status = $${params.length}`);
    }
    if (term) {
      params.push(`%${term}%`);
      conditions.push(`(f.content ILIKE $${params.length} OR f.type ILIKE $${params.length} OR u.email ILIKE $${params.length} OR u.phone ILIKE $${params.length})`);
    }
    const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
    const countResult = await this.database.query(
      `SELECT count(*)::int AS total FROM feedbacks f LEFT JOIN users u ON u.id = f.user_id ${where}`,
      params
    );
    const listParams = [...params, safeLimit, safeOffset];
    const result = await this.database.query(
      `SELECT f.id, f.user_id, f.type, f.content, f.status, f.reply, f.replied_by, f.created_at, f.updated_at,
              COALESCE(u.email, u.phone) AS user_identifier
       FROM feedbacks f
       LEFT JOIN users u ON u.id = f.user_id
       ${where}
       ORDER BY f.created_at DESC
       LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      listParams
    );
    return {
      total: countResult.rows[0]?.total ?? 0,
      feedbacks: result.rows.map((row) => ({
        id: row.id,
        userId: row.user_id,
        userIdentifier: row.user_identifier || null,
        type: row.type,
        content: row.content,
        status: row.status,
        reply: row.reply,
        repliedBy: row.replied_by ?? null,
        createdAt: row.created_at,
        updatedAt: row.updated_at
      }))
    };
  }

  async get(id) {
    if (!this.database) return this.memory.find((f) => f.id === id) || null;
    const result = await this.database.query(
      `SELECT id, user_id, type, content, status, reply, replied_by, created_at, updated_at
       FROM feedbacks WHERE id = $1`,
      [id]
    );
    const row = result.rows[0];
    if (!row) return null;
    return {
      id: row.id, userId: row.user_id, type: row.type, content: row.content,
      status: row.status, reply: row.reply, repliedBy: row.replied_by ?? null,
      createdAt: row.created_at, updatedAt: row.updated_at
    };
  }

  async update(id, { status, reply, repliedBy = null }) {
    const existing = await this.get(id);
    if (!existing) return null;
    const nextStatus = STATUSES.has(status) ? status : existing.status;
    const nextReply = reply === undefined ? existing.reply : String(reply || "").slice(0, 4000);
    if (this.database) {
      await this.database.query(
        `UPDATE feedbacks SET status = $2, reply = $3, replied_by = $4, updated_at = now() WHERE id = $1`,
        [id, nextStatus, nextReply, repliedBy || null]
      );
    } else {
      const item = this.memory.find((f) => f.id === id);
      item.status = nextStatus;
      item.reply = nextReply;
      item.repliedBy = repliedBy || null;
      item.updatedAt = new Date().toISOString();
    }
    return this.get(id);
  }
}
