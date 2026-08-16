import test from "node:test";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";

import { createInitialResume, normalizeResume } from "../public/core.mjs";
import { A4_SCALE } from "../server/pdf-renderer.mjs";
import { renderDocx } from "../server/docx-renderer.mjs";
import { renderPrintDocument } from "../server/print-document.mjs";
import { RequestValidationError, sanitizeFileName, validateExportPayload } from "../server/validation.mjs";
import { startServer } from "../server.mjs";

const execFileAsync = promisify(execFile);

test("后端导出校验只保留规范字段且无效头像不阻断导出", () => {
  const resume = createInitialResume();
  resume.unknown = "不会进入打印任务";
  resume.profile.photo = "https://cdn.example.com/photo.png";

  const withoutPhoto = validateExportPayload({ resume });
  assert.equal(withoutPhoto.resume.profile.photo, "");

  const payload = validateExportPayload(
    { resume, fileName: '林知夏:产品经理?.pdf' },
    { allowedImageHosts: ["cdn.example.com"] }
  );
  assert.equal(payload.resume.unknown, undefined);
  assert.equal(payload.resume.profile.photo, "https://cdn.example.com/photo.png");
  assert.equal(payload.fileName, "林知夏_产品经理_.pdf");
});

test("头像为空、格式无效或过大时均继续导出无头像简历", () => {
  const resume = createInitialResume();
  for (const photo of ["", "不是图片地址", "http://example.com/photo.png"]) {
    resume.profile.photo = photo;
    assert.equal(validateExportPayload({ resume }).resume.profile.photo, "");
  }

  resume.profile.photo = `data:image/png;base64,${"A".repeat(2_100_000)}`;
  assert.equal(validateExportPayload({ resume }).resume.profile.photo, "");
});

test("文件名和 A4 缩放系数保持在安全、等比范围", () => {
  assert.equal(sanitizeFileName("../危险/简历"), "_危险_简历.pdf");
  assert.ok(A4_SCALE > 0.96 && A4_SCALE < 0.98);
});

test("打印文档安全嵌入结构化数据", () => {
  const resume = createInitialResume();
  resume.profile.name = "</script><script>alert(1)</script>";
  const html = renderPrintDocument({ id: "job-id", resume });
  assert.equal(html.includes("</script><script>alert(1)</script>"), false);
  assert.match(html, /resumeExportData/);
  assert.match(html, /print\.mjs/);
});

test("导出 API 完成提交、轮询、鉴权和下载闭环", async (context) => {
  const testDir = await mkdtemp(join(tmpdir(), "resume-editor-export-"));
  const fakeRenderer = async ({ outputPath }) => {
    const buffer = Buffer.alloc(2048, 0x20);
    buffer.write("%PDF-1.7\n");
    await writeFile(outputPath, buffer);
    return { pageCount: 1 };
  };
  const app = await startServer({ port: 0, requireAuth: false, outputDir: testDir, renderer: fakeRenderer });
  context.after(async () => {
    await new Promise((resolve) => app.server.close(resolve));
    await rm(testDir, { recursive: true, force: true });
  });

  const createResponse = await fetch(`${app.origin}/api/exports`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ resume: createInitialResume(), fileName: "测试简历.pdf" })
  });
  assert.equal(createResponse.status, 202);
  let job = await createResponse.json();
  assert.ok(job.id && job.token);

  for (let attempt = 0; attempt < 20 && job.status !== "completed"; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 10));
    const statusResponse = await fetch(`${app.origin}/api/exports/${job.id}?token=${job.token}`);
    assert.equal(statusResponse.status, 200);
    job = await statusResponse.json();
  }
  assert.equal(job.status, "completed");
  assert.equal(job.pageCount, 1);

  const forbidden = await fetch(`${app.origin}/api/exports/${job.id}?token=wrong`);
  assert.equal(forbidden.status, 404);

  const fileResponse = await fetch(`${app.origin}${job.downloadUrl}`);
  assert.equal(fileResponse.status, 200);
  assert.equal(fileResponse.headers.get("content-type"), "application/pdf");
  assert.ok((await fileResponse.arrayBuffer()).byteLength >= 2048);
});

