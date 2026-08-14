import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { createInitialResume } from "../public/core.mjs";

const origin = process.env.EXPORT_ORIGIN || "http://127.0.0.1:4173";
const outputPath = resolve(process.argv[2] || "output/pdf/backend-export-verification.pdf");
const resume = createInitialResume();

if (process.env.EXPORT_VERIFY_MULTIPAGE === "true") {
  const experience = resume.sections.find((section) => section.id === "experience");
  const source = experience.items[0];
  experience.items = Array.from({ length: 10 }, (_, index) => ({
    ...source,
    id: `verification-work-${index + 1}`,
    start: `${2014 + index}-01`,
    end: index === 9 ? "至今" : `${2015 + index}-01`,
    organization: `多页导出验证公司 ${index + 1}`
  }));
}

async function api(response) {
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.error || `HTTP ${response.status}`);
  return body;
}

const created = await api(await fetch(`${origin}/api/exports`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    resume,
    fileName: "后端导出验证.pdf"
  })
}));

let job = created;
for (let attempt = 0; attempt < 120 && !["completed", "failed"].includes(job.status); attempt += 1) {
  await new Promise((resolveDelay) => setTimeout(resolveDelay, 500));
  job = await api(await fetch(
    `${origin}/api/exports/${job.id}?token=${encodeURIComponent(job.token)}`,
    { cache: "no-store" }
  ));
}

if (job.status !== "completed") throw new Error(job.error || "导出任务超时");
const pdfResponse = await fetch(`${origin}${job.downloadUrl}`);
if (!pdfResponse.ok) throw new Error(`下载失败: HTTP ${pdfResponse.status}`);
const pdf = Buffer.from(await pdfResponse.arrayBuffer());
await mkdir(dirname(outputPath), { recursive: true });
await writeFile(outputPath, pdf);
console.log(JSON.stringify({ outputPath, bytes: pdf.length, pageCount: job.pageCount }));
