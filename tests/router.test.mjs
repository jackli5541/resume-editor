import test from "node:test";
import assert from "node:assert/strict";

import { isAppPath, parseAppRoute, routePath } from "../public/router.mjs";

test("parseAppRoute 识别首页与其他路由", () => {
  assert.deepEqual(parseAppRoute("/"), { name: "home" });
  assert.deepEqual(parseAppRoute(""), { name: "home" });
  assert.deepEqual(parseAppRoute("/ai"), { name: "ai" });
  assert.deepEqual(parseAppRoute("/ai/"), { name: "ai" });
  assert.deepEqual(parseAppRoute("/ai/translate"), { name: "ai-translate" });
  assert.deepEqual(parseAppRoute("/ai/translate/"), { name: "ai-translate" });
  assert.deepEqual(parseAppRoute("/templates"), { name: "templates" });
  assert.deepEqual(parseAppRoute("/drafts"), { name: "drafts" });
  assert.deepEqual(parseAppRoute("/admin"), { name: "admin" });
  assert.deepEqual(parseAppRoute("/resumes/ABC-123/edit"), { name: "resume", resumeId: "abc-123" });
});

test("routePath 生成首页、AI 与草稿路径", () => {
  assert.equal(routePath({ name: "home" }), "/");
  assert.equal(routePath({ name: "ai" }), "/ai");
  assert.equal(routePath({ name: "ai-translate" }), "/ai/translate");
  assert.equal(routePath({ name: "resume", resumeId: "abc" }), "/resumes/abc/edit");
  assert.equal(routePath({ name: "editor" }), "/editor");
});

test("isAppPath 识别 AI 翻译路由", () => {
  assert.equal(isAppPath("/ai/translate"), true);
  assert.equal(isAppPath("/ai/translate/"), true);
  assert.equal(isAppPath("/api/ai/translate"), false);
});