test("模板 API 拒绝未适配模板并可用已发布模板创建草稿", async (context) => {
  const templates = [
    { slug: "clean-single", version: 1, status: "ready", selectable: true },
    { slug: "pending-template", version: 1, status: "needs_mapping", selectable: false }
  ];
  const templateRepository = {
    async list() { return templates; },
    async get(slug, version) {
      return templates.find((item) => item.slug === slug && item.version === version) || null;
    },
    async createResume({ templateSlug, templateVersion }) {
      return { id: "draft-id", templateSlug, templateVersion, revision: 1 };
    }
  };
  const app = await startServer({ port: 0, requireAuth: false, templateRepository });
  context.after(() => new Promise((resolve) => app.server.close(resolve)));

  const listResponse = await fetch(`${app.origin}/api/templates`);
  assert.equal(listResponse.status, 200);
  assert.equal((await listResponse.json()).templates.length, 2);

  const pendingResponse = await fetch(`${app.origin}/api/resumes`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ templateSlug: "pending-template", templateVersion: 1 })
  });
  assert.equal(pendingResponse.status, 409);

  const readyResponse = await fetch(`${app.origin}/api/resumes`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ templateSlug: "clean-single", templateVersion: 1 })
  });
  assert.equal(readyResponse.status, 201);
  assert.equal((await readyResponse.json()).id, "draft-id");
});

test("草稿 API 支持按路由恢复、版本更新并拒绝过期写入", async (context) => {
  const id = "019fff3e-69ac-7893-abd7-ed31c55b50fc";
  let stored = { id, templateSlug: "clean-single", templateVersion: 1, data: createInitialResume(), revision: 1 };
  const templateRepository = {
    async listResumes() {
      return [{ id, candidateName: "林知夏", title: "产品经理简历", revision: stored.revision }];
    },
    async getResume(requestedId) { return requestedId === id ? stored : null; },
    async updateResume({ id: requestedId, revision, data }) {
      if (requestedId !== id || revision !== stored.revision) return null;
      stored = { ...stored, data, revision: revision + 1, updatedAt: new Date().toISOString() };
      return { revision: stored.revision, updated_at: stored.updatedAt };
    },
    async deleteResume(requestedId) {
      if (!stored || requestedId !== id) return false;
      stored = null;
      return true;
    }
  };
  const app = await startServer({ port: 0, requireAuth: false, templateRepository });
  context.after(() => new Promise((resolve) => app.server.close(resolve)));

  const listResponse = await fetch(`${app.origin}/api/resumes`);
  assert.equal(listResponse.status, 200);
  assert.equal((await listResponse.json()).resumes[0].id, id);

  const readResponse = await fetch(`${app.origin}/api/resumes/${id}`);
  assert.equal(readResponse.status, 200);
  assert.equal((await readResponse.json()).resume.revision, 1);

  const changed = createInitialResume();
  changed.profile.name = "路由恢复测试";
  const updateResponse = await fetch(`${app.origin}/api/resumes/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ revision: 1, data: changed })
  });
  assert.equal(updateResponse.status, 200);
  assert.equal((await updateResponse.json()).revision, 2);
  assert.equal(stored.data.profile.name, "路由恢复测试");

  const conflictResponse = await fetch(`${app.origin}/api/resumes/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ revision: 1, data: changed })
  });
  assert.equal(conflictResponse.status, 409);

  const deleteResponse = await fetch(`${app.origin}/api/resumes/${id}`, { method: "DELETE" });
  assert.equal(deleteResponse.status, 204);
  const missingDeleteResponse = await fetch(`${app.origin}/api/resumes/${id}`, { method: "DELETE" });
  assert.equal(missingDeleteResponse.status, 404);
});

test("Word 导出返回 DOCX 下载类型和扩展名", async (context) => {
  const testDir = await mkdtemp(join(tmpdir(), "resume-editor-docx-api-"));
  const fakeDocxRenderer = async ({ outputPath }) => {
    await writeFile(outputPath, Buffer.alloc(2048, 0x50));
    return { pageCount: null };
  };
  const app = await startServer({ port: 0, requireAuth: false, outputDir: testDir, docxRenderer: fakeDocxRenderer });
  context.after(async () => {
    await new Promise((resolve) => app.server.close(resolve));
    await rm(testDir, { recursive: true, force: true });
  });

  const response = await fetch(`${app.origin}/api/exports`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ format: "docx", resume: createInitialResume(), fileName: "测试简历.pdf" })
  });
  assert.equal(response.status, 202);
  let job = await response.json();
  for (let attempt = 0; attempt < 20 && job.status !== "completed"; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 10));
    job = await (await fetch(`${app.origin}/api/exports/${job.id}?token=${job.token}`)).json();
  }
  const fileResponse = await fetch(`${app.origin}${job.downloadUrl}`);
  assert.equal(fileResponse.headers.get("content-type"), "application/vnd.openxmlformats-officedocument.wordprocessingml.document");
  assert.match(fileResponse.headers.get("content-disposition"), /\.docx/i);
});

