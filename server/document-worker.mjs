import { mkdir, readFile, stat } from "node:fs/promises";
import { join } from "node:path";
import { Worker } from "bullmq";
import { createRedisConnection } from "./bull-services.mjs";
import { renderNativeDocument, renderPreviewPages } from "./document-renderer.mjs";
import { renderDocx } from "./docx-renderer.mjs";
import { objectStorageEnabled, uploadObject } from "./object-storage.mjs";
import { renderPdf } from "./pdf-renderer.mjs";

const connection = createRedisConnection();
if (!connection) throw new Error("REDIS_URL is required by the document worker");

const exportWorker = new Worker("resume-exports", async (job) => {
  const exportDir = process.env.EXPORT_DIR || job.data.outputDir;
  const outputPath = join(exportDir, `${job.data.id}.${job.data.format}`);
  await mkdir(exportDir, { recursive: true });
  let result;
  if (job.data.template.engine === "docx-native") {
    result = await renderNativeDocument({ sourcePath: job.data.template.sourcePath, outputPath, resume: job.data.resume, format: job.data.format });
  } else if (job.data.format === "docx") {
    result = await renderDocx({ outputPath, resume: job.data.resume, template: job.data.template });
  } else {
    const origin = String(process.env.APP_INTERNAL_ORIGIN || job.data.origin || "").replace(/\/$/, "");
    if (!origin) throw new Error("HTML PDF export requires APP_INTERNAL_ORIGIN");
    result = await renderPdf({
      url: `${origin}/internal/print/${encodeURIComponent(job.data.id)}?token=${encodeURIComponent(job.data.token)}`,
      outputPath
    });
  }
  if ((await stat(outputPath)).size < 1000) throw new Error("生成的文档无效");
  const objectKey = objectStorageEnabled()
    ? await uploadObject(`exports/${job.data.id}.${job.data.format}`, outputPath,
      job.data.format === "pdf" ? "application/pdf" : "application/vnd.openxmlformats-officedocument.wordprocessingml.document")
    : null;
  return { ...result, objectKey };
}, { connection, concurrency: 1, lockDuration: 90_000 });

const previewWorker = new Worker("resume-previews", async (job) => {
  const previewDir = process.env.PREVIEW_DIR || job.data.outputDir;
  const result = await renderPreviewPages({
    sourcePath: job.data.template.sourcePath,
    outputDir: join(previewDir, job.data.id),
    resume: job.data.resume,
    previewQuality: job.data.previewQuality
  });
  if (!objectStorageEnabled()) return result;
  const pages = [];
  for (const page of result.pages) {
    const key = `previews/${job.data.id}/${page}`;
    await uploadObject(key, join(previewDir, job.data.id, page), "image/webp");
    pages.push(key);
  }
  return { pageCount: pages.length, pages, objectStorage: true };
}, { connection, concurrency: 1, lockDuration: 90_000 });

async function memoryBytes() {
  try {
    return Number.parseInt(await readFile("/sys/fs/cgroup/memory.current", "utf8"), 10);
  } catch {
    return process.memoryUsage().rss;
  }
}

async function reportAndRecycle(job, result) {
  const bytes = await memoryBytes();
  console.log(JSON.stringify({ event: "document_job_completed", queue: job.queueName, jobId: job.id, durationMs: job.finishedOn - job.processedOn, memoryBytes: bytes, pageCount: result?.pageCount ?? null }));
  if (bytes > 900 * 1024 * 1024) {
    console.warn("Document worker exceeded 900 MB and will recycle after the current job");
    setTimeout(() => process.exit(0), 100).unref();
  }
}

exportWorker.on("completed", reportAndRecycle);
previewWorker.on("completed", reportAndRecycle);
exportWorker.on("failed", (job, error) => console.error(JSON.stringify({ event: "document_job_failed", queue: "resume-exports", jobId: job?.id, error: error.message })));
previewWorker.on("failed", (job, error) => console.error(JSON.stringify({ event: "document_job_failed", queue: "resume-previews", jobId: job?.id, error: error.message })));

async function shutdown() {
  await Promise.all([exportWorker.close(), previewWorker.close()]);
  await connection.quit();
}

process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
console.log("Document worker ready (concurrency=1)");
