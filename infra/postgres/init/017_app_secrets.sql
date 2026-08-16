-- 管理端可配置的外部服务密钥（阿里云验证码 / SMTP / 阿里云短信）。
-- 值使用 AES-256-GCM 加密后存储（value_enc），仅存脱敏提示（value_hint），绝不落明文。
-- 加密主密钥复用 AI_CONFIG_ENC_KEY（32 字节，hex 或 base64）。
CREATE TABLE IF NOT EXISTS app_secrets (
  key text PRIMARY KEY,
  value_enc text NOT NULL,
  value_hint text NOT NULL DEFAULT '',
  updated_at timestamptz NOT NULL DEFAULT now()
);
