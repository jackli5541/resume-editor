import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { createInitialResume } from "../public/core.mjs";

const projectRoot = fileURLToPath(new URL("../", import.meta.url));
const origin = process.env.EXPORT_ORIGIN || "http://127.0.0.1:4173";
const outputDir = join(projectRoot, "output", "templates");
await mkdir(outputDir, { recursive: true });

async function json(response) {
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error || `HTTP ${response.status}`);
  return payload;
}

async function exportTemplate(template, format) {
  const resume = createInitialResume();
  resume.profile.name = "模板导出验证";
  resume.template = { slug: template.slug, version: template.version, name: template.name };
  let job = await json(await fetch(`${origin}/api/exports`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      format,
      template: { slug: template.slug, version: template.version },
      resume,
      fileName: `${template.slug}.${format}`
    })
  }));
  for (let attempt = 0; attempt < 240 && !["completed", "failed"].includes(job.status); attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 250));
    job = await json(await fetch(`${origin}/api/exports/${job.id}?token=${encodeURIComponent(job.token)}`));
  }
  if (job.status !== "completed") throw new Error(`${template.slug} ${format}: ${job.error || "timeout"}`);
  const response = await fetch(`${origin}${job.downloadUrl}`);
  if (!response.ok) throw new Error(`${template.slug} ${format} download failed`);
  const file = Buffer.from(await response.arrayBuffer());
  const signature = format === "pdf" ? file.subarray(0, 4).toString("ascii") : file.subarray(0, 2).toString("ascii");
  if ((format === "pdf" && signature !== "%PDF") || (format === "docx" && signature !== "PK")) {
    throw new Error(`${template.slug} ${format} has invalid signature`);
  }
  await writeFile(join(outputDir, `${template.slug}.${format}`), file);
  return { format, bytes: file.length, pageCount: job.pageCount };
}

const catalog = await json(await fetch(`${origin}/api/templates`));
const templates = catalog.templates.filter((item) => item.slug.startsWith("resume-collection-") && item.status === "ready");
const results = [];
for (const template of templates) {
  const pdf = await exportTemplate(template, "pdf");
  const docx = await exportTemplate(template, "docx");
  results.push({ slug: template.slug, pdf, docx });
  console.log(JSON.stringify(results.at(-1)));
}
await writeFile(join(outputDir, "verification.json"), JSON.stringify(results, null, 2));
