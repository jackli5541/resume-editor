-- 告警记录：由后台巡检触发，供运维面板查看与确认。
-- 本文件保持幂等，配合 scripts/migrate.mjs 按文件名顺序应用。
CREATE TABLE IF NOT EXISTS alert_log (
  id bigserial PRIMARY KEY,
  level text NOT NULL CHECK (level IN ('info', 'warn', 'error')),
  kind text NOT NULL,
  message text NOT NULL,
  meta jsonb NOT NULL DEFAULT '{}'::jsonb,
  acknowledged boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS alert_log_created_idx ON alert_log (created_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS alert_log_kind_ack_idx ON alert_log (kind, acknowledged, created_at DESC);
