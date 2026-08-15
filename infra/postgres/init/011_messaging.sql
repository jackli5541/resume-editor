-- 公告（面向全站用户）与站内信（用户级通知）。
-- 本文件保持幂等，配合 scripts/migrate.mjs 按文件名顺序应用。
CREATE TABLE IF NOT EXISTS announcements (
  id uuid PRIMARY KEY,
  title text NOT NULL,
  content text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published', 'archived')),
  created_by uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS announcements_status_idx ON announcements (status, created_at DESC);

CREATE TABLE IF NOT EXISTS user_messages (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title text NOT NULL,
  content text NOT NULL DEFAULT '',
  read_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS user_messages_user_idx ON user_messages (user_id, created_at DESC);
