-- 产品埋点：关键行为事件（注册/登录/创建草稿/导出/AI 生成等），供趋势看板与留存分析。
-- 本文件保持幂等，配合 scripts/migrate.mjs 按文件名顺序应用。
CREATE TABLE IF NOT EXISTS events (
  id bigserial PRIMARY KEY,
  user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  event text NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS events_event_created_idx ON events (event, created_at DESC);
CREATE INDEX IF NOT EXISTS events_user_created_idx ON events (user_id, created_at DESC);
