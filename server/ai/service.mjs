import { validateExportPayload } from "../validation.mjs";
import { buildSystemPrompt, buildUserPrompt, mapModelOutput } from "./extract.mjs";
import { buildOptimizeSystemPrompt, buildOptimizeUserPrompt, mapOptimizeOutput } from "./optimize.mjs";
import { AiProviderError } from "./provider.mjs";

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
  provider_error: [502, "模型服务异常，请稍后再试"],
  unsafe_base_url: [500, "模型服务地址配置有误，请联系管理员"]
};

function auditStatusFor(code) {
  if (code === "timeout") return "timeout";
  if (code === "rate_limited") return "rate_limited";
  if (code === "invalid_json") return "invalid_json";
  return "provider_error";
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

  async generate({ userId, templateSlug, description, tone = "professional", isAdmin = false, aiDailyLimit = null }) {
    if (templateSlug && templateSlug !== "clean-single") {
      throw new AiGenerationError("当前仅支持极简轻模板", 400, "unsupported_template");
    }

    const config = await this.configRepository.get();
    if (!config.enabled) throw new AiGenerationError("AI 生成未启用，请联系管理员", 503, "ai_disabled");
    const apiKey = await this.configRepository.getApiKey();
    if (!apiKey) throw new AiGenerationError("模型 API Key 未配置，请联系管理员", 503, "missing_api_key");

    const text = String(description || "").trim();
    if (!text) throw new AiGenerationError("请填写个人经历描述", 400, "empty_description");
    if (text.length > config.maxInputChars) {
      throw new AiGenerationError(`描述内容过长（上限 ${config.maxInputChars} 字），请精简后再试`, 413, "input_too_long");
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
          systemPrompt: buildSystemPrompt(config.systemPrompt),
          userPrompt: buildUserPrompt(text, tone)
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

      const mapped = mapModelOutput(modelJson);
      let resume;
      try {
        resume = validateExportPayload({ resume: mapped.resume, template: { slug: "clean-single", version: 1 } }).resume;
      } catch {
        status = "provider_error";
        errorCode = "validation_error";
        throw new AiGenerationError("AI 生成结果校验失败，请重试", 502, "validation_error");
      }

      this.quota.increment(userId);
      return {
        resume,
        uncertain: mapped.uncertain,
        notices: mapped.notices,
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

  async optimize({ userId, resume, instruction, tone = "professional", isAdmin = false, aiDailyLimit = null }) {
    const config = await this.configRepository.get();
    if (!config.enabled) throw new AiGenerationError("AI 生成未启用，请联系管理员", 503, "ai_disabled");
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
          userPrompt: buildOptimizeUserPrompt(resume, text, tone)
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

  toClientError(error) {
    const [statusCode, message] = CLIENT_ERRORS[error.code] || CLIENT_ERRORS.provider_error;
    return new AiGenerationError(message, statusCode, error.code);
  }
}