test("真实 Word 渲染器生成可解压且包含可编辑正文的 DOCX", async (context) => {
  const testDir = await mkdtemp(join(tmpdir(), "resume-editor-docx-render-"));
  const outputPath = join(testDir, "resume.docx");
  context.after(() => rm(testDir, { recursive: true, force: true }));
  const resume = createInitialResume();
  resume.profile.name = "林知夏";

  await renderDocx({ outputPath, resume, template: { slug: "clean-single", version: 1 } });
  const file = await readFile(outputPath);
  assert.equal(file.subarray(0, 2).toString("ascii"), "PK");
  assert.ok(file.length > 1000);

  const python = process.env.PYTHON_BIN || (process.platform === "win32" ? "python" : "python3");
  const { stdout } = await execFileAsync(python, ["-X", "utf8",
    "-c",
    "import sys,zipfile; z=zipfile.ZipFile(sys.argv[1]); assert z.testzip() is None; print(z.read('word/document.xml').decode('utf-8'))",
    outputPath
  ], { maxBuffer: 5 * 1024 * 1024 });
  assert.match(stdout, /林知夏/);
  assert.match(stdout, /<w:t/);
});

test("极简轻 Word 导出渲染自定义字段（字段驱动）", async (context) => {
  const testDir = await mkdtemp(join(tmpdir(), "resume-editor-custom-field-docx-"));
  const outputPath = join(testDir, "resume.docx");
  context.after(() => rm(testDir, { recursive: true, force: true }));
  const resume = normalizeResume(createInitialResume());
  const experience = resume.sections.find((section) => section.id === "experience");
  experience.fields.push({ key: "custom_0", label: "公司规模", type: "text", role: "meta", builtin: false, visible: true });
  experience.items[0].custom_0 = "2000人规模";

  await renderDocx({ outputPath, resume, template: { slug: "clean-single", version: 1 } });
  const python = process.env.PYTHON_BIN || (process.platform === "win32" ? "python" : "python3");
  const { stdout } = await execFileAsync(python, ["-X", "utf8", "-c",
    "import sys,zipfile; z=zipfile.ZipFile(sys.argv[1]); print(z.read('word/document.xml').decode('utf-8'))",
    outputPath
  ], { maxBuffer: 5 * 1024 * 1024 });
  assert.match(stdout, /公司规模/);
  assert.match(stdout, /2000人规模/);
});

test("外部模板 Word 导出使用 schema 布局且不携带原稿示例个人信息", async (context) => {
  const testDir = await mkdtemp(join(tmpdir(), "resume-editor-schema-docx-"));
  const outputPath = join(testDir, "resume.docx");
  context.after(() => rm(testDir, { recursive: true, force: true }));
  const resume = createInitialResume();
  await renderDocx({ outputPath, resume, template: { slug: "resume-collection-cn-009", version: 1 } });
  const { stdout } = await execFileAsync(process.env.PYTHON_BIN || (process.platform === "win32" ? "python" : "python3"), ["-X", "utf8", "-c",
    "import sys,zipfile; from lxml import etree; z=zipfile.ZipFile(sys.argv[1]); x=etree.fromstring(z.read('word/document.xml')); print(' '.join(x.xpath('//w:t/text()',namespaces={'w':'http://schemas.openxmlformats.org/wordprocessingml/2006/main'})))",
    outputPath
  ]);
  assert.match(stdout, /林知夏/);
  assert.match(stdout, /华东理工大学/);
  assert.doesNotMatch(stdout, /简历模板资源网/);
});

