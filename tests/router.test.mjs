import test from "node:test";
import assert from "node:assert/strict";

import { isAppPath, isLegalRoute, legalReturnTarget, parseAppRoute, routePath } from "../public/router.mjs";

test("parseAppRoute 识别首页与其他路由", () => {
  assert.deepEqual(parseAppRoute("/"), { name: "home" });
  assert.deepEqual(parseAppRoute(""), { name: "home" });
  assert.deepEqual(parseAppRoute("/ai"), { name: "ai" });
  assert.deepEqual(parseAppRoute("/ai/"), { name: "ai" });
  assert.deepEqual(parseAppRoute("/ai/optimize"), { name: "ai-optimize" });
  assert.deepEqual(parseAppRoute("/ai/translate"), { name: "ai-translate" });
  assert.deepEqual(parseAppRoute("/ai/translate/"), { name: "ai-translate" });
  assert.deepEqual(parseAppRoute("/templates"), { name: "templates" });
  assert.deepEqual(parseAppRoute("/drafts"), { name: "drafts" });
  assert.deepEqual(parseAppRoute("/admin"), { name: "admin" });
  assert.deepEqual(parseAppRoute("/privacy"), { name: "privacy" });
  assert.deepEqual(parseAppRoute("/data-deletion/"), { name: "data-deletion" });
  assert.deepEqual(parseAppRoute("/resumes/ABC-123/edit"), { name: "resume", resumeId: "abc-123" });
});

test("routePath 生成首页、AI 与草稿路径", () => {
  assert.equal(routePath({ name: "home" }), "/");
  assert.equal(routePath({ name: "ai" }), "/ai");
  assert.equal(routePath({ name: "ai-optimize" }), "/ai/optimize");
  assert.equal(routePath({ name: "ai-translate" }), "/ai/translate");
  assert.equal(routePath({ name: "ai-notice" }), "/ai-notice");
  assert.equal(routePath({ name: "resume", resumeId: "abc" }), "/resumes/abc/edit");
  assert.equal(routePath({ name: "editor" }), "/editor");
});

test("isAppPath 识别 AI 优化与翻译路由", () => {
  assert.equal(isAppPath("/ai/optimize"), true);
  assert.equal(isAppPath("/ai/translate"), true);
  assert.equal(isAppPath("/ai/translate/"), true);
  assert.equal(isAppPath("/api/ai/translate"), false);
  assert.equal(isAppPath("/privacy"), true);
});

test("信任页返回地址只接受应用内非信任页路径", () => {
  assert.equal(isLegalRoute(parseAppRoute("/terms")), true);
  assert.equal(isLegalRoute(parseAppRoute("/login")), false);
  assert.equal(legalReturnTarget("/login"), "/login");
  assert.equal(legalReturnTarget("/ai?from=home#input"), "/ai?from=home#input");
  assert.equal(legalReturnTarget("/privacy"), "/");
  assert.equal(legalReturnTarget("https://example.com/login"), "/");
  assert.equal(legalReturnTarget("//example.com/login"), "/");
});
