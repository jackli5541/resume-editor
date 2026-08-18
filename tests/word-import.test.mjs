import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { normalizeWordText } from "../public/word-import.mjs";

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

test("Word 文本清理连续空行并保留段落边界", () => {
  const source = "  姓名  \r\n\t\r\n\r\n\r\n工作经历\t  \r\n公司 A\u00a0\r\n\r\n职责描述  ";
  assert.equal(normalizeWordText(source), "姓名\n\n工作经历\n公司 A\n\n职责描述");
});

test("Word 文本清理不合并正常内容行", () => {
  assert.equal(normalizeWordText("项目一\n要点一\n要点二"), "项目一\n要点一\n要点二");
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

test("AI 结果页要求逐项确认低置信度模块映射", async () => {
  const content = await readFile(appPath, "utf8");
  assert.match(content, /确认非标准模块映射/);
  assert.match(content, /data-ai-module-confirm/);
  assert.match(content, /aiModuleReviewConfirmed/);
  assert.match(content, /ai-confirm-modules/);
});