test("版本化导出从服务端草稿快照读取正文并拒绝过期版本", async (context) => {
  const testDir = await mkdtemp(join(tmpdir(), "resume-editor-snapshot-export-"));
  const id = "019fff3e-69ac-7893-abd7-ed31c55b50fc";
  const storedResume = createInitialResume();
  storedResume.profile.name = "数据库快照";
  let renderedName = "";
  const template = { slug: "clean-single", version: 1, status: "ready", engine: "html-native" };
  const templateRepository = {
    async get(slug, version) { return slug === template.slug && version === template.version ? template : null; },
    async getResume(requestedId) {
      return requestedId === id ? { id, revision: 7, templateSlug: template.slug, templateVersion: 1, data: storedResume } : null;
    }
  };
  const renderer = async ({ outputPath, resume }) => {
    renderedName = resume.profile.name;
    const buffer = Buffer.alloc(2048, 0x20);
    buffer.write("%PDF-1.7\n");
    await writeFile(outputPath, buffer);
    return { pageCount: 1 };
  };
  const app = await startServer({ port: 0, requireAuth: false, outputDir: testDir, templateRepository, renderer });
  context.after(async () => {
    await new Promise((resolve) => app.server.close(resolve));
    await rm(testDir, { recursive: true, force: true });
  });

  const stale = await fetch(`${app.origin}/api/exports`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ resumeId: id, revision: 6, format: "pdf" })
  });
  assert.equal(stale.status, 409);

  let job = await (await fetch(`${app.origin}/api/exports`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ resumeId: id, revision: 7, format: "pdf" })
  })).json();
  for (let attempt = 0; attempt < 20 && job.status !== "completed"; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 10));
    job = await (await fetch(`${app.origin}/api/exports/${job.id}?token=${job.token}`)).json();
  }
  assert.equal(job.status, "completed");
  assert.equal(renderedName, "数据库快照");
});

test("高保真预览按草稿版本去重并返回受保护分页", async (context) => {
  const directory = await mkdtemp(join(tmpdir(), "resume-editor-preview-api-"));
  const id = "019fff3e-69ac-7893-abd7-ed31c55b50fc";
  const template = { slug: "native", version: 2, status: "ready", engine: "docx-native", sourcePath: "fixture.docx" };
  const templateRepository = {
    async get() { return template; },
    async getResume() { return { id, revision: 3, templateSlug: template.slug, templateVersion: 2, data: createInitialResume() }; }
  };
  let renderCount = 0;
  const previewRenderer = async ({ outputDir }) => {
    renderCount += 1;
    await mkdir(outputDir, { recursive: true });
    await writeFile(join(outputDir, "page-1.png"), Buffer.alloc(1200, 0x50));
    return { pageCount: 1, pages: ["page-1.png"] };
  };
  const app = await startServer({ port: 0, requireAuth: false, previewDir: directory, templateRepository, previewRenderer });
  context.after(async () => {
    await new Promise((resolve) => app.server.close(resolve));
    await rm(directory, { recursive: true, force: true });
  });
  const requestPreview = () => fetch(`${app.origin}/api/previews`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ resumeId: id, revision: 3 })
  }).then((response) => response.json());
  const first = await requestPreview();
  const second = await requestPreview();
  assert.equal(first.id, second.id);
  let job = first;
  for (let attempt = 0; attempt < 20 && job.status !== "completed"; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 10));
    job = await (await fetch(`${app.origin}/api/previews/${first.id}?token=${first.token}`)).json();
  }
  assert.equal(job.pageCount, 1);
  assert.equal(renderCount, 1);
  const pageResponse = await fetch(`${app.origin}${job.pages[0]}`);
  assert.equal(pageResponse.status, 200);
  await pageResponse.arrayBuffer();
  assert.equal((await fetch(`${app.origin}/api/previews/${first.id}?token=wrong`)).status, 404);
});

test("高保真预览允许连续修订并跳过尚未渲染的旧版本", async (context) => {
  const directory = await mkdtemp(join(tmpdir(), "resume-editor-latest-preview-"));
  let revision = 1;
  const id = "029fff3e-69ac-7893-abd7-ed31c55b50fc";
  const template = { slug: "native", version: 1, status: "ready", engine: "docx-native", sourcePath: "fixture.docx" };
  const rendered = [];
  const templateRepository = {
    async get() { return template; },
    async getResume() {
      const data = createInitialResume();
      data.revision = revision;
      return { id, revision, templateSlug: template.slug, templateVersion: 1, data };
    }
  };
  const previewRenderer = async ({ outputDir, resume }) => {
    rendered.push(resume.revision);
    await mkdir(outputDir, { recursive: true });
    await writeFile(join(outputDir, "page-1.png"), Buffer.alloc(1200, 0x50));
    return { pageCount: 1, pages: ["page-1.png"] };
  };
  const app = await startServer({ port: 0, requireAuth: false, previewDir: directory, templateRepository, previewRenderer });
  context.after(async () => {
    await new Promise((resolve) => app.server.close(resolve));
    await rm(directory, { recursive: true, force: true });
  });
  const request = () => fetch(`${app.origin}/api/previews`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ resumeId: id, revision })
  });
  assert.equal((await request()).status, 202);
  revision = 2;
  assert.equal((await request()).status, 202);
  await new Promise((resolve) => setTimeout(resolve, 30));
  assert.ok(rendered.length >= 1);
  assert.equal(rendered.at(-1), 2);
});
