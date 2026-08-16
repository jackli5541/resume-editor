import test from "node:test";
import assert from "node:assert/strict";

import { AiQuotaService } from "../server/ai/quota.mjs";

test("管理员不限额，普通用户按各自限额扣减", async () => {
  const quota = new AiQuotaService({ database: null, dailyLimit: 8 });

  const admin = await quota.check("admin-id", { isAdmin: true, limit: 8 });
  assert.equal(admin.allowed, true);
  assert.equal(admin.limit, null);
  assert.equal(admin.unlimited, true);

  const user = await quota.check("user-id", { isAdmin: false, limit: 3 });
  assert.equal(user.allowed, true);
  assert.equal(user.limit, 3);
  assert.equal(user.remaining, 3);

  quota.increment("user-id");
  quota.increment("user-id");
  quota.increment("user-id");

  const exhausted = await quota.check("user-id", { isAdmin: false, limit: 3 });
  assert.equal(exhausted.allowed, false);
  assert.equal(exhausted.remaining, 0);

  // 另一个用户不受影响
  const other = await quota.check("other-id", { isAdmin: false, limit: 8 });
  assert.equal(other.allowed, true);
  assert.equal(other.remaining, 8);
});
