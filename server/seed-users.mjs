// 测试账号种子逻辑。仅限本地开发（SEED_TEST_USERS=true）；生产务必保持关闭。
// 口令不再提供弱默认值：必须通过 SEED_ADMIN_PASSWORD / SEED_USER_PASSWORD 显式注入。
export async function seedTestUsers(authService, options = {}) {
  const adminEmail = options.adminEmail ?? process.env.SEED_ADMIN_EMAIL ?? "admin@example.com";
  const adminPassword = options.adminPassword ?? process.env.SEED_ADMIN_PASSWORD ?? "";
  const userEmail = options.userEmail ?? process.env.SEED_USER_EMAIL ?? "user@example.com";
  const userPassword = options.userPassword ?? process.env.SEED_USER_PASSWORD ?? "";

  if (!adminPassword || !userPassword) {
    throw new Error(
      "启用 SEED_TEST_USERS 时必须显式设置 SEED_ADMIN_PASSWORD 与 SEED_USER_PASSWORD，禁止使用默认弱口令"
    );
  }

  const admin = await authService.seedUser({
    email: adminEmail,
    password: adminPassword,
    displayName: "管理员",
    isAdmin: true
  });
  const user = await authService.seedUser({
    email: userEmail,
    password: userPassword,
    displayName: "测试用户",
    isAdmin: false
  });
  return { admin, user };
}
