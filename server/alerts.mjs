// 告警巡检：检查 AI 失败、队列积压失败、数据库不可用，记录到 alert_log 并可选触发 webhook。
// 去重：同 kind 的未确认告警在冷却期内不重复记录，避免刷屏。
export class AlertService {
  constructor({
    database,
    getQueueStats,
    thresholds = {},
    webhookUrl = "",
    cooldownMs = 30 * 60 * 1000
  } = {}) {
    this.database = database;
    this.getQueueStats = getQueueStats || (async () => ({ exportFailed: 0, previewFailed: 0 }));
    this.webhookUrl = webhookUrl || process.env.ALERT_WEBHOOK_URL || "";
    this.cooldownMs = cooldownMs;
    this.aiFailureWindowMin = Number(thresholds.aiFailureWindowMin ?? process.env.ALERT_AI_FAILURE_WINDOW_MIN ?? 30);
    this.aiFailureThreshold = Number(thresholds.aiFailureThreshold ?? process.env.ALERT_AI_FAILURE_THRESHOLD ?? 5);
    this.queueFailedThreshold = Number(thresholds.queueFailedThreshold ?? process.env.ALERT_QUEUE_FAILED_THRESHOLD ?? 10);
    this.memory = [];
  }

  async countRecentAiFailures() {
    if (!this.database) return 0;
    const result = await this.database.query(
      `SELECT count(*)::int AS n FROM ai_generation_log
       WHERE status IN ('provider_error', 'timeout')
         AND created_at > now() - ($1::int * interval '1 minute')`,
      [this.aiFailureWindowMin]
    );
    return result.rows[0]?.n ?? 0;
  }

  async check() {
    const triggered = [];

    const aiFailures = await this.countRecentAiFailures();
    if (aiFailures >= this.aiFailureThreshold) {
      triggered.push({
        level: "warn",
        kind: "ai_failures",
        message: `近 ${this.aiFailureWindowMin} 分钟 AI 调用失败 ${aiFailures} 次`,
        meta: { aiFailures, windowMin: this.aiFailureWindowMin }
      });
    }

    const queue = await this.getQueueStats();
    if ((queue.exportFailed || 0) >= this.queueFailedThreshold) {
      triggered.push({
        level: "warn",
        kind: "export_queue_failed",
        message: `导出队列失败任务 ${queue.exportFailed} 个`,
        meta: { exportFailed: queue.exportFailed }
      });
    }
    if ((queue.previewFailed || 0) >= this.queueFailedThreshold) {
      triggered.push({
        level: "warn",
        kind: "preview_queue_failed",
        message: `预览队列失败任务 ${queue.previewFailed} 个`,
        meta: { previewFailed: queue.previewFailed }
      });
    }

    for (const alert of triggered) await this.emit(alert);
    return triggered;
  }

  // 去重后落库 + webhook（fire-and-forget）。
  async emit({ level, kind, message, meta = {} }) {
    if (await this.recentlyAlerted(kind)) return null;

    let record = null;
    if (this.database) {
      const result = await this.database.query(
        `INSERT INTO alert_log (level, kind, message, meta) VALUES ($1, $2, $3, $4::jsonb) RETURNING id, level, kind, message, meta, acknowledged, created_at`,
        [level, kind, message, JSON.stringify(meta)]
      );
      record = mapRow(result.rows[0]);
    } else {
      record = {
        id: String(this.memory.length + 1),
        level,
        kind,
        message,
        meta,
        acknowledged: false,
        createdAt: new Date().toISOString()
      };
      this.memory.unshift(record);
      if (this.memory.length > 1000) this.memory.length = 1000;
    }

    if (this.webhookUrl) {
      fetch(this.webhookUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(record)
      }).catch(() => {});
    }
    return record;
  }

  async recentlyAlerted(kind) {
    if (this.database) {
      const result = await this.database.query(
        `SELECT 1 FROM alert_log WHERE kind = $1 AND acknowledged = false AND created_at > now() - ($2::int * interval '1 millisecond') LIMIT 1`,
        [kind, this.cooldownMs]
      );
      return result.rowCount > 0;
    }
    const cutoff = Date.now() - this.cooldownMs;
    return this.memory.some((a) => a.kind === kind && !a.acknowledged && new Date(a.createdAt).getTime() >= cutoff);
  }

  async list({ limit = 50, offset = 0 } = {}) {
    const safeLimit = Math.min(Math.max(Number(limit) || 50, 1), 200);
    const safeOffset = Math.max(Number(offset) || 0, 0);
    if (!this.database) {
      const items = [...this.memory].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
      return { total: items.length, alerts: items.slice(safeOffset, safeOffset + safeLimit) };
    }
    const countResult = await this.database.query("SELECT count(*)::int AS total FROM alert_log");
    const result = await this.database.query(
      `SELECT id, level, kind, message, meta, acknowledged, created_at
       FROM alert_log ORDER BY created_at DESC, id DESC LIMIT $1 OFFSET $2`,
      [safeLimit, safeOffset]
    );
    return { total: countResult.rows[0]?.total ?? 0, alerts: result.rows.map(mapRow) };
  }

  async ack(id) {
    if (!this.database) {
      const item = this.memory.find((a) => a.id === String(id));
      if (!item) return false;
      item.acknowledged = true;
      return true;
    }
    const result = await this.database.query("UPDATE alert_log SET acknowledged = true WHERE id = $1", [id]);
    return result.rowCount === 1;
  }
}

function mapRow(row) {
  if (!row) return null;
  return {
    id: String(row.id),
    level: row.level,
    kind: row.kind,
    message: row.message,
    meta: row.meta ?? {},
    acknowledged: Boolean(row.acknowledged),
    createdAt: row.created_at
  };
}
