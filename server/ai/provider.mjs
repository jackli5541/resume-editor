import { assertSafeBaseUrlResolved } from "./url-guard.mjs";

export class AiProviderError extends Error {
  constructor(message, code, { modelOutput = "" } = {}) {
    super(message);
    this.name = "AiProviderError";
    this.code = code;
    // 仅在进程内用于把错误输出交还给模型修复；不得写入审计或返回客户端。
    this.modelOutput = String(modelOutput || "");
  }
}

const INVALID_JSON_RETRY_PROMPT =
  "上一次输出不是合法 JSON。请重新输出完整的合法 JSON 对象，不要接着续写，也不要包含解释、注释或 Markdown 代码块。";
const TRUNCATED_JSON_RETRY_PROMPT =
  "上一次输出因长度限制被截断。请压缩措辞并从头重新输出完整 JSON，不要接着续写，不要省略字段，也不要输出 Markdown。";
const RETRYABLE_OUTPUT_CODES = new Set(["invalid_json", "output_truncated"]);

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

// DeepSeek OpenAI 兼容调用封装：SSRF 校验、超时、HTTP 错误映射与 JSON 解析。
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

  buildRequestBody({ model, temperature = 0.2, maxOutputTokens = 1600, messages }) {
    return {
      model,
      temperature,
      max_tokens: maxOutputTokens,
      response_format: { type: "json_object" },
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
      messages
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
      const code = response.status === 401 || response.status === 403
        ? "auth"
        : response.status === 429 ? "rate_limited" : "provider_error";
      throw new AiProviderError(`模型服务返回 HTTP ${response.status}`, code);
    }

    const raw = await response.text();
    const envelope = this.parseJson(raw);
    const choice = envelope?.choices?.[0];
    const content = choice?.message?.content;
    if (typeof content !== "string" || !content.trim()) {
      throw new AiProviderError("模型未返回有效内容", "invalid_json");
    }
    if (choice?.finish_reason === "length") {
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
    for (let attempt = 0; attempt <= retries; attempt += 1) {
      try {
        return await this.completeOnce({ ...options, messages });
      } catch (error) {
        if (!RETRYABLE_OUTPUT_CODES.has(error?.code) || attempt === retries) throw error;
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
