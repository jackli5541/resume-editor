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

test("用户列表支持角色与状态筛选", async (context) => {
  const app = await startAdminServer();
  context.after(() => new Promise((resolve) => app.server.close(resolve)));

  const admin = await register(app, { identifier: "admin@example.com", password: "password123" });
  const bob = await register(app, { identifier: "bob@example.com", password: "password123" });
  await register(app, { identifier: "carol@example.com", password: "password123" });

  // 禁用 bob
  await fetch(`${app.origin}/api/admin/users/${bob.body.user.id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", Cookie: admin.cookie },
    body: JSON.stringify({ disabled: true })
  });

  const byRole = await (await fetch(`${app.origin}/api/admin/users?role=super_admin`, { headers: authHeaders(admin.cookie) })).json();
  assert.equal(byRole.total, 1);
  assert.equal(byRole.users[0].id, admin.body.user.id);

  const regular = await (await fetch(`${app.origin}/api/admin/users?role=user`, { headers: authHeaders(admin.cookie) })).json();
  assert.equal(regular.total, 2);
  assert.ok(regular.users.every((u) => !u.isAdmin));

  const disabled = await (await fetch(`${app.origin}/api/admin/users?status=disabled`, { headers: authHeaders(admin.cookie) })).json();
  assert.equal(disabled.total, 1);
  assert.equal(disabled.users[0].id, bob.body.user.id);
});

test("草稿列表支持模板筛选", async (context) => {
  const app = await startAdminServer();
  context.after(() => new Promise((resolve) => app.server.close(resolve)));

  const admin = await register(app, { identifier: "admin@example.com", password: "password123" });
  const bob = await register(app, { identifier: "bob@example.com", password: "password123" });

  await fetch(`${app.origin}/api/resumes`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: bob.cookie },
    body: JSON.stringify({ templateSlug: "clean-single", templateVersion: 1 })
  });

  const matched = await (await fetch(`${app.origin}/api/admin/resumes?template=clean-single`, { headers: authHeaders(admin.cookie) })).json();
  assert.equal(matched.total, 1);

  const none = await (await fetch(`${app.origin}/api/admin/resumes?template=other`, { headers: authHeaders(admin.cookie) })).json();
  assert.equal(none.total, 0);
});

test("公告：创建、发布、公开可见、下线、删除", async (context) => {
  const app = await startAdminServer();
  context.after(() => new Promise((resolve) => app.server.close(resolve)));

  const admin = await register(app, { identifier: "admin@example.com", password: "password123" });

  const created = await fetch(`${app.origin}/api/admin/announcements`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: admin.cookie },
    body: JSON.stringify({ title: "维护通知", content: "今晚 22:00 维护", status: "draft" })
  });
  assert.equal(created.status, 201);
  const { id } = (await created.json()).announcement;

  // 草稿不可公开见
  assert.equal((await (await fetch(`${app.origin}/api/announcements`)).json()).announcements.length, 0);

  await fetch(`${app.origin}/api/admin/announcements/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", Cookie: admin.cookie },
    body: JSON.stringify({ status: "published" })
  });

  const published = await (await fetch(`${app.origin}/api/announcements`)).json();
  assert.equal(published.announcements.length, 1);
  assert.equal(published.announcements[0].title, "维护通知");

  await fetch(`${app.origin}/api/admin/announcements/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", Cookie: admin.cookie },
    body: JSON.stringify({ status: "draft" })
  });
  assert.equal((await (await fetch(`${app.origin}/api/announcements`)).json()).announcements.length, 0);

  const del = await fetch(`${app.origin}/api/admin/announcements/${id}`, { method: "DELETE", headers: authHeaders(admin.cookie) });
  assert.equal(del.status, 204);
  assert.equal((await (await fetch(`${app.origin}/api/admin/announcements`, { headers: authHeaders(admin.cookie) })).json()).total, 0);
});

test("反馈：用户提交，管理员查看并回复", async (context) => {
  const app = await startAdminServer();
  context.after(() => new Promise((resolve) => app.server.close(resolve)));

  const admin = await register(app, { identifier: "admin@example.com", password: "password123" });
  const bob = await register(app, { identifier: "bob@example.com", password: "password123" });

  const submit = await fetch(`${app.origin}/api/feedback`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: bob.cookie },
    body: JSON.stringify({ type: "suggestion", content: "希望增加更多模板" })
  });
  assert.equal(submit.status, 201);
  const { id } = (await submit.json()).feedback;

  const list = await (await fetch(`${app.origin}/api/admin/feedbacks`, { headers: authHeaders(admin.cookie) })).json();
  assert.equal(list.total, 1);
  assert.equal(list.feedbacks[0].status, "open");

  const reply = await fetch(`${app.origin}/api/admin/feedbacks/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", Cookie: admin.cookie },
    body: JSON.stringify({ status: "resolved", reply: "已记录，感谢反馈" })
  });
  assert.equal(reply.status, 200);
  const updated = (await reply.json()).feedback;
  assert.equal(updated.status, "resolved");
  assert.equal(updated.reply, "已记录，感谢反馈");

  // 普通用户不能查看反馈工单
  assert.equal((await fetch(`${app.origin}/api/admin/feedbacks`, { headers: authHeaders(bob.cookie) })).status, 403);
});

