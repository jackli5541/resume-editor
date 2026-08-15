const ALLOWED_STATUS = new Set(["ok", "invalid_json", "timeout", "provider_error", "rate_limited", "blocked"]);

// AI 调用审计：只记录元数据，绝不记录用户描述原文或生成正文。
export class AiAuditLog {
  constructor({ database } = {}) {
    this.database = database;
  }

  async record(entry = {}) {
    if (!this.database) return;
    const status = ALLOWED_STATUS.has(entry.status) ? entry.status : "provider_error";
    try {
      await this.database.query(`
        INSERT INTO ai_generation_log (user_id, provider, model, status, input_chars, output_chars, latency_ms, error_code)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      `, [
        entry.userId || null,
        String(entry.provider || "").slice(0, 40),
        String(entry.model || "").slice(0, 120),
        status,
        Number.isSafeInteger(entry.inputChars) ? entry.inputChars : 0,
        Number.isSafeInteger(entry.outputChars) ? entry.outputChars : 0,
        Number.isSafeInteger(entry.latencyMs) ? entry.latencyMs : 0,
        entry.errorCode ? String(entry.errorCode).slice(0, 80) : null
      ]);
    } catch {
      // 审计写入失败不得影响主流程。
    }
  }

  // 只读列表：按用户邮箱/手机号、模型或状态搜索，支持状态与日期筛选，按时间倒序。
  async list({ limit = 100, offset = 0, search = "", status = "", from = "", to = "" } = {}) {
    if (!this.database) return { total: 0, logs: [] };
    const safeLimit = Math.min(Math.max(Number(limit) || 100, 1), 500);
    const safeOffset = Math.max(Number(offset) || 0, 0);
    const term = String(search || "").trim();
    const conditions = [];
    const params = [];
    if (term) {
      params.push(`%${term}%`);
      conditions.push(`(u.email ILIKE $${params.length} OR u.phone ILIKE $${params.length} OR l.model ILIKE $${params.length} OR l.status ILIKE $${params.length})`);
    }
    if (status) {
      params.push(status);
      conditions.push(`l.status = $${params.length}`);
    }
    if (from) {
      params.push(from);
      conditions.push(`l.created_at >= $${params.length}::date`);
    }
    if (to) {
      params.push(to);
      conditions.push(`l.created_at < ($${params.length}::date + interval '1 day')`);
    }
    const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
    const countResult = await this.database.query(
      `SELECT count(*)::int AS total FROM ai_generation_log l LEFT JOIN users u ON u.id = l.user_id ${where}`,
      params
    );
    const listParams = [...params, safeLimit, safeOffset];
    const result = await this.database.query(`
      SELECT l.id, l.user_id, l.provider, l.model, l.status,
             l.input_chars, l.output_chars, l.latency_ms, l.error_code, l.created_at,
             COALESCE(u.email, u.phone) AS user_identifier
      FROM ai_generation_log l
      LEFT JOIN users u ON u.id = l.user_id
      ${where}
      ORDER BY l.created_at DESC
      LIMIT $${params.length + 1} OFFSET $${params.length + 2}
    `, listParams);
    return {
      total: countResult.rows[0]?.total ?? 0,
      logs: result.rows.map((row) => ({
        id: String(row.id),
        userId: row.user_id,
        userIdentifier: row.user_identifier || null,
        provider: row.provider,
        model: row.model,
        status: row.status,
        inputChars: row.input_chars,
        outputChars: row.output_chars,
        latencyMs: row.latency_ms,
        errorCode: row.error_code,
        createdAt: row.created_at
      }))
    };
  }

  // 概览统计：当日成功次数与累计调用次数（仅元数据）。
  async stats() {
    if (!this.database) return { today: 0, total: 0 };
    const result = await this.database.query(`
      SELECT
        count(*) FILTER (WHERE status = 'ok' AND created_at >= date_trunc('day', now()))::int AS today_ok,
        count(*)::int AS total
      FROM ai_generation_log
    `);
    const row = result.rows[0] || {};
    return { today: row.today_ok ?? 0, total: row.total ?? 0 };
  }
}
