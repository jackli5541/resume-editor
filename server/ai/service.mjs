import { validateExportPayload } from "../validation.mjs";
import { buildSystemPrompt, buildUserPrompt, mapModelOutput } from "./extract.mjs";
import { buildOptimizeSystemPrompt, buildOptimizeUserPrompt, mapOptimizeOutput } from "./optimize.mjs";
import { AiProviderError } from "./provider.mjs";
import { parseProjectCandidates } from "./project-parser.mjs";
import { buildTranslateSystemPrompt, buildTranslateUserPrompt, mapTranslationOutput, translationLanguageLabel } from "./translate.mjs";
import { TARGET_SYSTEM_PROMPT, EXECUTE_SYSTEM_PROMPT, validateTargetInput, buildTargetPrompt, mapTargetDiagnosis, buildTargetExecutionPrompt, mapTargetExecution } from "./target-agent.mjs";

export class AiGenerationError extends Error {
  constructor(message, statusCode = 400, code = "ai_generation_error") {
    super(message);
    this.name = "AiGenerationError";
    this.statusCode = statusCode;
    this.code = code;
  }
}

const CLIENT_ERRORS = {
  auth: [503, "模型服务鉴权失败，请检查管理端 API Key 配置"],
  rate_limited: [502, "模型服务繁忙，请稍后再试"],
  timeout: [504, "模型服务响应超时，请稍后再试"],
  network: [502, "无法连接模型服务，请稍后再试"],
  invalid_json: [502, "模型返回了无效结果，请重试"],
  output_truncated: [502, "简历内容较长，模型输出被截断，请精简内容后重试"],
  provider_error: [502, "模型服务异常，请稍后再试"],
  provider_unavailable: [502, "模型服务暂时不可用，已自动重试，请稍后再试"],
  network: [502, "暂时无法连接模型服务，已自动重试，请稍后再试"],
  context_length: [413, "发送给模型的内容仍超过上下文限制，请缩短 JD 或简历内容"],
  unsupported_parameter: [502, "模型接口不支持当前请求参数，兼容模式重试失败"],
  provider_request_rejected: [502, "模型服务拒绝了请求，请检查所选模型与接口配置"],
  unsafe_base_url: [500, "模型服务地址配置有误，请联系管理员"]
};

function auditStatusFor(code) {
  if (code === "timeout") return "timeout";
  if (code === "rate_limited") return "rate_limited";
  if (code === "invalid_json" || code === "output_truncated") return "invalid_json";
  return "provider_error";
}

export function translationOutputTokenBudget(configuredTokens, inputChars) {
  const configured = Number.isFinite(Number(configuredTokens)) ? Number(configuredTokens) : 1600;
  const estimated = 1000 + Math.ceil(Math.max(0, Number(inputChars) || 0) * 1.5);
  return Math.min(8000, Math.max(4096, configured, estimated));
}

// AI 生成编排：模板白名单 → 配置/启用/Key → 输入校验 → 配额 → 并发 → 调用 → 映射 → 规范化 → 审计。
export class AiGenerationService {
  constructor({ configRepository, provider, auditLog, quota, maxConcurrency = 2 }) {
    this.configRepository = configRepository;
    this.provider = provider;
    this.auditLog = auditLog;
    this.quota = quota;
    this.maxConcurrency = Number.isSafeInteger(maxConcurrency) && maxConcurrency > 0 ? maxConcurrency : 2;
    this.active = 0;
    this.queue = [];
  }

  async acquire() {
    if (this.active < this.maxConcurrency) {
      this.active += 1;
      return;
    }
    await new Promise((resolve) => this.queue.push(resolve));
  }

  release() {
    const next = this.queue.shift();
    if (next) next();
    else this.active -= 1;
  }

