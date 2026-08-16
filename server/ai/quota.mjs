// 用户级日配额：DB 模式以 ai_generation_log 中当日成功(status='ok')记录为准，
// 无 DB 模式退化为进程内计数。失败请求不占用配额（但受 IP/用户限流约束）。
export class AiQuotaService {
  constructor({ database, dailyLimit = 8 } = {}) {
    this.database = database;
    this.dailyLimit = Number.isSafeInteger(dailyLimit) && dailyLimit > 0 ? dailyLimit : 8;
    this.memory = new Map();
  }

  async check(userId, { isAdmin = false, limit = null } = {}) {
    // 管理员/超级管理员不限额。
    if (isAdmin) return { allowed: true, used: 0, limit: null, remaining: null, unlimited: true };

    const effective = Number.isSafeInteger(Number(limit)) && Number(limit) > 0 ? Number(limit) : this.dailyLimit;
    if (this.database) {
      const result = await this.database.query(`
        SELECT count(*)::int AS used FROM ai_generation_log
        WHERE user_id = $1 AND status = 'ok'
          AND created_at >= date_trunc('day', now() AT TIME ZONE 'Asia/Shanghai') AT TIME ZONE 'Asia/Shanghai'
      `, [userId]);
      const used = result.rows[0]?.used ?? 0;
      return { allowed: used < effective, used, limit: effective, remaining: Math.max(0, effective - used) };
    }
    const today = new Date().toISOString().slice(0, 10);
    const entry = this.memory.get(userId);
    const used = entry && entry.date === today ? entry.count : 0;
    return { allowed: used < effective, used, limit: effective, remaining: Math.max(0, effective - used) };
  }

  // 仅在无 DB 模式由服务在成功生成后调用；DB 模式由审计日志自动计数，此处为空操作。
  increment(userId) {
    if (this.database) return;
    const today = new Date().toISOString().slice(0, 10);
    const entry = this.memory.get(userId);
    if (entry && entry.date === today) entry.count += 1;
    else this.memory.set(userId, { date: today, count: 1 });
  }
}
