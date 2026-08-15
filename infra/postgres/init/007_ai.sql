-- AI 生成能力：模型配置与调用审计。
-- 模型配置为单例行(id=1)，API Key 以 AES-256-GCM 密文落库，明文永不入库。
-- 本文件保持幂等，配合 scripts/migrate.mjs 按文件名顺序应用。

CREATE TABLE IF NOT EXISTS ai_model_config (
  id integer PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  provider text NOT NULL DEFAULT 'deepseek',
  base_url text NOT NULL DEFAULT 'https://api.deepseek.com',
  model text NOT NULL DEFAULT 'deepseek-chat',
  api_key_enc text NOT NULL DEFAULT '',
  api_key_hint text NOT NULL DEFAULT '',
  temperature real NOT NULL DEFAULT 0.2,
  max_input_chars integer NOT NULL DEFAULT 8000,
  max_output_tokens integer NOT NULL DEFAULT 1600,
  system_prompt text NOT NULL DEFAULT '',
  enabled boolean NOT NULL DEFAULT false,
  timeout_ms integer NOT NULL DEFAULT 30000,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES users(id) ON DELETE SET NULL
);

INSERT INTO ai_model_config (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

CREATE TABLE IF NOT EXISTS ai_generation_log (
  id bigserial PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  provider text NOT NULL,
  model text NOT NULL,
  status text NOT NULL CHECK (status IN ('ok', 'invalid_json', 'timeout', 'provider_error', 'rate_limited', 'blocked')),
  input_chars integer NOT NULL DEFAULT 0,
  output_chars integer NOT NULL DEFAULT 0,
  latency_ms integer NOT NULL DEFAULT 0,
  error_code text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ai_generation_log_user_created
  ON ai_generation_log (user_id, created_at DESC);
