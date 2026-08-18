-- 可恢复 AI 任务：浏览器刷新或离开页面后，生成/翻译仍可继续并恢复结果。
CREATE TABLE IF NOT EXISTS ai_jobs (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type text NOT NULL CHECK (type IN ('generate', 'translate')),
  status text NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'processing', 'completed', 'failed')),
  stage text NOT NULL DEFAULT 'queued',
  progress integer NOT NULL DEFAULT 5 CHECK (progress BETWEEN 0 AND 100),
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  result jsonb,
  error text,
  error_code text,
  attempts integer NOT NULL DEFAULT 0,
  consumed_at timestamptz,
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '24 hours'),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ai_jobs_user_recovery_idx
  ON ai_jobs (user_id, type, created_at DESC)
  WHERE consumed_at IS NULL;

CREATE INDEX IF NOT EXISTS ai_jobs_runnable_idx
  ON ai_jobs (status, updated_at)
  WHERE consumed_at IS NULL;
