// 把本地 var/templates 里已「ready」的模板状态同步回数据库。
// 用途：当 template-ingest 重新下载了原始模板、把已标注好的模板覆盖成 needs_mapping 后，
//   用本脚本直接从本地 manifest.json（status=ready）恢复 template_versions 的状态/清单/槽位映射。
// 用法（在 app 容器内）：node scripts/sync-published-templates.mjs
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { createDatabase } from "../server/database.mjs";

const projectRoot = fileURLToPath(new URL("../", import.meta.url));
const storageDir = process.env.TEMPLATE_STORAGE_DIR || join(projectRoot, "var", "templates");
const pool = createDatabase();
if (!pool) throw new Error("DATABASE_URL is required for template sync");

const SLUGS = [
  "resume-collection-cn-001",
  "resume-collection-cn-002",
  "resume-collection-cn-003",
  "resume-collection-cn-004",
  "resume-collection-cn-005",
  "resume-collection-cn-006",
  "resume-collection-cn-007",
  "resume-collection-cn-008",
  "resume-collection-cn-009",
  "resume-collection-cn-010"
];

try {
  for (const slug of SLUGS) {
    const manifestPath = join(storageDir, slug, "v1", "manifest.json");
    let item;
    try {
      item = JSON.parse(await readFile(manifestPath, "utf8"));
    } catch (error) {
      console.log(`跳过 ${slug}：无法读取 manifest（${error.message}）`);
      continue;
    }
    if (item.status !== "ready") {
      console.log(`跳过 ${slug}：状态为 ${item.status || "未知"}`);
      continue;
    }
    await pool.query(
      `UPDATE template_versions SET
         status = $2, engine = $3, source_path = $4, preview_path = $5,
         sha256 = $6, manifest = $7::jsonb, analysis = $8::jsonb, slot_map = $9::jsonb
       WHERE template_slug = $1 AND version = 1`,
      [
        slug,
        "ready",
        "docx-native",
        item.sourcePath,
        item.previewPath,
        item.sha256,
        JSON.stringify(item.manifest),
        JSON.stringify(item.analysis || null),
        JSON.stringify(item.slotMap || null)
      ]
    );
    if (item.description) {
      await pool.query(
        "UPDATE templates SET description = $2, updated_at = now() WHERE slug = $1",
        [slug, item.description]
      );
    }
    console.log(`已恢复 ${slug} → ready`);
  }
  console.log("同步完成");
} finally {
  await pool.end();
}
