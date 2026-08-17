import { randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import { mkdir, rm } from "node:fs/promises";
import { join } from "node:path";
import { renderPreviewPages } from "./document-renderer.mjs";

function matches(expected, actual) {
  if (!expected || !actual) return false;
  const left = Buffer.from(expected);
  const right = Buffer.from(actual);
  return left.length === right.length && timingSafeEqual(left, right);
}

export class PreviewService {
  constructor({ outputDir, renderer = renderPreviewPages, ttlMs = 30 * 60 * 1000 } = {}) {
    this.outputDir = outputDir;
    this.renderer = renderer;
    this.ttlMs = ttlMs;
    this.jobs = new Map();
    this.keys = new Map();
    this.latestRevision = new Map();
    this.cleanupTimer = setInterval(() => this.cleanup(), Math.min(this.ttlMs, 60_000));
    this.cleanupTimer.unref();
  }

  async create({ resumeId, revision, resume, template, previewQuality = "balanced" }) {
    const key = `${resumeId}:${revision}:${template.slug}:${template.version}:${previewQuality}`;
    const existing = this.keys.get(key);
    if (existing && this.jobs.has(existing)) return this.toPublic(this.jobs.get(existing));
    const now = Date.now();
    this.latestRevision.set(resumeId, revision);
    const job = {
      id: randomUUID(), token: randomBytes(32).toString("base64url"), key,
      resumeId, revision, resume, template, previewQuality, status: "queued", pages: [],
      error: null, createdAt: now, updatedAt: now
    };
    this.jobs.set(job.id, job);
    this.keys.set(key, job.id);
    queueMicrotask(() => this.process(job));
    return this.toPublic(job);
  }

  async process(job) {
    if (this.latestRevision.get(job.resumeId) !== job.revision) {
      job.status = "failed";
      job.error = "预览已由更新版本替代";
      job.updatedAt = Date.now();
      return;
    }
    job.status = "processing";
    job.updatedAt = Date.now();
    const targetDir = join(this.outputDir, job.id);
    try {
      const result = await this.renderer({ sourcePath: job.template.sourcePath, outputDir: targetDir, resume: job.resume, previewQuality: job.previewQuality });
      if (!result.pages.length) throw new Error("预览未生成页面");
      job.pages = result.pages;
      job.status = "completed";
    } catch (error) {
      job.status = "failed";
      job.error = error?.message || "高保真预览生成失败";
      await rm(targetDir, { recursive: true, force: true });
    }
    job.updatedAt = Date.now();
  }

  get(id, token) {
    const job = this.jobs.get(id);
    return job && matches(job.token, token) ? job : null;
  }

  toPublic(job) {
    return {
      id: job.id, token: job.token, status: job.status, revision: job.revision,
      pageCount: job.pages.length, error: job.error,
      pages: job.status === "completed"
        ? job.pages.map((_, index) => `/api/previews/${job.id}/pages/${index + 1}?token=${encodeURIComponent(job.token)}`)
        : []
    };
  }

  async cleanup() {
    const expiredBefore = Date.now() - this.ttlMs;
    for (const [id, job] of this.jobs) {
      if (job.updatedAt >= expiredBefore || job.status === "processing") continue;
      this.jobs.delete(id);
      this.keys.delete(job.key);
      await rm(join(this.outputDir, id), { recursive: true, force: true });
    }
  }

  async retryFailed() {
    let retried = 0;
    for (const job of this.jobs.values()) {
      if (job.status === "failed" && job.error !== "预览已由更新版本替代") {
        job.status = "queued";
        job.error = null;
        job.updatedAt = Date.now();
        queueMicrotask(() => this.process(job));
        retried += 1;
      }
    }
    return retried;
  }

  async clean(type = "completed") {
    let cleaned = 0;
    for (const [id, job] of this.jobs) {
      if (type === "all" || (type === "completed" && job.status === "completed") || (type === "failed" && job.status === "failed")) {
        this.jobs.delete(id);
        this.keys.delete(job.key);
        await rm(join(this.outputDir, id), { recursive: true, force: true });
        cleaned += 1;
      }
    }
    return cleaned;
  }

  async dispose() {
    clearInterval(this.cleanupTimer);
  }
}
