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

async function login(app, { identifier, password }) {
  const response = await fetch(`${app.origin}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ identifier, password })
  });
  return { status: response.status, body: await response.json().catch(() => ({})), cookie: cookieFrom(response) };
}

async function patchUser(app, adminCookie, userId, payload) {
  return fetch(`${app.origin}/api/admin/users/${userId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", Cookie: adminCookie },
    body: JSON.stringify(payload)
  });
}

test("超级管理员默认拥有全部权限，运营/审计按角色受控", async (context) => {
  const app = await startAdminServer();
  context.after(() => new Promise((resolve) => app.server.close(resolve)));

  const admin = await register(app, { identifier: "admin@example.com", password: "password123" });
  assert.equal(admin.body.user.isAdmin, true);
  assert.equal(admin.body.user.role, "super_admin");
  assert.deepEqual(admin.body.user.permissions, ["*"]);

  const bob = await register(app, { identifier: "bob@example.com", password: "password123" });
  const bobId = bob.body.user.id;
  assert.equal(bob.body.user.role, null);

  // 超级管理员提升 bob 为管理员，默认角色为「运营」。
  const promote = await patchUser(app, admin.cookie, bobId, { isAdmin: true });
  assert.equal(promote.status, 200);
  assert.equal((await promote.json()).user.role, "operator");

  // 超级管理员可把 bob 调为「审计」。
  const setAuditor = await patchUser(app, admin.cookie, bobId, { role: "auditor" });
  assert.equal(setAuditor.status, 200);
  assert.equal((await setAuditor.json()).user.role, "auditor");
});

test("运营不能设置角色，也不能操作超级管理员", async (context) => {
  const app = await startAdminServer();
  context.after(() => new Promise((resolve) => app.server.close(resolve)));

  const admin = await register(app, { identifier: "admin@example.com", password: "password123" });
  const adminId = admin.body.user.id;
  const bob = await register(app, { identifier: "bob@example.com", password: "password123" });
  const bobId = bob.body.user.id;
  const carol = await register(app, { identifier: "carol@example.com", password: "password123" });

  // carol 被提升为运营（最小权限管理员）。
  await patchUser(app, admin.cookie, carol.body.user.id, { isAdmin: true });

  // 运营给他人设置角色 → 403。
  const setRole = await patchUser(app, carol.cookie, bobId, { role: "super_admin" });
  assert.equal(setRole.status, 403);

  // 运营禁用超级管理员 → 403。
  const disableSuper = await patchUser(app, carol.cookie, adminId, { disabled: true });
  assert.equal(disableSuper.status, 403);

  // 运营删除超级管理员 → 403。
  const delSuper = await fetch(`${app.origin}/api/admin/users/${adminId}`, {
    method: "DELETE",
    headers: authHeaders(carol.cookie)
  });
  assert.equal(delSuper.status, 403);
});

test("审计角色只读：可查看用户但不可写入/删除", async (context) => {
  const app = await startAdminServer();
  context.after(() => new Promise((resolve) => app.server.close(resolve)));

  const admin = await register(app, { identifier: "admin@example.com", password: "password123" });
  const bob = await register(app, { identifier: "bob@example.com", password: "password123" });
  const bobId = bob.body.user.id;
  const dave = await register(app, { identifier: "dave@example.com", password: "password123" });

  await patchUser(app, admin.cookie, dave.body.user.id, { isAdmin: true, role: "auditor" });

  const list = await fetch(`${app.origin}/api/admin/users`, { headers: authHeaders(dave.cookie) });
  assert.equal(list.status, 200);

  const write = await patchUser(app, dave.cookie, bobId, { disabled: true });
  assert.equal(write.status, 403);

  const del = await fetch(`${app.origin}/api/admin/users/${bobId}`, {
    method: "DELETE",
    headers: authHeaders(dave.cookie)
  });
  assert.equal(del.status, 403);
});

test("管理员写操作写入审计日志", async (context) => {
  const app = await startAdminServer();
  context.after(() => new Promise((resolve) => app.server.close(resolve)));

  const admin = await register(app, { identifier: "admin@example.com", password: "password123" });
  const bob = await register(app, { identifier: "bob@example.com", password: "password123" });
  const bobId = bob.body.user.id;

  await patchUser(app, admin.cookie, bobId, { disabled: true });

  const logs = await (await fetch(`${app.origin}/api/admin/audit-logs`, { headers: authHeaders(admin.cookie) })).json();
  assert.ok(logs.total >= 1);
  const entry = logs.logs.find((log) => log.action === "user.update" && log.targetId === bobId);
  assert.ok(entry, "应存在 user.update 审计记录");
  assert.equal(entry.actorId, admin.body.user.id);
});

test("普通用户访问审计与回收站接口返回 403", async (context) => {
  const app = await startAdminServer();
  context.after(() => new Promise((resolve) => app.server.close(resolve)));

  const bob = await register(app, { identifier: "bob@example.com", password: "password123" });
  assert.equal((await fetch(`${app.origin}/api/admin/audit-logs`, { headers: authHeaders(bob.cookie) })).status, 403);
  assert.equal((await fetch(`${app.origin}/api/admin/recycle`, { headers: authHeaders(bob.cookie) })).status, 403);
});

