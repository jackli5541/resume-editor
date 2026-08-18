import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { publicTemplateSchema } from "../public/template-schemas.mjs";

const BUILTIN_TEMPLATE = {
  slug: "clean-single",
  name: "极简轻",
  category: "通用",
  description: "系统内置的结构化单栏模板",
  tags: [],
  version: 1,
  status: "ready",
  engine: "html-native",
  previewUrl: "/template-assets/clean-single/v1/preview.png",
  licenseStatus: "internal",
  selectable: true,
  supportedFormats: ["pdf", "docx"]
};
BUILTIN_TEMPLATE.editorSchema = publicTemplateSchema(BUILTIN_TEMPLATE);
BUILTIN_TEMPLATE.layoutSchema = BUILTIN_TEMPLATE.editorSchema.layoutSchema;

// These templates keep their original DOCX assets as visual references and
// rollback material, but the product path uses the structured HTML renderer.
const HTML_ADAPTED_TEMPLATES = new Set(
  Array.from({ length: 10 }, (_, index) => `resume-collection-cn-${String(index + 1).padStart(3, "0")}`)
);
const HTML_PREVIEW_REVISION = "structured-v2";

function previewUrlFor(slug, previewPath) {
  if (!previewPath) return null;
  const url = `/template-assets/${previewPath.replaceAll("\\", "/")}`;
  return HTML_ADAPTED_TEMPLATES.has(slug) ? `${url}?preview=${HTML_PREVIEW_REVISION}` : url;
}

function mapRow(row) {
  const htmlAdapted = HTML_ADAPTED_TEMPLATES.has(row.slug);
  const native = row.engine === "docx-native" && !htmlAdapted;
  const editorSchema = htmlAdapted
    ? publicTemplateSchema(row.slug)
    : row.manifest?.editorSchema || (native ? null : publicTemplateSchema(row.slug));
  const status = native && !editorSchema ? "needs_mapping" : row.status;
  return {
    slug: row.slug,
    name: row.name,
    category: row.category,
    description: row.description,
    tags: Array.isArray(row.tags) ? row.tags : [],
    version: row.version,
    status,
    engine: htmlAdapted ? "html-native" : row.engine,
    previewUrl: previewUrlFor(row.slug, row.preview_path),
    licenseStatus: row.license_status,
    selectable: status === "ready" && Boolean(editorSchema),
    supportedFormats: row.manifest?.supportedFormats || ["pdf", "docx"],
    analysis: row.analysis || {},
    editorSchema,
    defaultResume: htmlAdapted ? null : row.manifest?.defaultResume || null,
    layoutSchema: htmlAdapted ? editorSchema?.layoutSchema || null : row.manifest?.layoutSchema || editorSchema?.layoutSchema || null,
    styleControls: editorSchema?.styleControls || {}
  };
}

function mapTemplateDetail(row) {
  if (!row) return null;
  return {
    ...mapRow(row),
    sourcePath: row.source_path || null,
    previewPath: row.preview_path || null,
    manifest: row.manifest || {},
    slotMap: row.slot_map || {}
  };
}

export class TemplateRepository {
  constructor({ database, storageDir }) {
    this.database = database;
    this.storageDir = storageDir;
    this.localResumes = new Map();
  }

