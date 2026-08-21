// 产品埋点：记录关键行为事件，供趋势看板与留存分析。
// 无 DB 模式静默跳过（埋点不影响主流程）。
export class EventLog {
  constructor({ database } = {}) {
    this.database = database;
    this.memory = [];
  }

  async record({ userId = null, event, payload = null } = {}) {
    if (!event) return;
    if (!this.database) {
      this.memory.unshift({ id: this.memory.length + 1, userId, event, payload: payload || {}, createdAt: new Date().toISOString() });
      return;
    }
    try {
      await this.database.query(
        `INSERT INTO events (user_id, event, payload) VALUES ($1, $2, $3::jsonb)`,
        [userId || null, String(event).slice(0, 60), payload == null ? null : JSON.stringify(payload)]
      );
    } catch {
      // 埋点失败不得影响主流程。
    }
  }

  async updateExport(jobId, changes = {}) {
    if (!jobId) return;
    if (!this.database) {
      const item = this.memory.find((entry) => entry.event === "export_created" && entry.payload?.jobId === jobId);
      if (item) item.payload = { ...item.payload, ...changes };
      return;
    }
    try {
      await this.database.query(
        `UPDATE events SET payload = payload || $2::jsonb WHERE event = 'export_created' AND payload->>'jobId' = $1`,
        [jobId, JSON.stringify(changes)]
      );
    } catch {
      // 记录状态失败不得影响用户下载。
    }
  }

  async listExports({ limit = 20, offset = 0, search = "", status = "", format = "", from = "", to = "" } = {}) {
    const safeLimit = Math.min(Math.max(Number(limit) || 20, 1), 200);
    const safeOffset = Math.max(Number(offset) || 0, 0);
    if (!this.database) {
      const needle = String(search).trim().toLowerCase();
      const matches = this.memory.filter((entry) => entry.event === "export_created").filter((entry) => {
        const payload = entry.payload || {};
        return (!status || payload.status === status)
          && (!format || payload.format === format)
          && (!from || entry.createdAt.slice(0, 10) >= from)
          && (!to || entry.createdAt.slice(0, 10) <= to)
          && (!needle || JSON.stringify(payload).toLowerCase().includes(needle));
      });
      return {
        total: matches.length,
        exports: matches.slice(safeOffset, safeOffset + safeLimit).map((entry) => ({
          id: entry.id, userId: entry.userId, ...entry.payload, createdAt: entry.createdAt
        }))
      };
    }
    const conditions = ["e.event = 'export_created'"];
    const params = [];
    const add = (sql, value) => { params.push(value); conditions.push(sql.replace("?", `$${params.length}`)); };
    if (search) {
      params.push(search);
      conditions.push(`(coalesce(u.email, u.phone, '') ILIKE '%' || $${params.length} || '%' OR e.payload::text ILIKE '%' || $${params.length} || '%')`);
    }
    if (status) add(`e.payload->>'status' = ?`, status);
    if (format) add(`e.payload->>'format' = ?`, format);
    if (from) add(`e.created_at >= ?::date`, from);
    if (to) add(`e.created_at < (?::date + interval '1 day')`, to);
    const where = conditions.join(" AND ");
    const count = await this.database.query(`SELECT count(*)::int AS n FROM events e LEFT JOIN users u ON u.id = e.user_id WHERE ${where}`, params);
    params.push(safeLimit, safeOffset);
    const result = await this.database.query(
      `SELECT e.id, e.user_id, coalesce(u.email, u.phone) AS user_identifier, e.payload, e.created_at
       FROM events e LEFT JOIN users u ON u.id = e.user_id WHERE ${where}
       ORDER BY e.created_at DESC LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params
    );
    return {
      total: count.rows[0]?.n ?? 0,
      exports: result.rows.map((row) => ({ id: row.id, userId: row.user_id, userIdentifier: row.user_identifier, ...row.payload, createdAt: row.created_at }))
    };
  }
}
