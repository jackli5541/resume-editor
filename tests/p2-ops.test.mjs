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

  const admin = await register(app, { identifier: "admin@example.com", password: "password123" });

  const initial = await (await fetch(`${app.origin}/api/admin/config`, { headers: authHeaders(admin.cookie) })).json();
  assert.equal(initial.config.maintenance_mode, false);
  assert.equal(initial.config.registration_enabled, true);
  assert.ok(initial.schema.maintenance_mode);
  assert.ok(initial.schema.registration_enabled);

  const updated = await (await patchConfig(app, admin.cookie, { maintenance_mode: true })).json();
  assert.equal(updated.config.maintenance_mode, true);
});

test("维护模式阻止普通用户写操作，管理员不受影响", async (context) => {
  const app = await startAdminServer();
  context.after(() => new Promise((resolve) => app.server.close(resolve)));

  const admin = await register(app, { identifier: "admin@example.com", password: "password123" });
  const bob = await register(app, { identifier: "bob@example.com", password: "password123" });

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

  const admin = await register(app, { identifier: "admin@example.com", password: "password123" });

  await patchConfig(app, admin.cookie, { registration_enabled: false });

  const blocked = await register(app, { identifier: "newuser@example.com", password: "password123" });
  assert.equal(blocked.status, 403);

  await patchConfig(app, admin.cookie, { registration_enabled: true });
  assert.equal((await register(app, { identifier: "newuser@example.com", password: "password123" })).status, 201);
});

test("系统运维面板返回组件状态，普通用户 403", async (context) => {
  const app = await startAdminServer();
  context.after(() => new Promise((resolve) => app.server.close(resolve)));

  const admin = await register(app, { identifier: "admin@example.com", password: "password123" });
  const bob = await register(app, { identifier: "bob@example.com", password: "password123" });

  assert.equal((await fetch(`${app.origin}/api/admin/system`, { headers: authHeaders(bob.cookie) })).status, 403);

  const payload = await (await fetch(`${app.origin}/api/admin/system`, { headers: authHeaders(admin.cookie) })).json();
  assert.equal(payload.service, "resume-editor-mvp");
  assert.equal(payload.database.configured, false);
  assert.equal(payload.redis.configured, false);
  assert.equal(payload.exportQueue.backend, "in-process");
  assert.ok(typeof payload.uptimeSeconds === "number");
  assert.ok(payload.ai && typeof payload.ai.enabled === "boolean");
});
