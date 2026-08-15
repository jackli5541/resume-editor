-- 用户反馈与客服工单。
-- 本文件保持幂等，配合 scripts/migrate.mjs 按文件名顺序应用。
CREATE TABLE IF NOT EXISTS feedbacks (
  id uuid PRIMARY KEY,
  user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  type text NOT NULL DEFAULT 'suggestion' CHECK (type IN ('bug', 'suggestion', 'question', 'other')),
  content text NOT NULL,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'in_progress', 'resolved', 'closed')),
  reply text NOT NULL DEFAULT '',
  replied_by uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS feedbacks_status_idx ON feedbacks (status, created_at DESC);
