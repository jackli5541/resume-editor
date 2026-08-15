import test from "node:test";
import assert from "node:assert/strict";

import { startServer } from "../server.mjs";
import { hashPassword, verifyPassword, isValidEmail, isValidPhone, mapUserRow } from "../server/auth.mjs";
import { seedTestUsers } from "../server/seed-users.mjs";

function cookieFrom(response) {
  const header = response.headers.get("set-cookie");
  return header ? header.split(";")[0] : null;
}

async function startAuthServer() {
  const app = await startServer({ port: 0 });
  return app;
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

function authHeaders(cookie) {
  return { Cookie: cookie || "" };
}

test("密码哈希可校验且不暴露明文", async () => {
  const hash = await hashPassword("correct-horse-battery");
  assert.equal(hash.startsWith("scrypt$16384$8$1$"), true);
  assert.equal(hash.includes("correct-horse-battery"), false);
  assert.equal(await verifyPassword("correct-horse-battery", hash), true);
  assert.equal(await verifyPassword("wrong-password", hash), false);
});

test("邮箱与手机号格式校验", () => {
  assert.equal(isValidEmail("User@Example.com"), true);
  assert.equal(isValidEmail("not-an-email"), false);
  assert.equal(isValidPhone("+8613800000000"), true);
  assert.equal(isValidPhone("13800000000"), true);
  assert.equal(isValidPhone("abc"), false);
});

test("邮箱注册、会话、退出闭环", async (context) => {
  const app = await startAuthServer();
  context.after(() => new Promise((resolve) => app.server.close(resolve)));

  const created = await register(app, { identifier: "alice@example.com", password: "password123" });
  assert.equal(created.status, 201);
  assert.equal(created.body.user.email, "alice@example.com");
  assert.ok(created.cookie);

  const session = await fetch(`${app.origin}/api/auth/session`, { headers: authHeaders(created.cookie) });
  assert.equal(session.status, 200);
  assert.equal((await session.json()).user.email, "alice@example.com");

  const logout = await fetch(`${app.origin}/api/auth/logout`, {
    method: "POST",
    headers: authHeaders(created.cookie)
  });
  assert.equal(logout.status, 200);

  const afterLogout = await fetch(`${app.origin}/api/auth/session`, { headers: authHeaders(created.cookie) });
  assert.equal((await afterLogout.json()).user, null);
});

test("手机号注册并登录", async (context) => {
  const app = await startAuthServer();
  context.after(() => new Promise((resolve) => app.server.close(resolve)));

  const created = await register(app, { identifier: "13800000000", password: "password123" });
  assert.equal(created.status, 201);
  assert.equal(created.body.user.phone, "13800000000");

  const ok = await login(app, { identifier: "13800000000", password: "password123" });
  assert.equal(ok.status, 200);
  assert.equal(ok.body.user.phone, "13800000000");
});

test("登录拒绝错误密码并给出统一提示", async (context) => {
  const app = await startAuthServer();
  context.after(() => new Promise((resolve) => app.server.close(resolve)));

  await register(app, { identifier: "bob@example.com", password: "password123" });
  const ok = await login(app, { identifier: "bob@example.com", password: "password123" });
  assert.equal(ok.status, 200);

  const bad = await login(app, { identifier: "bob@example.com", password: "wrong-password" });
  assert.equal(bad.status, 401);
  assert.equal(bad.body.error, "账号或密码不正确");
});

test("未登录访问草稿与导出接口返回 401", async (context) => {
  const app = await startAuthServer();
  context.after(() => new Promise((resolve) => app.server.close(resolve)));

  assert.equal((await fetch(`${app.origin}/api/resumes`)).status, 401);
  assert.equal((await fetch(`${app.origin}/api/resumes/019fff3e-69ac-7893-abd7-ed31c55b50fc`)).status, 401);
  const create = await fetch(`${app.origin}/api/resumes`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ templateSlug: "clean-single", templateVersion: 1 })
  });
  assert.equal(create.status, 401);
});

