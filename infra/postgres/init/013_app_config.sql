-- 运行时配置中心（Feature Flag）：管理端可热改的开关，避免重启服务。
-- 键为白名单（见 server/config.mjs），值以 jsonb 存储类型化数据。
-- 本文件保持幂等，配合 scripts/migrate.mjs 按文件名顺序应用。
CREATE TABLE IF NOT EXISTS app_config (
  key text PRIMARY KEY,
  value jsonb NOT NULL,
  updated_by uuid REFERENCES users(id) ON DELETE SET NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
