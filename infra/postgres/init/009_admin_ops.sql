-- 管理端长期运营底座：管理员角色(RBAC)、软删除、操作审计。
-- 本文件保持幂等，配合 scripts/migrate.mjs 按文件名顺序应用。

-- 1) 管理员角色：super_admin(超级管理员) / operator(运营) / auditor(只读审计)。
--    is_admin 仍作为「是否可进入管理端」的准入开关；role 只在 is_admin=true 时有意义。
ALTER TABLE users ADD COLUMN IF NOT EXISTS role text;
-- 兼容历史数据：已存在的管理员默认升级为超级管理员，保留原有完整权限。
UPDATE users SET role = 'super_admin' WHERE is_admin = true AND role IS NULL;

-- 2) 软删除：用户与草稿不再物理删除，进入回收站可恢复。
ALTER TABLE users ADD COLUMN IF NOT EXISTS deleted_at timestamptz;
ALTER TABLE resumes ADD COLUMN IF NOT EXISTS deleted_at timestamptz;

-- 软删除用户释放邮箱/手机号唯一占用，允许同名重新注册（仅对未删除行保持唯一）。
DROP INDEX IF EXISTS users_email_key;
DROP INDEX IF EXISTS users_phone_key;
CREATE UNIQUE INDEX IF NOT EXISTS users_email_key ON users (lower(email)) WHERE deleted_at IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS users_phone_key ON users (phone) WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS users_deleted_at_idx ON users (deleted_at) WHERE deleted_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS resumes_deleted_at_idx ON resumes (deleted_at) WHERE deleted_at IS NOT NULL;

-- 3) 管理员操作审计：谁在何时对什么对象做了什么。
CREATE TABLE IF NOT EXISTS admin_audit_log (
  id bigserial PRIMARY KEY,
  actor_id uuid REFERENCES users(id) ON DELETE SET NULL,
  action text NOT NULL,
  target_type text NOT NULL,
  target_id text,
  before jsonb,
  after jsonb,
  ip text,
  user_agent text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS admin_audit_log_created_idx ON admin_audit_log (created_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS admin_audit_log_actor_idx ON admin_audit_log (actor_id, created_at DESC);
