import { createApp, h } from "vue";
import { RuntimeSentinel } from "./runtime-sentinel.mjs";
import { AdminOverview } from "./features/admin/admin-overview.mjs";
import { AdminUsers } from "./features/admin/admin-users.mjs";
import { AdminExports, AdminResumes } from "./features/admin/admin-records.mjs";
import { AdminDuplicates } from "./features/admin/admin-duplicates.mjs";
import { AdminAnnouncements } from "./features/admin/admin-announcements.mjs";
import { AdminFeedback } from "./features/admin/admin-feedback.mjs";
import { AdminCosts } from "./features/admin/admin-costs.mjs";
import { AdminAiLogs } from "./features/admin/admin-ai-logs.mjs";
import { ModuleTabs } from "./features/editor/module-tabs.mjs";
import { ResumePreview } from "./features/editor/resume-preview.mjs";
import { EditorContent } from "./features/editor/editor-content.mjs";
import { AddModuleMenu } from "./features/editor/add-module-menu.mjs";
import { AiChatContent } from "./features/ai/chat-content.mjs";
import { AiResultPreview } from "./features/ai/result-preview.mjs";
import { AiResultNotices } from "./features/ai/result-notices.mjs";
import { AdminAuditLogs } from "./features/admin/admin-audit-logs.mjs";
import { AdminRecycleResumes, AdminRecycleUsers } from "./features/admin/admin-recycle.mjs";
import { TemplateLibrary } from "./features/templates/template-library.mjs";
import { DraftList, RecentDraftList } from "./features/drafts/draft-lists.mjs";
import { SettingsDialog } from "./features/account/settings-dialog.mjs";
import { FeedbackDialog } from "./features/account/feedback-dialog.mjs";
import { MessagesDialog } from "./features/account/messages-dialog.mjs";
import { LoginContent } from "./features/account/login-content.mjs";
import { AdminAlerts, AdminSystemDetail, AdminSystemStats } from "./features/admin/admin-system.mjs";
import { AdminTemplates } from "./features/admin/admin-templates.mjs";
import { AdminAuthSecretFields, AdminAuthStatus, AdminConfigFields } from "./features/admin/admin-config.mjs";
import { AdminSupportImages } from "./features/admin/admin-support-images.mjs";
import { AiGenerateTemplateList, OptimizeDraftList, TranslateTemplateList } from "./features/ai/selection-lists.mjs";
import { AiContextSummary } from "./features/ai/context-summary.mjs";
import { AiGuideCard } from "./features/ai/guide-card.mjs";
import { AiModuleReview, AiProjectReview } from "./features/ai/review-panels.mjs";
import { AiTargetWorkspace } from "./features/ai/target-workspace.mjs";
import { AdminAiConfig } from "./features/admin/admin-ai-config.mjs";
import { FidelityPreview, PageMarkers } from "./features/editor/preview-decorations.mjs";

const registeredFeatures = new Map();
const mountedFeatures = new WeakMap();

function enabledByDataset(element, name) {
  return element.dataset.vueFeature === name && element.dataset.vueEnabled === "true";
}

export function registerVueFeature(name, component) {
  if (!name || typeof name !== "string") {
    throw new TypeError("Vue feature name must be a non-empty string");
  }
  if (!component) {
    throw new TypeError(`Vue feature \"${name}\" must provide a component`);
  }
  registeredFeatures.set(name, component);
}

export function mountVueFeature(element, { name, props = {}, enabled } = {}) {
  if (!(element instanceof Element)) return null;
  if (mountedFeatures.has(element)) return mountedFeatures.get(element);

  const shouldMount = enabled === true || (enabled === undefined && enabledByDataset(element, name));
  if (!shouldMount) return null;

  const component = registeredFeatures.get(name);
  if (!component) throw new Error(`Vue feature \"${name}\" is not registered`);

  const featureProps = element.dataset.vuePreserveMarkup === "true"
    ? { ...props, preservedMarkup: element.innerHTML }
    : props;
  const app = createApp({ render: () => h(component, featureProps) });
  app.mount(element);
  mountedFeatures.set(element, app);
  return app;
}

