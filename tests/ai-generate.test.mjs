import test from "node:test";
import assert from "node:assert/strict";

import { mapModelOutput, bulletsToHtml, paragraphToHtml } from "../server/ai/extract.mjs";
import { AiQuotaService } from "../server/ai/quota.mjs";
import { AiGenerationError, AiGenerationService } from "../server/ai/service.mjs";
import { AiConfigRepository } from "../server/ai/config-repository.mjs";
import { AiProvider } from "../server/ai/provider.mjs";
import { AiAuditLog } from "../server/ai/audit.mjs";
import { startServer } from "../server.mjs";

const KEY = Buffer.from("00".repeat(32), "hex");
const identityResolve = async (value) => new URL(value);
function okEnvelope(content) {
  return { ok: true, status: 200, text: async () => JSON.stringify({ choices: [{ message: { content } }] }) };
}

const SAMPLE = {
  profile: { name: "张三", job: "产品经理", mobile: "13800000000", email: "zhang@example.com", city: "上海", workYears: "5年" },
  objective: { job: "产品经理", city: "上海", salary: "面议", availability: "一个月内到岗" },
  education: [{ start: "2013-09", end: "2017-06", organization: "华东理工大学", role: "信息管理与信息系统 本科", content: "- 主修产品设计\n- 校级奖学金" }],
  experience: [{ start: "2021-04", end: "至今", organization: "青屿科技", role: "高级产品经理", content: "- 负责企业协作产品\n- 提升激活率" }],
  projects: [],
  skills: "需求分析\n- 原型设计\nSQL",
  summary: "5年产品经验，擅长抽象复杂业务。",
  uncertain: ["email"]
};

function sampleProvider() {
  return new AiProvider({ resolveBaseUrl: identityResolve, fetchImpl: async () => okEnvelope(JSON.stringify(SAMPLE)) });
}

async function makeService({ enabled = true, apiKey = "sk-test", provider, dailyLimit = 100 } = {}) {
  const configRepository = new AiConfigRepository({ encryptionKey: KEY });
  await configRepository.update({ enabled, apiKey, model: "deepseek-chat", baseUrl: "https://api.deepseek.com" });
  return new AiGenerationService({
    configRepository,
    provider: provider || sampleProvider(),
    auditLog: new AiAuditLog({}),
    quota: new AiQuotaService({ dailyLimit })
  });
}

async function registerAndLogin(app, identifier = "ai@example.com") {
  const response = await fetch(`${app.origin}/api/auth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ identifier, password: "password123" })
  });
  return response.headers.get("set-cookie")?.split(";")[0] || "";
}

// ---------- extract ----------

test("mapModelOutput 映射字段且不泄漏示例数据", () => {
  const { resume, uncertain } = mapModelOutput(SAMPLE);
  assert.equal(resume.profile.name, "张三");
  assert.equal(resume.profile.email, "zhang@example.com");
  assert.equal(resume.profile.gender, "");
  assert.equal(resume.profile.photo, "");
  assert.equal(uncertain.includes("email"), true);

  const interests = resume.sections.find((section) => section.id === "interests");
  assert.equal(Array.isArray(interests.items), true);
  assert.equal(interests.items.length, 0);
  const campus = resume.sections.find((section) => section.id === "campus");
  assert.equal(campus.items.length, 0);
});

test("timeline 条目转富文本且 HTML 转义", () => {
  const { resume } = mapModelOutput({
    education: [{ start: "2013", end: "2017", organization: "X", role: "Y", content: "<script>alert(1)</script>\n- 第二点" }]
  });
  const edu = resume.sections.find((section) => section.id === "education");
  assert.equal(edu.items.length, 1);
  assert.equal(edu.items[0].content, "<ul><li>&lt;script&gt;alert(1)&lt;/script&gt;</li><li>第二点</li></ul>");
});

test("条目超上限被截断并给出提示", () => {
  const many = Array.from({ length: 7 }, (_, i) => ({ start: String(2020 - i), end: "", organization: `公司${i}`, role: "工程师", content: "- 职责" }));
  const { resume, notices } = mapModelOutput({ experience: many });
  const exp = resume.sections.find((section) => section.id === "experience");
  assert.equal(exp.items.length, 6);
  assert.equal(notices.some((notice) => notice.includes("工作经历") && notice.includes("6")), true);
});

test("skills 分条、summary 转段落，空模块置为不可见", () => {
  const { resume } = mapModelOutput({ skills: "a\n- b\nc", summary: "多行\n总结" });
  const skills = resume.sections.find((section) => section.id === "skills");
  const summary = resume.sections.find((section) => section.id === "summary");
  const projects = resume.sections.find((section) => section.id === "projects");
  assert.equal(skills.content, "<ul><li>a</li><li>b</li><li>c</li></ul>");
  assert.equal(summary.content, "<p>多行 总结</p>");
  assert.equal(projects.visible, false);
});

test("bulletsToHtml 与 paragraphToHtml 空输入", () => {
  assert.equal(bulletsToHtml(""), "");
  assert.equal(bulletsToHtml("  \n "), "");
  assert.equal(paragraphToHtml(""), "");
});

// ---------- quota ----------

test("内存配额：按日计数并在超限后拒绝", async () => {
  const quota = new AiQuotaService({ dailyLimit: 3 });
  assert.equal((await quota.check("u1")).allowed, true);
  quota.increment("u1");
  quota.increment("u1");
  assert.equal((await quota.check("u1")).allowed, true);
  quota.increment("u1");
  const result = await quota.check("u1");
  assert.equal(result.allowed, false);
  assert.equal(result.used, 3);
});

// ---------- service ----------

test("服务层：上游超时映射为 504", async () => {
  const provider = new AiProvider({
    resolveBaseUrl: identityResolve,
    fetchImpl: async () => { throw Object.assign(new Error("t"), { name: "AbortError" }); }
  });
  const service = await makeService({ provider });
  await assert.rejects(
    () => service.generate({ userId: "u1", templateSlug: "clean-single", description: "张三" }),
    (error) => error instanceof AiGenerationError && error.statusCode === 504 && error.code === "timeout"
  );
});

test("服务层：配额用尽返回 429", async () => {
  const service = await makeService({ dailyLimit: 3 });
  for (let i = 0; i < 3; i += 1) service.quota.increment("u1");
  await assert.rejects(
    () => service.generate({ userId: "u1", templateSlug: "clean-single", description: "张三" }),
    (error) => error instanceof AiGenerationError && error.statusCode === 429 && error.code === "quota_exceeded"
  );
});

test("服务层：非 clean-single 模板被拒绝", async () => {
  const service = await makeService();
  await assert.rejects(
    () => service.generate({ userId: "u1", templateSlug: "resume-collection-cn-001", description: "张三" }),
    (error) => error instanceof AiGenerationError && error.statusCode === 400
  );
});

// ---------- 路由集成 ----------

async function startAiServer(service) {
  const app = await startServer({ port: 0, aiService: service });
  return app;
}

function closeServer(app, context) {
  context.after(() => new Promise((resolve) => app.server.close(resolve)));
}

test("未登录访问 /api/ai/generate 返回 401", async (context) => {
  const app = await startAiServer(await makeService());
  closeServer(app, context);
  const response = await fetch(`${app.origin}/api/ai/generate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ description: "张三" })
  });
  assert.equal(response.status, 401);
});

