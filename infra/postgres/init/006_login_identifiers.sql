-- 登录标识改为「邮箱或手机号」（至少一个）。用户名仅作展示昵称，不作为唯一标识。
-- 本文件保持幂等；同时清理上一版可能遗留的 username 列。
ALTER TABLE users DROP COLUMN IF EXISTS username;
ALTER TABLE users ADD COLUMN IF NOT EXISTS phone text;
ALTER TABLE users ALTER COLUMN email DROP NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS users_phone_key ON users (phone);
