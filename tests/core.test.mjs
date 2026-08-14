import test from "node:test";
import assert from "node:assert/strict";

import {
  clamp,
  completionScore,
  createInitialResume,
  escapeHtml,
  formatRange,
  moveItem,
  normalizeResume,
  pageCountForHeight
} from "../public/core.mjs";

test("初始简历包含完整的 MVP 模块和合法设置", () => {
  const resume = createInitialResume();

  assert.equal(resume.schemaVersion, 1);
  assert.equal(resume.profile.name, "林知夏");
  assert.deepEqual(
    resume.sections.map((section) => section.id),
    ["objective", "education", "experience", "projects", "skills", "summary"]
  );
  assert.equal(completionScore(resume), 100);
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
