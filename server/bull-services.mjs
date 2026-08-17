import { createHash, randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import { join } from "node:path";
import { Queue } from "bullmq";
import IORedis from "ioredis";

function tokenMatches(expected, actual) {
  if (!expected || !actual) return false;
  const left = Buffer.from(expected);
  const right = Buffer.from(actual);
  return left.length === right.length && timingSafeEqual(left, right);
}

function publicState(state) {
  if (state === "active") return "processing";
  if (state === "completed") return "completed";
  if (state === "failed") return "failed";
  return "queued";
}

export function createRedisConnection(url = process.env.REDIS_URL) {
  return url ? new IORedis(url, { maxRetriesPerRequest: null, enableReadyCheck: true }) : null;
}

export class BullExportService {
  constructor({ connection, outputDir }) {
    this.connection = connection;
    this.outputDir = outputDir;
    this.queue = new Queue("resume-exports", { connection });
  }

  setOrigin() {}

  async create(payload) {
    const id = randomUUID();
    const token = randomBytes(32).toString("base64url");
    await this.queue.add("render", { ...payload, id, token, outputDir: this.outputDir }, {
      jobId: id, attempts: 2, backoff: { type: "exponential", delay: 1000 },
      removeOnComplete: { age: 1800 }, removeOnFail: { age: 1800 }
    });
    return { id, token, status: "queued", format: payload.format, pageCount: null, error: null, downloadUrl: null };
  }

  async get(id, token) {
    const queued = await this.queue.getJob(id);
    if (!queued || !tokenMatches(queued.data.token, token)) return null;
    const state = await queued.getState();
    const status = publicState(state);
    return {
      ...queued.data,
      status,
      pageCount: queued.returnvalue?.pageCount ?? null,
      objectKey: queued.returnvalue?.objectKey || null,
      error: status === "failed" ? queued.failedReason : null,
      outputPath: join(this.outputDir, `${id}.${queued.data.format}`),
      createdAt: queued.timestamp,
      updatedAt: queued.finishedOn || queued.processedOn || queued.timestamp
    };
  }

  toPublic(job) {
    return {
      id: job.id, token: job.token, status: job.status, format: job.format,
      pageCount: job.pageCount, error: job.error,
      downloadUrl: job.status === "completed" ? `/api/exports/${job.id}/file?token=${encodeURIComponent(job.token)}` : null
    };
  }

  async retryFailed() {
    const failed = await this.queue.getFailed(0, 1000);
    let retried = 0;
    for (const job of failed) {
      try {
        await job.retry();
        retried += 1;
      } catch {
        // 单个任务重试失败不阻断整体。
      }
    }
    return retried;
  }

  async clean(type = "completed") {
    const removed = await this.queue.clean(0, 1000, type);
    return Array.isArray(removed) ? removed.length : 0;
  }

  async dispose() {
    await this.queue.close();
    await this.connection.quit();
  }
}

export class BullPreviewService {
  constructor({ connection, outputDir }) {
    this.connection = connection;
    this.outputDir = outputDir;
    this.queue = new Queue("resume-previews", { connection });
  }

  async create(payload) {
    const key = `${payload.resumeId}:${payload.revision}:${payload.template.slug}:${payload.template.version}:${payload.previewQuality || "balanced"}`;
    const id = createHash("sha256").update(key).digest("hex").slice(0, 32);
    const existing = await this.queue.getJob(id);
    if (existing) return this.toPublic(await this.get(id, existing.data.token));
    const pending = await this.queue.getJobs(["waiting", "delayed", "prioritized"]);
    for (const job of pending) {
      if (job.data.resumeId === payload.resumeId && job.data.revision < payload.revision) {
        await job.remove();
      }
    }
    const token = randomBytes(32).toString("base64url");
    await this.queue.add("preview", { ...payload, id, token, outputDir: this.outputDir }, {
      jobId: id, attempts: 2, backoff: { type: "exponential", delay: 1000 },
      removeOnComplete: { age: 1800 }, removeOnFail: { age: 1800 }
    });
    return { id, token, status: "queued", revision: payload.revision, pageCount: 0, pages: [], error: null };
  }

  async get(id, token) {
    const queued = await this.queue.getJob(id);
    if (!queued || !tokenMatches(queued.data.token, token)) return null;
    const status = publicState(await queued.getState());
    return { ...queued.data, status, pages: queued.returnvalue?.pages || [], objectStorage: queued.returnvalue?.objectStorage === true, error: status === "failed" ? queued.failedReason : null };
  }

  toPublic(job) {
    return {
      id: job.id, token: job.token, status: job.status, revision: job.revision,
      pageCount: job.pages.length, error: job.error,
      pages: job.status === "completed" ? job.pages.map((_, index) => `/api/previews/${job.id}/pages/${index + 1}?token=${encodeURIComponent(job.token)}`) : []
    };
  }

  async retryFailed() {
    const failed = await this.queue.getFailed(0, 1000);
    let retried = 0;
    for (const job of failed) {
      try {
        await job.retry();
        retried += 1;
      } catch {
        // 忽略单个任务重试失败。
      }
    }
    return retried;
  }

  async clean(type = "completed") {
    const removed = await this.queue.clean(0, 1000, type);
    return Array.isArray(removed) ? removed.length : 0;
  }

  async dispose() {
    await this.queue.close();
    await this.connection.quit();
  }
}