export function unmountVueFeature(element) {
  const app = mountedFeatures.get(element);
  if (!app) return false;
  app.unmount();
  mountedFeatures.delete(element);
  return true;
}

export function mountEnabledVueFeatures(root = document) {
  const mounted = [];
  for (const element of root.querySelectorAll("[data-vue-feature][data-vue-enabled=\"true\"]")) {
    const app = mountVueFeature(element, { name: element.dataset.vueFeature });
    if (app) mounted.push(app);
  }
  return mounted;
}

export function mountVueBusinessFeatures(root = document) {
  const mounted = [];
  for (const element of root.querySelectorAll("[data-vue-feature][data-vue-enabled=\"true\"]")) {
    if (element.dataset.vueFeature === "runtime") continue;
    const app = mountVueFeature(element, { name: element.dataset.vueFeature });
    if (app) mounted.push(app);
  }
  return mounted;
}

registerVueFeature("runtime", RuntimeSentinel);
registerVueFeature("admin-overview", AdminOverview);
registerVueFeature("admin-users", AdminUsers);
registerVueFeature("admin-resumes", AdminResumes);
registerVueFeature("admin-exports", AdminExports);
registerVueFeature("admin-duplicates", AdminDuplicates);
registerVueFeature("admin-announcements", AdminAnnouncements);
registerVueFeature("admin-feedback", AdminFeedback);
registerVueFeature("admin-costs", AdminCosts);
registerVueFeature("admin-ai-logs", AdminAiLogs);
registerVueFeature("module-tabs", ModuleTabs);
registerVueFeature("resume-preview", ResumePreview);
registerVueFeature("editor-content", EditorContent);
registerVueFeature("add-module-menu", AddModuleMenu);
registerVueFeature("ai-chat-content", AiChatContent);
registerVueFeature("ai-result-preview", AiResultPreview);
registerVueFeature("ai-result-notices", AiResultNotices);
registerVueFeature("admin-audit-logs", AdminAuditLogs);
registerVueFeature("admin-recycle-users", AdminRecycleUsers);
registerVueFeature("admin-recycle-resumes", AdminRecycleResumes);
registerVueFeature("template-library", TemplateLibrary);
registerVueFeature("draft-list", DraftList);
registerVueFeature("recent-draft-list", RecentDraftList);
registerVueFeature("settings-dialog", SettingsDialog);
registerVueFeature("feedback-dialog", FeedbackDialog);
registerVueFeature("messages-dialog", MessagesDialog);
registerVueFeature("login-content", LoginContent);
registerVueFeature("admin-system-stats", AdminSystemStats);
registerVueFeature("admin-system-detail", AdminSystemDetail);
registerVueFeature("admin-alerts", AdminAlerts);
registerVueFeature("admin-templates", AdminTemplates);
registerVueFeature("admin-auth-status", AdminAuthStatus);
registerVueFeature("admin-config-fields", AdminConfigFields);
registerVueFeature("admin-auth-secret-fields", AdminAuthSecretFields);
registerVueFeature("admin-support-images", AdminSupportImages);
registerVueFeature("optimize-draft-list", OptimizeDraftList);
registerVueFeature("ai-generate-template-list", AiGenerateTemplateList);
registerVueFeature("translate-template-list", TranslateTemplateList);
registerVueFeature("ai-context-summary", AiContextSummary);
registerVueFeature("ai-guide-card", AiGuideCard);
registerVueFeature("ai-project-review", AiProjectReview);
registerVueFeature("ai-module-review", AiModuleReview);
registerVueFeature("ai-target-workspace", AiTargetWorkspace);
registerVueFeature("admin-ai-config", AdminAiConfig);
registerVueFeature("page-markers", PageMarkers);
registerVueFeature("fidelity-preview", FidelityPreview);

if (typeof document !== "undefined") {
  const mountRuntime = () => {
    const root = document.querySelector('[data-vue-feature="runtime"][data-vue-enabled="true"]');
    if (root) mountVueFeature(root, { name: "runtime" });
  };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", mountRuntime, { once: true });
  else mountRuntime();
  document.addEventListener("resume-legacy-ready", () => mountVueBusinessFeatures(), { once: true });
}
