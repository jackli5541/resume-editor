ALTER TABLE template_versions DROP CONSTRAINT IF EXISTS template_versions_status_check;
ALTER TABLE template_versions ADD CONSTRAINT template_versions_status_check
  CHECK (status IN ('ready', 'needs_mapping', 'needs_qa', 'blocked'));

UPDATE template_versions
SET status = 'needs_qa',
    engine = 'docx-native',
    manifest = manifest || '{"qa":{"approved":false},"renderPipeline":"docx-libreoffice"}'::jsonb
WHERE template_slug LIKE 'resume-collection-cn-%';
