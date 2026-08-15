// 测试账号种子逻辑。生产环境勿启用 SEED_TEST_USERS。
export async function seedTestUsers(authService) {
  const adminEmail = process.env.SEED_ADMIN_EMAIL || "admin@example.com";
  const adminPassword = process.env.SEED_ADMIN_PASSWORD || "admin123";
  const userEmail = process.env.SEED_USER_EMAIL || "user@example.com";
  const userPassword = process.env.SEED_USER_PASSWORD || "user1234";

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
