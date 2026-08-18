-- 求职目标 Agent：不可变简历版本、目标任务与逐模块执行记录。
CREATE TABLE IF NOT EXISTS resume_versions (
  id uuid PRIMARY KEY,
  resume_id uuid NOT NULL REFERENCES resumes(id) ON DELETE CASCADE,
  revision integer NOT NULL,
  parent_version_id uuid REFERENCES resume_versions(id),
  target_session_id uuid,
  label text NOT NULL DEFAULT '手动保存',
  created_by text NOT NULL DEFAULT 'user' CHECK (created_by IN ('user', 'agent', 'restore', 'import')),
  data jsonb NOT NULL,
  change_set jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS resume_versions_resume_idx ON resume_versions(resume_id, created_at DESC);

CREATE TABLE IF NOT EXISTS target_sessions (
  id uuid PRIMARY KEY,
  resume_id uuid NOT NULL REFERENCES resumes(id) ON DELETE CASCADE,
  owner_id uuid REFERENCES users(id) ON DELETE CASCADE,
  base_revision integer NOT NULL,
  job_description text NOT NULL,
  target_profile jsonb NOT NULL DEFAULT '{}'::jsonb,
  diagnosis jsonb NOT NULL DEFAULT '{}'::jsonb,
  plan jsonb NOT NULL DEFAULT '[]'::jsonb,
  status text NOT NULL DEFAULT 'diagnosing' CHECK (status IN ('diagnosing','awaiting_plan_approval','executing','awaiting_user_evidence','validating','completed','cancelled')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE resume_versions DROP CONSTRAINT IF EXISTS resume_versions_target_session_id_fkey;
ALTER TABLE resume_versions ADD CONSTRAINT resume_versions_target_session_id_fkey FOREIGN KEY (target_session_id) REFERENCES target_sessions(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS target_sessions_owner_idx ON target_sessions(owner_id, updated_at DESC);

CREATE TABLE IF NOT EXISTS target_plan_changes (
  id uuid PRIMARY KEY,
  target_session_id uuid NOT NULL REFERENCES target_sessions(id) ON DELETE CASCADE,
  plan_item_id text NOT NULL,
  status text NOT NULL DEFAULT 'proposed' CHECK (status IN ('proposed','applied','skipped','reverted')),
  forward_patch jsonb NOT NULL DEFAULT '[]'::jsonb,
  inverse_patch jsonb NOT NULL DEFAULT '[]'::jsonb,
  evidence_refs jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(target_session_id, plan_item_id)
);
