import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { createInitialResume, resumeForTemplate } from "../public/core.mjs";
import { renderResumeMarkup } from "../public/resume-renderer.mjs";
import { TEMPLATE_SCHEMAS } from "../public/template-schemas.mjs";

const documentRef = {
  createElement() {
    let html = "";
    return {
      content: { querySelectorAll: () => [] },
      get innerHTML() { return html; },
      set innerHTML(value) { html = String(value); }
    };
  }
};

test("所有 HTML 模板都将非用户照片标记为导出占位", () => {
  const source = createInitialResume();
  source.profile.photo = "";
  for (const [slug, editorSchema] of Object.entries(TEMPLATE_SCHEMAS)) {
    const resume = resumeForTemplate(source, { slug, editorSchema });
    resume.template = { slug, editorSchema };
    const markup = renderResumeMarkup(resume, documentRef);
    const photoNode = markup.match(/<(?:img|div) class="[^"]*resume-photo[^"]*"/i)?.[0] || "";
    assert.match(photoNode, /resume-photo--(?:placeholder|fallback)/, slug);
  }
});

test("打印导出隐藏占位和模板兜底头像，保留用户照片", async () => {
  const printStyles = await readFile(join("public", "print.css"), "utf8");
  assert.match(printStyles, /\.resume-photo--placeholder[\s\S]*\.resume-photo--fallback\s*\{[\s\S]*display:\s*none\s*!important/);

  const resume = createInitialResume();
  resume.profile.photo = "data:image/png;base64,AAAA";
  const markup = renderResumeMarkup(resume, documentRef);
  const photoNode = markup.match(/<img class="[^"]*resume-photo[^"]*"/i)?.[0] || "";
  assert.doesNotMatch(photoNode, /resume-photo--(?:placeholder|fallback)/);
});

test("DOCX 母版在用户未上传照片时移除示例头像控件", async () => {
  const script = await readFile(join("scripts", "fill-docx-template.py"), "utf8");
  assert.match(script, /if not match:[\s\S]*for sdt in photo_controls:[\s\S]*parent\.remove\(sdt\)/);
});
