import test from "node:test";
import assert from "node:assert/strict";

import {
  decryptSecret,
  encryptSecret,
  loadEncryptionKey,
  maskSecret
} from "../server/ai/crypto.mjs";
import {
  UnsafeBaseUrlError,
  assertSafeBaseUrl,
  assertSafeBaseUrlResolved,
  isPrivateIpAddress
} from "../server/ai/url-guard.mjs";
import {
  AI_CONFIG_DEFAULTS,
  AiConfigRepository,
  sanitizeConfigInput
} from "../server/ai/config-repository.mjs";
import { AiAuditLog } from "../server/ai/audit.mjs";
import { AiProvider, AiProviderError } from "../server/ai/provider.mjs";

const KEY_HEX = "00".repeat(32);
const key = Buffer.from(KEY_HEX, "hex");

const identityResolve = async (value) => new URL(value);

function okEnvelope(content, finishReason = "stop") {
  return { ok: true, status: 200, text: async () => JSON.stringify({ choices: [{ message: { content }, finish_reason: finishReason }] }) };
}

// ---------- crypto ----------

test("AES-GCM 加解密往返且密文不含明文", () => {
  const enc = encryptSecret("sk-secret-123", key);
  assert.equal(enc.includes("sk-secret-123"), false);
  assert.equal(decryptSecret(enc, key), "sk-secret-123");
});

test("空密文解密返回空串", () => {
  assert.equal(decryptSecret("", key), "");
});

test("错误主密钥解密抛错（防篡改/轮换不匹配）", () => {
  const wrong = Buffer.from("11".repeat(32), "hex");
  const enc = encryptSecret("sk-secret", key);
  assert.throws(() => decryptSecret(enc, wrong));
});

test("主密钥脱敏显示", () => {
  assert.equal(maskSecret("sk-abcdef1234567890"), "sk-****7890");
  assert.equal(maskSecret("abc"), "****");
  assert.equal(maskSecret(""), "");
});

test("主密钥长度与格式校验", () => {
  assert.equal(loadEncryptionKey(""), null);
  assert.equal(loadEncryptionKey("abcd"), null);
  assert.equal(loadEncryptionKey(KEY_HEX) instanceof Buffer, true);
});

// ---------- url-guard ----------

test("私网/保留 IP 判定", () => {
  for (const ip of [
    "10.0.0.1", "127.0.0.1", "169.254.169.254", "172.16.0.1", "172.31.255.255",
    "192.168.1.1", "100.64.0.1", "0.0.0.0", "224.0.0.1",
    "::1", "::", "fc00::1", "fd12::1", "fe80::1", "ff02::1"
  ]) {
    assert.equal(isPrivateIpAddress(ip), true, ip);
  }
  for (const ip of ["8.8.8.8", "1.1.1.1", "223.5.5.5"]) {
    assert.equal(isPrivateIpAddress(ip), false, ip);
  }
});

test("结构校验拒绝不安全地址", () => {
  for (const bad of [
    "http://api.deepseek.com",
    "https://user:pass@api.deepseek.com",
    "https://api.deepseek.com:8443",
    "https://10.0.0.1",
    "http://169.254.169.254",
    "not a url"
  ]) {
    assert.throws(() => assertSafeBaseUrl(bad), UnsafeBaseUrlError, bad);
  }
});

test("结构校验接受合法 HTTPS 地址", () => {
  assert.equal(assertSafeBaseUrl("https://api.deepseek.com").protocol, "https:");
  assert.equal(assertSafeBaseUrl("https://8.8.8.8/v1").pathname, "/v1");
});

test("开发模式可显式允许 http localhost", () => {
  assert.equal(assertSafeBaseUrl("http://localhost:80", { allowHttpLocalhost: true }).protocol, "http:");
  assert.equal(assertSafeBaseUrl("http://127.0.0.1", { allowHttpLocalhost: true }).protocol, "http:");
  assert.throws(() => assertSafeBaseUrl("http://localhost", {}), UnsafeBaseUrlError);
});

// ---------- config-repository ----------

test("配置仓储默认值与默认 Key 未配置", async () => {
  const repo = new AiConfigRepository({ encryptionKey: key });
  const config = await repo.get();
  assert.equal(config.provider, AI_CONFIG_DEFAULTS.provider);
  assert.equal(config.baseUrl, AI_CONFIG_DEFAULTS.baseUrl);
  assert.equal(config.apiKeySet, false);
});

test("配置更新加密 Key、只回显脱敏、可解密", async () => {
  const repo = new AiConfigRepository({ encryptionKey: key });
  await repo.update({ model: "deepseek-chat", apiKey: "sk-topsecret" });
  const config = await repo.get();
  assert.equal(config.model, "deepseek-chat");
  assert.equal(config.apiKeySet, true);
  assert.equal(config.apiKeyHint, "sk-****cret");
  assert.equal(config.apiKeyEnc, undefined);
  assert.equal(await repo.getApiKey(), "sk-topsecret");
});

test("空 apiKey 清除已存 Key", async () => {
  const repo = new AiConfigRepository({ encryptionKey: key });
  await repo.update({ apiKey: "sk-topsecret" });
  assert.equal(await repo.getApiKey(), "sk-topsecret");
  await repo.update({ apiKey: "" });
  assert.equal(await repo.getApiKey(), "");
  assert.equal((await repo.get()).apiKeySet, false);
});