test("草稿按 ownerId 隔离：其他用户读取/修改/删除均 404", async (context) => {
  const app = await startAuthServer();
  context.after(() => new Promise((resolve) => app.server.close(resolve)));

  const alice = await register(app, { identifier: "alice@example.com", password: "password123" });
  const bob = await register(app, { identifier: "bob@example.com", password: "password123" });

  const createdResponse = await fetch(`${app.origin}/api/resumes`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: alice.cookie },
    body: JSON.stringify({ templateSlug: "clean-single", templateVersion: 1 })
  });
  assert.equal(createdResponse.status, 201);
  const { id } = await createdResponse.json();

  const aliceRead = await fetch(`${app.origin}/api/resumes/${id}`, { headers: authHeaders(alice.cookie) });
  assert.equal(aliceRead.status, 200);
  const aliceList = await (await fetch(`${app.origin}/api/resumes`, { headers: authHeaders(alice.cookie) })).json();
  assert.equal(aliceList.resumes.length, 1);

  const bobRead = await fetch(`${app.origin}/api/resumes/${id}`, { headers: authHeaders(bob.cookie) });
  assert.equal(bobRead.status, 404);
  const bobList = await (await fetch(`${app.origin}/api/resumes`, { headers: authHeaders(bob.cookie) })).json();
  assert.equal(bobList.resumes.length, 0);
  const bobPatch = await fetch(`${app.origin}/api/resumes/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", Cookie: bob.cookie },
    body: JSON.stringify({ revision: 1, data: {} })
  });
  assert.equal(bobPatch.status, 404);
  const bobDelete = await fetch(`${app.origin}/api/resumes/${id}`, {
    method: "DELETE",
    headers: authHeaders(bob.cookie)
  });
  assert.equal(bobDelete.status, 404);
});

test("用户设置只保留白名单字段", async (context) => {
  const app = await startAuthServer();
  context.after(() => new Promise((resolve) => app.server.close(resolve)));

  const user = await register(app, { identifier: "carol@example.com", password: "password123" });
  const updated = await fetch(`${app.origin}/api/me`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", Cookie: user.cookie },
    body: JSON.stringify({
      displayName: "林知夏",
      settings: {
        theme: "dark",
        ai: { enabled: true, targetRole: "产品经理", tone: "confident", evil: "should-drop" },
        locale: "zh-CN",
        unknown: "should-drop"
      }
    })
  });
  assert.equal(updated.status, 200);
  const { user: saved } = await updated.json();
  assert.equal(saved.displayName, "林知夏");
  assert.equal(saved.settings.theme, "dark");
  assert.equal(saved.settings.unknown, undefined);
  assert.equal(saved.settings.ai.enabled, true);
  assert.equal(saved.settings.ai.evil, undefined);
});

test("跨站状态变更请求被 CSRF 校验拒绝", async (context) => {
  const app = await startAuthServer();
  context.after(() => new Promise((resolve) => app.server.close(resolve)));

  const user = await register(app, { identifier: "dave@example.com", password: "password123" });
  const response = await fetch(`${app.origin}/api/resumes`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Cookie: user.cookie,
      "Sec-Fetch-Site": "cross-site"
    },
    body: JSON.stringify({ templateSlug: "clean-single", templateVersion: 1 })
  });
  assert.equal(response.status, 403);
});

test("登录接口按标识限流，超过阈值返回 429", async (context) => {
  const app = await startAuthServer();
  context.after(() => new Promise((resolve) => app.server.close(resolve)));

  await register(app, { identifier: "eve@example.com", password: "password123" });
  let last;
  for (let attempt = 0; attempt < 6; attempt += 1) {
    last = await login(app, { identifier: "eve@example.com", password: "wrong-password" });
  }
  assert.equal(last.status, 429);
});

test("mapUserRow 将数据库行规范为内部 camelCase 形态", () => {
  const row = mapUserRow({
    id: "u1",
    email: "admin@example.com",
    phone: "13800000000",
    password_hash: "hash",
    display_name: "张三",
    settings: { theme: "dark" },
    is_admin: true,
    disabled: false,
    created_at: "2024-01-01",
    updated_at: "2024-01-02"
  });
  assert.equal(row.email, "admin@example.com");
  assert.equal(row.phone, "13800000000");
  assert.equal(row.passwordHash, "hash");
  assert.equal(row.displayName, "张三");
  assert.equal(row.isAdmin, true);
  assert.equal(row.disabled, false);
  assert.equal(row.createdAt, "2024-01-01");
  assert.equal(row.updatedAt, "2024-01-02");
});

test("管理员邮箱自动获得管理员角色且普通用户被拒", async (context) => {
  const app = await startServer({ port: 0, adminEmails: ["admin@example.com"] });
  context.after(() => new Promise((resolve) => app.server.close(resolve)));

  const admin = await register(app, { identifier: "admin@example.com", password: "password123" });
  assert.equal(admin.body.user.isAdmin, true);

  const bob = await register(app, { identifier: "bob@example.com", password: "password123" });
  assert.equal(bob.body.user.isAdmin, false);

  const forbidden = await fetch(`${app.origin}/api/admin/users`, { headers: authHeaders(bob.cookie) });
  assert.equal(forbidden.status, 403);

  const list = await fetch(`${app.origin}/api/admin/users`, { headers: authHeaders(admin.cookie) });
  assert.equal(list.status, 200);
  const { users, total } = await list.json();
  assert.equal(total, 2);
  assert.ok(users.some((user) => user.email === "bob@example.com"));
});

test("管理员可设管理员、禁用、删除用户且不能操作自己", async (context) => {
  const app = await startServer({ port: 0, adminEmails: ["admin@example.com"] });
  context.after(() => new Promise((resolve) => app.server.close(resolve)));

  const admin = await register(app, { identifier: "admin@example.com", password: "password123" });
  const bob = await register(app, { identifier: "bob@example.com", password: "password123" });
  const bobId = bob.body.user.id;

  const promote = await fetch(`${app.origin}/api/admin/users/${bobId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", Cookie: admin.cookie },
    body: JSON.stringify({ isAdmin: true })
  });
  assert.equal(promote.status, 200);
  assert.equal((await promote.json()).user.isAdmin, true);

  const disable = await fetch(`${app.origin}/api/admin/users/${bobId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", Cookie: admin.cookie },
    body: JSON.stringify({ disabled: true })
  });
  assert.equal(disable.status, 200);

  const session = await fetch(`${app.origin}/api/auth/session`, { headers: authHeaders(bob.cookie) });
  assert.equal((await session.json()).user, null);

  const relogin = await login(app, { identifier: "bob@example.com", password: "password123" });
  assert.equal(relogin.status, 403);

  const del = await fetch(`${app.origin}/api/admin/users/${bobId}`, { method: "DELETE", headers: authHeaders(admin.cookie) });
  assert.equal(del.status, 204);

  const selfDel = await fetch(`${app.origin}/api/admin/users/${admin.body.user.id}`, { method: "DELETE", headers: authHeaders(admin.cookie) });
  assert.equal(selfDel.status, 400);
});

test("管理员可查看并删除全站草稿", async (context) => {
  const app = await startServer({ port: 0, adminEmails: ["admin@example.com"] });
  context.after(() => new Promise((resolve) => app.server.close(resolve)));

  const admin = await register(app, { identifier: "admin@example.com", password: "password123" });
  const bob = await register(app, { identifier: "bob@example.com", password: "password123" });

  const created = await fetch(`${app.origin}/api/resumes`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: bob.cookie },
    body: JSON.stringify({ templateSlug: "clean-single", templateVersion: 1 })
  });
  const { id } = await created.json();

  const list = await (await fetch(`${app.origin}/api/admin/resumes`, { headers: authHeaders(admin.cookie) })).json();
  assert.equal(list.total, 1);
  assert.equal(list.resumes[0].id, id);

  const detail = await fetch(`${app.origin}/api/admin/resumes/${id}`, { headers: authHeaders(admin.cookie) });
  assert.equal(detail.status, 200);

  const del = await fetch(`${app.origin}/api/admin/resumes/${id}`, { method: "DELETE", headers: authHeaders(admin.cookie) });
  assert.equal(del.status, 204);

  const bobList = await (await fetch(`${app.origin}/api/resumes`, { headers: authHeaders(bob.cookie) })).json();
  assert.equal(bobList.resumes.length, 0);
});

test("种子账号 admin@example.com/admin123 与 user@example.com/user1234 角色正确且可登录", async (context) => {
  const app = await startServer({ port: 0 });
  context.after(() => new Promise((resolve) => app.server.close(resolve)));

  await seedTestUsers(app.authService);

  const adminLogin = await login(app, { identifier: "admin@example.com", password: "admin123" });
  assert.equal(adminLogin.status, 200);
  assert.equal(adminLogin.body.user.isAdmin, true);

  const userLogin = await login(app, { identifier: "user@example.com", password: "user1234" });
  assert.equal(userLogin.status, 200);
  assert.equal(userLogin.body.user.isAdmin, false);
});
