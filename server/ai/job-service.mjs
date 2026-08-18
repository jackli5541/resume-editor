import { resumeForTemplate } from "../../public/core.mjs";
import { validateExportPayload } from "../validation.mjs";
import { publicAiJob } from "./job-repository.mjs";

const JOB_TYPES = new Set(["generate", "translate"]);

export class AiJobService {
  constructor({ repository, aiService, templateRepository, eventLog }) {
    this.repository = repository;
    this.aiService = aiService;
    this.templateRepository = templateRepository;
    this.eventLog = eventLog;
    this.running = new Set();
    this.recoveryTimer = null;
  }

  start() {
    this.recover().catch(() => {});
    this.recoveryTimer = setInterval(() => this.recover().catch(() => {}), 60_000);
    this.recoveryTimer.unref?.();
  }

  dispose() {
    if (this.recoveryTimer) clearInterval(this.recoveryTimer);
  }

  async create({ userId, type, payload, isAdmin = false, aiDailyLimit = null }) {
    if (!JOB_TYPES.has(type)) throw Object.assign(new Error("AI 任务类型无效"), { statusCode: 400 });
    const existing = await this.repository.findRunning(userId, type);
    if (existing) return { job: publicAiJob(existing), reused: true };
    const job = await this.repository.create({
      userId,
      type,
      payload: { ...(payload || {}), execution: { isAdmin: Boolean(isAdmin), aiDailyLimit } }
    });
    this.enqueue(job.id);
    return { job: publicAiJob(job), reused: false };
  }

  enqueue(id) {
    if (this.running.has(id)) return;
    this.running.add(id);
    setTimeout(() => this.run(id).catch(() => {}).finally(() => this.running.delete(id)), 0);
  }

  async recover() {
    const jobs = await this.repository.listRunnable();
    for (const job of jobs) this.enqueue(job.id);
    await this.repository.cleanup();
  }

  async run(id) {
    const job = await this.repository.claim(id);
    if (!job) return;
    const execution = job.payload?.execution || {};
    try {
      if (job.type === "generate") {
        const template = await this.templateRepository.get(job.payload.templateSlug || "clean-single", Number(job.payload.templateVersion) || 1);
        if (!template) throw Object.assign(new Error("生成模板不存在"), { code: "template_missing" });
        if ((template.status || "ready") !== "ready" || template.selectable === false) {
          throw Object.assign(new Error("生成模板暂不可用"), { code: "template_unavailable" });
        }
        const generated = await this.aiService.generate({
          userId: job.userId,
          templateSlug: job.payload.templateSlug,
          description: job.payload.description,
          documentStructure: job.payload.documentStructure,
          tone: job.payload.tone,
          targetRole: job.payload.targetRole,
          jobStage: job.payload.jobStage,
          jobDescription: job.payload.jobDescription,
          isAdmin: execution.isAdmin,
          aiDailyLimit: execution.aiDailyLimit
        });
        const mapped = resumeForTemplate(generated.resume, template);
        const resume = validateExportPayload({ resume: mapped, template }).resume;
        await this.repository.updateProgress(job.id, "finalizing", 90);
        await this.eventLog?.record({ userId: job.userId, event: "ai_generate" });
        await this.repository.complete(job.id, {
          ...generated,
          resume,
          template: {
            slug: template.slug,
            version: template.version,
            name: template.name,
            engine: template.engine
          }
        });
        return;
      }

      const translated = await this.aiService.translate({
        userId: job.userId,
        description: job.payload.description,
        documentStructure: job.payload.documentStructure,
        targetLanguage: job.payload.targetLanguage,
        isAdmin: execution.isAdmin,
        aiDailyLimit: execution.aiDailyLimit
      });
      await this.repository.updateProgress(job.id, "saving", 85);
      const template = await this.templateRepository.get(job.payload.templateSlug, Number(job.payload.templateVersion) || 1);
      if (!template) throw Object.assign(new Error("翻译模板不存在"), { code: "template_missing" });
      if ((template.status || "ready") !== "ready") throw Object.assign(new Error("翻译模板暂不可用"), { code: "template_unavailable" });
      const mapped = resumeForTemplate(translated.resume, template);
      const data = validateExportPayload({ resume: mapped, template }).resume;
      const draft = await this.templateRepository.createResume({
        templateSlug: template.slug,
        templateVersion: template.version,
        data,
        ownerId: job.userId
      });
      await this.eventLog?.record({ userId: job.userId, event: "ai_translate" });
      await this.eventLog?.record({ userId: job.userId, event: "draft_created" });
      await this.repository.complete(job.id, {
        resumeId: draft.id,
        uncertain: translated.uncertain,
        notices: translated.notices,
        usage: translated.usage
      });
    } catch (error) {
      const expected = error?.name === "AiGenerationError" || error?.statusCode || String(error?.code || "").startsWith("template_");
      await this.repository.fail(
        job.id,
        expected ? (error?.message || "AI 任务失败，请稍后重试") : "AI 任务处理失败，请稍后重试",
        expected ? (error?.code || "ai_job_failed") : "ai_job_failed"
      );
    }
  }

  async get(id, userId) {
    return publicAiJob(await this.repository.get(id, userId));
  }

  async latest(userId, type) {
    if (!JOB_TYPES.has(type)) return null;
    return publicAiJob(await this.repository.findLatestRecoverable(userId, type));
  }

  async consume(id, userId) {
    return publicAiJob(await this.repository.consume(id, userId));
  }
}