test("配置输入白名单与范围约束", () => {
  const out = sanitizeConfigInput({
    temperature: 5,
    maxInputChars: 999999,
    maxOutputTokens: 1,
    systemPrompt: "x",
    unknown: "y",
    apiKey: "sk-abc"
  });
  assert.equal(out.temperature, 1);
  assert.equal(out.maxInputChars, 20000);
  assert.equal(out.maxOutputTokens, 256);
  assert.equal(out.unknown, undefined);
  assert.equal(out.apiKey, "sk-abc");
});

// ---------- audit ----------

test("审计只写元数据，无库时静默", async () => {
  const silent = new AiAuditLog({});
  await silent.record({ userId: "u1", status: "ok" });

  const calls = [];
  const log = new AiAuditLog({
    database: { query: async (sql, params) => { calls.push({ sql, params }); } }
  });
  await log.record({
    userId: "u1",
    provider: "deepseek",
    model: "deepseek-chat",
    status: "ok",
    inputChars: 100,
    outputChars: 50,
    latencyMs: 300
  });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].params[0], "u1");
  assert.equal(calls[0].params[1], "deepseek");
  assert.equal(calls[0].params[3], "ok");
});

// ---------- provider ----------

test("Provider 解析 DeepSeek 响应", async () => {
  const provider = new AiProvider({
    resolveBaseUrl: identityResolve,
    fetchImpl: async () => okEnvelope(JSON.stringify({ profile: { name: "张三" } }))
  });
  const data = await provider.complete({
    baseUrl: "https://api.deepseek.com",
    apiKey: "sk-test",
    model: "deepseek-chat"
  });
  assert.equal(data.profile.name, "张三");
});

test("Provider 宽容解析 JSON 代码围栏与前后说明", async () => {
  for (const content of [
    '```json\n{"profile":{"name":"张三"}}\n```',
    '以下是结果：\n{"profile":{"name":"张三"}}\n请查收'
  ]) {
    const provider = new AiProvider({
      resolveBaseUrl: identityResolve,
      fetchImpl: async () => okEnvelope(content)
    });
    const data = await provider.completeOnce({ baseUrl: "https://api.deepseek.com", apiKey: "sk-test", model: "deepseek-chat" });
    assert.equal(data.profile.name, "张三");
  }
});

test("JSON 解析失败自动重试一次", async () => {
  let calls = 0;
  let retryBody;
  const provider = new AiProvider({
    resolveBaseUrl: identityResolve,
    fetchImpl: async (_url, options) => {
      calls += 1;
      if (calls === 1) return okEnvelope("not-json");
      retryBody = JSON.parse(options.body);
      return okEnvelope(JSON.stringify({ profile: { name: "张三" } }));
    }
  });
  const data = await provider.complete({ baseUrl: "https://api.deepseek.com", apiKey: "sk-test", model: "deepseek-chat" });
  assert.equal(data.profile.name, "张三");
  assert.equal(calls, 2);
  assert.equal(retryBody.messages.at(-2).role, "assistant");
  assert.equal(retryBody.messages.at(-2).content, "not-json");
  assert.match(retryBody.messages.at(-1).content, /重新输出完整/);
});

test("输出截断时携带原输出重试并使用专用提示", async () => {
  let calls = 0;
  let retryBody;
  const provider = new AiProvider({
    resolveBaseUrl: identityResolve,
    fetchImpl: async (_url, options) => {
      calls += 1;
      if (calls === 1) return okEnvelope('{"profile":', "length");
      retryBody = JSON.parse(options.body);
      return okEnvelope('{"profile":{"name":"张三"}}');
    }
  });
  const data = await provider.complete({ baseUrl: "https://api.deepseek.com", apiKey: "sk-test", model: "deepseek-chat" });
  assert.equal(data.profile.name, "张三");
  assert.equal(retryBody.messages.at(-2).content, '{"profile":');
  assert.match(retryBody.messages.at(-1).content, /长度限制被截断/);
});

test("重试后仍无效则抛出 invalid_json", async () => {
  const provider = new AiProvider({
    resolveBaseUrl: identityResolve,
    fetchImpl: async () => okEnvelope("still-not-json")
  });
  await assert.rejects(
    () => provider.complete({ baseUrl: "https://api.deepseek.com", apiKey: "sk-test", model: "deepseek-chat" }),
    (error) => error instanceof AiProviderError && error.code === "invalid_json"
  );
});

test("HTTP 错误码映射", async () => {
  for (const [status, code] of [[401, "auth"], [403, "auth"], [429, "rate_limited"], [500, "provider_error"]]) {
    const provider = new AiProvider({
      resolveBaseUrl: identityResolve,
      fetchImpl: async () => ({ ok: false, status, text: async () => "" })
    });
    await assert.rejects(
      () => provider.completeOnce({ baseUrl: "https://api.deepseek.com", apiKey: "sk-test", model: "deepseek-chat" }),
      (error) => error instanceof AiProviderError && error.code === code,
      `status ${status}`
    );
  }
});

test("超时映射为 timeout", async () => {
  const provider = new AiProvider({
    resolveBaseUrl: identityResolve,
    fetchImpl: async () => { throw Object.assign(new Error("aborted"), { name: "AbortError" }); }
  });
  await assert.rejects(
    () => provider.completeOnce({ baseUrl: "https://api.deepseek.com", apiKey: "sk-test", model: "deepseek-chat", timeoutMs: 1 }),
    (error) => error instanceof AiProviderError && error.code === "timeout"
  );
});

test("不安全 base_url 被拒绝（SSRF）", async () => {
  const provider = new AiProvider({ resolveBaseUrl: assertSafeBaseUrlResolved });
  await assert.rejects(
    () => provider.completeOnce({ baseUrl: "http://10.0.0.1", apiKey: "sk-test", model: "deepseek-chat" }),
    (error) => error?.code === "unsafe_base_url"
  );
});
