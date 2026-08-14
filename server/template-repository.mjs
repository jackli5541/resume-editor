import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

const BUILTIN_TEMPLATE = {
  slug: "clean-single",
  name: "清晰单栏",
  category: "通用",
  description: "系统内置的结构化单栏模板",
  version: 1,
  status: "ready",
  engine: "html-native",
  previewUrl: "/template-assets/clean-single/v1/preview.png",
  licenseStatus: "internal",
  selectable: true,
  supportedFormats: ["pdf", "docx"]
};

function mapRow(row) {
  return {
    slug: row.slug,
    name: row.name,
    category: row.category,
    description: row.description,
    version: row.version,
    status: row.status,
    engine: row.engine,
    previewUrl: row.preview_path ? `/template-assets/${row.preview_path.replaceAll("\\", "/")}` : null,
    licenseStatus: row.license_status,
    selectable: row.status === "ready",
    supportedFormats: row.manifest?.supportedFormats || ["pdf", "docx"],
    analysis: row.analysis || {}
  };
}

export class TemplateRepository {
  constructor({ database, storageDir }) {
    this.database = database;
    this.storageDir = storageDir;
  }

  async list() {
    if (this.database) {
      const result = await this.database.query(`
        SELECT t.slug, t.name, t.category, t.description,
               v.version, v.status, v.engine, v.preview_path,
               v.license_status, v.manifest, v.analysis
        FROM templates t
        JOIN LATERAL (
          SELECT * FROM template_versions tv
          WHERE tv.template_slug = t.slug
          ORDER BY tv.version DESC LIMIT 1
        ) v ON true
        ORDER BY (v.status = 'ready') DESC, t.slug ASC
      `);
      return result.rows.map(mapRow);
    }

    try {
      const catalog = JSON.parse(await readFile(join(this.storageDir, "catalog.json"), "utf8"));
      return [BUILTIN_TEMPLATE, ...catalog.templates.filter((item) => item.slug !== BUILTIN_TEMPLATE.slug)];
    } catch {
      return [BUILTIN_TEMPLATE];
    }
  }

  async get(slug, version) {
    if (this.database) {
      const result = await this.database.query(`
        SELECT t.slug, t.name, t.category, t.description,
               v.version, v.status, v.engine, v.source_path, v.preview_path,
               v.license_status, v.manifest, v.analysis, v.slot_map
        FROM templates t
        JOIN template_versions v ON v.template_slug = t.slug
        WHERE t.slug = $1 AND v.version = COALESCE($2::integer, (
          SELECT max(version) FROM template_versions WHERE template_slug = $1
        ))
      `, [slug, version || null]);
      return result.rows[0] || null;
    }
    return (await this.list()).find((item) => item.slug === slug && (!version || item.version === version)) || null;
  }

  async createResume({ templateSlug, templateVersion, data }) {
    const id = randomUUID();
    if (this.database) {
      await this.database.query(`
        INSERT INTO resumes (id, template_slug, template_version, data)
        VALUES ($1, $2, $3, $4::jsonb)
      `, [id, templateSlug, templateVersion, JSON.stringify(data || {})]);
    }
    return { id, templateSlug, templateVersion, revision: 1 };
  }
}
