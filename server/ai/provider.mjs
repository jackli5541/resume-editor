import { assertSafeBaseUrlResolved } from "./url-guard.mjs";

export class AiProviderError extends Error {
  constructor(message, code, { modelOutput = "", outputChars = null, providerCode = "" } = {}) {
    super(message);
    this.name = "AiProviderError";
    this.code = code;
    // 仅在进程内用于把错误输出交还给模型修复；不得写入审计或返回客户端。
    this.modelOutput = String(modelOutput || "");
    // 仅记录长度用于审计诊断，不记录模型正文。
    this.outputChars = Number.isSafeInteger(outputChars) ? outputChars : this.modelOutput.length;
    this.providerCode = String(providerCode || "").replace(/[^a-zA-Z0-9_.:-]/g, "").slice(0, 80);
  }
}

const INVALID_JSON_RETRY_PROMPT =
  "上一次输出不是合法 JSON。请重新输出完整的合法 JSON 对象，不要接着续写，也不要包含解释、注释或 Markdown 代码块。";
const TRUNCATED_JSON_RETRY_PROMPT =
  "上一次输出因长度限制被截断。请压缩措辞并从头重新输出完整 JSON，不要接着续写，不要省略字段，也不要输出 Markdown。";
const RETRYABLE_OUTPUT_CODES = new Set(["invalid_json", "output_truncated", "network", "provider_unavailable", "unsupported_parameter", "provider_request_rejected"]);

function providerErrorDetails(raw) {
  try {
    const payload = JSON.parse(String(raw || ""));
    const error = payload?.error && typeof payload.error === "object" ? payload.error : payload;
    return { code: String(error?.code || error?.type || ""), message: String(error?.message || "") };
  } catch {
    return { code: "", message: "" };
  }
}

function classifyProviderHttpError(status, details) {
  if (status === 401 || status === 403) return "auth";
  if (status === 429) return "rate_limited";
  if (status >= 500) return "provider_unavailable";
  const hint = `${details.code} ${details.message}`.toLowerCase();
  if (/context|token.*limit|maximum.*token|too.*long|length.*exceed/.test(hint)) return "context_length";
  if (status === 400 && /response_format|temperature|unsupported|unknown parameter|extra inputs|not permitted/.test(hint)) return "unsupported_parameter";
  return status === 400 ? "provider_request_rejected" : "provider_error";
}

function extractBalancedJsonObject(text) {
  const source = String(text || "");
  for (let start = source.indexOf("{"); start >= 0; start = source.indexOf("{", start + 1)) {
    let depth = 0;
    let inString = false;
    let escaped = false;
    for (let index = start; index < source.length; index += 1) {
      const char = source[index];
      if (inString) {
        if (escaped) escaped = false;
        else if (char === "\\") escaped = true;
        else if (char === '"') inString = false;
        continue;
      }
      if (char === '"') inString = true;
      else if (char === "{") depth += 1;
      else if (char === "}") {
        depth -= 1;
        if (depth === 0) return source.slice(start, index + 1);
      }
    }
  }
  return "";
}

function messageText(content) {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content.map((part) => {
      if (typeof part === "string") return part;
      if (part && typeof part.text === "string") return part.text;
      if (part?.text && typeof part.text.value === "string") return part.text.value;
      return "";
    }).join("");
  }
  if (content && typeof content.text === "string") return content.text;
  if (content?.text && typeof content.text.value === "string") return content.text.value;
  return "";
}

// OpenAI 兼容调用封装：SSRF 校验、超时、HTTP 错误映射与 JSON 解析。
// fetchImpl 与 resolveBaseUrl 可注入，便于单元测试与本地 mock。
export class AiProvider {
  constructor({ fetchImpl = fetch, resolveBaseUrl = assertSafeBaseUrlResolved } = {}) {
    this.fetchImpl = fetchImpl;
    this.resolveBaseUrl = resolveBaseUrl;
  }

  buildMessages({ systemPrompt = "", userPrompt = "" }) {
    return [
      { role: "system", content: String(systemPrompt || "") },
      { role: "user", content: String(userPrompt || "") }
    ];
  }

  buildRequestBody({ model, temperature = 0.2, maxOutputTokens = 1600, messages, compatibilityMode = false }) {
    return {
      model,
      max_tokens: maxOutputTokens,
      ...(!compatibilityMode ? { temperature, response_format: { type: "json_object" } } : {}),
      messages
    };
  }

