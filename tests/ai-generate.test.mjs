import test from "node:test";
import assert from "node:assert/strict";

import { mapModelOutput, bulletsToHtml, paragraphToHtml, buildUserPrompt } from "../server/ai/extract.mjs";
import { parseProjectCandidates } from "../server/ai/project-parser.mjs";
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
    body: JSON.stringify({ identifier, password: "Test1234!" })
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

test("岗位上下文与真实经历明确隔离", () => {
  const prompt = buildUserPrompt("曾负责校园社团活动", "professional", {
    targetRole: "产品经理实习生",
    jobStage: "internship",
    jobDescription: "协助完成用户调研"
  });
  assert.match(prompt, /<job_context>/);
  assert.match(prompt, /产品经理实习生/);
  assert.match(prompt, /找实习/);
  assert.match(prompt, /不代表用户曾担任该岗位/);
  assert.match(prompt, /<resume_input>\n曾负责校园社团活动/);
});

test("项目预解析器区分项目名称、角色、技术栈和要点", () => {
  const candidates = parseProjectCandidates(`项目经历
“数智交行”AI应用创新项目 | 项目负责人
技术栈：HTML / CSS / JavaScript
◆ 面向重点车辆智慧监管场景，拆解协同链路
图书借阅管理系统｜独立开发 / 全流程设计
技术栈：Java / MySQL
- 完成图书入库和借阅管理
技能特长
Python`);
  assert.equal(candidates.length, 2);
  assert.equal(candidates[0].projectName, "“数智交行”AI应用创新项目");
  assert.equal(candidates[0].projectRole, "项目负责人");
  assert.equal(candidates[0].techStack, "HTML / CSS / JavaScript");
  assert.deepEqual(candidates[0].highlights, ["面向重点车辆智慧监管场景，拆解协同链路"]);
  assert.equal(candidates[1].projectName, "图书借阅管理系统");
  assert.equal(candidates[1].projectRole, "独立开发 / 全流程设计");
});

test("项目预解析器支持 Word 结构标记", () => {
  const candidates = parseProjectCandidates(`[HEADING level=1] 项目经验
[PARAGRAPH emphasis=true] 豆瓣电影 Top250 数据采集与可视化分析 | 独立开发 / Python 数据分析项目
[PARAGRAPH emphasis=false] 技术栈：Python / BeautifulSoup / Pandas
[BULLET] 搭建网页采集、数据清洗和可视化流程
[HEADING level=1] 技能特长`);
  assert.equal(candidates.length, 1);
  assert.equal(candidates[0].projectName, "豆瓣电影 Top250 数据采集与可视化分析");
  assert.equal(candidates[0].projectRole, "独立开发 / Python 数据分析项目");
  assert.equal(candidates[0].techStack, "Python / BeautifulSoup / Pandas");
});

test("项目预解析器支持中英文章节名和无分隔符标题", () => {
  const candidates = parseProjectCandidates(`项目经历 PROJECT EXPERIENCE
智能问答系统
技术栈：Vue / Node.js / MySQL
- 完成知识库检索与答案展示
专业技能 PROFESSIONAL SKILLS`);
  assert.equal(candidates.length, 1);
  assert.equal(candidates[0].projectName, "智能问答系统");
  assert.equal(candidates[0].techStack, "Vue / Node.js / MySQL");
});

test("项目映射优先使用明确 schema 并保留技术栈", () => {
  const candidates = parseProjectCandidates(`项目经历
图书借阅管理系统 | 独立开发
技术栈：Java / MySQL
- 完成图书入库和借阅管理
技能特长`);
  const { resume } = mapModelOutput({ projects: [{
    sourceId: "project-1", projectName: "图书借阅管理系统", projectRole: "独立开发",
    techStack: "Java / MySQL", highlights: ["完成图书入库和借阅管理"]
  }] }, { projectCandidates: candidates });
  const project = resume.sections.find((section) => section.id === "projects").items[0];
  assert.equal(project.organization, "图书借阅管理系统");
  assert.equal(project.role, "独立开发");
  assert.match(project.content, /技术栈：Java \/ MySQL/);
  assert.match(project.content, /完成图书入库和借阅管理/);
});

