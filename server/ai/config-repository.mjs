import { decryptSecret, encryptSecret, loadEncryptionKey, maskSecret } from "./crypto.mjs";

export const AI_CONFIG_DEFAULTS = Object.freeze({
  provider: "deepseek",
  baseUrl: "https://api.deepseek.com",
  model: "deepseek-chat",
  temperature: 0.2,
  maxInputChars: 8000,
  maxOutputTokens: 1600,
  systemPrompt: "",
  enabled: false,
  timeoutMs: 30000,
  optimizeEnabled: true,
  targetAgentEnabled: true
});

const COLUMN_MAP = {
  provider: "provider",
  baseUrl: "base_url",
  model: "model",
  temperature: "temperature",
  maxInputChars: "max_input_chars",
  maxOutputTokens: "max_output_tokens",
  systemPrompt: "system_prompt",
  enabled: "enabled",
  timeoutMs: "timeout_ms",
  optimizeEnabled: "optimize_enabled",
  targetAgentEnabled: "target_agent_enabled"
};

function clampNumber(value, fallback, min, max) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.min(max, Math.max(min, number));
}

// 只保留白名单字段并做类型/范围约束，防止任意写入。
export function sanitizeConfigInput(input) {
  if (!input || typeof input !== "object") return {};
  const out = {};
  if (typeof input.provider === "string") out.provider = input.provider.slice(0, 40);
  if (typeof input.baseUrl === "string") out.baseUrl = input.baseUrl.slice(0, 500);
  if (typeof input.model === "string") out.model = input.model.slice(0, 120);
  if (input.temperature !== undefined) out.temperature = clampNumber(input.temperature, AI_CONFIG_DEFAULTS.temperature, 0, 1);
  if (input.maxInputChars !== undefined) out.maxInputChars = clampNumber(input.maxInputChars, AI_CONFIG_DEFAULTS.maxInputChars, 500, 20000);
  if (input.maxOutputTokens !== undefined) out.maxOutputTokens = clampNumber(input.maxOutputTokens, AI_CONFIG_DEFAULTS.maxOutputTokens, 256, 8000);
  if (typeof input.systemPrompt === "string") out.systemPrompt = input.systemPrompt.slice(0, 8000);
  if (input.enabled !== undefined) out.enabled = Boolean(input.enabled);
  if (input.timeoutMs !== undefined) out.timeoutMs = clampNumber(input.timeoutMs, AI_CONFIG_DEFAULTS.timeoutMs, 5000, 120000);
  if (input.optimizeEnabled !== undefined) out.optimizeEnabled = Boolean(input.optimizeEnabled);
  if (input.targetAgentEnabled !== undefined) out.targetAgentEnabled = Boolean(input.targetAgentEnabled);
  if (typeof input.apiKey === "string") out.apiKey = input.apiKey.slice(0, 500);
  return out;
}

function rowToPublic(row) {
  return {
    provider: row.provider,
    baseUrl: row.base_url,
    model: row.model,
    temperature: row.temperature,
    maxInputChars: row.max_input_chars,
    maxOutputTokens: row.max_output_tokens,
    systemPrompt: row.system_prompt,
    enabled: row.enabled,
    timeoutMs: row.timeout_ms,
    optimizeEnabled: row.optimize_enabled !== false,
    targetAgentEnabled: row.target_agent_enabled !== false,
    updatedAt: row.updated_at,
    apiKeySet: Boolean(row.api_key_enc),
    apiKeyHint: row.api_key_hint || ""
  };
}

export class AiConfigRepository {
  constructor({ database, encryptionKey } = {}) {
    this.database = database;
    this.encryptionKey = encryptionKey || loadEncryptionKey();
    this.memory = null;
  }

