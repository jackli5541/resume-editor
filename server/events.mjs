// 产品埋点：记录关键行为事件，供趋势看板与留存分析。
// 无 DB 模式静默跳过（埋点不影响主流程）。
export class EventLog {
  constructor({ database } = {}) {
    this.database = database;
  }

  async record({ userId = null, event, payload = null } = {}) {
    if (!this.database || !event) return;
    try {
      await this.database.query(
        `INSERT INTO events (user_id, event, payload) VALUES ($1, $2, $3::jsonb)`,
        [userId || null, String(event).slice(0, 60), payload == null ? null : JSON.stringify(payload)]
      );
    } catch {
      // 埋点失败不得影响主流程。
    }
  }
}