test("项目名称被模型遗漏或错放角色时从原文恢复", () => {
  const candidates = parseProjectCandidates(`项目经历
“数智交行”AI应用创新项目 | 项目负责人
技术栈：HTML / CSS / JavaScript
- 负责项目需求拆解
技能特长`);
  const mapped = mapModelOutput({ projects: [{ organization: "项目负责人", role: "", content: "- 负责项目需求拆解" }] }, { projectCandidates: candidates });
  const project = mapped.resume.sections.find((section) => section.id === "projects").items[0];
  assert.equal(project.organization, "“数智交行”AI应用创新项目");
  assert.equal(project.role, "项目负责人");
  assert.equal(mapped.notices.some((notice) => notice.includes("恢复项目名称")), true);
});

test("模型遗漏整条项目时使用导入候选降级恢复", () => {
  const candidates = parseProjectCandidates(`项目经验
图书借阅管理系统 | 独立开发
- 完成借阅流程
豆瓣电影 Top250 数据分析 | 独立开发
- 完成数据清洗
技能特长`);
  const mapped = mapModelOutput({ projects: [] }, { projectCandidates: candidates });
  const projects = mapped.resume.sections.find((section) => section.id === "projects");
  assert.equal(projects.items.length, 2);
  assert.equal(projects.items[0].organization, "图书借阅管理系统");
  assert.equal(projects.items[1].organization, "豆瓣电影 Top250 数据分析");
  assert.equal(mapped.notices.some((notice) => notice.includes("恢复 2 条")), true);
});

test("用户提示词携带项目候选和 Word 结构说明", () => {
  const prompt = buildUserPrompt("项目经历\n项目甲 | 负责人", "professional", {
    documentStructure: "[HEADING level=1] 项目经历\n[PARAGRAPH emphasis=true] 项目甲 | 负责人",
    projectCandidates: [{ sourceId: "project-1", projectName: "项目甲", projectRole: "负责人", techStack: "Java", highlights: [] }]
  });
  assert.match(prompt, /<document_structure>/);
  assert.match(prompt, /<project_candidates>/);
  assert.match(prompt, /project-1/);
});

test("确认面板数据与简历项目逐条对齐并附带原文", () => {
  const candidates = parseProjectCandidates(`项目经历
“数智交行”AI应用创新项目 | 项目负责人
技术栈：HTML / CSS / JavaScript
- 负责项目需求拆解
技能特长`);
  const mapped = mapModelOutput({ projects: [{
    sourceId: "project-1", projectName: "“数智交行”AI应用创新项目", projectRole: "项目负责人",
    techStack: "HTML / CSS / JavaScript", highlights: ["负责项目需求拆解"]
  }] }, { projectCandidates: candidates });
  const review = mapped.projectReview[0];
  assert.equal(review.projectName, "“数智交行”AI应用创新项目");
  assert.equal(review.projectRole, "项目负责人");
  assert.equal(review.techStack, "HTML / CSS / JavaScript");
  assert.equal(review.sourceId, "project-1");
  assert.match(review.sourceText, /数智交行/);
});

test("无候选时确认面板从 content 回退提取技术栈", () => {
  const mapped = mapModelOutput({ projects: [{ projectName: "图书系统", projectRole: "独立开发", techStack: "Java / MySQL", highlights: ["完成借阅流程"] }] });
  const review = mapped.projectReview[0];
  assert.equal(review.techStack, "Java / MySQL");
  assert.equal(review.start, "");
  assert.equal(review.end, "");
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

test("服务层：拒绝未知求职阶段", async () => {
  const service = await makeService();
  await assert.rejects(
    () => service.generate({ userId: "u1", description: "张三", jobStage: "invalid" }),
    (error) => error instanceof AiGenerationError && error.statusCode === 400 && error.code === "invalid_job_stage"
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

test("目标岗位写入求职字段且不覆盖历史职位", async (context) => {
  const app = await startAiServer(await makeService());
  closeServer(app, context);
  const cookie = await registerAndLogin(app, "context@example.com");
  const response = await fetch(`${app.origin}/api/ai/generate`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: cookie },
    body: JSON.stringify({ description: "我在青屿科技担任高级产品经理", targetRole: "AI 产品负责人", jobStage: "experienced" })
  });
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.resume.profile.job, "AI 产品负责人");
  assert.equal(body.resume.sections.find((section) => section.id === "objective").data.job, "AI 产品负责人");
  assert.equal(body.resume.sections.find((section) => section.id === "experience").items[0].role, "高级产品经理");
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
