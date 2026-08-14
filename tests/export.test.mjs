import test from "node:test";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";

import { createInitialResume } from "../public/core.mjs";
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
  const app = await startServer({ port: 0, outputDir: testDir, renderer: fakeRenderer });
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
  const app = await startServer({ port: 0, templateRepository });
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

test("Word 导出返回 DOCX 下载类型和扩展名", async (context) => {
  const testDir = await mkdtemp(join(tmpdir(), "resume-editor-docx-api-"));
  const fakeDocxRenderer = async ({ outputPath }) => {
    await writeFile(outputPath, Buffer.alloc(2048, 0x50));
    return { pageCount: null };
  };
  const app = await startServer({ port: 0, outputDir: testDir, docxRenderer: fakeDocxRenderer });
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