  async generate({ userId, templateSlug, description, documentStructure = "", tone = "professional", targetRole = "", jobStage = "", jobDescription = "", isAdmin = false, aiDailyLimit = null }) {
    const config = await this.configRepository.get();
    if (!config.enabled) throw new AiGenerationError("AI 生成简历未启用，请联系管理员", 503, "ai_disabled");
    const apiKey = await this.configRepository.getApiKey();
    if (!apiKey) throw new AiGenerationError("模型 API Key 未配置，请联系管理员", 503, "missing_api_key");

    const text = String(description || "").trim();
    if (!text) throw new AiGenerationError("请填写个人经历描述", 400, "empty_description");
    if (text.length > config.maxInputChars) {
      throw new AiGenerationError(`描述内容过长（上限 ${config.maxInputChars} 字），请精简后再试`, 413, "input_too_long");
    }
    const structure = String(documentStructure || "").trim();
    if (structure.length > config.maxInputChars * 2) {
      throw new AiGenerationError("Word 文档结构过长，请精简后再试", 413, "document_structure_too_long");
    }
    const role = String(targetRole || "").trim();
    const stage = String(jobStage || "").trim();
    const jd = String(jobDescription || "").trim();
    const allowedStages = new Set(["", "internship", "graduate", "experienced", "career_switch", "unsure"]);
    if (role.length > 120) throw new AiGenerationError("目标岗位过长（上限 120 字）", 400, "invalid_target_role");
    if (!allowedStages.has(stage)) throw new AiGenerationError("求职阶段无效", 400, "invalid_job_stage");
    if (jd.length > 5000) throw new AiGenerationError("职位描述过长（上限 5000 字）", 400, "job_description_too_long");
    const projectCandidates = parseProjectCandidates(structure || text);

    const quota = await this.quota.check(userId, { isAdmin, limit: aiDailyLimit });
    if (!quota.allowed) {
      throw new AiGenerationError(`今日 AI 调用次数已用完（${quota.limit} 次/天），0 点后重置`, 429, "quota_exceeded");
    }

    const inputChars = text.length;
    const startedAt = Date.now();
    let status = "ok";
    let errorCode = null;
    let outputChars = 0;

    await this.acquire();
    try {
      let modelJson;
      try {
        modelJson = await this.provider.complete({
          baseUrl: config.baseUrl,
          apiKey,
          model: config.model,
          temperature: config.temperature,
          maxOutputTokens: Math.max(config.maxOutputTokens, 3000),
          timeoutMs: config.timeoutMs,
          systemPrompt: buildSystemPrompt(config.systemPrompt),
          userPrompt: buildUserPrompt(text, tone, { targetRole: role, jobStage: stage, jobDescription: jd, documentStructure: structure, projectCandidates })
        });
        outputChars = JSON.stringify(modelJson).length;
      } catch (error) {
        outputChars = Number.isSafeInteger(error?.outputChars) ? error.outputChars : 0;
        const code = error?.code;
        status = auditStatusFor(code);
        errorCode = code || "provider_error";
        if (error instanceof AiProviderError) throw this.toClientError(error);
        if (code === "unsafe_base_url") {
          throw new AiGenerationError("模型服务地址配置有误，请联系管理员", 500, code);
        }
        throw new AiGenerationError("模型服务异常，请稍后再试", 502, "provider_error");
      }

      const mapped = mapModelOutput(modelJson, { projectCandidates });
      if (role) {
        mapped.resume.profile.job = role;
        const objective = mapped.resume.sections.find((section) => section.id === "objective");
        if (objective?.data) {
          objective.data.job = role;
          objective.visible = true;
        }
      }
      let resume;
      try {
        resume = validateExportPayload({ resume: mapped.resume, template: { slug: "clean-single", version: 1 } }).resume;
      } catch {
        status = "provider_error";
        errorCode = "validation_error";
        throw new AiGenerationError("AI 生成简历结果校验失败，请重试", 502, "validation_error");
      }

      this.quota.increment(userId);
      return {
        resume,
        uncertain: mapped.uncertain,
        notices: mapped.notices,
        projectReview: mapped.projectReview || [],
        moduleMappings: mapped.moduleMappings || [],
        usage: { model: config.model }
      };
    } finally {
      this.release();
      await this.auditLog.record({
        userId,
        provider: config.provider,
        model: config.model,
        status,
        inputChars,
        outputChars,
        latencyMs: Date.now() - startedAt,
        errorCode
      });
    }
  }

