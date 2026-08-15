// 管理员操作审计：只记录元数据（动作/对象/前后快照/IP/UA），不记录敏感内容。
// 与 aiAuditLog 一样支持 DB 模式与无 DB 内存模式（供测试使用）。
export class AdminAuditLog {
  constructor({ database } = {}) {
    this.database = database;
    this.memory = [];
  }

  async record({
    actorId = null,
    action,
    targetType,
    targetId = null,
    before = null,
    after = null,
    ip = null,
    userAgent = null
  } = {}) {
    if (!action || !targetType) return;
    if (this.database) {
      try {
        await this.database.query(
          `INSERT INTO admin_audit_log (actor_id, action, target_type, target_id, before, after, ip, user_agent)
           VALUES ($1, $2, $3, $4, $5::jsonb, $6::jsonb, $7, $8)`,
          [
            actorId || null,
            String(action).slice(0, 80),
            String(targetType).slice(0, 40),
            targetId ? String(targetId).slice(0, 120) : null,
            before == null ? null : JSON.stringify(before),
            after == null ? null : JSON.stringify(after),
            ip ? String(ip).slice(0, 64) : null,
            userAgent ? String(userAgent).slice(0, 200) : null
          ]
        );
      } catch {
        // 审计写入失败不得影响主流程。
      }
    } else {
      this.memory.unshift({
        id: String(this.memory.length + 1),
        actorId: actorId || null,
        action,
        targetType,
        targetId: targetId || null,
        before: before ?? null,
        after: after ?? null,
        ip: ip || null,
        userAgent: userAgent || null,
        createdAt: new Date().toISOString()
      });
      if (this.memory.length > 2000) this.memory.length = 2000;
    }
  }

  async list({ limit = 100, offset = 0, search = "", action = "", from = "", to = "" } = {}) {
    const safeLimit = Math.min(Math.max(Number(limit) || 100, 1), 500);
    const safeOffset = Math.max(Number(offset) || 0, 0);
    const term = String(search || "").trim();

    if (!this.database) {
      let logs = [...this.memory];
      if (term) {
        const needle = term.toLowerCase();
        logs = logs.filter((log) =>
          [log.actorId, log.action, log.targetType, log.targetId]
            .filter(Boolean)
            .some((value) => String(value).toLowerCase().includes(needle))
        );
      }
      if (action) logs = logs.filter((log) => log.action === action);
      if (from) {
        const fromDate = new Date(from);
        logs = logs.filter((log) => new Date(log.createdAt) >= fromDate);
      }
      if (to) {
        const toDate = new Date(to);
        toDate.setDate(toDate.getDate() + 1);
        logs = logs.filter((log) => new Date(log.createdAt) < toDate);
      }
      return { total: logs.length, logs: logs.slice(safeOffset, safeOffset + safeLimit) };
    }

    const conditions = [];
    const params = [];
    if (term) {
      params.push(`%${term}%`);
      conditions.push(`(u.email ILIKE $${params.length} OR u.phone ILIKE $${params.length} OR a.action ILIKE $${params.length} OR a.target_type ILIKE $${params.length} OR a.target_id ILIKE $${params.length})`);
    }
    if (action) {
      params.push(action);
      conditions.push(`a.action = $${params.length}`);
    }
    if (from) {
      params.push(from);
      conditions.push(`a.created_at >= $${params.length}::date`);
    }
    if (to) {
      params.push(to);
      conditions.push(`a.created_at < ($${params.length}::date + interval '1 day')`);
    }
    const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
    const countResult = await this.database.query(
      `SELECT count(*)::int AS total FROM admin_audit_log a LEFT JOIN users u ON u.id = a.actor_id ${where}`,
      params
    );
    const listParams = [...params, safeLimit, safeOffset];
    const result = await this.database.query(
      `SELECT a.id, a.actor_id, a.action, a.target_type, a.target_id, a.before, a.after, a.ip, a.created_at,
              COALESCE(u.email, u.phone) AS actor_identifier
       FROM admin_audit_log a
       LEFT JOIN users u ON u.id = a.actor_id
       ${where}
       ORDER BY a.created_at DESC, a.id DESC
       LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      listParams
    );
    return {
      total: countResult.rows[0]?.total ?? 0,
      logs: result.rows.map((row) => ({
        id: String(row.id),
        actorId: row.actor_id,
        actorIdentifier: row.actor_identifier || null,
        action: row.action,
        targetType: row.target_type,
        targetId: row.target_id,
        before: row.before ?? null,
        after: row.after ?? null,
        ip: row.ip ?? null,
        createdAt: row.created_at
      }))
    };
  }
}
