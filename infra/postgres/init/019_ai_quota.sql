-- 每个用户的 AI 日调用上限：默认 8 次；管理员/超级管理员在应用层不限额。
ALTER TABLE users ADD COLUMN IF NOT EXISTS ai_daily_limit integer NOT NULL DEFAULT 8;
