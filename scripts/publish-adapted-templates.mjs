import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { readFile, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { createDatabase } from "../server/database.mjs";
import { buildEditorSchema } from "./template-editor-mappings.mjs";

const execFileAsync = promisify(execFile);
const projectRoot = fileURLToPath(new URL("../", import.meta.url));
const storageDir = process.env.TEMPLATE_STORAGE_DIR || join(projectRoot, "var", "templates");
const python = process.env.PYTHON_BIN || (process.platform === "win32" ? "python" : "python3");

const adapters = {
  "resume-collection-cn-001": { layout: "rounded-single", theme: "#5a779b", sanitized: true },
  "resume-collection-cn-002": { layout: "teal-single", theme: "#3f6f78" },
  "resume-collection-cn-003": { layout: "navy-single", theme: "#173e5a" },
  "resume-collection-cn-004": { layout: "coral-sidebar", theme: "#ef6464" },
  "resume-collection-cn-005": { layout: "navy-sidebar", theme: "#294d70" },
  "resume-collection-cn-006": { layout: "blue-geometric", theme: "#438fc9" },
  "resume-collection-cn-007": { layout: "cyan-dark-sidebar", theme: "#08a8de" },
  "resume-collection-cn-008": { layout: "nurse-sidebar", theme: "#3498db" },
  "resume-collection-cn-009": { layout: "creative-columns", theme: "#1599c7", minimumSsim: 0.82, maximumChangedRatio: 0.08, manualVisualOverride: true },
  "resume-collection-cn-010": { layout: "trade-columns", theme: "#009dcc" }
};

function slotMapFor(editorSchema) {
  return {
    profile: editorSchema.profileFields,
    sections: Object.fromEntries(editorSchema.sections.map((section) => [section.id, section.fields]))
  };
}

function validateEditorSchema(editorSchema, nativeSlots) {
  const tags = new Set(nativeSlots.tags || []);
  const missing = [];
  for (const field of editorSchema.profileFields) {
    if (!tags.has(`resume:profile.${field}`)) missing.push(`profile.${field}`);
  }
  for (const section of editorSchema.sections) {
    if (section.capabilities.addItems) {
      if (!tags.has(`resume:repeat:${section.id}`)) missing.push(`repeat:${section.id}`);
      for (const field of section.fields) {
        if (!tags.has(`resume:item.${field}`)) missing.push(`${section.id}.${field}`);
      }
    } else if (!tags.has(`resume:section:${section.id}.content`)) {
      missing.push(`${section.id}.content`);
    }
  }
  if (missing.length) throw new Error(`${editorSchema.slug} editor schema references missing slots: ${missing.join(", ")}`);
}

const catalogPath = join(storageDir, "catalog.json");
const catalog = JSON.parse(await readFile(catalogPath, "utf8"));
const pool = createDatabase();

try {
  for (const item of catalog.templates) {
    const adapter = adapters[item.slug];
    if (!adapter) continue;
    const versionDir = join(storageDir, item.slug, "v1");
    const sourceFile = "native.docx";
    const sourcePath = join(versionDir, sourceFile);
    const previewPath = join(versionDir, "preview.png");
    await Promise.all([stat(sourcePath), stat(previewPath)]);
    const source = await readFile(sourcePath);
    const { stdout } = await execFileAsync(python, [join(projectRoot, "scripts", "analyze-docx.py"), sourcePath], {
      maxBuffer: 5 * 1024 * 1024
    });
    const analysis = JSON.parse(stdout);
    if (analysis.macroParts.length || analysis.externalRelationships.length) {
      throw new Error(`${item.slug} still contains unsafe OOXML relationships`);
    }
    const { stdout: slotStdout } = await execFileAsync(python, [
      join(projectRoot, "scripts", "fill-docx-template.py"), "--inspect", sourcePath
    ], { maxBuffer: 1024 * 1024 });
    const nativeSlots = JSON.parse(slotStdout);
    const editorSchema = buildEditorSchema(item.slug, nativeSlots);
    const { stdout: defaultsStdout } = await execFileAsync(python, [
      join(projectRoot, "scripts", "fill-docx-template.py"), "--extract-defaults", sourcePath
    ], { maxBuffer: 5 * 1024 * 1024 });
    const extractedDefaults = JSON.parse(defaultsStdout);
    const defaultResume = {
      profile: extractedDefaults.profile || {},
      sections: editorSchema.sections.map((definition) => {
        const extracted = extractedDefaults.sections?.[definition.id] || {};
        return {
          id: definition.id,
          type: definition.type,
          title: extracted.title || definition.title,
          visible: true,
          ...(definition.type === "timeline" ? { items: extracted.items || [] } : { content: extracted.content || "" })
        };
      })
    };
    validateEditorSchema(editorSchema, nativeSlots);
    const slotMap = slotMapFor(editorSchema);
    const tags = nativeSlots.tags || [];
    const editingCapabilities = {
      editableSlots: tags,
      repeatableSections: nativeSlots.repeatSections || [],
      sortableZones: tags.filter((tag) => tag.startsWith("resume:zone:")).map((tag) => tag.slice("resume:zone:".length)),
      hideableSections: tags
        .filter((tag) => /^resume:section:[^.]+\.visible$/.test(tag))
        .map((tag) => tag.slice("resume:section:".length, -".visible".length)),
      fixedTemplateElementsLocked: true
    };
    const reportPath = item.manifest?.qa?.reportPath;
    const report = reportPath ? JSON.parse(await readFile(join(projectRoot, reportPath), "utf8")) : null;
    const reportQa = report?.qa || {};
    const reportHashMatches = reportQa.templateSha256 === createHash("sha256").update(source).digest("hex");
    const minimumSsim = adapter.minimumSsim ?? 0.98;
    const maximumChangedRatio = adapter.maximumChangedRatio ?? 0.02;
    const qaApproved = report?.slug === item.slug && reportHashMatches
      && (reportQa.automaticApproved === true || adapter.manualVisualOverride === true)
      && reportQa.manualApproved === true && reportQa.minimumSsim >= minimumSsim
      && reportQa.maximumChangedRatio <= maximumChangedRatio;
    const status = !nativeSlots.hasProfile ? "needs_mapping" : qaApproved ? "ready" : "needs_qa";

    Object.assign(item, {
      status,
      engine: "docx-native",
      description: status === "ready" ? `${item.name}，已通过高保真模板验收` : `${item.name}，等待 DOCX 母版标注与视觉验收`,
      sourcePath: `${item.slug}/v1/${sourceFile}`,
      previewPath: `${item.slug}/v1/preview.png`,
      previewUrl: `/template-assets/${item.slug}/v1/preview.png`,
      sha256: createHash("sha256").update(source).digest("hex"),
      selectable: status === "ready",
      analysis,
      manifest: {
        ...item.manifest,
        pageSize: "A4",
        supportedFormats: ["pdf", "docx"],
        adapter: { version: 2, layout: adapter.layout, theme: adapter.theme },
        renderPipeline: "docx-libreoffice",
        nativeSlots,
        editorSchema,
        defaultResume,
        layoutSchema: editorSchema.layoutSchema,
        editingCapabilities,
        qa: { ...reportQa, reportPath, approved: qaApproved }
      },
      slotMap
    });
    await writeFile(join(versionDir, "manifest.json"), JSON.stringify(item, null, 2));

    if (pool) {
      await pool.query("UPDATE templates SET description = $2, updated_at = now() WHERE slug = $1", [item.slug, item.description]);
      await pool.query(`
        UPDATE template_versions SET
          status = $8, engine = 'docx-native', source_path = $2, preview_path = $3,
          sha256 = $4, manifest = $5::jsonb, analysis = $6::jsonb, slot_map = $7::jsonb
        WHERE template_slug = $1 AND version = 1
      `, [
        item.slug, item.sourcePath, item.previewPath, item.sha256,
        JSON.stringify(item.manifest), JSON.stringify(item.analysis), JSON.stringify(slotMap), status
      ]);
    }
    console.log(`Published ${item.slug} (${adapter.layout})`);
  }
  catalog.generatedAt = new Date().toISOString();
  await writeFile(catalogPath, JSON.stringify(catalog, null, 2));
} finally {
  await pool?.end();
}
