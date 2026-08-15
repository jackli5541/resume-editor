import { randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import { mkdir, stat, unlink } from "node:fs/promises";
import { join } from "node:path";
import { renderPdf } from "./pdf-renderer.mjs";
import { renderDocx } from "./docx-renderer.mjs";
import { renderNativeDocument } from "./document-renderer.mjs";

async function renderPdfForTemplate(options) {
  if (options.template?.engine === "docx-native") {
    return renderNativeDocument({ ...options, sourcePath: options.template.sourcePath, format: "pdf" });
  }
  return renderPdf(options);
}

async function renderDocxForTemplate(options) {
  if (options.template?.engine === "docx-native") {
    return renderNativeDocument({ ...options, sourcePath: options.template.sourcePath, format: "docx" });
  }
  return renderDocx(options);
}

function tokenMatches(expected, actual) {
  if (!expected || !actual) return false;
  const left = Buffer.from(expected);
  const right = Buffer.from(actual);
  return left.length === right.length && timingSafeEqual(left, right);
}

export class ExportService {
  constructor(options = {}) {
    this.outputDir = options.outputDir;
    this.origin = options.origin || "";
    this.renderers = options.renderers || {
      pdf: options.renderer || renderPdfForTemplate,
      docx: options.docxRenderer || renderDocxForTemplate
    };
    this.ttlMs = options.ttlMs || 30 * 60 * 1000;
    this.jobs = new Map();
    this.queue = [];
    this.processing = false;
    this.cleanupTimer = setInterval(() => this.cleanup(), Math.min(this.ttlMs, 60_000));
    this.cleanupTimer.unref();
  }

  setOrigin(origin) {
    this.origin = origin;
  }

  async create({ resume, fileName, format = "pdf", template }) {
    await mkdir(this.outputDir, { recursive: true });
    const id = randomUUID();
    const token = randomBytes(32).toString("base64url");
    const job = {
      id,
      token,
      resume,
      fileName,
      format,
      template,
      status: "queued",
      createdAt: Date.now(),
      updatedAt: Date.now(),
      outputPath: join(this.outputDir, `${id}.${format}`),
      pageCount: null,
      error: null
    };
    this.jobs.set(id, job);
    this.queue.push(job);
    queueMicrotask(() => this.processQueue());
    return this.toPublic(job);
  }

  get(id, token) {
    const job = this.jobs.get(id);
    return job && tokenMatches(job.token, token) ? job : null;
  }

  toPublic(job) {
    return {
      id: job.id,
      token: job.token,
      status: job.status,
      format: job.format,
      createdAt: new Date(job.createdAt).toISOString(),
      updatedAt: new Date(job.updatedAt).toISOString(),
      pageCount: job.pageCount,
      error: job.error,
      downloadUrl: job.status === "completed"
        ? `/api/exports/${job.id}/file?token=${encodeURIComponent(job.token)}`
        : null
    };
  }

  async processQueue() {
    if (this.processing) return;
    this.processing = true;
    try {
      while (this.queue.length) {
        const job = this.queue.shift();
        job.status = "processing";
        job.updatedAt = Date.now();
        try {
          const printUrl = `${this.origin}/internal/print/${job.id}?token=${encodeURIComponent(job.token)}`;
          const renderer = this.renderers[job.format];
          if (!renderer) throw new Error(`不支持的导出格式: ${job.format}`);
          const result = await renderer({
            url: printUrl,
            outputPath: job.outputPath,
            resume: job.resume,
            template: job.template
          });
          const output = await stat(job.outputPath);
          if (output.size < 1000) throw new Error(`生成的 ${job.format.toUpperCase()} 文件无效`);
          job.status = "completed";
          job.pageCount = result.pageCount;
        } catch (error) {
          job.status = "failed";
          job.error = error?.message || `${job.format.toUpperCase()} 生成失败`;
          await unlink(job.outputPath).catch(() => {});
        }
        job.updatedAt = Date.now();
      }
    } finally {
      this.processing = false;
    }
  }

  async cleanup() {
    const expiredBefore = Date.now() - this.ttlMs;
    for (const [id, job] of this.jobs) {
      if (job.updatedAt >= expiredBefore || job.status === "processing") continue;
      this.jobs.delete(id);
      await unlink(job.outputPath).catch(() => {});
    }
  }

  async retryFailed() {
    let retried = 0;
    for (const job of this.jobs.values()) {
      if (job.status === "failed") {
        job.status = "queued";
        job.error = null;
        job.updatedAt = Date.now();
        this.queue.push(job);
        retried += 1;
      }
    }
    if (retried) queueMicrotask(() => this.processQueue());
    return retried;
  }

  async clean(type = "completed") {
    let cleaned = 0;
    for (const [id, job] of this.jobs) {
      if (type === "all" || (type === "completed" && job.status === "completed") || (type === "failed" && job.status === "failed")) {
        this.jobs.delete(id);
        await unlink(job.outputPath).catch(() => {});
        cleaned += 1;
      }
    }
    return cleaned;
  }

  dispose() {
    clearInterval(this.cleanupTimer);
  }
}
