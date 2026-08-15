import { randomUUID } from "node:crypto";

const ANNOUNCEMENT_STATUS = new Set(["draft", "published", "archived"]);

export class AnnouncementRepository {
  constructor({ database } = {}) {
    this.database = database;
    this.memory = [];
  }

  async list({ status = "", search = "", limit = 100, offset = 0 } = {}) {
    const safeLimit = Math.min(Math.max(Number(limit) || 100, 1), 500);
    const safeOffset = Math.max(Number(offset) || 0, 0);
    const term = String(search || "").trim();

    if (!this.database) {
      let items = [...this.memory];
      if (status) items = items.filter((a) => a.status === status);
      if (term) {
        const needle = term.toLowerCase();
        items = items.filter((a) =>
          (a.title || "").toLowerCase().includes(needle) || (a.content || "").toLowerCase().includes(needle)
        );
      }
      items.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
      return { total: items.length, announcements: items.slice(safeOffset, safeOffset + safeLimit) };
    }

    const conditions = [];
    const params = [];
    if (status) {
      params.push(status);
      conditions.push(`status = $${params.length}`);
    }
    if (term) {
      params.push(`%${term}%`);
      conditions.push(`(title ILIKE $${params.length} OR content ILIKE $${params.length})`);
    }
    const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
    const countResult = await this.database.query(
      `SELECT count(*)::int AS total FROM announcements ${where}`,
      params
    );
    const listParams = [...params, safeLimit, safeOffset];
    const result = await this.database.query(
      `SELECT id, title, content, status, created_by, created_at, updated_at
       FROM announcements ${where}
       ORDER BY created_at DESC
       LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      listParams
    );
    return { total: countResult.rows[0]?.total ?? 0, announcements: result.rows.map(mapRow) };
  }

  async listPublished({ limit = 5 } = {}) {
    const { announcements } = await this.list({ status: "published", limit });
    return announcements;
  }

  async get(id) {
    if (!this.database) return this.memory.find((a) => a.id === id) || null;
    const result = await this.database.query(
      `SELECT id, title, content, status, created_by, created_at, updated_at FROM announcements WHERE id = $1`,
      [id]
    );
    return mapRow(result.rows[0]);
  }

  async create({ title, content = "", status = "draft", createdBy = null }) {
    const id = randomUUID();
    const safeTitle = String(title || "").slice(0, 200);
    const safeContent = String(content || "").slice(0, 10000);
    const safeStatus = ANNOUNCEMENT_STATUS.has(status) ? status : "draft";
    if (this.database) {
      await this.database.query(
        `INSERT INTO announcements (id, title, content, status, created_by) VALUES ($1, $2, $3, $4, $5)`,
        [id, safeTitle, safeContent, safeStatus, createdBy || null]
      );
    } else {
      const now = new Date().toISOString();
      this.memory.unshift({
        id, title: safeTitle, content: safeContent, status: safeStatus,
        createdBy: createdBy || null, createdAt: now, updatedAt: now
      });
    }
    return this.get(id);
  }

  async update(id, { title, content, status }) {
    const existing = await this.get(id);
    if (!existing) return null;
    const nextTitle = title === undefined ? existing.title : String(title || "").slice(0, 200);
    const nextContent = content === undefined ? existing.content : String(content || "").slice(0, 10000);
    const nextStatus = status === undefined ? existing.status : (ANNOUNCEMENT_STATUS.has(status) ? status : existing.status);
    if (this.database) {
      await this.database.query(
        `UPDATE announcements SET title = $2, content = $3, status = $4, updated_at = now() WHERE id = $1`,
        [id, nextTitle, nextContent, nextStatus]
      );
    } else {
      const item = this.memory.find((a) => a.id === id);
      item.title = nextTitle;
      item.content = nextContent;
      item.status = nextStatus;
      item.updatedAt = new Date().toISOString();
    }
    return this.get(id);
  }

  async delete(id) {
    if (!this.database) {
      const index = this.memory.findIndex((a) => a.id === id);
      if (index === -1) return false;
      this.memory.splice(index, 1);
      return true;
    }
    const result = await this.database.query("DELETE FROM announcements WHERE id = $1", [id]);
    return result.rowCount === 1;
  }
}

export class MessageRepository {
  constructor({ database } = {}) {
    this.database = database;
    this.memory = [];
  }

  // 向全部未删除用户广播一条站内信，返回创建条数。
  async broadcast({ title, content = "" }) {
    const safeTitle = String(title || "").slice(0, 200);
    const safeContent = String(content || "").slice(0, 10000);
    if (this.database) {
      const result = await this.database.query(
        `INSERT INTO user_messages (id, user_id, title, content)
         SELECT gen_random_uuid(), id, $1, $2 FROM users WHERE deleted_at IS NULL`,
        [safeTitle, safeContent]
      );
      return result.rowCount;
    }
    return 0;
  }

  async listForUser(userId, { limit = 50, offset = 0 } = {}) {
    const safeLimit = Math.min(Math.max(Number(limit) || 50, 1), 200);
    const safeOffset = Math.max(Number(offset) || 0, 0);
    if (!this.database) {
      const items = this.memory
        .filter((m) => m.userId === userId)
        .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
      const unread = items.filter((m) => !m.readAt).length;
      return { messages: items.slice(safeOffset, safeOffset + safeLimit), unread };
    }
    const countResult = await this.database.query(
      "SELECT count(*)::int AS n FROM user_messages WHERE user_id = $1 AND read_at IS NULL",
      [userId]
    );
    const result = await this.database.query(
      `SELECT id, title, content, read_at, created_at FROM user_messages
       WHERE user_id = $1 ORDER BY created_at DESC LIMIT $2 OFFSET $3`,
      [userId, safeLimit, safeOffset]
    );
    return {
      unread: countResult.rows[0]?.n ?? 0,
      messages: result.rows.map((row) => ({
        id: row.id,
        title: row.title,
        content: row.content,
        readAt: row.read_at ?? null,
        createdAt: row.created_at
      }))
    };
  }

  async markRead(userId, id) {
    if (!this.database) {
      const item = this.memory.find((m) => m.id === id && m.userId === userId);
      if (!item) return false;
      item.readAt = new Date().toISOString();
      return true;
    }
    const result = await this.database.query(
      "UPDATE user_messages SET read_at = COALESCE(read_at, now()) WHERE id = $1 AND user_id = $2",
      [id, userId]
    );
    return result.rowCount === 1;
  }
}

function mapRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    title: row.title,
    content: row.content,
    status: row.status,
    createdBy: row.created_by ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}
