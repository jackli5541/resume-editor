CREATE TABLE IF NOT EXISTS schema_migrations (
  version text PRIMARY KEY,
  applied_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS templates (
  slug text PRIMARY KEY,
  name text NOT NULL,
  category text NOT NULL DEFAULT '中文简历',
  description text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS template_versions (
  template_slug text NOT NULL REFERENCES templates(slug) ON DELETE CASCADE,
  version integer NOT NULL CHECK (version > 0),
  status text NOT NULL CHECK (status IN ('ready', 'needs_mapping', 'needs_qa', 'blocked')),
  engine text NOT NULL CHECK (engine IN ('html-native', 'docx-native')),
  source_url text,
  source_path text,
  preview_path text,
  sha256 text,
  license_status text NOT NULL DEFAULT 'unverified',
  manifest jsonb NOT NULL DEFAULT '{}'::jsonb,
  analysis jsonb NOT NULL DEFAULT '{}'::jsonb,
  slot_map jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (template_slug, version)
);

CREATE TABLE IF NOT EXISTS resumes (
  id uuid PRIMARY KEY,
  template_slug text NOT NULL,
  template_version integer NOT NULL,
  data jsonb NOT NULL DEFAULT '{}'::jsonb,
  revision integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (template_slug, template_version)
    REFERENCES template_versions(template_slug, version)
);

INSERT INTO templates (slug, name, category, description)
VALUES ('clean-single', '极简轻', '通用', '系统内置的结构化单栏模板')
ON CONFLICT (slug) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  updated_at = now();

INSERT INTO template_versions (
  template_slug, version, status, engine, license_status, manifest, analysis, slot_map
)
VALUES (
  'clean-single', 1, 'ready', 'html-native', 'internal',
  '{"pageSize":"A4","supportedFormats":["pdf","docx"],"supportedSections":["objective","education","experience","projects","richtext"]}'::jsonb,
  '{"layout":"820x1160"}'::jsonb,
  '{}'::jsonb
)
ON CONFLICT (template_slug, version) DO UPDATE SET
  status = EXCLUDED.status,
  manifest = EXCLUDED.manifest;
