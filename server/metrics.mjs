// 管理端趋势看板：直接聚合源表（users/resumes/events/ai_generation_log）生成日序列。
// 无 DB 模式返回空序列/零总计，供测试与本地降级。
export class MetricsService {
  constructor({ database } = {}) {
    this.database = database;
  }

  async daily({ days = 30 } = {}) {
    const safeDays = Math.min(Math.max(Number(days) || 30, 1), 365);
    if (!this.database) return this.emptySeries(safeDays);

    const result = await this.database.query(
      `WITH days AS (
         SELECT generate_series(
           date_trunc('day', now()) - ($1::int - 1) * interval '1 day',
           date_trunc('day', now()),
           interval '1 day'
         )::date AS day
       )
       SELECT
         to_char(d.day, 'YYYY-MM-DD') AS day,
         (SELECT count(*) FROM users u WHERE u.created_at::date = d.day) AS new_users,
         (SELECT count(*) FROM resumes r WHERE r.created_at::date = d.day) AS drafts_created,
         (SELECT count(*) FROM events e WHERE e.event = 'export_created' AND e.created_at::date = d.day) AS exports,
         (SELECT count(*) FROM events e WHERE e.event = 'login' AND e.created_at::date = d.day) AS logins,
         (SELECT count(DISTINCT e.user_id) FROM events e WHERE e.created_at::date = d.day) AS active_users,
         (SELECT count(*) FROM ai_generation_log l WHERE l.status = 'ok' AND l.created_at::date = d.day) AS ai_ok,
         (SELECT count(*) FROM ai_generation_log l WHERE l.status <> 'ok' AND l.created_at::date = d.day) AS ai_failed
       FROM days d
       ORDER BY d.day ASC`,
      [safeDays]
    );
    return result.rows.map((row) => ({
      day: row.day,
      newUsers: Number(row.new_users) || 0,
      draftsCreated: Number(row.drafts_created) || 0,
      exports: Number(row.exports) || 0,
      logins: Number(row.logins) || 0,
      activeUsers: Number(row.active_users) || 0,
      aiOk: Number(row.ai_ok) || 0,
      aiFailed: Number(row.ai_failed) || 0
    }));
  }

  async totals() {
    if (!this.database) return { users: 0, drafts: 0, exports: 0, aiTotal: 0 };
    const [users, drafts, events, ai] = await Promise.all([
      this.database.query("SELECT count(*)::int AS n FROM users WHERE deleted_at IS NULL"),
      this.database.query("SELECT count(*)::int AS n FROM resumes WHERE deleted_at IS NULL"),
      this.database.query("SELECT count(*)::int AS n FROM events WHERE event = 'export_created'"),
      this.database.query("SELECT count(*)::int AS n FROM ai_generation_log")
    ]);
    return {
      users: users.rows[0]?.n ?? 0,
      drafts: drafts.rows[0]?.n ?? 0,
      exports: events.rows[0]?.n ?? 0,
      aiTotal: ai.rows[0]?.n ?? 0
    };
  }

  // AI 成本/用量：按日与按模型聚合输入/输出字符数与调用次数。
  async aiCosts({ days = 30 } = {}) {
    const safeDays = Math.min(Math.max(Number(days) || 30, 1), 365);
    if (!this.database) return { days: [], byModel: [] };

    const dailyResult = await this.database.query(
      `SELECT to_char(l.created_at::date, 'YYYY-MM-DD') AS day, l.model,
              sum(l.input_chars)::int AS input_chars,
              sum(l.output_chars)::int AS output_chars,
              count(*)::int AS calls
       FROM ai_generation_log l
       WHERE l.created_at >= date_trunc('day', now()) - ($1::int - 1) * interval '1 day'
       GROUP BY l.created_at::date, l.model
       ORDER BY l.created_at::date ASC, l.model ASC`,
      [safeDays]
    );
    const modelResult = await this.database.query(
      `SELECT l.model,
              sum(l.input_chars)::int AS input_chars,
              sum(l.output_chars)::int AS output_chars,
              count(*)::int AS calls
       FROM ai_generation_log l
       GROUP BY l.model
       ORDER BY calls DESC`
    );
    return {
      days: dailyResult.rows.map((row) => ({
        day: row.day,
        model: row.model,
        inputChars: Number(row.input_chars) || 0,
        outputChars: Number(row.output_chars) || 0,
        calls: Number(row.calls) || 0
      })),
      byModel: modelResult.rows.map((row) => ({
        model: row.model,
        inputChars: Number(row.input_chars) || 0,
        outputChars: Number(row.output_chars) || 0,
        calls: Number(row.calls) || 0
      }))
    };
  }

  emptySeries(days) {
    const out = [];
    const now = new Date();
    for (let i = days - 1; i >= 0; i -= 1) {
      const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i);
      const day = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
      out.push({ day, newUsers: 0, draftsCreated: 0, exports: 0, logins: 0, activeUsers: 0, aiOk: 0, aiFailed: 0 });
    }
    return out;
  }
}
