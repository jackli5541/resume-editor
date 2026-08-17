import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const vendorPath = fileURLToPath(new URL("../public/vendor/mammoth.browser.min.js", import.meta.url));
const appPath = fileURLToPath(new URL("../public/app.mjs", import.meta.url));

// 前端 Word 导入依赖 vendored 的 mammoth 浏览器包（同源静态资源，CSP script-src 'self'）。
// 这里做冒烟校验：文件已提交、非空，且包含 docx 文本提取所需的两个 API。
test("vendor mammoth 浏览器包已提交且含解析 API", async () => {
  const content = await readFile(vendorPath, "utf8");
  assert.ok(content.length > 100_000, "mammoth 包体积异常，疑似未正确 vendored");
  assert.match(content, /extractRawText/);
  assert.match(content, /convertToHtml/);
});

test("Word 导入同时提交纯文本与安全结构信息", async () => {
  const content = await readFile(appPath, "utf8");
  assert.match(content, /mammoth\.convertToHtml/);
  assert.match(content, /wordHtmlToStructure/);
  assert.match(content, /documentStructure:\s*aiWordDocumentStructure/);
  assert.match(content, /PARAGRAPH emphasis=/);
});

test("AI 结果页含项目识别确认面板（名称/角色/时间/技术栈可编辑）", async () => {
  const content = await readFile(appPath, "utf8");
  assert.match(content, /ai-project-review__source/);
  assert.match(content, /data-ai-project-field/);
  assert.match(content, /field\(index, "organization"/);
  assert.match(content, /field\(index, "role"/);
  assert.match(content, /field\(index, "techStack"/);
  assert.match(content, /field\(index, "start"/);
  assert.match(content, /field\(index, "end"/);
});
