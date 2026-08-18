import { randomUUID } from "node:crypto";

const ALLOWED_MIME_TYPES = new Set(["image/png", "image/jpeg", "image/webp"]);
export const MAX_SUPPORT_IMAGES = 5;
export const MAX_SUPPORT_IMAGE_BYTES = 2 * 1024 * 1024;

export class SupportImageRepository {
  constructor({ database } = {}) {
    this.database = database;
    this.memory = new Map();
  }

  async list({ enabledOnly = false } = {}) {
    if (this.database) {
      const result = await this.database.query(
        `SELECT id, label, mime_type, sort_order, enabled, created_at, updated_at
         FROM support_images ${enabledOnly ? "WHERE enabled = true" : ""}
         ORDER BY sort_order ASC, created_at ASC`
      );
      return result.rows.map(mapRow);
    }
    return [...this.memory.values()]
      .filter((item) => !enabledOnly || item.enabled)
      .sort((a, b) => a.sortOrder - b.sortOrder || a.createdAt.localeCompare(b.createdAt))
      .map(publicItem);
  }

  async count() {
    if (this.database) return Number((await this.database.query("SELECT count(*) AS count FROM support_images")).rows[0].count);
    return this.memory.size;
  }

  async create({ label, mimeType, data }) {
    if (!ALLOWED_MIME_TYPES.has(mimeType)) throw validation("仅支持 PNG、JPEG、WebP 图片");
    if (!Buffer.isBuffer(data) || !data.length || data.length > MAX_SUPPORT_IMAGE_BYTES) throw validation("图片大小必须在 2 MB 以内");
    if (!hasMatchingSignature(data, mimeType)) throw validation("图片内容与文件类型不匹配");
    if (await this.count() >= MAX_SUPPORT_IMAGES) throw validation(`最多上传 ${MAX_SUPPORT_IMAGES} 张赞赏码`);
    const id = randomUUID();
    const safeLabel = String(label || "赞赏码").trim().slice(0, 30) || "赞赏码";
    const items = await this.list();
    const sortOrder = items.length ? Math.max(...items.map((item) => item.sortOrder)) + 1 : 0;
    if (this.database) {
      const result = await this.database.query(
        `INSERT INTO support_images (id, label, mime_type, image_data, sort_order)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING id, label, mime_type, sort_order, enabled, created_at, updated_at`,
        [id, safeLabel, mimeType, data, sortOrder]
      );
      return mapRow(result.rows[0]);
    }
    const now = new Date().toISOString();
    this.memory.set(id, { id, label: safeLabel, mimeType, data, sortOrder, enabled: true, createdAt: now, updatedAt: now });
    return publicItem(this.memory.get(id));
  }

  async getData(id, { enabledOnly = false } = {}) {
    if (this.database) {
      const result = await this.database.query(`SELECT mime_type, image_data FROM support_images WHERE id = $1 ${enabledOnly ? "AND enabled = true" : ""}`, [id]);
      return result.rowCount ? { mimeType: result.rows[0].mime_type, data: result.rows[0].image_data } : null;
    }
    const item = this.memory.get(id);
    return item && (!enabledOnly || item.enabled) ? { mimeType: item.mimeType, data: item.data } : null;
  }

  async update(id, { label, enabled, sortOrder } = {}) {
    const current = (await this.list()).find((item) => item.id === id);
    if (!current) return null;
    const next = {
      label: label === undefined ? current.label : (String(label).trim().slice(0, 30) || "赞赏码"),
      enabled: enabled === undefined ? current.enabled : Boolean(enabled),
      sortOrder: sortOrder === undefined ? current.sortOrder : Math.max(0, Number.parseInt(sortOrder, 10) || 0)
    };
    if (this.database) {
      const result = await this.database.query(
        `UPDATE support_images SET label = $2, enabled = $3, sort_order = $4, updated_at = now()
         WHERE id = $1 RETURNING id, label, mime_type, sort_order, enabled, created_at, updated_at`,
        [id, next.label, next.enabled, next.sortOrder]
      );
      return result.rowCount ? mapRow(result.rows[0]) : null;
    }
    Object.assign(this.memory.get(id), next, { updatedAt: new Date().toISOString() });
    return publicItem(this.memory.get(id));
  }

  async remove(id) {
    if (this.database) return (await this.database.query("DELETE FROM support_images WHERE id = $1", [id])).rowCount > 0;
    return this.memory.delete(id);
  }
}

function mapRow(row) {
  return { id: row.id, label: row.label, mimeType: row.mime_type, sortOrder: row.sort_order, enabled: row.enabled, createdAt: row.created_at, updatedAt: row.updated_at, url: `/api/support/images/${row.id}` };
}
function publicItem(item) { return { id: item.id, label: item.label, mimeType: item.mimeType, sortOrder: item.sortOrder, enabled: item.enabled, createdAt: item.createdAt, updatedAt: item.updatedAt, url: `/api/support/images/${item.id}` }; }
function validation(message) { const error = new Error(message); error.statusCode = 400; return error; }
function hasMatchingSignature(data, mimeType) {
  if (mimeType === "image/png") return data.length >= 8 && data.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  if (mimeType === "image/jpeg") return data.length >= 3 && data[0] === 0xff && data[1] === 0xd8 && data[2] === 0xff;
  return data.length >= 12 && data.subarray(0, 4).toString("ascii") === "RIFF" && data.subarray(8, 12).toString("ascii") === "WEBP";
}
