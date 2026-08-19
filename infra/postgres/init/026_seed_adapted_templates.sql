-- 将仓库内已经完成结构化适配的 10 个模板登记到新数据库。
-- 这些模板的产品渲染路径为 HTML；原始 DOCX 继续作为版本化参考资产保留。
WITH adapted_templates(slug, name, description) AS (
  VALUES
    ('resume-collection-cn-001', '非常好用的免费简历模板', '非常好用的免费简历模板，已完成结构化适配'),
    ('resume-collection-cn-002', '简约风求职简历模板', '简约风求职简历模板，已完成结构化适配'),
    ('resume-collection-cn-003', '应届毕业生免费简历模板', '应届毕业生免费简历模板，已完成结构化适配'),
    ('resume-collection-cn-004', '砖红色通用免费简历模板', '砖红色通用免费简历模板，已完成结构化适配'),
    ('resume-collection-cn-005', '左右双栏风免费简历模板', '左右双栏风免费简历模板，已完成结构化适配'),
    ('resume-collection-cn-006', '个人简历免费模板', '个人简历免费模板，已完成结构化适配'),
    ('resume-collection-cn-007', '项目经理负责人免费简历模板', '项目经理负责人免费简历模板，已完成结构化适配'),
    ('resume-collection-cn-008', '护士免费求职简历模板', '护士免费求职简历模板，已完成结构化适配'),
    ('resume-collection-cn-009', '创意免费求职简历模板', '创意免费求职简历模板，已完成结构化适配'),
    ('resume-collection-cn-010', '国际贸易风免费简历模板', '国际贸易风免费简历模板，已完成结构化适配')
)
INSERT INTO templates (slug, name, category, description)
SELECT slug, name, '中文简历', description
FROM adapted_templates
ON CONFLICT (slug) DO UPDATE SET
  name = EXCLUDED.name,
  category = EXCLUDED.category,
  description = EXCLUDED.description,
  updated_at = now();

WITH adapted_templates(slug) AS (
  VALUES
    ('resume-collection-cn-001'), ('resume-collection-cn-002'),
    ('resume-collection-cn-003'), ('resume-collection-cn-004'),
    ('resume-collection-cn-005'), ('resume-collection-cn-006'),
    ('resume-collection-cn-007'), ('resume-collection-cn-008'),
    ('resume-collection-cn-009'), ('resume-collection-cn-010')
)
INSERT INTO template_versions (
  template_slug, version, status, engine, source_path, preview_path,
  license_status, manifest, analysis, slot_map
)
SELECT
  slug,
  1,
  'ready',
  'html-native',
  slug || '/v1/native.docx',
  slug || '/v1/preview.png',
  'MIT',
  '{"pageSize":"A4","supportedFormats":["pdf","docx"],"renderPipeline":"structured-html","adapted":true}'::jsonb,
  '{}'::jsonb,
  '{}'::jsonb
FROM adapted_templates
ON CONFLICT (template_slug, version) DO UPDATE SET
  status = 'ready',
  engine = 'html-native',
  source_path = EXCLUDED.source_path,
  preview_path = EXCLUDED.preview_path,
  license_status = EXCLUDED.license_status,
  manifest = template_versions.manifest || EXCLUDED.manifest;
