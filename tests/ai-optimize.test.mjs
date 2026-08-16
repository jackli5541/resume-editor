import test from "node:test";
import assert from "node:assert/strict";

import { mapOptimizeOutput } from "../server/ai/optimize.mjs";

const resume = {
  profile: { name: "林晓", job: "产品经理" },
  sections: [
    { id: "experience", type: "timeline", title: "工作经历", items: [{ id: "a", organization: "青屿科技", role: "产品经理", content: "<p>旧内容</p>" }] },
    { id: "summary", type: "richtext", title: "自我评价", content: "<p>旧评价</p>" },
    { id: "objective", type: "keyValues", title: "求职意向", data: { city: "上海" } },
    { id: "campus", type: "timeline", title: "校园经历", visible: false, items: [] }
  ]
};

test("mapOptimizeOutput 保留合法的 set/add/remove/模块 变更", () => {
  const out = mapOptimizeOutput({
    summary: "优化工作经历",
    changes: [
      { op: "set", field: "job", after: "高级产品经理" },
      { op: "set", sectionId: "experience", itemIndex: 0, field: "content", after: "<ul><li>新内容</li></ul>" },
      { op: "set", sectionId: "objective", field: "city", after: "北京" },
      { op: "set", sectionId: "summary", field: "content", after: "<p>新评价</p>" },
      { op: "add", sectionId: "experience", item: { organization: "新公司", role: "产品", content: "<p>x</p>" } },
      { op: "remove", sectionId: "experience", itemIndex: 0 },
      { op: "addModule", sectionId: "campus" },
      { op: "removeModule", sectionId: "summary" }
    ]
  }, resume);

  assert.equal(out.changes.length, 8);
  assert.equal(out.summary, "优化工作经历");
  assert.equal(out.changes[0].field, "job");
  assert.equal(out.changes[1].itemIndex, 0);
  assert.equal(out.changes[6].op, "addModule");
  assert.equal(out.changes[7].op, "removeModule");
});

test("mapOptimizeOutput 丢弃越界或幻觉路径", () => {
  const out = mapOptimizeOutput({
    changes: [
      { op: "set", sectionId: "不存在", field: "content", after: "x" },
      { op: "set", sectionId: "experience", itemIndex: 99, field: "content", after: "x" },
      { op: "remove", sectionId: "experience", itemIndex: 99 },
      { op: "add", sectionId: "summary", item: {} },
      { op: "addModule", sectionId: "不存在" },
      { op: "removeModule", sectionId: "不存在" },
      { op: "set" }
    ]
  }, resume);

  assert.equal(out.changes.length, 0);
});