test("指标接口返回日序列与总计", async (context) => {
  const app = await startAdminServer();
  context.after(() => new Promise((resolve) => app.server.close(resolve)));

  const admin = await register(app, { identifier: "admin@example.com", password: "password123" });
  const payload = await (await fetch(`${app.origin}/api/admin/metrics?days=7`, { headers: authHeaders(admin.cookie) })).json();
  assert.equal(payload.days.length, 7);
  assert.ok(typeof payload.totals.users === "number");
  assert.ok(Array.isArray(payload.days));
});

test("CSV 导出返回带 BOM 的 text/csv", async (context) => {
  const app = await startAdminServer();
  context.after(() => new Promise((resolve) => app.server.close(resolve)));

  const admin = await register(app, { identifier: "admin@example.com", password: "password123" });
  const response = await fetch(`${app.origin}/api/admin/users?format=csv`, { headers: authHeaders(admin.cookie) });
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") || "", /text\/csv/);
  const buf = new Uint8Array(await response.arrayBuffer());
  assert.equal(buf[0], 0xef);
  assert.equal(buf[1], 0xbb);
  assert.equal(buf[2], 0xbf);
  const text = new TextDecoder().decode(buf.slice(3));
  assert.match(text, /email/);
});

test("站内信广播与读取", async (context) => {
  const app = await startAdminServer();
  context.after(() => new Promise((resolve) => app.server.close(resolve)));

  const admin = await register(app, { identifier: "admin@example.com", password: "password123" });
  const bob = await register(app, { identifier: "bob@example.com", password: "password123" });

  const broadcast = await fetch(`${app.origin}/api/admin/messages/broadcast`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: admin.cookie },
    body: JSON.stringify({ title: "欢迎", content: "欢迎使用轻简历" })
  });
  assert.equal(broadcast.status, 200);

  const inbox = await (await fetch(`${app.origin}/api/me/messages`, { headers: authHeaders(bob.cookie) })).json();
  assert.ok(Array.isArray(inbox.messages));
  assert.equal(typeof inbox.unread, "number");
});

test("模板管理列表与状态流转接口", async (context) => {
  const app = await startAdminServer();
  context.after(() => new Promise((resolve) => app.server.close(resolve)));

  const admin = await register(app, { identifier: "admin@example.com", password: "password123" });
  const list = await (await fetch(`${app.origin}/api/admin/templates`, { headers: authHeaders(admin.cookie) })).json();
  assert.ok(Array.isArray(list.templates));
  assert.ok(list.templates.some((t) => t.slug === "clean-single"));

  // 无 DB 模式下状态流转返回 404（内存模式没有模板版本存储）。
  const patch = await fetch(`${app.origin}/api/admin/templates/clean-single/versions/1`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", Cookie: admin.cookie },
    body: JSON.stringify({ status: "blocked" })
  });
  assert.equal(patch.status, 404);
});