  async translate({ userId, description, documentStructure = "", targetLanguage, isAdmin = false, aiDailyLimit = null }) {
    const language = translationLanguageLabel(targetLanguage);
    if (!language) throw new AiGenerationError("目标语言无效", 400, "invalid_target_language");

    const config = await this.configRepository.get();
    if (!config.enabled) throw new AiGenerationError("AI 翻译未启用，请联系管理员", 503, "ai_disabled");
    const apiKey = await this.configRepository.getApiKey();
    if (!apiKey) throw new AiGenerationError("模型 API Key 未配置，请联系管理员", 503, "missing_api_key");

    const text = String(description || "").trim();
    const structure = String(documentStructure || "").trim();
    if (!text) throw new AiGenerationError("未能读取简历内容", 400, "empty_description");
    if (text.length > config.maxInputChars) throw new AiGenerationError(`简历内容过长（上限 ${config.maxInputChars} 字）`, 413, "input_too_long");
    if (structure.length > config.maxInputChars * 2) throw new AiGenerationError("Word 文档结构过长", 413, "document_structure_too_long");

    const quota = await this.quota.check(userId, { isAdmin, limit: aiDailyLimit });
    if (!quota.allowed) throw new AiGenerationError(`今日 AI 调用次数已用完（${quota.limit} 次/天），0 点后重置`, 429, "quota_exceeded");

    const startedAt = Date.now();
    let status = "ok";
    let errorCode = null;
    let outputChars = 0;
    await this.acquire();
    try {
      let modelJson;
      try {
        modelJson = await this.provider.complete({
          baseUrl: config.baseUrl, apiKey, model: config.model,
          temperature: Math.min(config.temperature, 0.3),
          maxOutputTokens: translationOutputTokenBudget(config.maxOutputTokens, text.length), timeoutMs: config.timeoutMs,
          systemPrompt: buildTranslateSystemPrompt(targetLanguage, config.systemPrompt),
          userPrompt: buildTranslateUserPrompt(text, structure, targetLanguage)
        });
        outputChars = JSON.stringify(modelJson).length;
      } catch (error) {
        const code = error?.code;
        status = auditStatusFor(code);
        errorCode = code || "provider_error";
        if (error instanceof AiProviderError) throw this.toClientError(error);
        throw new AiGenerationError("模型服务异常，请稍后再试", 502, "provider_error");
      }

      const mapped = mapTranslationOutput(modelJson, targetLanguage);
      let resume;
      try {
        resume = validateExportPayload({ resume: mapped.resume, template: { slug: "clean-single", version: 1 } }).resume;
      } catch {
        status = "provider_error";
        errorCode = "validation_error";
        throw new AiGenerationError("AI 翻译结果校验失败，请重试", 502, "validation_error");
      }
      this.quota.increment(userId);
      return { resume, uncertain: mapped.uncertain, notices: mapped.notices, usage: { model: config.model } };
    } finally {
      this.release();
      await this.auditLog.record({
        userId, provider: config.provider, model: config.model, status,
        inputChars: text.length, outputChars, latencyMs: Date.now() - startedAt, errorCode
      });
    }
  }

  async optimize({ userId, resume, instruction, tone = "professional", decisionContext = [], isAdmin = false, aiDailyLimit = null }) {
    const config = await this.configRepository.get();
    if (!config.enabled) throw new AiGenerationError("AI 服务未启用，请联系管理员", 503, "ai_disabled");
    if (config.optimizeEnabled === false) throw new AiGenerationError("AI 优化已关闭，请联系管理员", 503, "ai_optimize_disabled");
    const apiKey = await this.configRepository.getApiKey();
    if (!apiKey) throw new AiGenerationError("模型 API Key 未配置，请联系管理员", 503, "missing_api_key");

    const text = String(instruction || "").trim();
    if (!text) throw new AiGenerationError("请填写修改要求", 400, "empty_instruction");
    if (text.length > config.maxInputChars) {
      throw new AiGenerationError(`修改要求过长（上限 ${config.maxInputChars} 字），请精简后再试`, 413, "input_too_long");
    }

    const quota = await this.quota.check(userId, { isAdmin, limit: aiDailyLimit });
    if (!quota.allowed) {
      throw new AiGenerationError(`今日 AI 调用次数已用完（${quota.limit} 次/天），0 点后重置`, 429, "quota_exceeded");
    }

    const inputChars = text.length;
    const startedAt = Date.now();
    let status = "ok";
    let errorCode = null;
    let outputChars = 0;

    await this.acquire();
    try {
      let modelJson;
      try {
        modelJson = await this.provider.complete({
          baseUrl: config.baseUrl,
          apiKey,
          model: config.model,
          temperature: config.temperature,
          maxOutputTokens: config.maxOutputTokens,
          timeoutMs: config.timeoutMs,
          systemPrompt: buildOptimizeSystemPrompt(config.systemPrompt),
          userPrompt: buildOptimizeUserPrompt(resume, text, tone, decisionContext)
        });
        outputChars = JSON.stringify(modelJson).length;
      } catch (error) {
        const code = error?.code;
        status = auditStatusFor(code);
        errorCode = code || "provider_error";
        if (error instanceof AiProviderError) throw this.toClientError(error);
        if (code === "unsafe_base_url") {
          throw new AiGenerationError("模型服务地址配置有误，请联系管理员", 500, code);
        }
        throw new AiGenerationError("模型服务异常，请稍后再试", 502, "provider_error");
      }

      const proposal = mapOptimizeOutput(modelJson, resume);
      if (!proposal.changes.length) {
        status = "invalid_json";
        errorCode = "no_changes";
        throw new AiGenerationError("AI 未能给出有效修改方案，请换个说法重试", 502, "no_changes");
      }

      this.quota.increment(userId);
      return { ...proposal, usage: { model: config.model } };
    } finally {
      this.release();
      await this.auditLog.record({
        userId,
        provider: config.provider,
        model: config.model,
        status,
        inputChars,
        outputChars,
        latencyMs: Date.now() - startedAt,
        errorCode
      });
    }
  }

