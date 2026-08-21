import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("Vue migration bootstrap remains opt-in", async () => {
  const source = await readFile(new URL("../frontend/src/bootstrap.mjs", import.meta.url), "utf8");
  const html = await readFile(new URL("../public/index.html", import.meta.url), "utf8");

  assert.match(source, /data-vue-enabled/);
  assert.match(source, /enabled === true/);
  assert.match(html, /id="vueRuntimeRoot"[^>]+data-vue-feature="runtime"[^>]+data-vue-enabled="true"[^>]+hidden/);
  assert.match(html, /<script type="module" src="\/assets\/vue\/bootstrap\.mjs"><\/script>/);
});

test("Vue build writes only to its isolated static asset directory", async () => {
  const config = await readFile(new URL("../frontend/vite.config.mjs", import.meta.url), "utf8");

  assert.match(config, /public\/assets\/vue\//);
  assert.match(config, /bootstrap\.mjs/);
  assert.match(config, /publicDir:\s*false/);
  assert.match(config, /"process\.env\.NODE_ENV":\s*JSON\.stringify\("production"\)/);
  assert.doesNotMatch(config, /publicRoot|public\/index\.html/);
});

test("production image builds Vue assets without shipping build dependencies", async () => {
  const dockerfile = await readFile(new URL("../Dockerfile", import.meta.url), "utf8");

  assert.match(dockerfile, /FROM node:22-bookworm-slim AS web-build/);
  assert.match(dockerfile, /RUN npm run build:web/);
  assert.match(dockerfile, /npm ci --omit=dev/);
  assert.match(dockerfile, /COPY --from=web-build \/build\/public\/assets\/vue \.\/public\/assets\/vue/);
});

test("admin overview is mounted as a Vue feature while preserving its DOM contract", async () => {
  const html = await readFile(new URL("../public/index.html", import.meta.url), "utf8");
  const bootstrap = await readFile(new URL("../frontend/src/bootstrap.mjs", import.meta.url), "utf8");
  const app = await readFile(new URL("../public/app.mjs", import.meta.url), "utf8");

  assert.match(html, /id="vueAdminOverview"[^>]+data-vue-feature="admin-overview"[^>]+data-vue-enabled="true"/);
  assert.match(html, /id="adminStats"/);
  assert.match(html, /id="adminChart"/);
  assert.match(bootstrap, /registerVueFeature\("admin-overview", AdminOverview\)/);
  assert.match(bootstrap, /resume-legacy-ready/);
  assert.match(app, /window\.__resumeVueAdminOverview\?\.load/);
});

test("admin users are owned by a Vue feature and retain action contracts", async () => {
  const html = await readFile(new URL("../public/index.html", import.meta.url), "utf8");
  const source = await readFile(new URL("../frontend/src/features/admin/admin-users.mjs", import.meta.url), "utf8");
  const app = await readFile(new URL("../public/app.mjs", import.meta.url), "utf8");

  assert.match(html, /id="vueAdminUsers"[^>]+data-vue-feature="admin-users"/);
  assert.match(source, /data-action.: "admin-toggle-disabled"/);
  assert.match(source, /data-action.: "admin-delete-user"/);
  assert.match(source, /data-action.: "admin-revoke-sessions"/);
  assert.match(app, /window\.__resumeVueAdminUsers\?\.load/);
});

test("admin draft and export records are owned by Vue features", async () => {
  const html = await readFile(new URL("../public/index.html", import.meta.url), "utf8");
  const source = await readFile(new URL("../frontend/src/features/admin/admin-records.mjs", import.meta.url), "utf8");
  const app = await readFile(new URL("../public/app.mjs", import.meta.url), "utf8");

  assert.match(html, /id="vueAdminResumes"[^>]+data-vue-feature="admin-resumes"/);
  assert.match(html, /id="vueAdminExports"[^>]+data-vue-feature="admin-exports"/);
  assert.match(source, /admin-download-draft/);
  assert.match(source, /admin-delete-draft/);
  assert.match(app, /window\.__resumeVueAdminResumes\?\.load/);
  assert.match(app, /window\.__resumeVueAdminExports\?\.load/);
});

test("admin duplicate review is a read-only Vue feature", async () => {
  const html = await readFile(new URL("../public/index.html", import.meta.url), "utf8");
  const source = await readFile(new URL("../frontend/src/features/admin/admin-duplicates.mjs", import.meta.url), "utf8");
  assert.match(html, /id="vueAdminDuplicates"[^>]+data-vue-feature="admin-duplicates"/);
  assert.match(source, /系统不会自动封禁账号/);
  assert.doesNotMatch(source, /admin-toggle-disabled|admin-delete-user/);
});

test("admin announcements are fully rendered and edited by Vue", async () => {
  const html = await readFile(new URL("../public/index.html", import.meta.url), "utf8");
  const source = await readFile(new URL("../frontend/src/features/admin/admin-announcements.mjs", import.meta.url), "utf8");
  const app = await readFile(new URL("../public/app.mjs", import.meta.url), "utf8");
  assert.match(html, /id="vueAdminAnnouncements"[^>]+data-vue-feature="admin-announcements"/);
  assert.match(source, /adminAnnouncementForm/);
  assert.match(source, /admin-toggle-announcement/);
  assert.match(source, /admin-delete-announcement/);
  assert.match(app, /window\.__resumeVueAdminAnnouncements\?\.load/);
});

test("admin feedback uses a Vue list, reply form, and detail dialog", async () => {
  const html = await readFile(new URL("../public/index.html", import.meta.url), "utf8");
  const source = await readFile(new URL("../frontend/src/features/admin/admin-feedback.mjs", import.meta.url), "utf8");
  const app = await readFile(new URL("../public/app.mjs", import.meta.url), "utf8");
  assert.match(html, /id="vueAdminFeedback"[^>]+data-vue-feature="admin-feedback"/);
  assert.match(source, /adminFeedbackReplyForm/);
  assert.match(source, /vueFeedbackDetailOverlay/);
  assert.match(app, /window\.__resumeVueAdminFeedback\?\.load/);
});

test("admin AI costs are rendered by Vue with existing summary markers", async () => {
  const html = await readFile(new URL("../public/index.html", import.meta.url), "utf8");
  const source = await readFile(new URL("../frontend/src/features/admin/admin-costs.mjs", import.meta.url), "utf8");
  const app = await readFile(new URL("../public/app.mjs", import.meta.url), "utf8");
  assert.match(html, /id="vueAdminCosts"[^>]+data-vue-feature="admin-costs"/);
  assert.match(source, /adminCostModelList/);
  assert.match(source, /adminCostList/);
  assert.match(app, /window\.__resumeVueAdminCosts\?\.load/);
});

test("template library cards are rendered by Vue without changing selection actions", async () => {
  const html = await readFile(new URL("../public/index.html", import.meta.url), "utf8");
  const source = await readFile(new URL("../frontend/src/features/templates/template-library.mjs", import.meta.url), "utf8");
  const app = await readFile(new URL("../public/app.mjs", import.meta.url), "utf8");
  assert.match(html, /id="templateList"[^>]+data-vue-feature="template-library"/);
  assert.match(source, /data-action.: "select-template"/);
  assert.match(source, /data-template-slug/);
  assert.match(app, /window\.__resumeVueTemplateLibrary\?\.setTemplates/);
});

test("home and full draft lists are rendered by Vue without changing draft actions", async () => {
  const html = await readFile(new URL("../public/index.html", import.meta.url), "utf8");
  const source = await readFile(new URL("../frontend/src/features/drafts/draft-lists.mjs", import.meta.url), "utf8");
  const app = await readFile(new URL("../public/app.mjs", import.meta.url), "utf8");
  assert.match(html, /id="homeDraftList"[^>]+data-vue-feature="recent-draft-list"/);
  assert.match(html, /id="draftList"[^>]+data-vue-feature="draft-list"/);
  assert.match(source, /data-action.: "continue-draft"/);
  assert.match(source, /data-action.: "delete-draft"/);
  assert.match(app, /window\.__resumeVueDraftList\?\.setDrafts/);
});

test("account settings and password updates are rendered by Vue with their existing field contracts", async () => {
  const html = await readFile(new URL("../public/index.html", import.meta.url), "utf8");
  const source = await readFile(new URL("../frontend/src/features/account/settings-dialog.mjs", import.meta.url), "utf8");
  const bootstrap = await readFile(new URL("../frontend/src/bootstrap.mjs", import.meta.url), "utf8");
  const app = await readFile(new URL("../public/app.mjs", import.meta.url), "utf8");
  assert.match(html, /id="vueSettingsOverlay"[^>]+data-vue-feature="settings-dialog"/);
  assert.match(source, /id: "settingsForm"/);
  assert.match(source, /id: "passwordForm"/);
  assert.match(source, /api\/auth\/change-password/);
  assert.match(bootstrap, /registerVueFeature\("settings-dialog", SettingsDialog\)/);
  assert.match(app, /window\.__resumeVueSettings\?\.open/);
});

test("user feedback dialog is rendered by Vue while keeping its submit contract", async () => {
  const html = await readFile(new URL("../public/index.html", import.meta.url), "utf8");
  const source = await readFile(new URL("../frontend/src/features/account/feedback-dialog.mjs", import.meta.url), "utf8");
  const app = await readFile(new URL("../public/app.mjs", import.meta.url), "utf8");
  assert.match(html, /id="vueFeedbackOverlay"[^>]+data-vue-feature="feedback-dialog"/);
  assert.match(source, /id: "feedbackForm"/);
  assert.match(source, /api\/feedback/);
  assert.match(app, /window\.__resumeVueFeedback\?\.open/);
});

test("inbox is rendered by Vue while retaining the unread and mark-read contracts", async () => {
  const html = await readFile(new URL("../public/index.html", import.meta.url), "utf8");
  const source = await readFile(new URL("../frontend/src/features/account/messages-dialog.mjs", import.meta.url), "utf8");
  const app = await readFile(new URL("../public/app.mjs", import.meta.url), "utf8");
  assert.match(html, /id="vueMessagesOverlay"[^>]+data-vue-feature="messages-dialog"/);
  assert.match(source, /api\/me\/messages/);
  assert.match(source, /message-mark-read/);
  assert.match(app, /window\.__resumeVueMessages\?\.open/);
});

test("admin AI log records are rendered by Vue while keeping filter and pager contracts", async () => {
  const html = await readFile(new URL("../public/index.html", import.meta.url), "utf8");
  const source = await readFile(new URL("../frontend/src/features/admin/admin-ai-logs.mjs", import.meta.url), "utf8");
  const app = await readFile(new URL("../public/app.mjs", import.meta.url), "utf8");
  assert.match(html, /id="adminAiLogList"[^>]+data-vue-feature="admin-ai-logs"/);
  assert.match(source, /data-admin-page.: "logs"/);
  assert.match(source, /rate_limited/);
  assert.match(app, /window\.__resumeVueAdminAiLogs\?\.setLogs/);
});

test("admin operations status and alerts are rendered by Vue with action and pager contracts", async () => {
  const html = await readFile(new URL("../public/index.html", import.meta.url), "utf8");
  const source = await readFile(new URL("../frontend/src/features/admin/admin-system.mjs", import.meta.url), "utf8");
  const bootstrap = await readFile(new URL("../frontend/src/bootstrap.mjs", import.meta.url), "utf8");
  const app = await readFile(new URL("../public/app.mjs", import.meta.url), "utf8");
  assert.match(html, /id="adminSystemStats"[^>]+data-vue-feature="admin-system-stats"/);
  assert.match(html, /id="adminSystemDetail"[^>]+data-vue-feature="admin-system-detail"/);
  assert.match(html, /id="adminAlertList"[^>]+data-vue-feature="admin-alerts"/);
  assert.match(source, /data-action.: "admin-ack-alert"/);
  assert.match(source, /data-admin-page.: "alerts"/);
  assert.match(bootstrap, /registerVueFeature\("admin-alerts", AdminAlerts\)/);
  assert.match(app, /window\.__resumeVueAdminSystem\.setStats/);
  assert.match(app, /window\.__resumeVueAdminAlerts\.setAlerts/);
});

test("admin template catalog is Vue-rendered while preserving selection and lifecycle actions", async () => {
  const html = await readFile(new URL("../public/index.html", import.meta.url), "utf8");
  const source = await readFile(new URL("../frontend/src/features/admin/admin-templates.mjs", import.meta.url), "utf8");
  const app = await readFile(new URL("../public/app.mjs", import.meta.url), "utf8");
  assert.match(html, /id="adminTemplateList"[^>]+data-vue-feature="admin-templates"/);
  assert.match(source, /data-admin-template-select-all/);
  assert.match(source, /data-admin-template-select/);
  assert.match(source, /admin-edit-template/);
  assert.match(source, /admin-template-status/);
  assert.match(app, /window\.__resumeVueAdminTemplates\.setTemplates/);
});

test("admin runtime configuration and encrypted auth fields are Vue-rendered with legacy form contracts", async () => {
  const html = await readFile(new URL("../public/index.html", import.meta.url), "utf8");
  const source = await readFile(new URL("../frontend/src/features/admin/admin-config.mjs", import.meta.url), "utf8");
  const app = await readFile(new URL("../public/app.mjs", import.meta.url), "utf8");
  assert.match(html, /id="adminConfigFields"[^>]+data-vue-feature="admin-config-fields"/);
  assert.match(html, /id="adminAuthSecretFields"[^>]+data-vue-feature="admin-auth-secret-fields"/);
  assert.match(source, /data-config-key/);
  assert.match(source, /data-secret-key/);
  assert.match(source, /admin-clear-secret/);
  assert.match(app, /window\.__resumeVueAdminConfig\.setFields/);
  assert.match(app, /window\.__resumeVueAdminAuth\.setSecrets/);
});

test("admin support image manager is Vue-rendered while preserving update, sort, and delete hooks", async () => {
  const html = await readFile(new URL("../public/index.html", import.meta.url), "utf8");
  const source = await readFile(new URL("../frontend/src/features/admin/admin-support-images.mjs", import.meta.url), "utf8");
  const app = await readFile(new URL("../public/app.mjs", import.meta.url), "utf8");
  assert.match(html, /id="adminSupportImages"[^>]+data-vue-feature="admin-support-images"/);
  assert.match(source, /data-support-id/);
  assert.match(source, /data-support-action.: "up"/);
  assert.match(source, /data-support-action.: "delete"/);
  assert.match(app, /window\.__resumeVueAdminSupportImages\.setImages/);
});

test("AI selection lists are Vue-rendered while preserving draft and template actions", async () => {
  const html = await readFile(new URL("../public/index.html", import.meta.url), "utf8");
  const source = await readFile(new URL("../frontend/src/features/ai/selection-lists.mjs", import.meta.url), "utf8");
  const app = await readFile(new URL("../public/app.mjs", import.meta.url), "utf8");
  assert.match(html, /id="optimizeDraftList"[^>]+data-vue-feature="optimize-draft-list"/);
  assert.match(html, /id="aiGenerateTemplateList"[^>]+data-vue-feature="ai-generate-template-list"/);
  assert.match(html, /id="translateTemplateList"[^>]+data-vue-feature="translate-template-list"/);
  assert.match(source, /optimize-open-draft/);
  assert.match(source, /ai-select-template/);
  assert.match(source, /translate-select-template/);
  assert.match(app, /window\.__resumeVueOptimizeDraftList\?\.setItems/);
});

test("AI job context summary is Vue-rendered while generation controls retain their legacy behavior", async () => {
  const html = await readFile(new URL("../public/index.html", import.meta.url), "utf8");
  const source = await readFile(new URL("../frontend/src/features/ai/context-summary.mjs", import.meta.url), "utf8");
  const app = await readFile(new URL("../public/app.mjs", import.meta.url), "utf8");
  assert.match(html, /id="aiContextSummary"[^>]+data-vue-feature="ai-context-summary"/);
  assert.match(source, /目标岗位/);
  assert.match(source, /本次生成将重点突出/);
  assert.match(app, /window\.__resumeVueAiContextSummary\?\.setContext/);
});

test("AI onboarding guide is Vue-rendered without changing field IDs or navigation actions", async () => {
  const html = await readFile(new URL("../public/index.html", import.meta.url), "utf8");
  const source = await readFile(new URL("../frontend/src/features/ai/guide-card.mjs", import.meta.url), "utf8");
  const app = await readFile(new URL("../public/app.mjs", import.meta.url), "utf8");
  assert.match(html, /id="aiGuideCard"[^>]+data-vue-feature="ai-guide-card"/);
  assert.match(source, /id: "aiGuideRole"/);
  assert.match(source, /id: "aiGuideJd"/);
  assert.match(source, /ai-guide-stage/);
  assert.match(app, /window\.__resumeVueAiGuideCard\?\.setGuide/);
});

test("AI project and module review panels are Vue-rendered with their confirmation contracts", async () => {
  const html = await readFile(new URL("../public/index.html", import.meta.url), "utf8");
  const source = await readFile(new URL("../frontend/src/features/ai/review-panels.mjs", import.meta.url), "utf8");
  const app = await readFile(new URL("../public/app.mjs", import.meta.url), "utf8");
  assert.match(html, /id="aiProjectReview"[^>]+data-vue-feature="ai-project-review"/);
  assert.match(html, /id="aiModuleReview"[^>]+data-vue-feature="ai-module-review"/);
  assert.match(source, /data-ai-project-field/);
  assert.match(source, /ai-confirm-projects/);
  assert.match(source, /data-ai-module-confirm/);
  assert.match(source, /ai-confirm-modules/);
  assert.match(app, /window\.__resumeVueAiProjectReview\?\.setProjects/);
  assert.match(app, /window\.__resumeVueAiModuleReview\?\.setMappings/);
});

test("AI target workspace is Vue-rendered with diagnosis, plan, and action contracts", async () => {
  const html = await readFile(new URL("../public/index.html", import.meta.url), "utf8");
  const source = await readFile(new URL("../frontend/src/features/ai/target-workspace.mjs", import.meta.url), "utf8");
  const app = await readFile(new URL("../public/app.mjs", import.meta.url), "utf8");
  assert.match(html, /id="aiTargetBody"[^>]+data-vue-feature="ai-target-workspace"/);
  assert.match(source, /id: "targetJobDescription"/);
  assert.match(source, /target-diagnose/);
  assert.match(source, /target-execute/);
  assert.match(source, /target-restore/);
  assert.match(app, /window\.__resumeVueAiTargetWorkspace\?\.setState/);
});

test("AI optimization chat is Vue data-driven while retaining proposal decision actions", async () => {
  const source = await readFile(new URL("../frontend/src/features/ai/chat-content.mjs", import.meta.url), "utf8");
  const app = await readFile(new URL("../public/app.mjs", import.meta.url), "utf8");
  assert.match(source, /showProposal/);
  assert.match(source, /ai-decide-change/);
  assert.match(source, /ai-apply/);
  assert.match(source, /ai-followup/);
  assert.match(app, /window\.__resumeVueAiChatContent\?\.showProposal/);
  assert.match(app, /window\.__resumeVueAiChatContent\?\.updateProposal/);
});

test("editor pagination and DOCX fidelity preview decorations are Vue-rendered", async () => {
  const html = await readFile(new URL("../public/index.html", import.meta.url), "utf8");
  const source = await readFile(new URL("../frontend/src/features/editor/preview-decorations.mjs", import.meta.url), "utf8");
  const app = await readFile(new URL("../public/app.mjs", import.meta.url), "utf8");
  assert.match(html, /id="pageMarkers"[^>]+data-vue-feature="page-markers"/);
  assert.match(html, /id="fidelityPreview"[^>]+data-vue-feature="fidelity-preview"/);
  assert.match(source, /成品预览第/);
  assert.match(app, /window\.__resumeVuePageMarkers\?\.setPages/);
  assert.match(app, /window\.__resumeVueFidelityPreview\?\.setPages/);
});

test("admin AI configuration is Vue-mounted while preserving API key and form bindings", async () => {
  const html = await readFile(new URL("../public/index.html", import.meta.url), "utf8");
  const source = await readFile(new URL("../frontend/src/features/admin/admin-ai-config.mjs", import.meta.url), "utf8");
  const bootstrap = await readFile(new URL("../frontend/src/bootstrap.mjs", import.meta.url), "utf8");
  const app = await readFile(new URL("../public/app.mjs", import.meta.url), "utf8");
  assert.match(html, /id="vueAdminAiConfig"[^>]+data-vue-feature="admin-ai-config"[^>]+data-vue-preserve-markup="true"/);
  assert.match(html, /id="adminAiApiKey"/);
  assert.match(source, /preservedMarkup/);
  assert.match(bootstrap, /registerVueFeature\("admin-ai-config", AdminAiConfig\)/);
  assert.match(app, /window\.__resumeVueAdminAiConfigMounted = bindAdminAiControls/);
});

test("core editor module tabs are rendered by Vue without changing selection or drag contracts", async () => {
  const html = await readFile(new URL("../public/index.html", import.meta.url), "utf8");
  const source = await readFile(new URL("../frontend/src/features/editor/module-tabs.mjs", import.meta.url), "utf8");
  const app = await readFile(new URL("../public/app.mjs", import.meta.url), "utf8");
  assert.match(html, /id="moduleTabs"[^>]+data-vue-feature="module-tabs"/);
  assert.match(source, /data-action.: "select-module"/);
  assert.match(source, /data-drag-module/);
  assert.match(source, /data-action.: "move-module"/);
  assert.match(app, /window\.__resumeVueModuleTabs\?\.setTabs/);
});

test("core editor preview is Vue-owned while retaining the tested template renderer and drag decoration", async () => {
  const html = await readFile(new URL("../public/index.html", import.meta.url), "utf8");
  const source = await readFile(new URL("../frontend/src/features/editor/resume-preview.mjs", import.meta.url), "utf8");
  const app = await readFile(new URL("../public/app.mjs", import.meta.url), "utf8");
  assert.match(html, /id="resumeFlow"[^>]+data-vue-feature="resume-preview"/);
  assert.match(source, /innerHTML: markup\.value/);
  assert.match(app, /window\.__resumeVuePreview\?\.setMarkup/);
  assert.match(app, /decoratePreviewModuleDragging\(\)/);
});

test("core editor form content is Vue-owned while preserving schema-driven fields and delegated actions", async () => {
  const html = await readFile(new URL("../public/index.html", import.meta.url), "utf8");
  const source = await readFile(new URL("../frontend/src/features/editor/editor-content.mjs", import.meta.url), "utf8");
  const app = await readFile(new URL("../public/app.mjs", import.meta.url), "utf8");
  assert.match(html, /id="drawerContent"[^>]+data-vue-feature="editor-content"/);
  assert.match(source, /innerHTML: markup\.value/);
  assert.match(app, /function renderEditorMarkup/);
  assert.match(app, /window\.__resumeVueEditorContent\?\.setMarkup/);
});

test("admin audit records are rendered by Vue while preserving CSV filter and pager contracts", async () => {
  const html = await readFile(new URL("../public/index.html", import.meta.url), "utf8");
  const source = await readFile(new URL("../frontend/src/features/admin/admin-audit-logs.mjs", import.meta.url), "utf8");
  const app = await readFile(new URL("../public/app.mjs", import.meta.url), "utf8");
  assert.match(html, /id="adminAuditList"[^>]+data-vue-feature="admin-audit-logs"/);
  assert.match(source, /data-admin-page.: "audit"/);
  assert.match(app, /window\.__resumeVueAdminAuditLogs\?\.setLogs/);
});

test("admin recycle lists are Vue-rendered without changing recovery action contracts", async () => {
  const html = await readFile(new URL("../public/index.html", import.meta.url), "utf8");
  const source = await readFile(new URL("../frontend/src/features/admin/admin-recycle.mjs", import.meta.url), "utf8");
  const app = await readFile(new URL("../public/app.mjs", import.meta.url), "utf8");
  assert.match(html, /id="adminRecycleUserList"[^>]+data-vue-feature="admin-recycle-users"/);
  assert.match(html, /id="adminRecycleResumeList"[^>]+data-vue-feature="admin-recycle-resumes"/);
  assert.match(source, /admin-restore-user/);
  assert.match(source, /admin-purge-resume/);
  assert.match(app, /window\.__resumeVueAdminRecycleUsers\?\.setItems/);
});

test("editor optional module menu is Vue-rendered with its existing add action", async () => {
  const html = await readFile(new URL("../public/index.html", import.meta.url), "utf8");
  const source = await readFile(new URL("../frontend/src/features/editor/add-module-menu.mjs", import.meta.url), "utf8");
  const app = await readFile(new URL("../public/app.mjs", import.meta.url), "utf8");
  assert.match(html, /id="addModuleMenu"[^>]+data-vue-feature="add-module-menu"/);
  assert.match(source, /data-action.: "add-module"/);
  assert.match(app, /window\.__resumeVueAddModuleMenu\?\.setAvailable/);
});

test("AI optimization chat uses a Vue-owned message mount while retaining proposal action nodes", async () => {
  const html = await readFile(new URL("../public/index.html", import.meta.url), "utf8");
  const source = await readFile(new URL("../frontend/src/features/ai/chat-content.mjs", import.meta.url), "utf8");
  const app = await readFile(new URL("../public/app.mjs", import.meta.url), "utf8");
  assert.match(html, /id="aiChatBody"[^>]+data-vue-feature="ai-chat-content"/);
  assert.match(source, /__resumeVueAiChatContent/);
  assert.match(app, /function aiChatContent/);
  assert.match(app, /aiChatContent\(\)\.appendChild/);
});

test("AI generation result preview is Vue-owned without changing template rendering", async () => {
  const html = await readFile(new URL("../public/index.html", import.meta.url), "utf8");
  const source = await readFile(new URL("../frontend/src/features/ai/result-preview.mjs", import.meta.url), "utf8");
  const app = await readFile(new URL("../public/app.mjs", import.meta.url), "utf8");
  assert.match(html, /id="aiPreviewFlow"[^>]+data-vue-feature="ai-result-preview"/);
  assert.match(source, /innerHTML: markup\.value/);
  assert.match(app, /window\.__resumeVueAiResultPreview\?\.setMarkup/);
});

test("AI result notices are Vue-rendered without changing uncertain-field review semantics", async () => {
  const html = await readFile(new URL("../public/index.html", import.meta.url), "utf8");
  const source = await readFile(new URL("../frontend/src/features/ai/result-notices.mjs", import.meta.url), "utf8");
  const app = await readFile(new URL("../public/app.mjs", import.meta.url), "utf8");
  assert.match(html, /id="aiNotices"[^>]+data-vue-feature="ai-result-notices"/);
  assert.match(source, /AI 无法确认/);
  assert.match(app, /window\.__resumeVueAiResultNotices\?\.setNotices/);
});

test("login and registration DOM are Vue-owned while retaining captcha and authentication bindings", async () => {
  const html = await readFile(new URL("../public/index.html", import.meta.url), "utf8");
  const source = await readFile(new URL("../frontend/src/features/account/login-content.mjs", import.meta.url), "utf8");
  const bootstrap = await readFile(new URL("../frontend/src/bootstrap.mjs", import.meta.url), "utf8");
  const app = await readFile(new URL("../public/app.mjs", import.meta.url), "utf8");
  assert.match(html, /id="vueLoginContent"[^>]+data-vue-feature="login-content"[^>]+data-vue-preserve-markup="true"/);
  assert.match(source, /__resumeVueLoginContentMounted/);
  assert.match(bootstrap, /preservedMarkup: element\.innerHTML/);
  assert.match(app, /function bindLoginControls/);
  assert.match(app, /"captchaWrap"/);
});