  // 公开配置视图：永不包含明文 Key 或密文，只给脱敏提示与「是否已配置」。
  async get() {
    if (!this.database) {
      const mem = this.memory || {};
      return {
        provider: mem.provider ?? AI_CONFIG_DEFAULTS.provider,
        baseUrl: mem.baseUrl ?? AI_CONFIG_DEFAULTS.baseUrl,
        model: mem.model ?? AI_CONFIG_DEFAULTS.model,
        temperature: mem.temperature ?? AI_CONFIG_DEFAULTS.temperature,
        maxInputChars: mem.maxInputChars ?? AI_CONFIG_DEFAULTS.maxInputChars,
        maxOutputTokens: mem.maxOutputTokens ?? AI_CONFIG_DEFAULTS.maxOutputTokens,
        systemPrompt: mem.systemPrompt ?? AI_CONFIG_DEFAULTS.systemPrompt,
        enabled: mem.enabled ?? AI_CONFIG_DEFAULTS.enabled,
        timeoutMs: mem.timeoutMs ?? AI_CONFIG_DEFAULTS.timeoutMs,
        optimizeEnabled: mem.optimizeEnabled ?? AI_CONFIG_DEFAULTS.optimizeEnabled,
        targetAgentEnabled: mem.targetAgentEnabled ?? AI_CONFIG_DEFAULTS.targetAgentEnabled,
        updatedAt: mem.updatedAt || null,
        apiKeySet: Boolean(mem.apiKeyEnc),
        apiKeyHint: mem.apiKeyHint || ""
      };
    }
    const result = await this.database.query(`
      SELECT provider, base_url, model, api_key_enc, api_key_hint, temperature,
             max_input_chars, max_output_tokens, system_prompt, enabled, timeout_ms, optimize_enabled, target_agent_enabled, updated_at
      FROM ai_model_config WHERE id = 1
    `);
    const row = result.rows[0];
    if (!row) return { ...AI_CONFIG_DEFAULTS, updatedAt: null, apiKeySet: false, apiKeyHint: "" };
    return rowToPublic(row);
  }

  // 仅供服务端发起调用前使用；返回明文，不落日志、不外传。
  async getApiKey() {
    let enc = "";
    if (this.database) {
      const result = await this.database.query("SELECT api_key_enc FROM ai_model_config WHERE id = 1");
      enc = result.rows[0]?.api_key_enc || "";
    } else {
      enc = this.memory?.apiKeyEnc || "";
    }
    if (!enc) return "";
    return decryptSecret(enc, this.encryptionKey);
  }

  // 部分更新：apiKey 为空字符串表示清除，缺省(undefined)表示保留现有 Key。
  async update(input, { updatedBy = null } = {}) {
    const fields = sanitizeConfigInput(input);
    const hasApiKey = Object.prototype.hasOwnProperty.call(fields, "apiKey");
    const apiKey = fields.apiKey ?? "";
    delete fields.apiKey;

    let apiKeyEnc;
    let apiKeyHint;
    if (hasApiKey) {
      if (apiKey === "") {
        apiKeyEnc = "";
        apiKeyHint = "";
      } else {
        apiKeyEnc = encryptSecret(apiKey, this.encryptionKey);
        apiKeyHint = maskSecret(apiKey);
      }
    }

    if (!this.database) {
      const existing = this.memory || {};
      const next = { ...existing, ...fields, updatedAt: new Date().toISOString() };
      if (hasApiKey) {
        next.apiKeyEnc = apiKeyEnc;
        next.apiKeyHint = apiKeyHint;
      }
      this.memory = next;
      return this.get();
    }

    const assignments = [];
    const params = [];
    for (const [key, column] of Object.entries(COLUMN_MAP)) {
      if (Object.prototype.hasOwnProperty.call(fields, key)) {
        params.push(fields[key]);
        assignments.push(`${column} = $${params.length}`);
      }
    }
    if (hasApiKey) {
      params.push(apiKeyEnc);
      assignments.push(`api_key_enc = $${params.length}`);
      params.push(apiKeyHint);
      assignments.push(`api_key_hint = $${params.length}`);
    }
    if (updatedBy) {
      params.push(updatedBy);
      assignments.push(`updated_by = $${params.length}`);
    }
    if (assignments.length === 0) return this.get();
    await this.database.query(
      `UPDATE ai_model_config SET ${assignments.join(", ")}, updated_at = now() WHERE id = 1`,
      params
    );
    return this.get();
  }
}
