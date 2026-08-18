import test from "node:test";
import assert from "node:assert/strict";

import { startServer } from "../server.mjs";

function cookieFrom(response) {
  const header = response.headers.get("set-cookie");
  return header ? header.split(";")[0] : null;
}

function authHeaders(cookie) {
  return { Cookie: cookie || "" };
}

async function startAdminServer() {
  return startServer({ port: 0, adminEmails: ["admin@example.com"] });
}

async function register(app, { identifier, password }) {
  const response = await fetch(`${app.origin}/api/auth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ identifier, password })
  });
  return { status: response.status, body: await response.json().catch(() => ({})), cookie: cookieFrom(response) };
}

async function patchConfig(app, adminCookie, entries) {
  return fetch(`${app.origin}/api/admin/config`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", Cookie: adminCookie },
    body: JSON.stringify(entries)
  });
}

test("配置中心：读取默认值并可热改", async (context) => {
  const app = await startAdminServer();
  context.after(() => new Promise((resolve) => app.server.close(resolve)));

  const admin = await register(app, { identifier: "admin@example.com", password: "Test1234!" });

  const initial = await (await fetch(`${app.origin}/api/admin/config`, { headers: authHeaders(admin.cookie) })).json();
  assert.equal(initial.config.maintenance_mode, false);
  assert.equal(initial.config.registration_enabled, true);
  assert.equal(initial.config.preview_quality, "balanced");
  assert.equal(initial.config.ai_generate_enabled, true);
  assert.equal(initial.config.ai_translate_enabled, true);
  assert.equal(initial.config.feedback_enabled, true);
  assert.equal(initial.config.support_enabled, true);
  assert.ok(initial.schema.maintenance_mode);
  assert.ok(initial.schema.registration_enabled);
  assert.equal(initial.schema.ai_generate_enabled.group, "ai");
  assert.equal(initial.schema.ai_translate_enabled.group, "ai");

  const updated = await (await patchConfig(app, admin.cookie, { maintenance_mode: true })).json();
  assert.equal(updated.config.maintenance_mode, true);

  const quality = await (await patchConfig(app, admin.cookie, { preview_quality: "high" })).json();
  assert.equal(quality.config.preview_quality, "high");
  const ignored = await (await patchConfig(app, admin.cookie, { preview_quality: "unbounded" })).json();
  assert.equal(ignored.config.preview_quality, "high");

  const featureFlags = await (await patchConfig(app, admin.cookie, {
    ai_generate_enabled: false,
    ai_translate_enabled: true
  })).json();
  assert.equal(featureFlags.config.ai_generate_enabled, false);
  assert.equal(featureFlags.config.ai_translate_enabled, true);

  const independentlyUpdated = await (await patchConfig(app, admin.cookie, {
    ai_translate_enabled: false
  })).json();
  assert.equal(independentlyUpdated.config.ai_generate_enabled, false);
  assert.equal(independentlyUpdated.config.ai_translate_enabled, false);
});

test("反馈与赞赏开关、赞赏码上传及安全校验", async (context) => {
  const app = await startAdminServer();
  context.after(() => new Promise((resolve) => app.server.close(resolve)));
  const admin = await register(app, { identifier: "admin@example.com", password: "Test1234!" });
  const user = await register(app, { identifier: "user@example.com", password: "Test1234!" });

  let features = await (await fetch(`${app.origin}/api/public/features`)).json();
  assert.equal(features.feedbackEnabled, true);
  assert.equal(features.supportEnabled, false);

  await patchConfig(app, admin.cookie, { feedback_enabled: false });
  const blockedFeedback = await fetch(`${app.origin}/api/feedback`, {
    method: "POST", headers: { "Content-Type": "application/json", Cookie: user.cookie },
    body: JSON.stringify({ type: "suggestion", content: "should be blocked" })
  });
  assert.equal(blockedFeedback.status, 403);

  const fakeImage = await fetch(`${app.origin}/api/admin/support-images`, {
    method: "POST", headers: { "Content-Type": "image/png", "X-Image-Label": "fake", Cookie: admin.cookie }, body: Buffer.from("not an image")
  });
  assert.equal(fakeImage.status, 400);

  const png = Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), Buffer.from("safe-test-image")]);
  const unauthorized = await fetch(`${app.origin}/api/admin/support-images`, {
    method: "POST", headers: { "Content-Type": "image/png", Cookie: user.cookie }, body: png
  });
  assert.equal(unauthorized.status, 403);

  const uploaded = await fetch(`${app.origin}/api/admin/support-images`, {
    method: "POST", headers: { "Content-Type": "image/png", "X-Image-Label": encodeURIComponent("微信"), Cookie: admin.cookie }, body: png
  });
  assert.equal(uploaded.status, 201);
  const image = (await uploaded.json()).image;
  features = await (await fetch(`${app.origin}/api/public/features`)).json();
  assert.equal(features.supportEnabled, true);
  assert.equal(features.supportImages[0].label, "微信");

  const imageResponse = await fetch(`${app.origin}${image.url}`);
  assert.equal(imageResponse.status, 200);
  assert.equal(imageResponse.headers.get("x-content-type-options"), "nosniff");
  assert.equal(imageResponse.headers.get("cross-origin-resource-policy"), "same-origin");

  await fetch(`${app.origin}/api/admin/support-images/${image.id}`, {
    method: "PATCH", headers: { "Content-Type": "application/json", Cookie: admin.cookie }, body: JSON.stringify({ enabled: false })
  });
  assert.equal((await fetch(`${app.origin}${image.url}`)).status, 404);
});

test("维护模式阻止普通用户写操作，管理员不受影响", async (context) => {
  const app = await startAdminServer();
  context.after(() => new Promise((resolve) => app.server.close(resolve)));

  const admin = await register(app, { identifier: "admin@example.com", password: "Test1234!" });
  const bob = await register(app, { identifier: "bob@example.com", password: "Test1234!" });

  await patchConfig(app, admin.cookie, { maintenance_mode: true });

  const bobWrite = await fetch(`${app.origin}/api/resumes`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: bob.cookie },
    body: JSON.stringify({ templateSlug: "clean-single", templateVersion: 1 })
  });
  assert.equal(bobWrite.status, 503);

  const adminWrite = await fetch(`${app.origin}/api/resumes`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: admin.cookie },
    body: JSON.stringify({ templateSlug: "clean-single", templateVersion: 1 })
  });
  assert.equal(adminWrite.status, 201);

  await patchConfig(app, admin.cookie, { maintenance_mode: false });
});

test("关闭注册后新用户无法注册", async (context) => {
  const app = await startAdminServer();
  context.after(() => new Promise((resolve) => app.server.close(resolve)));

  const admin = await register(app, { identifier: "admin@example.com", password: "Test1234!" });

  await patchConfig(app, admin.cookie, { registration_enabled: false });

  const blocked = await register(app, { identifier: "newuser@example.com", password: "Test1234!" });
  assert.equal(blocked.status, 403);

  await patchConfig(app, admin.cookie, { registration_enabled: true });
  assert.equal((await register(app, { identifier: "newuser@example.com", password: "Test1234!" })).status, 201);
});

test("系统运维面板返回组件状态，普通用户 403", async (context) => {
  const app = await startAdminServer();
  context.after(() => new Promise((resolve) => app.server.close(resolve)));

  const admin = await register(app, { identifier: "admin@example.com", password: "Test1234!" });
  const bob = await register(app, { identifier: "bob@example.com", password: "Test1234!" });

  assert.equal((await fetch(`${app.origin}/api/admin/system`, { headers: authHeaders(bob.cookie) })).status, 403);

  const payload = await (await fetch(`${app.origin}/api/admin/system`, { headers: authHeaders(admin.cookie) })).json();
  assert.equal(payload.service, "resume-editor-mvp");
  assert.equal(payload.database.configured, false);
  assert.equal(payload.redis.configured, false);
  assert.equal(payload.exportQueue.backend, "in-process");
  assert.ok(typeof payload.uptimeSeconds === "number");
  assert.ok(payload.ai && typeof payload.ai.enabled === "boolean");
});