test("软删除用户进入回收站，恢复后可登录，彻底删除后释放标识", async (context) => {
  const app = await startAdminServer();
  context.after(() => new Promise((resolve) => app.server.close(resolve)));

  const admin = await register(app, { identifier: "admin@example.com", password: "password123" });
  const bob = await register(app, { identifier: "bob@example.com", password: "password123" });
  const bobId = bob.body.user.id;

  const del = await fetch(`${app.origin}/api/admin/users/${bobId}`, { method: "DELETE", headers: authHeaders(admin.cookie) });
  assert.equal(del.status, 204);

  // 被软删除后无法登录。
  const relogin = await login(app, { identifier: "bob@example.com", password: "password123" });
  assert.equal(relogin.status, 401);

  // 出现在回收站。
  const recycle = await (await fetch(`${app.origin}/api/admin/recycle`, { headers: authHeaders(admin.cookie) })).json();
  assert.equal(recycle.userTotal, 1);
  assert.equal(recycle.users[0].id, bobId);

  // 恢复后可登录。
  const restore = await fetch(`${app.origin}/api/admin/recycle/users/${bobId}/restore`, {
    method: "POST",
    headers: authHeaders(admin.cookie)
  });
  assert.equal(restore.status, 200);
  assert.equal((await login(app, { identifier: "bob@example.com", password: "password123" })).status, 200);

  // 再次删除并彻底清除。
  await fetch(`${app.origin}/api/admin/users/${bobId}`, { method: "DELETE", headers: authHeaders(admin.cookie) });
  const purge = await fetch(`${app.origin}/api/admin/recycle/users/${bobId}`, {
    method: "DELETE",
    headers: authHeaders(admin.cookie)
  });
  assert.equal(purge.status, 204);

  const afterPurge = await (await fetch(`${app.origin}/api/admin/recycle`, { headers: authHeaders(admin.cookie) })).json();
  assert.equal(afterPurge.userTotal, 0);

  // 标识被释放，可重新注册。
  assert.equal((await register(app, { identifier: "bob@example.com", password: "password123" })).status, 201);
});

test("软删除草稿进入回收站，恢复与彻底删除", async (context) => {
  const app = await startAdminServer();
  context.after(() => new Promise((resolve) => app.server.close(resolve)));

  const admin = await register(app, { identifier: "admin@example.com", password: "password123" });
  const bob = await register(app, { identifier: "bob@example.com", password: "password123" });

  const created = await fetch(`${app.origin}/api/resumes`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: bob.cookie },
    body: JSON.stringify({ templateSlug: "clean-single", templateVersion: 1 })
  });
  const { id } = await created.json();

  const del = await fetch(`${app.origin}/api/admin/resumes/${id}`, { method: "DELETE", headers: authHeaders(admin.cookie) });
  assert.equal(del.status, 204);

  const bobList = await (await fetch(`${app.origin}/api/resumes`, { headers: authHeaders(bob.cookie) })).json();
  assert.equal(bobList.resumes.length, 0);

  const recycle = await (await fetch(`${app.origin}/api/admin/recycle`, { headers: authHeaders(admin.cookie) })).json();
  assert.equal(recycle.resumeTotal, 1);
  assert.equal(recycle.resumes[0].id, id);

  const restore = await fetch(`${app.origin}/api/admin/recycle/resumes/${id}/restore`, {
    method: "POST",
    headers: authHeaders(admin.cookie)
  });
  assert.equal(restore.status, 200);
  assert.equal((await (await fetch(`${app.origin}/api/resumes`, { headers: authHeaders(bob.cookie) })).json()).resumes.length, 1);

  await fetch(`${app.origin}/api/admin/resumes/${id}`, { method: "DELETE", headers: authHeaders(admin.cookie) });
  const purge = await fetch(`${app.origin}/api/admin/recycle/resumes/${id}`, {
    method: "DELETE",
    headers: authHeaders(admin.cookie)
  });
  assert.equal(purge.status, 204);

  const afterPurge = await (await fetch(`${app.origin}/api/admin/recycle`, { headers: authHeaders(admin.cookie) })).json();
  assert.equal(afterPurge.resumeTotal, 0);
});

test("管理员踢下线后用户会话立即失效", async (context) => {
  const app = await startAdminServer();
  context.after(() => new Promise((resolve) => app.server.close(resolve)));

  const admin = await register(app, { identifier: "admin@example.com", password: "password123" });
  const bob = await register(app, { identifier: "bob@example.com", password: "password123" });
  const bobId = bob.body.user.id;

  assert.equal((await (await fetch(`${app.origin}/api/auth/session`, { headers: authHeaders(bob.cookie) })).json()).user.id, bobId);

  const revoke = await fetch(`${app.origin}/api/admin/users/${bobId}/revoke-sessions`, {
    method: "POST",
    headers: authHeaders(admin.cookie)
  });
  assert.equal(revoke.status, 200);

  assert.equal((await (await fetch(`${app.origin}/api/auth/session`, { headers: authHeaders(bob.cookie) })).json()).user, null);
});