  async list() {
    if (this.database) {
      const result = await this.database.query(`
        SELECT t.slug, t.name, t.category, t.description, t.tags,
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
      const external = catalog.templates
        .filter((item) => item.slug !== BUILTIN_TEMPLATE.slug)
        .map((item) => {
          const nativeSlots = item.manifest?.nativeSlots;
          const approved = item.manifest?.qa?.approved === true;
          const editorSchema = item.manifest?.editorSchema;
          if (item.engine === "docx-native" && nativeSlots?.hasProfile && approved && editorSchema) return item;
          return {
            ...item,
            status: nativeSlots?.hasProfile ? "needs_qa" : "needs_mapping",
            selectable: false,
            engine: "schema-v2"
          };
        });
      return [BUILTIN_TEMPLATE, ...external].map((item) => {
        const htmlAdapted = HTML_ADAPTED_TEMPLATES.has(item.slug);
        const editorSchema = htmlAdapted
          ? publicTemplateSchema(item.slug)
          : item.manifest?.editorSchema || (item.slug === BUILTIN_TEMPLATE.slug ? publicTemplateSchema(item.slug) : null);
        return {
          ...item,
          engine: htmlAdapted ? "html-native" : item.engine,
          previewUrl: previewUrlFor(item.slug, item.previewUrl?.replace(/^\/template-assets\//, "").split("?")[0]),
          editorSchema,
          defaultResume: htmlAdapted ? null : item.manifest?.defaultResume || null,
          layoutSchema: htmlAdapted ? editorSchema?.layoutSchema || null : item.manifest?.layoutSchema || editorSchema?.layoutSchema || null,
          styleControls: editorSchema?.styleControls || {}
        };
      });
    } catch {
      return [BUILTIN_TEMPLATE];
    }
  }

  async get(slug, version) {
    if (this.database) {
      const result = await this.database.query(`
        SELECT t.slug, t.name, t.category, t.description, t.tags,
               v.version, v.status, v.engine, v.source_path, v.preview_path,
               v.license_status, v.manifest, v.analysis, v.slot_map
        FROM templates t
        JOIN template_versions v ON v.template_slug = t.slug
        WHERE t.slug = $1 AND v.version = COALESCE($2::integer, (
          SELECT max(version) FROM template_versions WHERE template_slug = $1
        ))
      `, [slug, version || null]);
      return mapTemplateDetail(result.rows[0]);
    }
    const item = (await this.list()).find((candidate) => candidate.slug === slug && (!version || candidate.version === version));
    if (!item) return null;
    return {
      ...item,
      sourcePath: item.sourcePath || null,
      manifest: item.manifest || {},
      slotMap: item.slotMap || {},
      editorSchema: item.editorSchema || publicTemplateSchema(item.slug),
      layoutSchema: item.layoutSchema || publicTemplateSchema(item.slug).layoutSchema
    };
  }

  async createResume({ templateSlug, templateVersion, data, ownerId }) {
    const id = randomUUID();
    if (this.database) {
      await this.database.query(`
        INSERT INTO resumes (id, template_slug, template_version, data, owner_id)
        VALUES ($1, $2, $3, $4::jsonb, $5)
      `, [id, templateSlug, templateVersion, JSON.stringify(data || {}), ownerId || null]);
    } else {
      const now = new Date().toISOString();
      this.localResumes.set(id, {
        id,
        templateSlug,
        templateVersion,
        data: data || {},
        revision: 1,
        ownerId: ownerId || null,
        deletedAt: null,
        createdAt: now,
        updatedAt: now
      });
    }
    return { id, templateSlug, templateVersion, revision: 1 };
  }

  async getResume(id, ownerId) {
    if (!this.database) {
      const resume = this.localResumes.get(id) || null;
      if (!resume || resume.deletedAt || (ownerId && resume.ownerId !== ownerId)) return null;
      return resume;
    }
    const result = ownerId
      ? await this.database.query(`
          SELECT id, template_slug, template_version, data, revision, created_at, updated_at
          FROM resumes WHERE id = $1 AND owner_id = $2 AND deleted_at IS NULL
        `, [id, ownerId])
      : await this.database.query(`
          SELECT id, template_slug, template_version, data, revision, created_at, updated_at
          FROM resumes WHERE id = $1 AND deleted_at IS NULL
        `, [id]);
    const row = result.rows[0];
    if (!row) return null;
    return {
      id: row.id,
      templateSlug: row.template_slug,
      templateVersion: row.template_version,
      data: row.data,
      revision: row.revision,
      createdAt: row.created_at,
      updatedAt: row.updated_at
    };
  }

  async listResumes({ limit = 20, ownerId } = {}) {
    if (!this.database) {
      const templates = await this.list();
      return [...this.localResumes.values()]
        .filter((resume) => !resume.deletedAt && (!ownerId || resume.ownerId === ownerId))
        .sort((left, right) => new Date(right.updatedAt) - new Date(left.updatedAt))
        .slice(0, Math.min(Math.max(limit, 1), 50))
        .map((resume) => ({
          id: resume.id,
          templateSlug: resume.templateSlug,
          templateVersion: resume.templateVersion,
          templateName: templates.find((template) => template.slug === resume.templateSlug && template.version === resume.templateVersion)?.name || resume.templateSlug,
          candidateName: resume.data?.profile?.name || "未命名简历",
          title: resume.data?.title || "在线简历",
          revision: resume.revision,
          updatedAt: resume.updatedAt
        }));
    }
    const conditions = ["r.deleted_at IS NULL"];
    const params = [];
    if (ownerId) {
      conditions.push("r.owner_id = $1");
      params.push(ownerId);
    }
    const where = `WHERE ${conditions.join(" AND ")}`;
    const listParams = [...params, Math.min(Math.max(limit, 1), 50)];
    const result = await this.database.query(`
      SELECT r.id, r.template_slug, r.template_version, r.revision, r.updated_at,
             t.name AS template_name,
             COALESCE(NULLIF(r.data #>> '{profile,name}', ''), '未命名简历') AS candidate_name,
             COALESCE(NULLIF(r.data ->> 'title', ''), '在线简历') AS title
      FROM resumes r
      LEFT JOIN templates t ON t.slug = r.template_slug
      ${where}
      ORDER BY r.updated_at DESC
      LIMIT $${params.length + 1}
    `, listParams);
    return result.rows.map((row) => ({
      id: row.id,
      templateSlug: row.template_slug,
      templateVersion: row.template_version,
      templateName: row.template_name || row.template_slug,
      candidateName: row.candidate_name,
      title: row.title,
      revision: row.revision,
      updatedAt: row.updated_at
    }));
  }

  // 管理员全量草稿列表（不过滤 ownerId，附带所属用户邮箱）。
  async listAllResumes({ limit = 200, offset = 0, search = "", template = "", from = "", to = "" } = {}) {
    const safeLimit = Math.min(Math.max(Number(limit) || 200, 1), 500);
    const safeOffset = Math.max(Number(offset) || 0, 0);
    const term = String(search || "").trim();

    if (!this.database) {
      const templates = await this.list();
      let resumes = [...this.localResumes.values()]
        .filter((resume) => !resume.deletedAt)
        .sort((left, right) => new Date(right.updatedAt) - new Date(left.updatedAt))
        .map((resume) => ({
          id: resume.id,
          ownerId: resume.ownerId || null,
          ownerIdentifier: null,
          templateSlug: resume.templateSlug,
          templateVersion: resume.templateVersion,
          templateName: templates.find((template) => template.slug === resume.templateSlug && template.version === resume.templateVersion)?.name || resume.templateSlug,
          candidateName: resume.data?.profile?.name || "未命名简历",
          title: resume.data?.title || "在线简历",
          revision: resume.revision,
          updatedAt: resume.updatedAt
        }));
      if (term) {
        const needle = term.toLowerCase();
        resumes = resumes.filter((resume) =>
          resume.candidateName.toLowerCase().includes(needle)
          || resume.title.toLowerCase().includes(needle)
        );
      }
      if (template) resumes = resumes.filter((resume) => resume.templateSlug === template);
      if (from) {
        const fromDate = new Date(from);
        resumes = resumes.filter((resume) => new Date(resume.updatedAt) >= fromDate);
      }
      if (to) {
        const toDate = new Date(to);
        toDate.setDate(toDate.getDate() + 1);
        resumes = resumes.filter((resume) => new Date(resume.updatedAt) < toDate);
      }
      return { total: resumes.length, resumes: resumes.slice(safeOffset, safeOffset + safeLimit) };
    }

    const conditions = ["r.deleted_at IS NULL"];
    const params = [];
    if (term) {
      params.push(`%${term}%`);
      conditions.push(`(u.email ILIKE $${params.length} OR u.phone ILIKE $${params.length} OR COALESCE(NULLIF(r.data #>> '{profile,name}', ''), '') ILIKE $${params.length} OR COALESCE(NULLIF(r.data ->> 'title', ''), '') ILIKE $${params.length})`);
    }
    if (template) {
      params.push(template);
      conditions.push(`r.template_slug = $${params.length}`);
    }
    if (from) {
      params.push(from);
      conditions.push(`r.updated_at >= $${params.length}::date`);
    }
    if (to) {
      params.push(to);
      conditions.push(`r.updated_at < ($${params.length}::date + interval '1 day')`);
    }
    const where = `WHERE ${conditions.join(" AND ")}`;
    const countResult = await this.database.query(
      `SELECT count(*)::int AS total FROM resumes r LEFT JOIN users u ON u.id = r.owner_id ${where}`,
      params
    );
    const listParams = [...params, safeLimit, safeOffset];
    const result = await this.database.query(
      `SELECT r.id, r.owner_id, r.template_slug, r.template_version, r.revision, r.updated_at,
              t.name AS template_name,
              COALESCE(u.email, u.phone) AS owner_identifier,
              COALESCE(NULLIF(r.data #>> '{profile,name}', ''), '未命名简历') AS candidate_name,
              COALESCE(NULLIF(r.data ->> 'title', ''), '在线简历') AS title
       FROM resumes r
       LEFT JOIN templates t ON t.slug = r.template_slug
       LEFT JOIN users u ON u.id = r.owner_id
       ${where}
       ORDER BY r.updated_at DESC
       LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      listParams
    );
    return {
      total: countResult.rows[0]?.total ?? 0,
      resumes: result.rows.map((row) => ({
        id: row.id,
        ownerId: row.owner_id,
        ownerIdentifier: row.owner_identifier || null,
        templateSlug: row.template_slug,
        templateVersion: row.template_version,
        templateName: row.template_name || row.template_slug,
        candidateName: row.candidate_name,
        title: row.title,
        revision: row.revision,
        updatedAt: row.updated_at
      }))
    };
  }

  async updateResume({ id, revision, data, ownerId }) {
    if (!this.database) {
      const existing = this.localResumes.get(id);
      if (!existing || existing.revision !== revision) return null;
      if (ownerId && existing.ownerId !== ownerId) return null;
      existing.data = data || {};
      existing.revision += 1;
      existing.updatedAt = new Date().toISOString();
      return { revision: existing.revision, updated_at: existing.updatedAt };
    }
    const result = ownerId
      ? await this.database.query(`
          UPDATE resumes
          SET data = $3::jsonb, revision = revision + 1, updated_at = now()
          WHERE id = $1 AND revision = $2 AND owner_id = $4
          RETURNING revision, updated_at
        `, [id, revision, JSON.stringify(data || {}), ownerId])
      : await this.database.query(`
          UPDATE resumes
          SET data = $3::jsonb, revision = revision + 1, updated_at = now()
          WHERE id = $1 AND revision = $2
          RETURNING revision, updated_at
        `, [id, revision, JSON.stringify(data || {})]);
    return result.rows[0] || null;
  }

  async deleteResume(id, ownerId) {
    if (!this.database) {
      const existing = this.localResumes.get(id);
      if (!existing || existing.deletedAt || (ownerId && existing.ownerId !== ownerId)) return false;
      const now = new Date().toISOString();
      existing.deletedAt = now;
      existing.updatedAt = now;
      return true;
    }
    const result = ownerId
      ? await this.database.query(
          "UPDATE resumes SET deleted_at = now(), updated_at = now() WHERE id = $1 AND owner_id = $2 AND deleted_at IS NULL",
          [id, ownerId]
        )
      : await this.database.query(
          "UPDATE resumes SET deleted_at = now(), updated_at = now() WHERE id = $1 AND deleted_at IS NULL",
          [id]
        );
    return result.rowCount === 1;
  }

  // —— 回收站：按 ownerId 批量软删除/彻底删除 + 单个草稿恢复/彻底删除 ——

  async softDeleteByOwner(ownerId) {
    if (!this.database) {
      const now = new Date().toISOString();
      for (const resume of this.localResumes.values()) {
        if (resume.ownerId === ownerId && !resume.deletedAt) {
          resume.deletedAt = now;
          resume.updatedAt = now;
        }
      }
      return true;
    }
    await this.database.query(
      "UPDATE resumes SET deleted_at = now(), updated_at = now() WHERE owner_id = $1 AND deleted_at IS NULL",
      [ownerId]
    );
    return true;
  }

  async purgeByOwner(ownerId) {
    if (!this.database) {
      for (const [id, resume] of this.localResumes) {
        if (resume.ownerId === ownerId) this.localResumes.delete(id);
      }
      return true;
    }
    await this.database.query("DELETE FROM resumes WHERE owner_id = $1", [ownerId]);
    return true;
  }

  async listDeletedResumes({ limit = 200, offset = 0, search = "", from = "", to = "" } = {}) {
    const safeLimit = Math.min(Math.max(Number(limit) || 200, 1), 500);
    const safeOffset = Math.max(Number(offset) || 0, 0);
    const term = String(search || "").trim();

    if (!this.database) {
      const templates = await this.list();
      let resumes = [...this.localResumes.values()]
        .filter((resume) => resume.deletedAt)
        .sort((left, right) => new Date(right.deletedAt) - new Date(left.deletedAt))
        .map((resume) => ({
          id: resume.id,
          ownerId: resume.ownerId || null,
          templateSlug: resume.templateSlug,
          templateVersion: resume.templateVersion,
          templateName: templates.find((template) => template.slug === resume.templateSlug && template.version === resume.templateVersion)?.name || resume.templateSlug,
          candidateName: resume.data?.profile?.name || "未命名简历",
          title: resume.data?.title || "在线简历",
          deletedAt: resume.deletedAt
        }));
      if (term) {
        const needle = term.toLowerCase();
        resumes = resumes.filter((resume) =>
          (resume.candidateName || "").toLowerCase().includes(needle)
          || (resume.title || "").toLowerCase().includes(needle)
        );
      }
      if (from) {
        const fromDate = new Date(from);
        resumes = resumes.filter((resume) => new Date(resume.deletedAt) >= fromDate);
      }
      if (to) {
        const toDate = new Date(to);
        toDate.setDate(toDate.getDate() + 1);
        resumes = resumes.filter((resume) => new Date(resume.deletedAt) < toDate);
      }
      return { total: resumes.length, resumes: resumes.slice(safeOffset, safeOffset + safeLimit) };
    }

    const conditions = ["r.deleted_at IS NOT NULL"];
    const params = [];
    if (term) {
      params.push(`%${term}%`);
      conditions.push(`(u.email ILIKE $${params.length} OR u.phone ILIKE $${params.length} OR COALESCE(NULLIF(r.data #>> '{profile,name}', ''), '') ILIKE $${params.length} OR COALESCE(NULLIF(r.data ->> 'title', ''), '') ILIKE $${params.length})`);
    }
    if (from) {
      params.push(from);
      conditions.push(`r.deleted_at >= $${params.length}::date`);
    }
    if (to) {
      params.push(to);
      conditions.push(`r.deleted_at < ($${params.length}::date + interval '1 day')`);
    }
    const where = `WHERE ${conditions.join(" AND ")}`;
    const countResult = await this.database.query(
      `SELECT count(*)::int AS total FROM resumes r LEFT JOIN users u ON u.id = r.owner_id ${where}`,
      params
    );
    const listParams = [...params, safeLimit, safeOffset];
    const result = await this.database.query(
      `SELECT r.id, r.owner_id, r.template_slug, r.template_version, r.deleted_at,
              t.name AS template_name,
              COALESCE(u.email, u.phone) AS owner_identifier,
              COALESCE(NULLIF(r.data #>> '{profile,name}', ''), '未命名简历') AS candidate_name,
              COALESCE(NULLIF(r.data ->> 'title', ''), '在线简历') AS title
       FROM resumes r
       LEFT JOIN templates t ON t.slug = r.template_slug
       LEFT JOIN users u ON u.id = r.owner_id
       ${where}
       ORDER BY r.deleted_at DESC
       LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      listParams
    );
    return {
      total: countResult.rows[0]?.total ?? 0,
      resumes: result.rows.map((row) => ({
        id: row.id,
        ownerId: row.owner_id,
        ownerIdentifier: row.owner_identifier || null,
        templateSlug: row.template_slug,
        templateVersion: row.template_version,
        templateName: row.template_name || row.template_slug,
        candidateName: row.candidate_name,
        title: row.title,
        deletedAt: row.deleted_at
      }))
    };
  }

  async restoreResume(id) {
    if (!this.database) {
      const existing = this.localResumes.get(id);
      if (!existing || !existing.deletedAt) return false;
      existing.deletedAt = null;
      existing.updatedAt = new Date().toISOString();
      return true;
    }
    const result = await this.database.query(
      "UPDATE resumes SET deleted_at = NULL, updated_at = now() WHERE id = $1 AND deleted_at IS NOT NULL",
      [id]
    );
    return result.rowCount === 1;
  }

  async purgeResume(id) {
    if (!this.database) {
      const existing = this.localResumes.get(id);
      if (!existing || !existing.deletedAt) return false;
      return this.localResumes.delete(id);
    }
    const result = await this.database.query(
      "DELETE FROM resumes WHERE id = $1 AND deleted_at IS NOT NULL",
      [id]
    );
    return result.rowCount === 1;
  }

  // 管理端模板状态流转：发布(ready) / 打回(needs_mapping|needs_qa) / 下架(blocked)。
  async updateTemplateStatus(slug, version, status) {
    const allowed = new Set(["ready", "needs_mapping", "needs_qa", "blocked"]);
    if (!allowed.has(status)) return null;
    if (!this.database) return null;
    const result = await this.database.query(
      `UPDATE template_versions SET status = $3
       WHERE template_slug = $1 AND version = $2
       RETURNING template_slug, version, status`,
      [slug, version, status]
    );
    return result.rows[0] || null;
  }

  async updateTemplateMetadata(slug, metadata) {
    if (!this.database) return null;
    const result = await this.database.query(
      `UPDATE templates
       SET name = $2, description = $3, category = $4, tags = $5, updated_at = now()
       WHERE slug = $1
       RETURNING slug, name, description, category, tags`,
      [slug, metadata.name, metadata.description, metadata.category, metadata.tags]
    );
    return result.rows[0] || null;
  }

  async bulkUpdateTemplates(items, changes) {
    if (!this.database) return [];
    const client = await this.database.connect();
    try {
      await client.query("BEGIN");
      const updated = [];
      for (const item of items) {
        if (changes.status) {
          const result = await client.query(
            `UPDATE template_versions SET status = $3
             WHERE template_slug = $1 AND version = $2
             RETURNING template_slug, version, status`,
            [item.slug, item.version, changes.status]
          );
          if (result.rows[0]) updated.push(result.rows[0]);
        } else {
          const result = await client.query(
            `UPDATE templates SET category = $2, updated_at = now()
             WHERE slug = $1 RETURNING slug, category`,
            [item.slug, changes.category]
          );
          if (result.rows[0]) updated.push(result.rows[0]);
        }
      }
      await client.query("COMMIT");
      return updated;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }
}