  async targetDiagnose({ userId, resume, jobDescription, isAdmin = false, aiDailyLimit = null }) {
    const jd = validateTargetInput(jobDescription);
    return this.runTargetCall({
      userId, isAdmin, aiDailyLimit, inputChars: jd.length,
      systemPrompt: TARGET_SYSTEM_PROMPT,
      userPrompt: buildTargetPrompt(resume, jd),
      map: mapTargetDiagnosis
    });
  }

  async targetExecute({ userId, resume, jobDescription, planItem, userEvidence = "", isAdmin = false, aiDailyLimit = null }) {
    const jd = validateTargetInput(jobDescription);
    if (!planItem || typeof planItem !== "object") throw new AiGenerationError("计划项无效", 400, "invalid_plan_item");
    return this.runTargetCall({
      userId, isAdmin, aiDailyLimit, inputChars: jd.length + String(userEvidence || "").length,
      systemPrompt: EXECUTE_SYSTEM_PROMPT,
      userPrompt: buildTargetExecutionPrompt(resume, jd, planItem, userEvidence),
      map: (raw) => mapTargetExecution(raw, resume)
    });
  }

  async runTargetCall({ userId, isAdmin, aiDailyLimit, inputChars, systemPrompt, userPrompt, map }) {
    const config = await this.configRepository.get();
    if (!config.enabled) throw new AiGenerationError("AI 服务未启用，请联系管理员", 503, "ai_disabled");
    if (config.targetAgentEnabled === false) throw new AiGenerationError("岗位定制功能正在维护中，请稍后再试", 503, "target_agent_disabled");
    const apiKey = await this.configRepository.getApiKey();
    if (!apiKey) throw new AiGenerationError("模型 API Key 未配置，请联系管理员", 503, "missing_api_key");
    const quota = await this.quota.check(userId, { isAdmin, limit: aiDailyLimit });
    if (!quota.allowed) throw new AiGenerationError(`今日 AI 调用次数已用完（${quota.limit} 次/天）`, 429, "quota_exceeded");
    const startedAt = Date.now();
    let status = "ok";
    let errorCode = null;
    let outputChars = 0;
    await this.acquire();
    try {
      let raw;
      try {
        raw = await this.provider.complete({
          baseUrl: config.baseUrl, apiKey, model: config.model,
          temperature: Math.min(config.temperature, 0.3), maxOutputTokens: Math.max(config.maxOutputTokens, 3000),
          timeoutMs: config.timeoutMs, systemPrompt, userPrompt
        });
        outputChars = JSON.stringify(raw).length;
      } catch (error) {
        status = auditStatusFor(error?.code);
        errorCode = error?.providerCode ? `${error.code}:${error.providerCode}` : error?.code || "provider_error";
        if (error instanceof AiProviderError) throw this.toClientError(error);
        throw new AiGenerationError("模型服务异常，请稍后再试", 502, errorCode);
      }
      const result = map(raw);
      this.quota.increment(userId);
      return { ...result, usage: { model: config.model } };
    } finally {
      this.release();
      await this.auditLog.record({ userId, provider: config.provider, model: config.model, status, inputChars, outputChars, latencyMs: Date.now() - startedAt, errorCode });
    }
  }

  toClientError(error) {
    const [statusCode, message] = CLIENT_ERRORS[error.code] || CLIENT_ERRORS.provider_error;
    return new AiGenerationError(message, statusCode, error.code);
  }
}