test("AI 生成成功返回规范化简历", async (context) => {
  const app = await startAiServer(await makeService());
  closeServer(app, context);
  const cookie = await registerAndLogin(app);

  const response = await fetch(`${app.origin}/api/ai/generate`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: cookie },
    body: JSON.stringify({ templateSlug: "clean-single", description: "我是张三，5年产品经验，邮箱 zhang@example.com" })
  });
  assert.equal(response.status, 200);
  const body = await response.json();

  assert.equal(body.resume.profile.name, "张三");
  assert.equal(body.resume.profile.email, "zhang@example.com");
  assert.equal(body.usage.model, "deepseek-chat");
  assert.equal(body.uncertain.includes("email"), true);

  const experience = body.resume.sections.find((section) => section.id === "experience");
  assert.equal(experience.items.length, 1);
  assert.equal(experience.items[0].content.includes("<li>负责企业协作产品</li>"), true);

  // 极简轻之外的模块必须为空，不得混入示例数据。
  const interests = body.resume.sections.find((section) => section.id === "interests");
  assert.equal(interests.items.length, 0);
});

test("非 clean-single 模板返回 400", async (context) => {
  const app = await startAiServer(await makeService());
  closeServer(app, context);
  const cookie = await registerAndLogin(app);
  const response = await fetch(`${app.origin}/api/ai/generate`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: cookie },
    body: JSON.stringify({ templateSlug: "resume-collection-cn-001", description: "张三" })
  });
  assert.equal(response.status, 400);
});

test("空描述返回 400", async (context) => {
  const app = await startAiServer(await makeService());
  closeServer(app, context);
  const cookie = await registerAndLogin(app);
  const response = await fetch(`${app.origin}/api/ai/generate`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: cookie },
    body: JSON.stringify({ templateSlug: "clean-single", description: "  " })
  });
  assert.equal(response.status, 400);
});

test("AI 未启用返回 503", async (context) => {
  const app = await startAiServer(await makeService({ enabled: false }));
  closeServer(app, context);
  const cookie = await registerAndLogin(app);
  const response = await fetch(`${app.origin}/api/ai/generate`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: cookie },
    body: JSON.stringify({ templateSlug: "clean-single", description: "张三" })
  });
  assert.equal(response.status, 503);
});

// ---------- AI 限制读取 ----------

test("未登录访问 /api/ai/limits 返回 401", async (context) => {
  const app = await startAiServer(await makeService());
  closeServer(app, context);
  const response = await fetch(`${app.origin}/api/ai/limits`);
  assert.equal(response.status, 401);
});

