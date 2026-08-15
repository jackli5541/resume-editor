import test from "node:test";
import assert from "node:assert/strict";

import {
  clamp,
  completionScore,
  createInitialResume,
  createResumeForTemplate,
  escapeHtml,
  formatRange,
  moveItem,
  normalizeResume,
  pageCountForHeight
} from "../public/core.mjs";
import { parseAppRoute, routePath } from "../public/router.mjs";

test("应用路由可解析模板库、编辑器和具体草稿", () => {
  assert.deepEqual(parseAppRoute("/templates"), { name: "templates" });
  assert.deepEqual(parseAppRoute("/drafts"), { name: "drafts" });
  assert.deepEqual(parseAppRoute("/editor/"), { name: "editor" });
  assert.deepEqual(parseAppRoute("/resumes/019fff3e-69ac-7893-abd7-ed31c55b50fc/edit"), {
    name: "resume",
    resumeId: "019fff3e-69ac-7893-abd7-ed31c55b50fc"
  });
  assert.equal(routePath({ name: "resume", resumeId: "draft-id" }), "/resumes/draft-id/edit");
  assert.equal(routePath({ name: "drafts" }), "/drafts");
  assert.deepEqual(parseAppRoute("/unknown"), { name: "home" });
});

test("初始简历包含完整的 MVP 模块和合法设置", () => {
  const resume = createInitialResume();

  assert.equal(resume.schemaVersion, 2);
  assert.equal(resume.profile.name, "林知夏");
  assert.deepEqual(
    resume.sections.map((section) => section.id),
    ["objective", "education", "experience", "projects", "skills", "summary", "campus", "certificates", "awards", "languages", "interests"]
  );
  assert.equal(completionScore(resume), 100);
});

test("从模板创建草稿时不继承其他草稿的内容或身份", () => {
  const template = { slug: "resume-collection-cn-004", version: 1, editorSchema: { sections: [] } };
  const first = createResumeForTemplate(template);
  first.profile.name = "草稿甲";
  first.remoteId = "remote-a";
  first.template.editorSchema.sections.push({ id: "summary" });

  const second = createResumeForTemplate(template);
  assert.notEqual(first.id, second.id);
  assert.equal(second.profile.name, "林知夏");
  assert.equal(second.remoteId, undefined);
  assert.deepEqual(second.template.editorSchema.sections, []);
});

test("模板 schema 中的全部模块都会初始化并保持模板顺序", () => {
  const resume = createResumeForTemplate({
    slug: "native-test",
    editorSchema: { sections: [
      { id: "summary", title: "自我评价", type: "richtext" },
      { id: "courses", title: "主修课程", type: "richtext" },
      { id: "competencies", title: "专业能力", type: "richtext" }
    ] }
  });
  assert.deepEqual(resume.sections.slice(0, 3).map((section) => section.id), ["summary", "courses", "competencies"]);
  assert.equal(resume.sections.find((section) => section.id === "courses").content, "");
});

test("DOCX 模板使用自身默认内容且不混入通用演示数据", () => {
  const resume = createResumeForTemplate({
    slug: "native-defaults",
    editorSchema: { sections: [{ id: "summary", title: "个人简介", type: "richtext" }] },
    defaultResume: {
      profile: { name: "原模板姓名" },
      sections: [{ id: "summary", type: "richtext", title: "个人简介", visible: true, content: "原模板正文" }]
    }
  });
  assert.equal(resume.profile.name, "原模板姓名");
  assert.equal(resume.profile.email, "");
  assert.equal(resume.sections[0].content, "原模板正文");
  assert.equal(resume.sections.some((section) => section.id === "projects"), false);
});

test("normalizeResume 合并缺省字段并限制排版参数", () => {
  const resume = normalizeResume({
    profile: { name: "测试用户" },
    settings: {
      fontSize: 99,
      lineHeight: 0,
      pagePadding: "bad",
      sectionGap: 2
    },
    sections: [{ id: "custom", title: "自定义", content: "你好" }]
  });

  assert.equal(resume.profile.name, "测试用户");
  assert.equal(resume.profile.email, "hello@example.com");
  assert.equal(resume.settings.fontSize, 18);
  assert.equal(resume.settings.lineHeight, 1.3);
  assert.equal(resume.settings.pagePadding, 24);
  assert.equal(resume.settings.sectionGap, 8);
  assert.equal(resume.sections[0].type, "richtext");
  assert.equal(resume.sections[0].visible, true);
});

test("moveItem 返回新数组并正确移动条目", () => {
  const original = ["a", "b", "c"];
  const moved = moveItem(original, 0, 2);

  assert.deepEqual(moved, ["b", "c", "a"]);
  assert.deepEqual(original, ["a", "b", "c"]);
  assert.equal(moveItem(original, -1, 1), original);
});

test("分页计算覆盖边界值", () => {
  assert.equal(pageCountForHeight(0), 1);
  assert.equal(pageCountForHeight(1160), 1);
  assert.equal(pageCountForHeight(1161), 2);
  assert.equal(pageCountForHeight(2320), 2);
});

test("完成度忽略隐藏模块并识别空内容", () => {
  const resume = createInitialResume();
  resume.profile.email = "";
  resume.sections[0].visible = false;
  resume.sections[1].items = [];

  const score = completionScore(resume);
  assert.ok(score > 0 && score < 100);
});

test("通用格式化工具处理不安全文本和空日期", () => {
  assert.equal(clamp(20, 1, 10), 10);
  assert.equal(clamp(Number.NaN, 3, 10), 3);
  assert.equal(escapeHtml('<b title="x">Tom & Jerry</b>'), "&lt;b title=&quot;x&quot;&gt;Tom &amp; Jerry&lt;/b&gt;");
  assert.equal(formatRange("2022-01", "至今"), "2022-01 — 至今");
  assert.equal(formatRange("", ""), "");
});