  parseJson(text) {
    if (typeof text !== "string") return null;
    const normalized = text.replace(/^\uFEFF/, "").trim();
    const candidates = [normalized];
    const fenced = normalized.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i)?.[1];
    if (fenced) candidates.push(fenced.trim());
    const balanced = extractBalancedJsonObject(normalized);
    if (balanced) candidates.push(balanced);
    const seen = new Set();
    for (const candidate of candidates) {
      if (!candidate || seen.has(candidate)) continue;
      seen.add(candidate);
      try {
        return JSON.parse(candidate);
      } catch {
        // 继续尝试代码围栏或正文中的完整 JSON 对象。
      }
    }
    return null;
  }

  async completeOnce(options) {
    const {
      baseUrl,
      apiKey,
      model,
      temperature = 0.2,
      maxOutputTokens = 1600,
      timeoutMs = 30000,
      systemPrompt = "",
      userPrompt = "",
      messages,
      compatibilityMode = false
    } = options;

    const base = await this.resolveBaseUrl(baseUrl);
    const endpoint = new URL(base.href);
    endpoint.pathname = `${endpoint.pathname.replace(/\/+$/, "")}/chat/completions`;
    endpoint.search = "";
    endpoint.hash = "";

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), Math.max(1, Number(timeoutMs) || 1));

    let response;
    try {
      response = await this.fetchImpl(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${String(apiKey || "")}`
        },
        body: JSON.stringify(this.buildRequestBody({
          model,
          temperature,
          maxOutputTokens,
          compatibilityMode,
          messages: messages || this.buildMessages({ systemPrompt, userPrompt })
        })),
        signal: controller.signal
      });
    } catch (error) {
      if (error?.name === "AbortError" || error?.name === "TimeoutError") {
        throw new AiProviderError("模型服务响应超时", "timeout");
      }
      throw new AiProviderError("无法连接模型服务", "network");
    } finally {
      clearTimeout(timer);
    }

    if (!response.ok) {
      const details = providerErrorDetails(await response.text());
      const code = classifyProviderHttpError(response.status, details);
      throw new AiProviderError(`模型服务返回 HTTP ${response.status}`, code, { providerCode: details.code });
    }

    const raw = await response.text();
    const envelope = this.parseJson(raw);
    const choice = envelope?.choices?.[0];
    const content = messageText(choice?.message?.content);
    const reasoningChars = messageText(choice?.message?.reasoning_content).length;
    if (!content.trim()) {
      const code = reasoningChars > 0 ? "output_truncated" : "invalid_json";
      throw new AiProviderError("模型未返回有效内容", code, { outputChars: reasoningChars });
    }
    if (["length", "max_tokens", "max_output_tokens"].includes(choice?.finish_reason)) {
      throw new AiProviderError("模型输出因长度限制被截断", "output_truncated", { modelOutput: content });
    }
    const data = this.parseJson(content);
    if (!data || typeof data !== "object" || Array.isArray(data)) {
      throw new AiProviderError("模型未返回有效 JSON", "invalid_json", { modelOutput: content });
    }
    return data;
  }

  // 输出截断或 JSON 无效时最多重试 retries 次，并把错误输出交还给模型修复。
  async complete(options) {
    const retries = Number.isSafeInteger(options.retries) ? options.retries : 1;
    let messages = options.messages;
    let compatibilityMode = Boolean(options.compatibilityMode);
    for (let attempt = 0; attempt <= retries; attempt += 1) {
      try {
        return await this.completeOnce({ ...options, messages, compatibilityMode });
      } catch (error) {
        if (!RETRYABLE_OUTPUT_CODES.has(error?.code) || attempt === retries) throw error;
        if (error.code === "network" || error.code === "provider_unavailable") {
          messages = options.messages;
          continue;
        }
        if (error.code === "unsupported_parameter" || error.code === "provider_request_rejected") {
          compatibilityMode = true;
          messages = options.messages;
          continue;
        }
        const base = options.messages || this.buildMessages(options);
        const repairPrompt = error.code === "output_truncated"
          ? TRUNCATED_JSON_RETRY_PROMPT
          : INVALID_JSON_RETRY_PROMPT;
        messages = [
          ...base,
          ...(error.modelOutput ? [{ role: "assistant", content: error.modelOutput }] : []),
          { role: "user", content: repairPrompt }
        ];
      }
    }
    throw new AiProviderError("模型服务重试后仍无有效输出", "invalid_json");
  }
}
