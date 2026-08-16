import test from "node:test";
import assert from "node:assert/strict";

import {
  DeviceFingerprintService,
  computeSoftSignature,
  normalizeClientDeviceId
} from "../server/device-fingerprint.mjs";
import { startServer } from "../server.mjs";

function cookieFrom(response) {
  const header = response.headers.get("set-cookie");
  return header ? header.split(";")[0] : null;
}

test("computeSoftSignature 同输入稳定、异 UA 不同", () => {
  const a = computeSoftSignature({
    ip: "127.0.0.1",
    userAgent: "Mozilla/5.0 Chrome",
    acceptLanguage: "zh-CN,zh;q=0.9",
    acceptEncoding: "gzip, deflate"
  });
  const b = computeSoftSignature({
    ip: "127.0.0.1",
    userAgent: "Mozilla/5.0 Chrome",
    acceptLanguage: "zh-CN,zh;q=0.9",
    acceptEncoding: "gzip, deflate"
  });
  const c = computeSoftSignature({
    ip: "127.0.0.1",
    userAgent: "Mozilla/5.0 Safari",
    acceptLanguage: "zh-CN,zh;q=0.9",
    acceptEncoding: "gzip, deflate"
  });
  assert.equal(a, b);
  assert.notEqual(a, c);
});

test("normalizeClientDeviceId 只接受 8–64 位十六进制", () => {
  assert.equal(normalizeClientDeviceId("ABCDEF1234567890"), "abcdef1234567890");
  assert.equal(normalizeClientDeviceId("abc"), ""); // 过短
  assert.equal(normalizeClientDeviceId("not-a-real-id!"), "");
  assert.equal(normalizeClientDeviceId(""), "");
});

test("内存模式：同一客户端指纹关联的两个账号被标记为疑似同人", async () => {
  const service = new DeviceFingerprintService({ database: null });

  const first = await service.record({
    userId: "u1", ip: "1.2.3.4", userAgent: "Chrome/1", clientDeviceId: "aaaaaaaaaaaaaaaa"
  });
  assert.equal(first.newDuplicates.length, 0);

  const second = await service.record({
    userId: "u2", ip: "5.6.7.8", userAgent: "Firefox/2", clientDeviceId: "aaaaaaaaaaaaaaaa"
  });
  assert.ok(second.newDuplicates.some((dup) => dup.type === "client" && dup.count === 2));

  const { groups, total } = await service.listSuspected();
  const clientGroup = groups.find((group) => group.type === "client");
  assert.ok(clientGroup);
  assert.deepEqual(new Set(clientGroup.userIds), new Set(["u1", "u2"]));
  assert.equal(total >= 1, true);
});

test("内存模式：同 IP + 同环境软指纹关联两个账号", async () => {
  const service = new DeviceFingerprintService({ database: null });
  const env = { ip: "9.9.9.9", userAgent: "Chrome/120", acceptLanguage: "zh-CN", acceptEncoding: "gzip" };

  await service.record({ userId: "a", ...env });
  await service.record({ userId: "b", ...env });

  const { groups } = await service.listSuspected();
  assert.ok(groups.some((group) => group.type === "soft" && group.userIds.includes("a") && group.userIds.includes("b")));
  assert.ok(groups.some((group) => group.type === "ip"));
});

test("集成：同 X-Device-Id 注册两个账号，管理端只读列表返回疑似关联", async (context) => {
  const app = await startServer({ port: 0, adminEmails: ["admin@example.com"] });
  context.after(() => new Promise((resolve) => app.server.close(resolve)));

  async function register(identifier, deviceId) {
    const response = await fetch(`${app.origin}/api/auth/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Device-Id": deviceId },
      body: JSON.stringify({ identifier, password: "password123" })
    });
    return { status: response.status, body: await response.json().catch(() => ({})), cookie: cookieFrom(response) };
  }

  const admin = await register("admin@example.com", "feedfacefeedface");
  const bob = await register("bob@example.com", "feedfacefeedface");
  assert.equal(admin.status, 201);
  assert.equal(bob.status, 201);

  const list = await fetch(`${app.origin}/api/admin/suspected-duplicates`, {
    headers: { Cookie: admin.cookie }
  });
  assert.equal(list.status, 200);
  const payload = await list.json();
  const clientGroup = payload.groups.find((group) => group.type === "client");
  assert.ok(clientGroup, "应存在基于客户端指纹的疑似关联组");
  assert.equal(clientGroup.users.length, 2);
  assert.deepEqual(
    new Set(clientGroup.users.map((user) => user.email)),
    new Set(["admin@example.com", "bob@example.com"])
  );

  // 高置信度（client）形成新关联时写入告警。
  const alertsResponse = await fetch(`${app.origin}/api/admin/alerts`, {
    headers: { Cookie: admin.cookie }
  });
  assert.equal(alertsResponse.status, 200);
  const alertsPayload = await alertsResponse.json();
  assert.ok(
    alertsPayload.alerts.some((alert) => alert.kind === "suspected_duplicate_accounts"),
    "应产生 suspected_duplicate_accounts 告警"
  );
});

test("集成：单账号不产生疑似关联，且接口要求登录", async (context) => {
  const app = await startServer({ port: 0, adminEmails: ["admin@example.com"] });
  context.after(() => new Promise((resolve) => app.server.close(resolve)));

  const unauthorized = await fetch(`${app.origin}/api/admin/suspected-duplicates`);
  assert.equal(unauthorized.status, 401);

  const admin = await fetch(`${app.origin}/api/auth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ identifier: "admin@example.com", password: "password123" })
  });
  const adminCookie = cookieFrom(admin);

  const list = await fetch(`${app.origin}/api/admin/suspected-duplicates`, {
    headers: { Cookie: adminCookie }
  });
  assert.equal(list.status, 200);
  assert.equal((await list.json()).total, 0);
});
