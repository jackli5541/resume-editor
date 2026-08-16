-- 手机号验证码登录（免密、新号自动注册）。
-- 本文件保持幂等，配合 scripts/migrate.mjs 按文件名顺序应用。

-- 1) 免密账号允许 password_hash 为空（OTP-only：验证码登录自动注册的用户无密码）。
ALTER TABLE users ALTER COLUMN password_hash DROP NOT NULL;

-- 2) 验证码表：只存哈希、恒时比较、用后即焚。
--    purpose 取值：'login'（验证码登录/注册）。预留 'reset_password' 等后续用途。
CREATE TABLE IF NOT EXISTS verification_codes (
  id uuid PRIMARY KEY,
  identifier text NOT NULL,          -- 归一化后的手机号（或邮箱）
  code_hash text NOT NULL,           -- 6 位数字验证码的 SHA-256 哈希
  purpose text NOT NULL,
  expires_at timestamptz NOT NULL,
  attempts integer NOT NULL DEFAULT 0,
  consumed boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS verification_codes_lookup_idx
  ON verification_codes (identifier, purpose, created_at);
