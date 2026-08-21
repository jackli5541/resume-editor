import assert from "node:assert/strict";
import test from "node:test";
import { chromium } from "playwright";
import { startServer } from "../server.mjs";

test("真实浏览器加载 Vue 运行时且保留现有首页与窄屏路由", { timeout: 30_000 }, async (context) => {
  const app = await startServer({ port: 0 });
  const browser = await chromium.launch({ headless: true });
  context.after(async () => {
    await browser.close();
    app.server.closeAllConnections();
    await new Promise((resolve) => app.server.close(resolve));
  });

  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const pageErrors = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));

  await page.goto(app.origin, { waitUntil: "domcontentloaded" });
  await page.locator("[data-vue-runtime=\"ready\"]").waitFor({ state: "attached" });
  await assert.doesNotReject(() => page.locator("#homePage:not([hidden])").waitFor());
  assert.equal(await page.locator("#templateLibrary").isHidden(), true);
  await page.goto(`${app.origin}/login`, { waitUntil: "domcontentloaded" });
  await page.locator("#loginPage:not([hidden]) .vue-login-content").waitFor({ state: "attached" });
  await page.locator("#loginTabRegister").dispatchEvent("click");
  assert.equal(await page.locator("#loginTitle").textContent(), "注册");
  await page.locator("#loginTabLogin").dispatchEvent("click");
  await page.locator("#loginMethodSwitch").dispatchEvent("click");
  assert.equal(await page.locator("#loginTitle").textContent(), "验证码登录");

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`${app.origin}/templates`, { waitUntil: "domcontentloaded" });
  await assert.doesNotReject(() => page.locator("#templateLibrary:not([hidden])").waitFor());
  await page.locator("#templateList .template-card").first().waitFor();
  assert.deepEqual(pageErrors, []);
});

test("管理员概览由 Vue 加载且保留原有统计 DOM 标记", { timeout: 30_000 }, async (context) => {
  const app = await startServer({ port: 0 });
  const admin = await app.authService.seedUser({
    email: "vue-admin@example.com",
    password: "Test1234!",
    displayName: "Vue 管理员",
    isAdmin: true
  });
  const session = await app.authService.createSession(admin.id, 60_000);
  const browser = await chromium.launch({ headless: true });
  context.after(async () => {
    await browser.close();
    app.server.closeAllConnections();
    await new Promise((resolve) => app.server.close(resolve));
  });

  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await page.context().addCookies([{
    name: app.authService.cookieName,
    value: session.token,
    url: app.origin,
    httpOnly: true,
    sameSite: "Lax"
  }]);
  await page.goto(`${app.origin}/admin`, { waitUntil: "domcontentloaded" });
  await page.locator("#adminPage:not([hidden])").waitFor();
  await page.locator("#vueAdminOverview .vue-admin-overview").waitFor();
  await page.locator("#adminStats .admin-stat").first().waitFor();
  assert.equal(await page.locator("#adminStats").count(), 1);
  assert.equal(await page.locator("#adminChart").count(), 1);

  await page.locator('[data-admin-tab="resumes"]').click();
  await page.locator('#vueAdminResumes [data-admin-panel="resumes"]:not([hidden])').waitFor();
  assert.equal(await page.locator("#adminResumeSearch").count(), 1);
  await page.locator('[data-admin-tab="exports"]').click();
  await page.locator('#vueAdminExports [data-admin-panel="exports"]:not([hidden])').waitFor();
  assert.equal(await page.locator("#adminExportSearch").count(), 1);
  await page.locator('[data-admin-tab="announcements"]').click();
  await page.locator('#vueAdminAnnouncements [data-admin-panel="announcements"]:not([hidden])').waitFor();
  await page.locator('[data-action="admin-new-announcement"]').click();
  await page.locator("#adminAnnouncementForm").waitFor();
  assert.equal(await page.locator("#adminAnnouncementTitle").count(), 1);
  await page.locator('[data-admin-tab="feedback"]').click();
  await page.locator('#vueAdminFeedback [data-admin-panel="feedback"]:not([hidden])').waitFor();
  assert.equal(await page.locator("#adminFeedbackSearch").count(), 1);
  await page.goto(`${app.origin}/drafts`, { waitUntil: "domcontentloaded" });
  await page.locator("#draftPage:not([hidden])").waitFor();
  assert.equal(await page.locator("#draftList").count(), 1);
  await page.goto(`${app.origin}/templates`, { waitUntil: "domcontentloaded" });
  await page.locator('#templateList [data-action="select-template"]:not([disabled])').first().click();
  await page.locator("#app:not([hidden]) #moduleTabs .module-tab").first().waitFor();
  await page.locator("#resumeFlow .vue-resume-preview-content").waitFor();
  await page.locator("#drawerContent .vue-editor-content").waitFor();
  assert.equal(await page.locator('#moduleTabs [data-action="select-module"][data-module-id="profile"]').count(), 1);
  await page.locator("#aiFloatBtn").click();
  await page.locator("#aiChatPanel.is-open #aiChatBody .vue-ai-chat-content").waitFor();
});
