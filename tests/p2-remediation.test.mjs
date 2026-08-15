import test from "node:test";
import assert from "node:assert/strict";

import { startServer } from "../server.mjs";
import { AlertService } from "../server/alerts.mjs";

function cookieFrom(response) {
  const header = response.headers.get("set-cookie");
  return header ? header.split(";")[0] : null;
}

function authHeaders(cookie) {
  return { Cookie: cookie || "" };
}

async function startAdminServer(extra = {}) {
  return startServer({ port: 0, adminEmails: ["admin@example.com"], ...extra });
}

async function register(app, { identifier, password }) {
  const response = await fetch(`${app.origin}/api/auth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ identifier, password })
  });
  return { status: response.status, body: await response.json().catch(() => ({})), cookie: cookieFrom(response) };
}

test("一键补救与告警接口冒烟", async (context) => {
  const app = await startAdminServer();
  context.after(() => new Promise((resolve) => app.server.close(resolve)));

  const admin = await register(app, { identifier: "admin@example.com", password: "password123" });
  const bob = await register(app, { identifier: "bob@example.com", password: "password123" });

  // 普通用户无写权限 → 403
  assert.equal((await fetch(`${app.origin}/api/admin/system/retry-failed`, { method: "POST", headers: authHeaders(bob.cookie) })).status, 403);

  const retry = await (await fetch(`${app.origin}/api/admin/system/retry-failed`, { method: "POST", headers: authHeaders(admin.cookie) })).json();
  assert.equal(typeof retry.exportRetried, "number");
  assert.equal(typeof retry.previewRetried, "number");

  const clean = await (await fetch(`${app.origin}/api/admin/system/clean`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: admin.cookie },
    body: JSON.stringify({ queue: "all", type: "completed" })
  })).json();
  assert.equal(typeof clean.removed, "number");

  const alerts = await (await fetch(`${app.origin}/api/admin/alerts`, { headers: authHeaders(admin.cookie) })).json();
  assert.ok(Array.isArray(alerts.alerts));
  assert.equal(typeof alerts.total, "number");

  // 确认不存在的告警 → 404
  assert.equal((await fetch(`${app.origin}/api/admin/alerts/999999/ack`, { method: "POST", headers: authHeaders(admin.cookie) })).status, 404);
});

test("一键重试失败导出任务", async (context) => {
  const app = await startAdminServer({
    renderer: async () => { throw new Error("render failed"); },
    docxRenderer: async () => { throw new Error("render failed"); }
  });
  context.after(() => new Promise((resolve) => app.server.close(resolve)));

  const admin = await register(app, { identifier: "admin@example.com", password: "password123" });
  const bob = await register(app, { identifier: "bob@example.com", password: "password123" });

  const created = await fetch(`${app.origin}/api/resumes`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: bob.cookie },
    body: JSON.stringify({ templateSlug: "clean-single", templateVersion: 1 })
  });
  const { id: resumeId } = await created.json();

  const exp = await fetch(`${app.origin}/api/exports`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: bob.cookie },
    body: JSON.stringify({ resumeId, revision: 1, format: "pdf" })
  });
  assert.equal(exp.status, 202);
  const { id: jobId, token } = await exp.json();

  let status = "queued";
  for (let i = 0; i < 50 && status !== "failed"; i += 1) {
    await new Promise((resolve) => setTimeout(resolve, 20));
    const poll = await fetch(`${app.origin}/api/exports/${jobId}?token=${encodeURIComponent(token)}`);
    status = (await poll.json()).status;
  }
  assert.equal(status, "failed");

  const retry = await (await fetch(`${app.origin}/api/admin/system/retry-failed`, { method: "POST", headers: authHeaders(admin.cookie) })).json();
  assert.equal(retry.exportRetried, 1);
});

test("告警巡检触发并去重", async () => {
  const alerts = new AlertService({
    database: null,
    getQueueStats: async () => ({ exportFailed: 20, previewFailed: 0 }),
    thresholds: { queueFailedThreshold: 10, aiFailureThreshold: 5 },
    cooldownMs: 60_000
  });

  const triggered = await alerts.check();
  assert.equal(triggered.length, 1);
  assert.equal(triggered[0].kind, "export_queue_failed");

  const list = await alerts.list();
  assert.equal(list.total, 1);
  assert.equal(list.alerts[0].acknowledged, false);

  // 冷却期内去重（check 仍报告触发，但不再新增记录）
  assert.equal((await alerts.check()).length, 1);
  assert.equal((await alerts.list()).total, 1);

  await alerts.ack(list.alerts[0].id);
  // 确认后再次触发会重新记录
  assert.equal((await alerts.check()).length, 1);
  assert.equal((await alerts.list()).total, 2);
});
