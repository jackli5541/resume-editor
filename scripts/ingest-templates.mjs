import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { basename, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { createDatabase } from "../server/database.mjs";

const execFileAsync = promisify(execFile);
const projectRoot = fileURLToPath(new URL("../", import.meta.url));
const storageDir = process.env.TEMPLATE_STORAGE_DIR || join(projectRoot, "var", "templates");
const python = process.env.PYTHON_BIN || (process.platform === "win32" ? "python" : "python3");
const limitArg = process.argv.find((argument) => argument.startsWith("--limit="));
const limit = Number.parseInt(limitArg?.split("=")[1] || "10", 10);
const githubApi = "https://api.github.com/repos/mmmlllnnn/ResumeCollection";
const sourceDirectory = "1.中文简历";
const headers = {
  Accept: "application/vnd.github+json",
  "User-Agent": "resume-editor-template-ingest",
  ...(process.env.GITHUB_TOKEN ? { Authorization: `Bearer ${process.env.GITHUB_TOKEN}` } : {})
};

async function githubJson(path, optional = false) {
  const response = await fetch(`${githubApi}${path}`, { headers });
  if (optional && response.status === 404) return null;
  if (!response.ok) throw new Error(`GitHub API ${response.status}: ${await response.text()}`);
  return response.json();
}

async function download(url, outputPath) {
  const response = await fetch(url, { headers });
  if (!response.ok) throw new Error(`Download ${response.status}: ${url}`);
  const declaredSize = Number.parseInt(response.headers.get("content-length") || "0", 10);
  if (declaredSize > 20 * 1024 * 1024) throw new Error("Template exceeds 20 MB");
  const body = Buffer.from(await response.arrayBuffer());
  if (body.length > 20 * 1024 * 1024) throw new Error("Template exceeds 20 MB");
  if (body.subarray(0, 2).toString("ascii") !== "PK") throw new Error("Downloaded file is not a DOCX ZIP package");
  await writeFile(outputPath, body);
  return body;
}

async function analyze(sourcePath) {
  const { stdout } = await execFileAsync(
    python,
    [join(projectRoot, "scripts", "analyze-docx.py"), sourcePath],
    { maxBuffer: 5 * 1024 * 1024 }
  );
  return JSON.parse(stdout);
}

async function renderPreview(sourcePath, previewPath) {
  try {
    await execFileAsync(
      python,
      [join(projectRoot, "scripts", "render-docx-preview.py"), sourcePath, previewPath],
      { maxBuffer: 5 * 1024 * 1024, timeout: 120_000 }
    );
    return true;
  } catch (error) {
    console.warn(`Preview skipped for ${basename(sourcePath)}: ${error?.message || error}`);
    return false;
  }
}

async function upsertDatabase(pool, item) {
  if (!pool) return;
  await pool.query(`
    INSERT INTO templates (slug, name, category, description)
    VALUES ($1, $2, $3, $4)
    ON CONFLICT (slug) DO UPDATE SET
      name = EXCLUDED.name,
      description = EXCLUDED.description,
      updated_at = now()
  `, [item.slug, item.name, item.category, item.description]);
  await pool.query(`
    INSERT INTO template_versions (
      template_slug, version, status, engine, source_url, source_path,
      preview_path, sha256, license_status, manifest, analysis, slot_map
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb, $11::jsonb, '{}'::jsonb)
    ON CONFLICT (template_slug, version) DO UPDATE SET
      status = EXCLUDED.status,
      source_url = EXCLUDED.source_url,
      source_path = EXCLUDED.source_path,
      preview_path = EXCLUDED.preview_path,
      sha256 = EXCLUDED.sha256,
      license_status = EXCLUDED.license_status,
      manifest = EXCLUDED.manifest,
      analysis = EXCLUDED.analysis
  `, [
    item.slug, item.version, item.status, item.engine, item.sourceUrl,
    item.sourcePath, item.previewPath, item.sha256, item.licenseStatus,
    JSON.stringify(item.manifest), JSON.stringify(item.analysis)
  ]);
}

await mkdir(storageDir, { recursive: true });
const pool = createDatabase();

try {
  const root = await githubJson(`/contents/${encodeURIComponent(sourceDirectory)}?ref=main`);
  const directories = root
    .filter((item) => item.type === "dir")
    .sort((left, right) => left.name.localeCompare(right.name, "en", { numeric: true }))
    .slice(0, limit);
  const license = await githubJson("/license", true);
  const licenseStatus = license?.license?.spdx_id && license.license.spdx_id !== "NOASSERTION"
    ? license.license.spdx_id
    : "unverified";
  const templates = [];

  for (const directory of directories) {
    const entries = await githubJson(`/contents/${encodeURIComponent(sourceDirectory)}/${encodeURIComponent(directory.name)}?ref=main`);
    const docx = entries.find((item) => item.type === "file" && item.name.toLowerCase().endsWith(".docx"));
    if (!docx) {
      console.warn(`No DOCX in ${directory.name}`);
      continue;
    }

    const slug = `resume-collection-cn-${directory.name.replace(/[^a-z0-9-]/gi, "-").toLowerCase()}`;
    const versionDir = join(storageDir, slug, "v1");
    const sourcePath = join(versionDir, "source.docx");
    const previewPath = join(versionDir, "preview.png");
    await mkdir(versionDir, { recursive: true });
    const source = await download(docx.download_url, sourcePath);
    const analysis = await analyze(sourcePath);
    const hasPreview = await renderPreview(sourcePath, previewPath);
    const securityBlocked = analysis.macroParts.length > 0 || analysis.externalRelationships.length > 0;
    const item = {
      slug,
      name: docx.name.replace(/\.docx$/i, "").replaceAll("_", " "),
      category: "中文简历",
      description: `ResumeCollection ${directory.name}，待完成字段映射后发布`,
      version: 1,
      status: securityBlocked ? "blocked" : "needs_mapping",
      engine: "docx-native",
      sourceUrl: docx.html_url,
      sourcePath: relative(storageDir, sourcePath).replaceAll("\\", "/"),
      previewPath: hasPreview ? relative(storageDir, previewPath).replaceAll("\\", "/") : null,
      sha256: createHash("sha256").update(source).digest("hex"),
      licenseStatus,
      selectable: false,
      previewUrl: hasPreview ? `/template-assets/${relative(storageDir, previewPath).replaceAll("\\", "/")}` : null,
      manifest: {
        pageSize: "A4",
        supportedFormats: ["docx", "pdf"],
        sourceRepository: "mmmlllnnn/ResumeCollection",
        sourceDirectory: directory.name,
        originalFileName: docx.name
      },
      analysis
    };
    await writeFile(join(versionDir, "manifest.json"), JSON.stringify(item, null, 2));
    await upsertDatabase(pool, item);
    templates.push(item);
    console.log(`Ingested ${directory.name}: ${item.name} (${item.status})`);
  }

  const catalog = {
    generatedAt: new Date().toISOString(),
    sourceRepository: "https://github.com/mmmlllnnn/ResumeCollection",
    licenseStatus,
    templates
  };
  await writeFile(join(storageDir, "catalog.json"), JSON.stringify(catalog, null, 2));
  console.log(JSON.stringify({ count: templates.length, storageDir, licenseStatus }));
} finally {
  await pool?.end();
}