test("登录后读取 /api/ai/limits 返回输入上限与日配额", async (context) => {
  const app = await startAiServer(await makeService());
  closeServer(app, context);
  const cookie = await registerAndLogin(app);
  const response = await fetch(`${app.origin}/api/ai/limits`, { headers: { Cookie: cookie } });
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(typeof body.enabled, "boolean");
  assert.equal(typeof body.maxInputChars, "number");
  assert.equal(body.maxInputChars > 0, true);
  assert.equal(typeof body.model, "string");
  assert.equal(typeof body.daily.used, "number");
  assert.equal(typeof body.daily.limit, "number");
  assert.equal(typeof body.daily.remaining, "number");
});

// ---------- 管理端 AI 配置 ----------

async function makeAdminApp() {
  const configRepository = new AiConfigRepository({ encryptionKey: KEY });
  const aiService = new AiGenerationService({
    configRepository,
    provider: sampleProvider(),
    auditLog: new AiAuditLog({}),
    quota: new AiQuotaService({ dailyLimit: 100 })
  });
  const app = await startServer({
    port: 0,
    aiService,
    aiConfigRepository: configRepository,
    adminEmails: ["admin@example.com"]
  });
  return { app, configRepository };
}

test("非管理员读取 AI 配置返回 403", async (context) => {
  const { app } = await makeAdminApp();
  closeServer(app, context);
  const cookie = await registerAndLogin(app, "user@example.com");
  const response = await fetch(`${app.origin}/api/admin/ai-config`, { headers: { Cookie: cookie } });
  assert.equal(response.status, 403);
});

test("管理员读取 AI 配置不回显 Key 或密文", async (context) => {
  const { app, configRepository } = await makeAdminApp();
  closeServer(app, context);
  await configRepository.update({ apiKey: "sk-topsecret" });
  const cookie = await registerAndLogin(app, "admin@example.com");
  const response = await fetch(`${app.origin}/api/admin/ai-config`, { headers: { Cookie: cookie } });
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.config.apiKeySet, true);
  assert.equal(body.config.apiKeyHint, "sk-****cret");
  assert.equal(body.config.apiKey, undefined);
  assert.equal(body.config.apiKeyEnc, undefined);
});

test("管理员保存 AI 配置（含 Key）且可解密", async (context) => {
  const { app, configRepository } = await makeAdminApp();
  closeServer(app, context);
  const cookie = await registerAndLogin(app, "admin@example.com");
  const response = await fetch(`${app.origin}/api/admin/ai-config`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", Cookie: cookie },
    body: JSON.stringify({ enabled: true, model: "deepseek-chat", baseUrl: "https://api.deepseek.com", apiKey: "sk-newsecret" })
  });
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.config.enabled, true);
  assert.equal(body.config.apiKeySet, true);
  assert.equal(await configRepository.getApiKey(), "sk-newsecret");
});

test("不安全 base_url 保存返回 400", async (context) => {
  const { app } = await makeAdminApp();
  closeServer(app, context);
  const cookie = await registerAndLogin(app, "admin@example.com");
  const response = await fetch(`${app.origin}/api/admin/ai-config`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", Cookie: cookie },
    body: JSON.stringify({ baseUrl: "http://api.deepseek.com" })
  });
  assert.equal(response.status, 400);
});

test("非管理员修改 AI 配置返回 403", async (context) => {
  const { app } = await makeAdminApp();
  closeServer(app, context);
  const cookie = await registerAndLogin(app, "user@example.com");
  const response = await fetch(`${app.origin}/api/admin/ai-config`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", Cookie: cookie },
    body: JSON.stringify({ enabled: true })
  });
  assert.equal(response.status, 403);
});

test("管理员读取 AI 调用记录返回空结构", async (context) => {
  const { app } = await makeAdminApp();
  closeServer(app, context);
  const cookie = await registerAndLogin(app, "admin@example.com");
  const response = await fetch(`${app.origin}/api/admin/ai-logs`, { headers: { Cookie: cookie } });
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.total, 0);
  assert.deepEqual(body.logs, []);
});

test("非管理员读取 AI 调用记录返回 403", async (context) => {
  const { app } = await makeAdminApp();
  closeServer(app, context);
  const cookie = await registerAndLogin(app, "user@example.com");
  const response = await fetch(`${app.origin}/api/admin/ai-logs`, { headers: { Cookie: cookie } });
  assert.equal(response.status, 403);
});

test("管理员读取概览统计", async (context) => {
  const { app } = await makeAdminApp();
  closeServer(app, context);
  const cookie = await registerAndLogin(app, "admin@example.com");
  const response = await fetch(`${app.origin}/api/admin/overview`, { headers: { Cookie: cookie } });
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(typeof body.userCount, "number");
  assert.equal(typeof body.draftCount, "number");
  assert.equal(typeof body.aiToday, "number");
  assert.equal(typeof body.aiTotal, "number");
  assert.equal(typeof body.aiEnabled, "boolean");
  assert.equal(typeof body.aiConfigured, "boolean");
});

test("/health 包含 AI 状态", async (context) => {
  const { app } = await makeAdminApp();
  closeServer(app, context);
  const response = await fetch(`${app.origin}/health`);
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(typeof body.ai.enabled, "boolean");
  assert.equal(typeof body.ai.configured, "boolean");
});
