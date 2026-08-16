-- 设备指纹与同人多账号检测（L1 服务端软指纹 + L2 客户端设备指纹）。
-- 只做「标记 + 人工复核」，不自动封禁。本文件保持幂等，配合 scripts/migrate.mjs 按文件名顺序应用。
--
-- fingerprint_type 取值：
--   client 客户端浏览器指纹（前端 canvas/WebGL/字体等生成的 deviceId，置信度高）
--   soft   服务端软指纹（IP + UA + Accept-Language + Accept-Encoding，置信度中）
--   ip     来源 IP（共享网络/NAT 下误报率较高，置信度低）
CREATE TABLE IF NOT EXISTS user_device_fingerprints (
  id bigserial PRIMARY KEY,
  fingerprint_type text NOT NULL CHECK (fingerprint_type IN ('client', 'soft', 'ip')),
  fingerprint_hash text NOT NULL,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  ip text,
  first_seen_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (fingerprint_type, fingerprint_hash, user_id)
);

CREATE INDEX IF NOT EXISTS user_device_fingerprints_hash_idx
  ON user_device_fingerprints (fingerprint_type, fingerprint_hash);
CREATE INDEX IF NOT EXISTS user_device_fingerprints_user_idx
  ON user_device_fingerprints (user_id);
