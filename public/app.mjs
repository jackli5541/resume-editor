import {
  PAGE_HEIGHT,
  LEGACY_STORAGE_KEY,
  STORAGE_KEY,
  completionScore,
  applyTemplateEditorSchema,
  createInitialResume,
  createResumeForTemplate,
  escapeHtml,
  formatRange,
  makeId,
  moveItem,
  nextCustomFieldKey,
  normalizeResume,
  pageCountForHeight
} from "./core.mjs";
import { defaultFieldsFor, FIELD_TYPES, getTemplateSchema, resolveSectionFields } from "./template-schemas.mjs";
import {
  applyResumeSettings,
  applyResumeTemplate,
  paginateResumeLayout,
  renderResumeMarkup,
  sanitizeRichHtml
} from "./resume-renderer.mjs";
import { isAppPath, parseAppRoute, routePath } from "./router.mjs";
import { getDeviceId } from "./fingerprint.mjs";

// —— 外观主题（暗色模式）——
const THEME_STORAGE_KEY = "qingjianli.theme";

function currentTheme() {
  return document.documentElement.dataset.theme === "dark" ? "dark" : "light";
}

function applyTheme(theme) {
  const dark = theme === "dark";
  document.documentElement.dataset.theme = dark ? "dark" : "light";
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute("content", dark ? "#0e1116" : "#12a77d");
  try { localStorage.setItem(THEME_STORAGE_KEY, theme); } catch (e) { /* 忽略隐私模式下的写入失败 */ }
  refreshThemeButtons();
}

function toggleTheme() {
  applyTheme(currentTheme() === "dark" ? "light" : "dark");
  closeAllAccountMenus();
}

function refreshThemeButtons() {
  const dark = currentTheme() === "dark";
  document.querySelectorAll('[data-action="toggle-theme"]').forEach((button) => {
    button.textContent = dark ? "外观 · 深色" : "外观 · 浅色";
    button.setAttribute("aria-pressed", String(dark));
  });
}

const elements = {
  app: document.querySelector("#app"),
  homePage: document.querySelector("#homePage"),
  homeDraftList: document.querySelector("#homeDraftList"),
  homeDraftCount: document.querySelector("#homeDraftCount"),
  homeEmptyState: document.querySelector("#homeEmptyState"),
  templateLibrary: document.querySelector("#templateLibrary"),
  draftPage: document.querySelector("#draftPage"),
  templateList: document.querySelector("#templateList"),
  templateFeatured: document.querySelector("#templateFeatured"),
  templateLibraryStatus: document.querySelector("#templateLibraryStatus"),
  draftSection: document.querySelector("#drafts"),
  draftList: document.querySelector("#draftList"),
  draftCount: document.querySelector("#draftCount"),
  draftEmptyState: document.querySelector("#draftEmptyState"),
  paper: document.querySelector("#resumePaper"),
  flow: document.querySelector("#resumeFlow"),
  markers: document.querySelector("#pageMarkers"),
  tabs: document.querySelector("#moduleTabs"),
  editor: document.querySelector("#drawerContent"),
  drawer: document.querySelector("#editorDrawer"),
  aiFloatBtn: document.querySelector("#aiFloatBtn"),
  aiChatPanel: document.querySelector("#aiChatPanel"),
  aiChatBody: document.querySelector("#aiChatBody"),
  aiChatForm: document.querySelector("#aiChatForm"),
  aiChatInput: document.querySelector("#aiChatInput"),
  aiChatSend: document.querySelector("#aiChatSend"),
  saveState: document.querySelector("#saveState"),
  pageCount: document.querySelector("#pageCountBadge"),
  sidePageCount: document.querySelector("#sidePageCount"),
  fidelityPreview: document.querySelector("#fidelityPreview"),
  fidelityStatus: document.querySelector("#fidelityStatus"),
  completionScore: document.querySelector("#completionScore"),
  completionBar: document.querySelector("#completionBar"),
  completionHint: document.querySelector("#completionHint"),
  revision: document.querySelector("#revisionText"),
  activeTemplateName: document.querySelector("#activeTemplateName"),
  title: document.querySelector("#resumeTitle"),
  themeInput: document.querySelector("#themeInput"),
  themeDot: document.querySelector("#themeDot"),
  importFile: document.querySelector("#importFile"),
  saveDraftButton: document.querySelector("#saveDraftButton"),
  storageStatus: document.querySelector("#storageStatus"),
  exportFormat: document.querySelector("#exportFormat"),
  toastRegion: document.querySelector("#toastRegion"),
  loginPage: document.querySelector("#loginPage"),
  settingsOverlay: document.querySelector("#settingsOverlay"),
  loginForm: document.querySelector("#loginForm"),
  loginTitle: document.querySelector("#loginTitle"),
  loginIdentifier: document.querySelector("#loginIdentifier"),
  loginPassword: document.querySelector("#loginPassword"),
  loginPasswordConfirmField: document.querySelector("#loginPasswordConfirmField"),
  loginPasswordConfirm: document.querySelector("#loginPasswordConfirm"),
  loginRememberField: document.querySelector("#loginRememberField"),
  loginRemember: document.querySelector("#loginRemember"),
  loginNameField: document.querySelector("#loginNameField"),
  loginName: document.querySelector("#loginName"),
  loginError: document.querySelector("#loginError"),
  loginSubmit: document.querySelector("#loginSubmit"),
  loginMethodSwitch: document.querySelector("#loginMethodSwitch"),
  loginPasswordHint: document.querySelector("#loginPasswordHint"),
  captchaWrap: document.querySelector("#captchaWrap"),
  loginTabLogin: document.querySelector("#loginTabLogin"),
  loginTabRegister: document.querySelector("#loginTabRegister"),
  loginIdentifierLabel: document.querySelector("#loginIdentifierLabel"),
  loginPasswordField: document.querySelector("#loginPasswordField"),
  loginCodeField: document.querySelector("#loginCodeField"),
  loginCode: document.querySelector("#loginCode"),
  sendCodeButton: document.querySelector("#sendCodeButton"),
  loginMethodSwitchRow: document.querySelector("#loginMethodSwitchRow"),
  settingsForm: document.querySelector("#settingsForm"),
  settingsName: document.querySelector("#settingsName"),
  settingsEmail: document.querySelector("#settingsEmail"),
  settingsAiEnabled: document.querySelector("#settingsAiEnabled"),
  settingsAiRole: document.querySelector("#settingsAiRole"),
  settingsAiTone: document.querySelector("#settingsAiTone"),
  settingsError: document.querySelector("#settingsError"),
  adminPage: document.querySelector("#adminPage"),
  adminUserSearch: document.querySelector("#adminUserSearch"),
  adminUserTotal: document.querySelector("#adminUserTotal"),
  adminUserList: document.querySelector("#adminUserList"),
  adminUserStatus: document.querySelector("#adminUserStatus"),
  adminResumeSearch: document.querySelector("#adminResumeSearch"),
  adminResumeTotal: document.querySelector("#adminResumeTotal"),
  adminResumeList: document.querySelector("#adminResumeList"),
  adminResumeStatus: document.querySelector("#adminResumeStatus"),
  adminAiForm: document.querySelector("#adminAiForm"),
  adminAiEnabled: document.querySelector("#adminAiEnabled"),
  adminAiOptimizeEnabled: document.querySelector("#adminAiOptimizeEnabled"),
  adminAiBaseUrl: document.querySelector("#adminAiBaseUrl"),
  adminAiModel: document.querySelector("#adminAiModel"),
  adminAiTemperature: document.querySelector("#adminAiTemperature"),
  adminAiMaxInput: document.querySelector("#adminAiMaxInput"),
  adminAiMaxOutput: document.querySelector("#adminAiMaxOutput"),
  adminAiTimeout: document.querySelector("#adminAiTimeout"),
  adminAiSystemPrompt: document.querySelector("#adminAiSystemPrompt"),
  adminAiApiKey: document.querySelector("#adminAiApiKey"),
  adminAiKeyHint: document.querySelector("#adminAiKeyHint"),
  adminAiStatus: document.querySelector("#adminAiStatus"),
  adminStats: document.querySelector("#adminStats"),
  adminAiLogSearch: document.querySelector("#adminAiLogSearch"),
  adminAiLogTotal: document.querySelector("#adminAiLogTotal"),
  adminAiLogList: document.querySelector("#adminAiLogList"),
  adminAiLogStatus: document.querySelector("#adminAiLogStatus"),
  adminAuditSearch: document.querySelector("#adminAuditSearch"),
  adminAuditTotal: document.querySelector("#adminAuditTotal"),
  adminAuditList: document.querySelector("#adminAuditList"),
  adminAuditStatus: document.querySelector("#adminAuditStatus"),
  adminRecycleSearch: document.querySelector("#adminRecycleSearch"),
  adminRecycleTotal: document.querySelector("#adminRecycleTotal"),
  adminRecycleUserList: document.querySelector("#adminRecycleUserList"),
  adminRecycleResumeList: document.querySelector("#adminRecycleResumeList"),
  adminRecycleStatus: document.querySelector("#adminRecycleStatus"),
  adminUserRole: document.querySelector("#adminUserRole"),
  adminUserStatus: document.querySelector("#adminUserStatus"),
  adminUserFrom: document.querySelector("#adminUserFrom"),
  adminUserTo: document.querySelector("#adminUserTo"),
  adminResumeTemplate: document.querySelector("#adminResumeTemplate"),
  adminResumeFrom: document.querySelector("#adminResumeFrom"),
  adminResumeTo: document.querySelector("#adminResumeTo"),
  adminAiLogStatusFilter: document.querySelector("#adminAiLogStatusFilter"),
  adminAiLogFrom: document.querySelector("#adminAiLogFrom"),
  adminAiLogTo: document.querySelector("#adminAiLogTo"),
  adminAuditAction: document.querySelector("#adminAuditAction"),
  adminAuditFrom: document.querySelector("#adminAuditFrom"),
  adminAuditTo: document.querySelector("#adminAuditTo"),
  adminRecycleFrom: document.querySelector("#adminRecycleFrom"),
  adminRecycleTo: document.querySelector("#adminRecycleTo"),
  adminChart: document.querySelector("#adminChart"),
  adminAnnouncementSearch: document.querySelector("#adminAnnouncementSearch"),
  adminAnnouncementFilter: document.querySelector("#adminAnnouncementFilter"),
  adminAnnouncementTotal: document.querySelector("#adminAnnouncementTotal"),
  adminAnnouncementList: document.querySelector("#adminAnnouncementList"),
  adminAnnouncementLoadStatus: document.querySelector("#adminAnnouncementLoadStatus"),
  adminAnnouncementForm: document.querySelector("#adminAnnouncementForm"),
  adminAnnouncementId: document.querySelector("#adminAnnouncementId"),
  adminAnnouncementTitle: document.querySelector("#adminAnnouncementTitle"),
  adminAnnouncementStatus: document.querySelector("#adminAnnouncementStatus"),
  adminAnnouncementContent: document.querySelector("#adminAnnouncementContent"),
  adminFeedbackSearch: document.querySelector("#adminFeedbackSearch"),
  adminFeedbackFilter: document.querySelector("#adminFeedbackFilter"),
  adminFeedbackTotal: document.querySelector("#adminFeedbackTotal"),
  adminFeedbackList: document.querySelector("#adminFeedbackList"),
  adminFeedbackStatus: document.querySelector("#adminFeedbackStatus"),
  adminFeedbackReplyForm: document.querySelector("#adminFeedbackReplyForm"),
  adminFeedbackReplyId: document.querySelector("#adminFeedbackReplyId"),
  adminFeedbackReplyStatus: document.querySelector("#adminFeedbackReplyStatus"),
  adminFeedbackReplyText: document.querySelector("#adminFeedbackReplyText"),
  adminTemplateSearch: document.querySelector("#adminTemplateSearch"),
  adminTemplateTotal: document.querySelector("#adminTemplateTotal"),
  adminTemplateList: document.querySelector("#adminTemplateList"),
  adminTemplateStatus: document.querySelector("#adminTemplateStatus"),
  adminCostDays: document.querySelector("#adminCostDays"),
  adminCostTotal: document.querySelector("#adminCostTotal"),
  adminCostList: document.querySelector("#adminCostList"),
  adminCostModelList: document.querySelector("#adminCostModelList"),
  adminCostStatus: document.querySelector("#adminCostStatus"),
  feedbackOverlay: document.querySelector("#feedbackOverlay"),
  feedbackForm: document.querySelector("#feedbackForm"),
  feedbackType: document.querySelector("#feedbackType"),
  feedbackContent: document.querySelector("#feedbackContent"),
  feedbackError: document.querySelector("#feedbackError"),
  feedbackDetailOverlay: document.querySelector("#feedbackDetailOverlay"),
  feedbackDetailBody: document.querySelector("#feedbackDetailBody"),
  messagesOverlay: document.querySelector("#messagesOverlay"),
  messagesList: document.querySelector("#messagesList"),
  messagesStatus: document.querySelector("#messagesStatus"),
  adminConfigForm: document.querySelector("#adminConfigForm"),
  adminConfigFields: document.querySelector("#adminConfigFields"),
  adminConfigMsg: document.querySelector("#adminConfigMsg"),
  adminAuthStatus: document.querySelector("#adminAuthStatus"),
  adminAuthSecretForm: document.querySelector("#adminAuthSecretForm"),
  adminAuthSecretFields: document.querySelector("#adminAuthSecretFields"),
  adminAuthSecretMsg: document.querySelector("#adminAuthSecretMsg"),
  adminSystemStats: document.querySelector("#adminSystemStats"),
  adminSystemDetail: document.querySelector("#adminSystemDetail"),
  adminSystemStatus: document.querySelector("#adminSystemStatus"),
  adminAlertList: document.querySelector("#adminAlertList"),
  adminDuplicatesTotal: document.querySelector("#adminDuplicatesTotal"),
  adminDuplicatesList: document.querySelector("#adminDuplicatesList"),
  adminDuplicatesStatus: document.querySelector("#adminDuplicatesStatus"),
  aiPage: document.querySelector("#aiPage"),
  aiOnboarding: document.querySelector("#aiOnboarding"),
  aiGuideCard: document.querySelector("#aiGuideCard"),
  aiGuideProgress: document.querySelector("#aiGuideProgress"),
  aiWorkspace: document.querySelector("#aiWorkspace"),
  aiContextSummary: document.querySelector("#aiContextSummary"),
  aiDescriptionHint: document.querySelector("#aiDescriptionHint"),
  aiGenerateButton: document.querySelector("#aiGenerateButton"),
  aiInputCard: document.querySelector("#aiInputCard"),
  aiDescription: document.querySelector("#aiDescription"),
  aiTone: document.querySelector("#aiTone"),
  aiStatus: document.querySelector("#aiStatus"),
  aiResult: document.querySelector("#aiResult"),
  aiNotices: document.querySelector("#aiNotices"),
  aiProjectReview: document.querySelector("#aiProjectReview"),
  aiSaveButton: document.querySelector("#aiSaveButton"),
  aiPreviewPaper: document.querySelector("#aiPreviewPaper"),
  aiPreviewFlow: document.querySelector("#aiPreviewFlow"),
  aiWordFile: document.querySelector("#aiWordFile"),
  aiImportStatus: document.querySelector("#aiImportStatus"),
  aiCharCount: document.querySelector("#aiCharCount"),
  aiVoiceBtn: document.querySelector("#aiVoiceBtn"),
  addModuleButton: document.querySelector("#addModuleButton"),
  addModuleMenu: document.querySelector("#addModuleMenu"),
  appDialog: document.querySelector("#appDialog"),
  appDialogTitle: document.querySelector("#appDialogTitle"),
  appDialogMessage: document.querySelector("#appDialogMessage"),
  appDialogInput: document.querySelector("#appDialogInput"),
  appDialogCancel: document.querySelector("#appDialogCancel"),
  appDialogSubmit: document.querySelector("#appDialogSubmit")
};

let resume = loadResume();
let activeModuleId = "profile";
let drawerOpen = true;
let saveTimer = null;
let paginationFrame = null;
let previewFrame = null;
let currentPages = 1;
let draggedModuleId = "";
let exportInProgress = false;
let availableTemplates = [];
let availableDrafts = [];
let hasUnsavedChanges = false;
let draftSaveInProgress = false;
let fidelityTimer = null;
let fidelityRequest = 0;
let fidelityRevision = 0;
let fidelityResumeId = "";
let fidelityRequestKey = "";
let previewMode = resume.template?.engine === "docx-native" ? "final" : "instant";
const activeItemBySection = new Map();

const FIELD_TYPE_LABELS = {
  text: "单行文本",
  month: "年月",
  textarea: "多行文本",
  richtext: "富文本",
  url: "链接"
};

let currentUser = null;
let loginNext = null;
let authTab = "login";
let loginMethod = "password";
let sendCodeTimer = null;
let sendCodeCountdown = 0;
let captchaConfig = { enabled: false, sceneId: "", prefix: "" };
let captchaReady = false;
let captchaRequested = false;
let captchaInstance = null;
let captchaAuthResult = null;
let codeLoginMethods = { email: false, phone: false };
let codeLoginAvailable = false;
let adminUsers = [];
let adminDrafts = [];
let adminUserSearchTimer = null;
let adminResumeSearchTimer = null;
let adminAiLogs = [];
let adminAiLogSearchTimer = null;
let adminAuditLogs = [];
let adminAuditSearchTimer = null;
let adminRecycle = { users: [], resumes: [] };
let adminRecycleSearchTimer = null;
let adminAnnouncements = [];
let adminAnnouncementSearchTimer = null;
let adminFeedbacks = [];
let adminFeedbackSearchTimer = null;
let adminTemplates = [];
let adminTemplateSearchTimer = null;
let adminCosts = { days: [], byModel: [] };
let adminConfigSchema = {};
let aiResult = null;
let aiProjectReviewConfirmed = true;
let aiGenerating = false;
let aiGuideStep = "role";
const aiJobContext = { targetRole: "", jobStage: "", jobDescription: "" };
let aiWordImporting = false;
let mammothPromise = null;
let aiWordDocumentStructure = "";
let aiOptimizePending = null;
let aiOptimizing = false;
let aiRecognition = null;
let aiVoiceActive = false;
let aiVoiceBase = "";
let aiVoicePrefix = "";
let aiLimits = { maxInputChars: 8000, enabled: true };
const AI_MAX_WORD_BYTES = 5 * 1024 * 1024;
const AI_FALLBACK_MAX_CHARS = 8000;

function loadResume() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY) || localStorage.getItem(LEGACY_STORAGE_KEY);
    const parsed = saved ? JSON.parse(saved) : null;
    return parsed?.remoteId ? normalizeResume(parsed) : createInitialResume();
  } catch {
    return createInitialResume();
  }
}

function draftStorageKey(id) {
  return `${STORAGE_KEY}:draft:${id}`;
}

function saveLocalResume() {
  const serialized = JSON.stringify(resume);
  if (resume.remoteId) {
    localStorage.setItem(STORAGE_KEY, serialized);
    localStorage.setItem(draftStorageKey(resume.remoteId), serialized);
  } else {
    localStorage.removeItem(STORAGE_KEY);
    localStorage.removeItem(LEGACY_STORAGE_KEY);
  }
}

function sectionById(id) {
  return resume.sections.find((section) => section.id === id);
}

function currentTemplateSchema() {
  return resume.template?.editorSchema || getTemplateSchema(resume.template);
}

function visibleSectionSchemas() {
  return currentTemplateSchema().sections || [];
}

function optionalSectionIds() {
  return visibleSectionSchemas().filter((section) => section.optional).map((section) => section.id);
}

function activatedOptionalIds() {
  const optional = new Set(optionalSectionIds());
  return new Set(resume.sections
    .filter((section) => optional.has(section.id) && section.visible !== false)
    .map((section) => section.id));
}

// 编辑器中可操作的模块：核心模块始终显示，可选模块仅在激活（visible）后显示。
function renderableSectionSchemas() {
  const activated = activatedOptionalIds();
  return visibleSectionSchemas().filter((section) => !section.optional || activated.has(section.id));
}

function activeSections() {
  const ids = new Set(renderableSectionSchemas().map((section) => section.id));
  return resume.sections.filter((section) => ids.has(section.id));
}

function itemById(section, id) {
  return section?.items?.find((item) => item.id === id);
}

function renderAll() {
  applySettings();
  renderTabs();
  renderEditor();
  renderPreview();
  updateStatusCards();
  elements.drawer.classList.toggle("is-open", drawerOpen);
}

function applySettings() {
  const { settings } = resume;
  const controls = currentTemplateSchema().styleControls || {};
  applyResumeSettings(elements.paper, settings);
  applyResumeTemplate(elements.paper, resume.template);
  elements.themeInput.value = settings.theme;
  elements.themeDot.style.background = settings.theme;
  const finalPreviewButton = document.querySelector('[data-preview-mode="final"]');
  const instantPreviewButton = document.querySelector('[data-preview-mode="instant"]');
  const supportsFidelity = resume.template?.engine === "docx-native";
  finalPreviewButton.disabled = !supportsFidelity;
  finalPreviewButton.title = supportsFidelity ? "当前模板使用 DOCX 同源预览" : "此模板仅提供即时预览";
  instantPreviewButton.disabled = supportsFidelity;
  instantPreviewButton.title = supportsFidelity ? "DOCX 模板不使用 HTML 仿制预览" : "查看即时预览";
  previewMode = supportsFidelity ? "final" : "instant";
  elements.paper.hidden = supportsFidelity;
  elements.fidelityPreview.hidden = !supportsFidelity;
  if (supportsFidelity && !elements.fidelityPreview.children.length && resume.template?.previewUrl) {
    elements.fidelityPreview.innerHTML = `<img src="${escapeHtml(resume.template.previewUrl)}" alt="${escapeHtml(resume.template.name || "DOCX 模板")}原始版式预览" />`;
  }
  document.querySelectorAll("[data-preview-mode]").forEach((button) => {
    button.classList.toggle("is-active", button.dataset.previewMode === previewMode);
  });

  document.querySelectorAll("[data-setting]").forEach((control) => {
    const value = settings[control.dataset.setting];
    if (value !== undefined) control.value = value;
    const permission = controls[control.dataset.setting];
    control.disabled = permission === false;
    if (permission && typeof permission === "object") {
      if (permission.min != null) control.min = permission.min;
      if (permission.max != null) control.max = permission.max;
    }
  });
  elements.themeInput.disabled = controls.theme === false;
  updateSettingOutputs();
}

function updateSettingOutputs() {
  document.querySelector("#sectionGapValue").value = resume.settings.sectionGap;
  document.querySelector("#lineHeightValue").value = Number(resume.settings.lineHeight).toFixed(2);
  document.querySelector("#pagePaddingValue").value = resume.settings.pagePadding;
  document.querySelector("#fontSizeValue").value = resume.settings.fontSize;
}

function renderTabs() {
  const profileTab = `
    <button class="module-tab ${activeModuleId === "profile" ? "is-active" : ""}" type="button" data-action="select-module" data-module-id="profile">
      <span class="module-tab__status module-tab__status--always"></span>
      <strong>基本信息</strong>
    </button>`;

  const schemas = new Map(renderableSectionSchemas().map((value) => [value.id, value]));
  const sections = activeSections();
  const sectionTabs = sections.map((section, index) => {
    const definition = schemas.get(section.id);
    const capabilities = definition?.capabilities || {
      hide: true,
      sort: definition?.sortable !== false,
      editTitle: definition?.titleEditable !== false,
      addItems: definition?.repeatable === true,
      removeItems: definition?.repeatable === true
    };
    const previous = sections[index - 1];
    const next = sections[index + 1];
    return `
    <div class="module-tab-wrap ${section.visible ? "" : "is-hidden"}" draggable="${capabilities.sort === true}" data-drag-module="${section.id}" data-zone="${definition?.zone || "main"}">
      <button class="module-tab ${activeModuleId === section.id ? "is-active" : ""}" type="button" data-action="select-module" data-module-id="${section.id}">
        ${capabilities.hide ? `<span class="module-tab__status ${section.visible ? "is-on" : ""}" data-action="toggle-module" data-module-id="${section.id}" title="${section.visible ? "隐藏模块" : "显示模块"}"></span>` : `<span class="module-tab__status module-tab__status--always"></span>`}
        <strong>${escapeHtml(section.title)}</strong>
      </button>
      ${capabilities.sort ? `<span class="module-tab__ops">
        <button type="button" data-action="move-module" data-module-id="${section.id}" data-direction="-1" ${!previous || schemas.get(previous.id)?.zone !== definition?.zone ? "disabled" : ""} title="前移">‹</button>
        <button type="button" data-action="move-module" data-module-id="${section.id}" data-direction="1" ${!next || schemas.get(next.id)?.zone !== definition?.zone ? "disabled" : ""} title="后移">›</button>
      </span>` : ""}
    </div>`;
  }).join("");

  elements.tabs.innerHTML = profileTab + sectionTabs;
  renderAddModuleMenu();
}

function blankSection(definition) {
  const base = {
    id: definition.id,
    type: definition.type || "richtext",
    title: definition.title || definition.id,
    visible: true,
    fields: defaultFieldsFor(definition.id)
  };
  if (["timeline", "list", "levels", "tags"].includes(definition.type)) {
    return { ...base, items: [] };
  }
  return { ...base, content: "" };
}

function renderAddModuleMenu() {
  const available = visibleSectionSchemas().filter((section) => section.optional && !activatedOptionalIds().has(section.id));
  elements.addModuleButton.hidden = available.length === 0;
  elements.addModuleMenu.innerHTML = available
    .map((section) => `<button type="button" class="module-add__item" data-action="add-module" data-module-id="${escapeHtml(section.id)}">${escapeHtml(section.title)}</button>`)
    .join("");
  elements.addModuleMenu.hidden = true;
}

function toggleAddModuleMenu() {
  const willOpen = elements.addModuleMenu.hidden;
  closePopovers();
  elements.addModuleMenu.hidden = !willOpen;
}

function addModule(sectionId) {
  const definition = visibleSectionSchemas().find((section) => section.id === sectionId);
  if (!definition?.optional) return;
  const blank = blankSection(definition);
  const index = resume.sections.findIndex((section) => section.id === sectionId);
  if (index === -1) resume.sections.push(blank);
  else resume.sections[index] = blank;
  activeModuleId = sectionId;
  activeItemBySection.delete(sectionId);
  drawerOpen = true;
  elements.addModuleMenu.hidden = true;
  renderAll();
  scheduleSave();
  elements.drawer.classList.add("is-open");
}

function renderEditor() {
  const validIds = new Set(renderableSectionSchemas().map((section) => section.id));
  if (activeModuleId !== "profile" && !validIds.has(activeModuleId)) activeModuleId = "profile";
  if (activeModuleId === "profile") {
    elements.editor.innerHTML = renderProfileEditor();
    return;
  }
  const section = sectionById(activeModuleId) || activeSections()[0];
  if (!section) return;
  activeModuleId = section.id;
  section.fields = resolveSectionFields(section);
  const definition = renderableSectionSchemas().find((value) => value.id === section.id);
  if (definition?.type === "keyValues") elements.editor.innerHTML = renderObjectiveEditor(section, definition);
  else if (definition?.type === "timeline") elements.editor.innerHTML = renderTimelineEditor(section, definition);
  else if (["list", "levels"].includes(definition?.type)) elements.editor.innerHTML = renderListEditor(section, definition);
  else if (definition?.type === "tags") elements.editor.innerHTML = renderTagsEditor(section);
  else elements.editor.innerHTML = renderRichEditor(section, definition);
}

function field(label, value, scope, key, options = {}) {
  const type = options.type || "text";
  const placeholder = options.placeholder || "";
  const data = `data-scope="${scope}" data-field="${key}" ${options.sectionId ? `data-section-id="${options.sectionId}"` : ""} ${options.itemId ? `data-item-id="${options.itemId}"` : ""}`;
  if (type === "month") return monthField(label, value, data, options);
  const control = type === "textarea"
    ? `<textarea placeholder="${escapeHtml(placeholder)}" ${data}>${escapeHtml(value)}</textarea>`
    : `<input type="${type}" value="${escapeHtml(value)}" placeholder="${escapeHtml(placeholder)}" ${data} />`;
  return `
    <label class="form-field ${options.wide ? "form-field--wide" : ""}">
      <span>${label}</span>
      ${control}
    </label>`;
}

// 年月字段：拆成「年」数字输入 + 「月」下拉，年份可像月份一样方便调整。
function parseMonthValue(value) {
  const match = /^(\d{4})-(\d{1,2})$/.exec(String(value || "").trim());
  if (!match) return { year: "", month: "" };
  return { year: match[1], month: String(Number(match[2])).padStart(2, "0") };
}

function monthField(label, value, data, options) {
  const parsed = parseMonthValue(value);
  const months = Array.from({ length: 12 }, (_, index) => {
    const month = String(index + 1).padStart(2, "0");
    return `<option value="${month}" ${month === parsed.month ? "selected" : ""}>${index + 1} 月</option>`;
  }).join("");
  return `
    <label class="form-field ${options.wide ? "form-field--wide" : ""}">
      <span>${label}</span>
      <span class="month-range" data-month-range ${data}>
        <input class="month-range__year" type="number" min="1900" max="2100" step="1" inputmode="numeric" placeholder="年" value="${escapeHtml(parsed.year)}" aria-label="${escapeHtml(label)} · 年份" />
        <select class="month-range__month" aria-label="${escapeHtml(label)} · 月份">
          <option value="">月</option>
          ${months}
        </select>
      </span>
    </label>`;
}

// 字段 Schema 的控件类型 → 实际 input 类型。
function fieldInputType(type) {
  if (type === "textarea") return "textarea";
  if (type === "month") return "month";
  if (type === "url") return "url";
  return "text";
}

function renderProfileEditor() {
  const profile = resume.profile;
  const schema = currentTemplateSchema();
  const definitions = schema.profileDefinitions || {};
  const fields = schema.profileFields.map((key) => {
    const definition = definitions[key] || { label: key, type: "text" };
    if (definition.type === "image") return field(definition.label, profile[key], "profile", key, { placeholder: "可选：粘贴图片地址", wide: true });
    return field(definition.label, profile[key], "profile", key, { type: definition.type });
  }).join("");
  const footerActions = [
    schema.profileFields.includes("photo")
      ? `<label class="inline-upload">上传本地照片<input type="file" id="photoUpload" accept="image/png,image/jpeg,image/webp" /></label>`
      : "",
    resume.template?.engine !== "docx-native"
      ? `<button class="ghost-button" type="button" data-action="fit-one-page">自动调整为一页</button>`
      : ""
  ].filter(Boolean).join("");
  return `
    <div class="editor-heading">
      <div><span class="eyebrow">PERSONAL INFO</span><h2>基本信息</h2></div>
      <p>填写的信息会实时排版到简历中，所有修改自动保存在本机。</p>
    </div>
    <div class="editor-grid editor-grid--profile">
      ${fields}
    </div>
    ${footerActions ? `<div class="editor-footer-actions">${footerActions}</div>` : ""}`;
}

function renderObjectiveEditor(section, definition) {
  const data = section.data || {};
  const fields = (section.fields || []).filter((item) => item.visible !== false);
  return `
    ${renderSectionHeading(section, "CAREER OBJECTIVE")}
    <div class="editor-grid">
      ${fields.map((item) => field(item.label, data[item.key], "section-data", item.key, { sectionId: section.id, type: fieldInputType(item.type) })).join("")}
    </div>
    ${renderFieldManager(section, definition)}`;
}

function renderLineHeightSelect(section) {
  const options = [
    ["", "跟随全局"],
    ["1.3", "紧凑 1.3"],
    ["1.45", "较紧凑 1.45"],
    ["1.6", "标准 1.6"],
    ["1.75", "宽松 1.75"],
    ["1.9", "较宽松 1.9"],
    ["2.05", "很宽松 2.05"]
  ];
  const current = section.lineHeight ? String(section.lineHeight) : "";
  return `<label class="section-lineheight"><span>行间距</span>
    <select data-scope="section" data-section-id="${section.id}" data-field="lineHeight">
      ${options.map(([value, label]) => `<option value="${value}" ${current === value ? "selected" : ""}>${label}</option>`).join("")}
    </select></label>`;
}

function renderSectionHeading(section, eyebrow, definition = {}) {
  const titleEditor = (definition.capabilities?.editTitle ?? definition.titleEditable !== false)
    ? `<label class="title-edit"><span>模块标题</span><input value="${escapeHtml(section.title)}" data-scope="section" data-section-id="${section.id}" data-field="title" /></label>`
    : "";
  return `
    <div class="editor-heading editor-heading--section">
      <div><span class="eyebrow">${eyebrow}</span><h2>${escapeHtml(section.title)}</h2></div>
      <div class="editor-heading__controls">${titleEditor}${renderLineHeightSelect(section)}</div>
    </div>`;
}

function renderTimelineEditor(section, definition) {
  if (!section.items) section.items = [];
  const fields = (section.fields || []).filter((item) => item.visible !== false);
  const canAdd = definition.capabilities?.addItems ?? definition.repeatable === true;
  const canRemove = definition.capabilities?.removeItems ?? definition.repeatable === true;
  const fieldManager = renderFieldManager(section, definition);

  if (!section.items.length) {
    return `${renderSectionHeading(section, section.id.toUpperCase(), definition)}
      <div class="entry-empty">
        <p>暂无条目。</p>
        ${canAdd ? `<button class="add-entry-button" type="button" data-action="add-entry" data-section-id="${section.id}">＋ 添加条目</button>` : ""}
      </div>
      ${fieldManager}`;
  }

  let activeItemId = activeItemBySection.get(section.id);
  if (!itemById(section, activeItemId)) activeItemId = section.items[0].id;
  activeItemBySection.set(section.id, activeItemId);
  const item = itemById(section, activeItemId);
  const entryFields = renderEntryFields(section, item);

  return `
    ${renderSectionHeading(section, section.id.toUpperCase(), definition)}
    <div class="timeline-editor">
      <aside class="entry-nav">
        <div class="entry-nav__heading"><span>经历条目</span><small>${section.items.length} 条</small></div>
        <div class="entry-nav__list">
          ${section.items.map((entry, index) => `
            <div class="entry-nav__row">
              <button class="entry-nav__item ${entry.id === activeItemId ? "is-active" : ""}" type="button" data-action="select-entry" data-section-id="${section.id}" data-item-id="${entry.id}">
                <strong>${escapeHtml(entry.organization || entry.name || `条目 ${index + 1}`)}</strong>
                <span>${escapeHtml(entry.role || entry.level || formatRange(entry.start, entry.end) || "编辑内容")}</span>
              </button>
              ${canRemove ? `<button class="entry-nav__delete" type="button" data-action="delete-entry" data-section-id="${section.id}" data-item-id="${entry.id}" aria-label="删除此条" title="删除此条">×</button>` : ""}
            </div>`).join("")}
        </div>
        ${canAdd ? `<button class="add-entry-button" type="button" data-action="add-entry" data-section-id="${section.id}">＋ 添加条目</button>` : ""}
      </aside>
      <div class="entry-editor">
        <div class="editor-grid editor-grid--entry">${entryFields.grid}</div>
        ${entryFields.rich}
        <div class="entry-editor__footer">
          <span>停止输入后自动更新 DOCX 预览</span>
        </div>
      </div>
    </div>
    ${fieldManager}`;
}

function renderListEditor(section, definition) {
  if (!section.items) section.items = [];
  const fieldManager = renderFieldManager(section, definition);
  if (!section.items.length) {
    return `${renderSectionHeading(section, definition.id.toUpperCase())}
      <div class="entry-empty"><p>暂无条目。</p><button class="add-entry-button" type="button" data-action="add-entry" data-section-id="${section.id}">＋ 添加条目</button></div>
      ${fieldManager}`;
  }
  let activeItemId = activeItemBySection.get(section.id);
  if (!itemById(section, activeItemId)) activeItemId = section.items[0].id;
  activeItemBySection.set(section.id, activeItemId);
  const item = itemById(section, activeItemId);
  const entryFields = renderEntryFields(section, item);
  return `${renderSectionHeading(section, definition.id.toUpperCase())}
    <div class="timeline-editor"><aside class="entry-nav"><div class="entry-nav__heading"><span>条目</span><small>${section.items.length} 条</small></div>
    <div class="entry-nav__list">${section.items.map((entry, index) => `
      <div class="entry-nav__row">
        <button class="entry-nav__item ${entry.id === activeItemId ? "is-active" : ""}" type="button" data-action="select-entry" data-section-id="${section.id}" data-item-id="${entry.id}"><strong>${escapeHtml(entry.name || `未命名条目 ${index + 1}`)}</strong><span>${escapeHtml(entry.level || entry.date || "请填写内容")}</span></button>
        <button class="entry-nav__delete" type="button" data-action="delete-entry" data-section-id="${section.id}" data-item-id="${entry.id}" aria-label="删除此条" title="删除此条">×</button>
      </div>`).join("")}</div>
    <button class="add-entry-button" type="button" data-action="add-entry" data-section-id="${section.id}">＋ 添加条目</button></aside>
    <div class="entry-editor"><div class="editor-grid">${entryFields.grid}</div>${entryFields.rich}
    <div class="entry-editor__footer"><span>修改会自动保存</span></div></div></div>
    ${fieldManager}`;
}

function renderTagsEditor(section) {
  const value = (section.items || []).join("、");
  const definition = renderableSectionSchemas().find((item) => item.id === section.id) || {};
  const itemsField = (section.fields || []).find((item) => item.key === "items");
  const itemsVisible = !itemsField || itemsField.visible !== false;
  const metaFields = (section.fields || []).filter((item) => item.visible !== false && item.key !== "items");
  return `${renderSectionHeading(section, "INTERESTS")}
    <div class="editor-grid">
      ${itemsVisible ? field("兴趣标签", value, "section-tags", "items", { sectionId: section.id, wide: true, placeholder: "使用逗号或顿号分隔" }) : ""}
      ${metaFields.map((item) => field(item.label, section.data?.[item.key], "section-data", item.key, { sectionId: section.id, type: fieldInputType(item.type) })).join("")}
    </div>
    ${renderFieldManager(section, definition)}`;
}

function emptyStructuredItem(type, fields = []) {
  return { id: makeId(type), ...Object.fromEntries(fields.map((key) => [key, ""])) };
}

function renderRichEditor(section, definition) {
  const contentField = (section.fields || []).find((item) => item.key === "content");
  const contentVisible = !contentField || contentField.visible !== false;
  const metaFields = (section.fields || []).filter((item) => item.visible !== false && item.key !== "content");
  return `
    ${renderSectionHeading(section, "RICH TEXT", definition)}
    <div class="standalone-rich-editor">
      ${contentVisible ? richTextBox(section.content, section.id, "", "content") : ""}
      ${metaFields.length ? `<div class="editor-grid editor-grid--meta">${metaFields.map((item) => field(item.label, section.data?.[item.key], "section-data", item.key, { sectionId: section.id, type: fieldInputType(item.type) })).join("")}</div>` : ""}
      <p class="editor-tip">提示：使用简短段落和列表，突出与目标岗位最相关的能力。</p>
    </div>
    ${renderFieldManager(section, definition)}`;
}

function richTextBox(content, sectionId, itemId = "", fieldKey = "content") {
  return `
    <section class="rich-editor-box">
      <div class="rich-toolbar" role="toolbar" aria-label="富文本格式">
        <button type="button" data-command="bold" title="加粗"><strong>B</strong></button>
        <button type="button" data-command="italic" title="斜体"><em>I</em></button>
        <button type="button" data-command="underline" title="下划线"><u>U</u></button>
        <span></span>
        <button type="button" data-command="insertUnorderedList" title="无序列表">• 列表</button>
        <button type="button" data-command="insertOrderedList" title="有序列表">1. 列表</button>
        <button type="button" data-command="createLink" title="添加链接">链接</button>
        <button type="button" data-command="removeFormat" title="清除格式">清除格式</button>
      </div>
      <div class="rich-editor" contenteditable="true" spellcheck="false" data-rich-section-id="${sectionId}" ${itemId ? `data-rich-item-id="${itemId}"` : ""} data-rich-field="${fieldKey}">${sanitizeRichHtml(content)}</div>
    </section>`;
}

function emptyTimelineItem(type) {
  return {
    id: makeId(type === "education" ? "edu" : "entry"),
    start: "",
    end: "",
    organization: "",
    role: "",
    content: "<p><br></p>"
  };
}

// 通用条目字段编辑：非富文本字段进入网格，富文本字段单独渲染。
function renderEntryFields(section, item) {
  const fields = (section.fields || []).filter((fieldItem) => fieldItem.visible !== false);
  const grid = fields.filter((fieldItem) => fieldItem.type !== "richtext")
    .map((fieldItem) => field(fieldItem.label, item[fieldItem.key], "entry", fieldItem.key, {
      sectionId: section.id,
      itemId: item.id,
      type: fieldInputType(fieldItem.type),
      wide: fieldItem.type === "url" || fieldItem.type === "textarea"
    })).join("");
  const rich = fields.filter((fieldItem) => fieldItem.type === "richtext")
    .map((fieldItem) => richTextBox(item[fieldItem.key], section.id, item.id, fieldItem.key)).join("");
  return { grid, rich };
}

function fieldHasData(section, field) {
  const key = field.key;
  if (Array.isArray(section.items) && section.items.some((item) => item && typeof item === "object" && String(item[key] ?? "").trim())) return true;
  if (section.data && String(section.data[key] ?? "").trim()) return true;
  if (section.type === "richtext" && key === "content" && String(section.content ?? "").replace(/<[^>]+>/g, "").trim()) return true;
  if (section.type === "tags" && key === "items" && (section.items || []).length) return true;
  return false;
}

function renderFieldManager(section, definition) {
  const fields = section.fields || [];
  const typeOptions = FIELD_TYPES.map((type) => `<option value="${type}">${FIELD_TYPE_LABELS[type] || type}</option>`).join("");
  const rows = fields.map((fieldItem, index) => {
    const canDelete = !fieldItem.builtin || (fieldItem.role !== "primary" && fieldItem.role !== "body");
    return `
      <div class="field-row ${fieldItem.visible === false ? "is-hidden" : ""}" data-field-key="${escapeHtml(fieldItem.key)}">
        <span class="field-row__grip" aria-hidden="true">⠿</span>
        <button class="field-row__toggle ${fieldItem.visible !== false ? "is-on" : ""}" type="button" data-action="toggle-field" data-section-id="${section.id}" data-field-key="${escapeHtml(fieldItem.key)}" title="${fieldItem.visible !== false ? "隐藏字段" : "显示字段"}">${fieldItem.visible !== false ? "●" : "○"}</button>
        <input class="field-row__label" value="${escapeHtml(fieldItem.label)}" data-scope="field-label" data-section-id="${section.id}" data-field-key="${escapeHtml(fieldItem.key)}" aria-label="字段名称" />
        <select class="field-row__type" data-scope="field-type" data-section-id="${section.id}" data-field-key="${escapeHtml(fieldItem.key)}" aria-label="字段类型">
          ${FIELD_TYPES.map((type) => `<option value="${type}" ${fieldItem.type === type ? "selected" : ""}>${FIELD_TYPE_LABELS[type] || type}</option>`).join("")}
        </select>
        <span class="field-row__ops">
          <button type="button" data-action="move-field" data-section-id="${section.id}" data-field-key="${escapeHtml(fieldItem.key)}" data-direction="-1" ${index === 0 ? "disabled" : ""} title="前移">↑</button>
          <button type="button" data-action="move-field" data-section-id="${section.id}" data-field-key="${escapeHtml(fieldItem.key)}" data-direction="1" ${index === fields.length - 1 ? "disabled" : ""} title="后移">↓</button>
          <button class="field-row__delete" type="button" data-action="delete-field" data-section-id="${section.id}" data-field-key="${escapeHtml(fieldItem.key)}" ${canDelete ? "" : "disabled"} title="${canDelete ? "删除字段" : "关键字段不可删除"}">×</button>
        </span>
      </div>`;
  }).join("");

  return `
    <details class="field-manager" ${fields.some((fieldItem) => !fieldItem.builtin) ? "open" : ""}>
      <summary>字段设置 <small>${fields.length} 个字段 · 可改名 / 改类型 / 隐藏 / 排序</small></summary>
      <div class="field-manager__list">${rows}</div>
      <div class="field-manager__footer">
        <button class="add-entry-button" type="button" data-action="show-add-field" data-section-id="${section.id}">＋ 新增字段</button>
        <button class="ghost-button" type="button" data-action="reset-fields" data-section-id="${section.id}">恢复默认字段</button>
      </div>
      <div class="field-manager__add" data-add-field-form data-section-id="${section.id}" hidden>
        <input class="field-manager__add-label" placeholder="字段名称，如：公司规模" data-add-field-label />
        <select data-add-field-type>${typeOptions}</select>
        <button type="button" data-action="add-field" data-section-id="${section.id}">添加</button>
        <button class="ghost-button" type="button" data-action="cancel-add-field" data-section-id="${section.id}">取消</button>
      </div>
    </details>`;
}

function renderPreview() {
  elements.title.textContent = resume.title;
  updateStatusCards();
  if (resume.template?.engine === "docx-native") return;

  // 合帧渲染：同一帧内的多次输入/编辑只重建一次预览，避免大 DOM 重建抖动。
  cancelAnimationFrame(previewFrame);
  previewFrame = requestAnimationFrame(() => {
    elements.flow.innerHTML = renderResumeMarkup(resume);
    elements.flow.style.fontSize = `${resume.settings.fontSize}px`;
    schedulePagination();
  });
}

function schedulePagination() {
  cancelAnimationFrame(paginationFrame);
  paginationFrame = requestAnimationFrame(updatePagination);
}

function updatePagination() {
  elements.paper.style.height = "auto";
  const measured = paginateResumeLayout(elements.flow, PAGE_HEIGHT);
  currentPages = pageCountForHeight(measured);
  elements.paper.style.height = `${currentPages * PAGE_HEIGHT}px`;
  document.querySelector("#previewStage").style.setProperty("--preview-height", `${currentPages * PAGE_HEIGHT}px`);
  elements.markers.innerHTML = Array.from({ length: currentPages - 1 }, (_, index) => `
    <div class="page-marker" style="top:${(index + 1) * PAGE_HEIGHT - 1}px">
      <span>第 ${index + 1} 页</span><i></i><span>第 ${index + 2} 页</span>
    </div>`).join("");
  elements.pageCount.textContent = `${currentPages} 页`;
  elements.sidePageCount.textContent = `${currentPages} 页`;
}

function updateStatusCards() {
  const score = completionScore(resume);
  elements.completionScore.textContent = `${score}%`;
  elements.completionBar.style.width = `${score}%`;
  elements.completionHint.textContent = score >= 90
    ? "内容已经很完整，可以导出投递了。"
    : score >= 70
      ? "基础信息完整，再补充量化结果会更有说服力。"
      : "继续完善信息，让简历更有说服力。";
  elements.revision.textContent = `v${resume.revision || 1}`;
  elements.activeTemplateName.textContent = resume.template?.name || currentTemplateSchema().name || "极简轻";
  elements.storageStatus.textContent = resume.remoteId ? "云端草稿" : "仅本机";
  elements.saveDraftButton.textContent = draftSaveInProgress
    ? "保存中…"
    : resume.remoteId && !hasUnsavedChanges ? "已保存" : "保存";
  elements.saveDraftButton.disabled = draftSaveInProgress || Boolean(resume.remoteId && !hasUnsavedChanges);
}

function scheduleSave(delay = 800) {
  hasUnsavedChanges = true;
  elements.saveState.classList.add("is-saving");
  elements.saveState.querySelector("span").textContent = "正在备份到本机…";
  updateStatusCards();
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => autoSaveChanges(), delay);
}

function saveNow() {
  clearTimeout(saveTimer);
  saveTimer = null;
  resume.updatedAt = new Date().toISOString();
  resume.revision = (resume.revision || 0) + 1;
  saveLocalResume();
  updateStatusCards();
  setSavedState(resume.remoteId ? "更改已备份到本机，点击保存同步草稿" : "未保存更改，点击保存加入草稿");
}

async function saveDraft() {
  if (draftSaveInProgress) return;
  if (!currentUser) {
    openLogin(window.location.pathname || "/editor");
    showToast("登录后才能保存到云端", "info");
    return;
  }
  saveNow();
  await persistDraftChanges({ notify: true });
}

async function autoSaveChanges() {
  saveNow();
  // DOCX 原生模板（推荐模板之外的 10 套）依赖云端快照生成成品预览，
  // 因此首次修改也应自动建云草稿并触发成品渲染，而不是等用户手动点「成品」。
  if (resume.template?.engine !== "docx-native") return;
  await persistDraftChanges({ notify: false });
}

async function persistDraftChanges({ notify }) {
  if (draftSaveInProgress) {
    scheduleSave(800);
    return;
  }
  draftSaveInProgress = true;
  const shouldRefreshFidelity = hasUnsavedChanges;
  const localRevision = resume.revision;
  updateStatusCards();
  try {
    await persistRemoteDraft();
    hasUnsavedChanges = resume.revision !== localRevision;
    saveLocalResume();
    setSavedState("云端草稿已保存");
    await loadDrafts();
    if (shouldRefreshFidelity) scheduleFidelityPreview();
    if (notify) showToast("简历已保存到草稿");
  } catch (error) {
    setSavedState("仅本机备份");
    if (notify) showToast(error?.message || "保存草稿失败", "warning");
  } finally {
    draftSaveInProgress = false;
    updateStatusCards();
    if (hasUnsavedChanges && resume.template?.engine === "docx-native") scheduleSave(800);
  }
}

function setSavedState(label) {
  elements.saveState.classList.remove("is-saving");
  elements.saveState.querySelector("span").textContent = `${label} · ${new Date().toLocaleTimeString("zh-CN", { hour12: false })}`;
}

function scheduleFidelityPreview() {
  clearTimeout(fidelityTimer);
  if (!resume.remoteId || resume.template?.engine !== "docx-native") {
    elements.fidelityStatus.textContent = "即时排版";
    return;
  }
  const requestKey = `${resume.remoteId}:${resume.remoteRevision}`;
  if (requestKey === fidelityRequestKey
    || (resume.remoteId === fidelityResumeId && resume.remoteRevision === fidelityRevision)) return;
  elements.fidelityStatus.textContent = "成品待刷新";
  fidelityRequestKey = requestKey;
  fidelityTimer = setTimeout(() => refreshFidelityPreview(requestKey), 600);
}

async function refreshFidelityPreview(requestKey) {
  const requestId = ++fidelityRequest;
  const resumeId = resume.remoteId;
  const revision = resume.remoteRevision;
  elements.fidelityStatus.textContent = "生成成品预览…";
  try {
    let job = await readApiResponse(await fetch("/api/previews", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ resumeId: resume.remoteId, revision })
    }));
    for (let attempt = 0; attempt < 120 && !["completed", "failed"].includes(job.status); attempt += 1) {
      await delay(500);
      job = await readApiResponse(await fetch(`/api/previews/${encodeURIComponent(job.id)}?token=${encodeURIComponent(job.token)}`, { cache: "no-store" }));
    }
    if (requestId !== fidelityRequest || requestKey !== `${resume.remoteId}:${resume.remoteRevision}`) return;
    if (job.status !== "completed") throw new Error(job.error || "成品预览生成超时");
    elements.fidelityPreview.innerHTML = job.pages.map((url, index) =>
      `<img src="${escapeHtml(url)}" alt="成品预览第 ${index + 1} 页" loading="${index ? "lazy" : "eager"}" />`
    ).join("");
    document.querySelector("#previewStage").style.setProperty("--preview-height", `${job.pageCount * PAGE_HEIGHT}px`);
    currentPages = job.pageCount;
    elements.pageCount.textContent = `${currentPages} 页`;
    elements.sidePageCount.textContent = `${currentPages} 页`;
    fidelityRevision = revision;
    fidelityResumeId = resumeId;
    elements.fidelityStatus.textContent = `成品 v${revision}`;
  } catch (error) {
    if (requestId !== fidelityRequest) return;
    if (fidelityRequestKey === requestKey) fidelityRequestKey = "";
    elements.fidelityStatus.textContent = "成品预览不可用";
  }
}

async function setPreviewMode(mode) {
  if (resume.template?.engine === "docx-native") mode = "final";
  previewMode = mode === "final" ? "final" : "instant";
  const finalMode = previewMode === "final";
  if (finalMode && !resume.remoteId) {
    await saveDraft();
    if (!resume.remoteId) {
      previewMode = "instant";
      return;
    }
  }
  elements.paper.hidden = finalMode;
  elements.fidelityPreview.hidden = !finalMode;
  document.querySelectorAll("[data-preview-mode]").forEach((button) => {
    button.classList.toggle("is-active", button.dataset.previewMode === previewMode);
  });
}

function updateStandardField(target) {
  const { scope, field, sectionId, itemId } = target.dataset;
  if (!scope || !field) return false;
  if (scope === "profile") resume.profile[field] = target.value;
  else if (scope === "section" && field === "lineHeight") {
    const section = sectionById(sectionId);
    if (target.value === "" || target.value == null) delete section.lineHeight;
    else section.lineHeight = Number(target.value);
  }
  else if (scope === "section") sectionById(sectionId)[field] = target.value;
  else if (scope === "section-data") {
    const section = sectionById(sectionId);
    (section.data ||= {})[field] = target.value;
  }
  else if (scope === "entry") itemById(sectionById(sectionId), itemId)[field] = target.value;
  else if (scope === "section-tags") sectionById(sectionId).items = target.value.split(/[、,，]/).map((value) => value.trim()).filter(Boolean);
  else return false;
  renderPreview();
  if (scope === "section" && field === "title") {
    renderTabs();
    const heading = elements.editor.querySelector(".editor-heading--section h2");
    if (heading) heading.textContent = sectionById(sectionId)?.title || "";
  }
  scheduleSave();
  return true;
}

function updateMonthRange(target) {
  const wrap = target.closest("[data-month-range]");
  if (!wrap) return false;
  const year = (wrap.querySelector(".month-range__year")?.value || "").trim();
  const month = wrap.querySelector(".month-range__month")?.value || "";
  const value = year && month ? `${year}-${String(month).padStart(2, "0")}` : "";
  const { scope, field, sectionId, itemId } = wrap.dataset;
  if (scope === "profile") resume.profile[field] = value;
  else if (scope === "entry") itemById(sectionById(sectionId), itemId)[field] = value;
  else return false;
  renderPreview();
  scheduleSave();
  return true;
}

function updateFieldLabel(target) {
  const section = sectionById(target.dataset.sectionId);
  const fieldItem = (section?.fields || []).find((item) => item.key === target.dataset.fieldKey);
  if (!fieldItem) return;
  fieldItem.label = target.value;
  renderPreview();
  scheduleSave();
}

function updateFieldType(target) {
  const section = sectionById(target.dataset.sectionId);
  const fieldItem = (section?.fields || []).find((item) => item.key === target.dataset.fieldKey);
  if (!fieldItem) return;
  fieldItem.type = target.value;
  renderEditor();
  renderPreview();
  scheduleSave();
}

function updateRichEditor(target) {
  const section = sectionById(target.dataset.richSectionId);
  if (!section) return;
  const fieldKey = target.dataset.richField || "content";
  const item = target.dataset.richItemId ? itemById(section, target.dataset.richItemId) : null;
  if (item) item[fieldKey] = target.innerHTML;
  else if (section.type === "richtext" && fieldKey === "content") section.content = target.innerHTML;
  else (section.data ||= {})[fieldKey] = target.innerHTML;
  renderPreview();
  scheduleSave(800);
}

function showToast(message, type = "success") {
  const toast = document.createElement("div");
  toast.className = `toast toast--${type}`;
  toast.textContent = message;
  elements.toastRegion.append(toast);
  setTimeout(() => toast.classList.add("is-visible"), 10);
  setTimeout(() => {
    toast.classList.remove("is-visible");
    setTimeout(() => toast.remove(), 250);
  }, 2600);
}

// 应用内确认/输入弹窗（替代浏览器 window.confirm / window.prompt）。
const dialogState = { mode: "confirm", resolve: null };

function openDialog({ title = "确认操作", message = "", confirmLabel = "确定", danger = false, input = null }) {
  return new Promise((resolve) => {
    dialogState.resolve = resolve;
    dialogState.mode = input === null ? "confirm" : "prompt";
    elements.appDialogTitle.textContent = title;
    elements.appDialogMessage.textContent = message || "";
    elements.appDialogMessage.hidden = !message;
    elements.appDialogInput.hidden = input === null;
    elements.appDialogInput.value = input?.value ?? "";
    elements.appDialogInput.placeholder = input?.placeholder ?? "";
    elements.appDialogSubmit.textContent = confirmLabel;
    elements.appDialogSubmit.classList.toggle("is-danger", danger);
    elements.appDialog.hidden = false;
    requestAnimationFrame(() => elements.appDialog.classList.add("is-visible"));
    if (input === null) elements.appDialogSubmit.focus();
    else {
      elements.appDialogInput.focus();
      elements.appDialogInput.select();
    }
  });
}

function closeDialog(result) {
  if (dialogState.resolve) {
    const resolve = dialogState.resolve;
    dialogState.resolve = null;
    resolve(result);
  }
  elements.appDialog.classList.remove("is-visible");
  setTimeout(() => { elements.appDialog.hidden = true; }, 180);
}

function confirmAction({ title = "确认操作", message = "", confirmLabel = "确定", danger = false }) {
  return openDialog({ title, message, confirmLabel, danger, input: null });
}

function promptValue({ title = "请输入", message = "", confirmLabel = "确定", value = "", placeholder = "" }) {
  return openDialog({ title, message, confirmLabel, danger: false, input: { value, placeholder } });
}

function closePopovers(exceptId = "") {
  document.querySelectorAll(".popover").forEach((popover) => {
    if (popover.id !== exceptId) popover.hidden = true;
  });
}

function setExportState(active, label = "") {
  exportInProgress = active;
  document.querySelectorAll('[data-action="export-resume"]').forEach((button) => {
    button.disabled = active;
    button.setAttribute("aria-busy", String(active));
    const labelNode = button.querySelector("[data-export-label]");
    if (!labelNode.dataset.defaultLabel) labelNode.dataset.defaultLabel = labelNode.textContent;
    labelNode.textContent = active ? label : labelNode.dataset.defaultLabel;
  });
}

async function readApiResponse(response) {
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    if (response.status === 401 && currentUser) {
      currentUser = null;
      updateAccountUi();
    }
    const error = new Error(payload.error || `服务请求失败 (${response.status})`);
    error.status = response.status;
    throw error;
  }
  return payload;
}

async function refreshSession() {
  try {
    const payload = await readApiResponse(await fetch("/api/auth/session", { cache: "no-store" }));
    currentUser = payload.user || null;
  } catch {
    currentUser = null;
  }
  updateAccountUi();
  refreshUnreadCount();
}

function updateAccountUi() {
  const identifier = currentUser?.email || currentUser?.phone || "";
  const label = currentUser ? (currentUser.displayName || identifier) : "登录";
  const avatarMark = currentUser
    ? (currentUser.displayName || identifier || "?").slice(0, 1).toUpperCase()
    : "登";
  document.querySelectorAll("[data-account-label]").forEach((node) => {
    node.textContent = label;
  });
  document.querySelectorAll("[data-avatar-mark]").forEach((node) => {
    node.textContent = avatarMark;
  });
  document.querySelectorAll("[data-account-name]").forEach((node) => {
    node.textContent = currentUser ? (currentUser.displayName || identifier) : "";
  });
  document.querySelectorAll("[data-account-email]").forEach((node) => {
    node.textContent = identifier;
  });
  document.querySelectorAll('[data-action="account"]').forEach((button) => {
    button.title = currentUser ? `${identifier} · 账户设置` : "登录 / 注册";
  });
  document.querySelectorAll("[data-admin-link]").forEach((node) => {
    node.hidden = !(currentUser?.isAdmin);
  });
}

function defaultPathFor(user) {
  return user?.isAdmin ? "/admin" : "/";
}

function openLogin(next = null, historyMode = "push") {
  loginNext = next;
  updateBrowserRoute({ name: "login" }, historyMode);
  showLoginPage();
}

// 用户不想登录时返回：进入登录页前的可见页面优先；若来路是需登录才能访问的
// 页面（/ai、/admin、/resumes/.../edit），则落到首页。
function closeLogin() {
  const route = loginNext && isAppPath(loginNext) ? parseAppRoute(loginNext) : null;
  const gated = route && (route.name === "ai" || route.name === "admin" || route.name === "resume");
  const target = route && !gated ? loginNext : "/";
  loginNext = null;
  if (window.location.pathname !== target) window.history.replaceState({}, "", target);
  applyCurrentRoute();
}

function loadCaptchaScript() {
  if (window.initAliyunCaptcha) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = "https://o.alicdn.com/captcha-frontend/aliyunCaptcha/AliyunCaptcha.js";
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("人机验证组件加载失败，请刷新后重试"));
    document.head.appendChild(script);
  });
}

// 拉取阿里云验证码配置并初始化（仅当服务端已配置 AccessKey + 场景ID + 身份标）。
async function ensureCaptcha() {
  if (captchaRequested) return;
  captchaRequested = true;
  try {
    const payload = await readApiResponse(await fetch("/api/auth/captcha-config", { cache: "no-store" }));
    captchaConfig = { enabled: Boolean(payload.enabled && payload.sceneId && payload.prefix), sceneId: payload.sceneId || "", prefix: payload.prefix || "" };
  } catch {
    captchaConfig = { enabled: false, sceneId: "", prefix: "" };
  }
  if (!captchaConfig.enabled || !captchaConfig.sceneId || !captchaConfig.prefix) return;
  try {
    // 全局配置（地区 + 身份标）必须在加载 SDK 前设置。
    window.AliyunCaptchaConfig = { region: "cn", prefix: captchaConfig.prefix };
    await loadCaptchaScript();
    elements.captchaWrap.hidden = false;
    window.initAliyunCaptcha({
      SceneId: captchaConfig.sceneId,
      mode: "embed",
      element: "#captchaWrap",
      button: "#loginSubmit",
      captchaVerifyCallback: handleCaptchaVerify,
      onBizResultCallback: handleBizResult,
      getInstance: (instance) => { captchaInstance = instance; },
      language: "cn",
      immediate: false
    });
    captchaReady = true;
  } catch {
    captchaReady = false;
  }
}

// 仅发起认证请求并返回 payload；不负责跳转。
async function postAuthRequest(path, body) {
  const deviceId = await getDeviceId().catch(() => "");
  const headers = { "Content-Type": "application/json" };
  if (deviceId) headers["X-Device-Id"] = deviceId;
  return readApiResponse(await fetch(path, {
    method: "POST",
    headers,
    body: JSON.stringify(body)
  }));
}

// 登录/注册成功后的统一收尾：更新会话状态并跳转。
async function completeAuthSuccess(payload, isRegister) {
  currentUser = payload.user || null;
  updateAccountUi();
  refreshUnreadCount();
  closeAllAccountMenus();
  showToast(isRegister ? "注册成功，已登录" : "登录成功", "success");
  const fallback = defaultPathFor(currentUser);
  const target = loginNext && isAppPath(loginNext) ? loginNext : fallback;
  loginNext = null;
  window.history.replaceState({}, "", target);
  await applyCurrentRoute();
}

// 验证码通过后由 SDK 调用：在此读取表单并发起真实的登录/注册/验证码登录请求。
async function handleCaptchaVerify(captchaVerifyParam) {
  const sub = buildAuthSubmission();
  if (sub.error) {
    captchaAuthResult = { ok: false, error: new Error(sub.error) };
    return { captchaResult: true, bizResult: false };
  }
  try {
    const payload = await postAuthRequest(sub.path, { ...sub.body, captchaVerifyParam });
    captchaAuthResult = { ok: true, isRegister: sub.isRegister, payload };
    return { captchaResult: true, bizResult: true };
  } catch (error) {
    const captchaFailed = /人机验证/.test(error?.message || "");
    captchaAuthResult = { ok: false, error };
    return { captchaResult: !captchaFailed, bizResult: false };
  }
}

// SDK 完成验证码校验后回调业务结果（仅验证码通过时会调用）。
function handleBizResult() {
  const result = captchaAuthResult;
  captchaAuthResult = null;
  elements.loginSubmit.disabled = false;
  if (!result) return;
  if (result.ok) {
    completeAuthSuccess(result.payload, result.isRegister);
  } else {
    elements.loginError.textContent = result.error?.message || "操作失败";
    elements.loginError.hidden = false;
  }
}

function resetCaptcha() {
  captchaAuthResult = null;
}

// 拉取验证码登录开关，决定是否显示「使用验证码登录」入口（默认关闭，由管理端开启）。
async function loadLoginMethods() {
  try {
    const payload = await readApiResponse(await fetch("/api/auth/login-methods", { cache: "no-store" }));
    codeLoginMethods = { email: Boolean(payload.emailCodeEnabled), phone: Boolean(payload.phoneCodeEnabled) };
  } catch {
    codeLoginMethods = { email: false, phone: false };
  }
  codeLoginAvailable = codeLoginMethods.email || codeLoginMethods.phone;
  if (!codeLoginAvailable && loginMethod === "code") loginMethod = "password";
  refreshLoginForm();
}

// 邮箱/手机号的基础校验：与服务端规则保持一致，仅在提交前做即时提示。
function identifierError(value) {
  const v = String(value || "").trim();
  if (!v) return "请输入邮箱或手机号";
  if (v.includes("@")) {
    return v.length <= 320 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)
      ? null
      : "邮箱格式不正确，请检查后重试";
  }
  const phone = v.replace(/[\s()-]/g, "");
  return /^\+?[0-9]{6,15}$/.test(phone) ? null : "手机号需为 6–15 位数字（可带 + 号）";
}

// 密码强度基础校验：与服务端 password-policy 保持一致（弱口令黑名单仍由服务端拦截）。
function passwordError(password) {
  if (typeof password !== "string" || password.length < 8 || password.length > 200) {
    return "密码长度需为 8–200 个字符";
  }
  if (!/[a-zA-Z]/.test(password) || !/[0-9]/.test(password)) {
    return "密码需同时包含字母和数字";
  }
  return null;
}

function refreshLoginForm() {
  const isRegister = authTab === "register";
  const isCode = authTab === "login" && loginMethod === "code";

  elements.loginTabLogin.classList.toggle("is-active", !isRegister);
  elements.loginTabRegister.classList.toggle("is-active", isRegister);
  elements.loginTabLogin.setAttribute("aria-selected", String(!isRegister));
  elements.loginTabRegister.setAttribute("aria-selected", String(isRegister));

  elements.loginIdentifierLabel.textContent = "邮箱或手机号";
  elements.loginIdentifier.autocomplete = "username";
  elements.loginIdentifier.type = "text";

  elements.loginPasswordField.hidden = isCode;
  elements.loginPasswordHint.hidden = !isRegister;
  elements.loginPasswordConfirmField.hidden = !isRegister;
  elements.loginPassword.autocomplete = isRegister ? "new-password" : "current-password";
  elements.loginCodeField.hidden = !isCode;
  elements.loginNameField.hidden = !isRegister;
  elements.loginMethodSwitchRow.hidden = isRegister || !codeLoginAvailable;

  elements.loginTitle.textContent = isRegister ? "注册" : (isCode ? "验证码登录" : "登录");
  elements.loginSubmit.textContent = isRegister ? "注册并登录" : (isCode ? "登录 / 注册" : "登录");
  elements.loginMethodSwitch.textContent = isCode ? "使用密码登录" : "使用验证码登录";
  elements.loginError.hidden = true;
}

function setAuthTab(tab) {
  authTab = tab === "register" ? "register" : "login";
  refreshLoginForm();
  elements.loginIdentifier.focus();
}

function toggleLoginMethod() {
  loginMethod = loginMethod === "code" ? "password" : "code";
  refreshLoginForm();
  elements.loginIdentifier.focus();
}

function updateSendCodeButton() {
  if (sendCodeCountdown > 0) {
    elements.sendCodeButton.disabled = true;
    elements.sendCodeButton.textContent = `${sendCodeCountdown}s 后重发`;
  } else {
    elements.sendCodeButton.disabled = false;
    elements.sendCodeButton.textContent = "获取验证码";
  }
}

function startSendCodeCountdown() {
  sendCodeCountdown = 60;
  updateSendCodeButton();
  clearInterval(sendCodeTimer);
  sendCodeTimer = setInterval(() => {
    sendCodeCountdown -= 1;
    if (sendCodeCountdown <= 0) {
      clearInterval(sendCodeTimer);
      sendCodeTimer = null;
    }
    updateSendCodeButton();
  }, 1000);
}

async function handleSendCode() {
  const identifier = elements.loginIdentifier.value.trim();
  const idError = identifierError(identifier);
  if (idError) {
    elements.loginError.textContent = idError;
    elements.loginError.hidden = false;
    elements.loginIdentifier.focus();
    return;
  }
  elements.sendCodeButton.disabled = true;
  try {
    await readApiResponse(await fetch("/api/auth/send-code", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ identifier })
    }));
    showToast("验证码已发送", "success");
    startSendCodeCountdown();
    elements.loginCode.focus();
  } catch (error) {
    elements.loginError.textContent = error?.message || "验证码发送失败";
    elements.loginError.hidden = false;
  } finally {
    elements.sendCodeButton.disabled = sendCodeCountdown > 0;
  }
}

// 读取并校验当前登录表单，返回待提交动作或错误信息。
function buildAuthSubmission() {
  if (authTab === "login" && loginMethod === "code") {
    const identifier = elements.loginIdentifier.value.trim();
    const code = elements.loginCode.value.trim();
    const idError = identifierError(identifier);
    if (idError) return { error: idError };
    if (!code) return { error: "请输入验证码" };
    return {
      path: "/api/auth/login/code",
      body: { identifier, code, remember: elements.loginRemember.checked },
      isRegister: false
    };
  }
  const identifier = elements.loginIdentifier.value.trim();
  const password = elements.loginPassword.value;
  const isRegister = authTab === "register";
  const idError = identifierError(identifier);
  if (idError) return { error: idError };
  if (!password) return { error: "请输入密码" };
  if (isRegister) {
    const pwError = passwordError(password);
    if (pwError) return { error: pwError };
    if (password !== elements.loginPasswordConfirm.value) return { error: "两次输入的密码不一致" };
  }
  const body = { identifier, password, remember: elements.loginRemember.checked };
  if (isRegister) body.displayName = elements.loginName.value.trim();
  return { path: isRegister ? "/api/auth/register" : "/api/auth/login", body, isRegister };
}

// 直接提交（未启用验证码时）。
async function submitAuthNow() {
  const sub = buildAuthSubmission();
  if (sub.error) {
    elements.loginError.textContent = sub.error;
    elements.loginError.hidden = false;
    return;
  }
  elements.loginSubmit.disabled = true;
  elements.loginError.hidden = true;
  try {
    const payload = await postAuthRequest(sub.path, sub.body);
    await completeAuthSuccess(payload, sub.isRegister);
  } catch (error) {
    elements.loginError.textContent = error?.message || "操作失败";
    elements.loginError.hidden = false;
  } finally {
    elements.loginSubmit.disabled = false;
  }
}

// 页面切换淡入：用 Web Animations API 显式播放，避免依赖浏览器对
// hidden(display:none) 切换是否重启 CSS 动画的行为差异。
function revealView(element) {
  element.hidden = false;
  if (window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches) return;
  element.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 240, easing: "ease" });
}

function showLoginPage() {
  document.documentElement.classList.remove("home-page-mode");
  document.documentElement.classList.remove("template-library-mode");
  elements.homePage.hidden = true;
  elements.templateLibrary.hidden = true;
  elements.draftPage.hidden = true;
  elements.app.hidden = true;
  elements.adminPage.hidden = true;
  elements.aiPage.hidden = true;
  revealView(elements.loginPage);
  authTab = "login";
  loginMethod = "password";
  refreshLoginForm();
  elements.loginIdentifier.value = "";
  elements.loginPassword.value = "";
  elements.loginPasswordConfirm.value = "";
  elements.loginName.value = "";
  elements.loginCode.value = "";
  elements.loginRemember.checked = false;
  clearInterval(sendCodeTimer);
  sendCodeTimer = null;
  sendCodeCountdown = 0;
  updateSendCodeButton();
  ensureCaptcha();
  resetCaptcha();
  loadLoginMethods();
  window.scrollTo({ top: 0, behavior: "auto" });
  elements.loginIdentifier.focus();
}

function hideLoginPage() {
  elements.loginPage.hidden = true;
}

function closeAllAccountMenus() {
  document.querySelectorAll("[data-account-dropdown]").forEach((dropdown) => {
    dropdown.hidden = true;
  });
  document.querySelectorAll('[data-action="account"]').forEach((button) => {
    button.setAttribute("aria-expanded", "false");
  });
}

function toggleAccountMenu(button) {
  const dropdown = button.closest(".account-area")?.querySelector("[data-account-dropdown]");
  if (!dropdown) return;
  const willOpen = dropdown.hidden;
  closeAllAccountMenus();
  dropdown.hidden = !willOpen;
  button.setAttribute("aria-expanded", String(!willOpen));
}

function openSettings() {
  if (!currentUser) {
    openLogin(window.location.pathname || "/");
    return;
  }
  closeAllAccountMenus();
  const settings = currentUser.settings || {};
  const ai = settings.ai || {};
  elements.settingsName.value = currentUser.displayName || "";
  elements.settingsEmail.textContent = currentUser.email || currentUser.phone || "";
  elements.settingsAiEnabled.checked = Boolean(ai.enabled);
  elements.settingsAiRole.value = ai.targetRole || "";
  elements.settingsAiTone.value = ai.tone || "professional";
  elements.settingsError.hidden = true;
  elements.settingsOverlay.hidden = false;
}

function closeSettings() {
  elements.settingsOverlay.hidden = true;
  elements.settingsError.hidden = true;
}

async function handleLoginSubmit(event) {
  event.preventDefault();
  if (captchaConfig.enabled) {
    // 启用验证码（内嵌式）时：点「登录/注册」由 SDK 触发 captchaVerifyCallback 完成提交。
    if (!captchaReady) {
      elements.loginError.textContent = "人机验证组件加载失败，请刷新页面重试";
      elements.loginError.hidden = false;
      ensureCaptcha();
    }
    return;
  }
  await submitAuthNow();
}

async function handleSettingsSubmit(event) {
  event.preventDefault();
  elements.settingsError.hidden = true;
  try {
    const payload = await readApiResponse(await fetch("/api/me", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        displayName: elements.settingsName.value.trim(),
        settings: {
          ai: {
            enabled: elements.settingsAiEnabled.checked,
            targetRole: elements.settingsAiRole.value.trim(),
            tone: elements.settingsAiTone.value
          }
        }
      })
    }));
    currentUser = payload.user;
    updateAccountUi();
    closeSettings();
    showToast("设置已保存", "success");
  } catch (error) {
    elements.settingsError.textContent = error?.message || "保存设置失败";
    elements.settingsError.hidden = false;
  }
}

async function handleLogout() {
  try {
    await fetch("/api/auth/logout", { method: "POST" });
  } catch {
    // 退出时网络错误可忽略
  }
  currentUser = null;
  updateAccountUi();
  refreshUnreadCount();
  closeAllAccountMenus();
  closeSettings();
  resume = createInitialResume();
  activeModuleId = "profile";
  activeItemBySection.clear();
  availableDrafts = [];
  renderDrafts();
  localStorage.removeItem(STORAGE_KEY);
  localStorage.removeItem(LEGACY_STORAGE_KEY);
  updateStatusCards();
  showTemplateLibrary({ historyMode: "replace" });
  showToast("已退出登录", "info");
}

function hasAdminPermission(permission) {
  const permissions = currentUser?.permissions || [];
  return permissions.includes("*") || permissions.includes(permission);
}

function adminRoleLabel(user) {
  if (!user.isAdmin) return "用户";
  if (user.role === "super_admin") return "超级管理员";
  if (user.role === "auditor") return "审计";
  return "运营";
}

function adminRoleBadge(user) {
  if (!user.isAdmin) return '<span class="badge">用户</span>';
  return `<span class="badge badge--admin">${escapeHtml(adminRoleLabel(user))}</span>`;
}

const ADMIN_TAB_PERMISSIONS = [
  ["users", "users.read"],
  ["duplicates", "users.read"],
  ["resumes", "resumes.read"],
  ["recycle", "recycle.read"],
  ["announcements", "announcements.read"],
  ["feedback", "feedback.read"],
  ["templates", "templates.read"],
  ["ai", "ai_config.read"],
  ["logs", "ai_logs.read"],
  ["costs", "ai_logs.read"],
  ["config", "config.read"],
  ["auth", "config.read"],
  ["audit", "audit.read"],
  ["system", "system.read"]
];

function adminTabsForUser() {
  return ADMIN_TAB_PERMISSIONS
    .filter(([, permission]) => hasAdminPermission(permission))
    .map(([tab]) => tab);
}

function showAdminPage() {
  document.documentElement.classList.remove("home-page-mode");
  document.documentElement.classList.remove("template-library-mode");
  elements.homePage.hidden = true;
  elements.templateLibrary.hidden = true;
  elements.draftPage.hidden = true;
  elements.app.hidden = true;
  elements.loginPage.hidden = true;
  elements.aiPage.hidden = true;
  revealView(elements.adminPage);

  const visibleTabs = adminTabsForUser();
  document.querySelectorAll("[data-admin-tab]").forEach((button) => {
    button.hidden = !visibleTabs.includes(button.dataset.adminTab);
  });
  document.querySelectorAll("[data-admin-group]").forEach((group) => {
    const hasVisible = [...group.querySelectorAll("[data-admin-tab]")].some((button) => !button.hidden);
    group.hidden = !hasVisible;
  });
  setAdminTab(visibleTabs[0] || "users");

  loadAdminOverview();
  if (hasAdminPermission("users.read")) {
    loadAdminUsers();
    loadAdminDuplicates();
  }
  if (hasAdminPermission("resumes.read")) loadAdminDrafts();
  if (hasAdminPermission("announcements.read")) loadAdminAnnouncements();
  if (hasAdminPermission("feedback.read")) loadAdminFeedbacks();
  if (hasAdminPermission("templates.read")) loadAdminTemplates();
  if (hasAdminPermission("ai_config.read")) loadAdminAiConfig();
  if (hasAdminPermission("ai_logs.read")) loadAdminAiLogs();
  if (hasAdminPermission("ai_logs.read")) loadAdminCosts();
  if (hasAdminPermission("audit.read")) loadAdminAuditLogs();
  if (hasAdminPermission("recycle.read")) loadAdminRecycle();
  if (hasAdminPermission("config.read")) {
    loadAdminConfig();
    loadAdminAuthStatus();
    loadAdminAuthSecrets();
  }
  if (hasAdminPermission("system.read")) {
    loadAdminSystem();
    loadAdminAlerts();
  }
  document.querySelectorAll("[data-admin-write]").forEach((node) => {
    node.hidden = !hasAdminPermission("system.write");
  });
  window.scrollTo({ top: 0, behavior: "auto" });
}

function hideAdminPage() {
  elements.adminPage.hidden = true;
}

function setAdminTab(tab) {
  document.querySelectorAll("[data-admin-tab]").forEach((button) => {
    button.classList.toggle("is-active", button.dataset.adminTab === tab);
  });
  document.querySelectorAll("[data-admin-panel]").forEach((panel) => {
    panel.hidden = panel.dataset.adminPanel !== tab;
  });
}

async function loadAdminUsers() {
  const search = elements.adminUserSearch.value.trim();
  elements.adminUserStatus.hidden = false;
  elements.adminUserStatus.textContent = "正在加载用户…";
  try {
    const query = new URLSearchParams({ limit: "200", search });
    if (elements.adminUserRole.value) query.set("role", elements.adminUserRole.value);
    if (elements.adminUserStatus.value) query.set("status", elements.adminUserStatus.value);
    if (elements.adminUserFrom.value) query.set("from", elements.adminUserFrom.value);
    if (elements.adminUserTo.value) query.set("to", elements.adminUserTo.value);
    const payload = await readApiResponse(await fetch(`/api/admin/users?${query}`, { cache: "no-store" }));
    adminUsers = payload.users || [];
    elements.adminUserTotal.textContent = payload.total ? `${payload.total} 位用户` : "";
    renderAdminUsers();
    elements.adminUserStatus.hidden = true;
  } catch (error) {
    elements.adminUserStatus.textContent = error?.message || "加载用户失败";
  }
}

function renderAdminUsers() {
  if (!adminUsers.length) {
    elements.adminUserList.innerHTML = '<p class="admin-empty">没有符合条件的用户。</p>';
    return;
  }
  const canWrite = hasAdminPermission("users.write");
  const canDelete = hasAdminPermission("users.delete");
  const canManageSessions = hasAdminPermission("sessions.manage");
  const isSuper = currentUser?.role === "super_admin";
  elements.adminUserList.innerHTML = `
    <table class="admin-table">
      <thead><tr><th>用户</th><th>角色</th><th>状态</th><th>草稿</th><th>AI 限额/日</th><th>注册时间</th><th>操作</th></tr></thead>
      <tbody>${adminUsers.map((user) => {
        const created = new Date(user.createdAt);
        const createdLabel = Number.isNaN(created.getTime()) ? "—" : created.toLocaleDateString("zh-CN");
        const isSelf = currentUser?.id === user.id;
        const canManageThisUser = isSuper || !user.isAdmin;
        const ops = [];
        if (isSelf) {
          ops.push('<span class="admin-self">本人</span>');
        } else {
          // 超级管理员可管理管理员与普通用户；普通管理员只能管理普通用户。
          if (canWrite && canManageThisUser) {
            if (isSuper) {
              ops.push(`<button type="button" data-action="admin-toggle-admin" data-user-id="${escapeHtml(user.id)}" data-is-admin="${user.isAdmin}">${user.isAdmin ? "取消管理员" : "设为管理员"}</button>`);
            }
            ops.push(`<button type="button" data-action="admin-toggle-disabled" data-user-id="${escapeHtml(user.id)}" data-disabled="${user.disabled}">${user.disabled ? "启用" : "禁用"}</button>`);
          }
          if (isSuper && user.isAdmin) {
            ops.push(`<select class="admin-role-select" data-action="admin-set-role" data-user-id="${escapeHtml(user.id)}" data-current-role="${escapeHtml(user.role || "operator")}" aria-label="设置角色">
              <option value="operator"${user.role === "operator" ? " selected" : ""}>运营</option>
              <option value="auditor"${user.role === "auditor" ? " selected" : ""}>审计</option>
            </select>`);
          }
          if (canManageSessions && canManageThisUser) {
            ops.push(`<button type="button" data-action="admin-revoke-sessions" data-user-id="${escapeHtml(user.id)}">踢下线</button>`);
          }
          if (canDelete && canManageThisUser) {
            ops.push(`<button class="danger-link" type="button" data-action="admin-delete-user" data-user-id="${escapeHtml(user.id)}" data-account="${escapeHtml(user.email || user.phone)}">删除</button>`);
          }
        }
        const canEditLimit = canWrite && canManageThisUser && !isSelf && !user.isAdmin;
        const aiLimitCell = user.isAdmin
          ? '<span class="admin-self">不限</span>'
          : canEditLimit
            ? `<input class="admin-ai-limit-input" type="number" min="1" max="10000" step="1" value="${Number(user.aiDailyLimit) || 8}" data-action="admin-set-ai-limit" data-user-id="${escapeHtml(user.id)}" aria-label="AI 日限额" title="每日 AI 调用上限" />`
            : `${Number(user.aiDailyLimit) || 8} 次`;
        return `<tr>
          <td><div class="admin-user"><strong>${escapeHtml(user.displayName || "未命名")}</strong><small>${escapeHtml(user.email || user.phone || "—")}</small></div></td>
          <td>${adminRoleBadge(user)}</td>
          <td>${user.disabled ? '<span class="badge badge--disabled">已禁用</span>' : '<span class="badge badge--active">正常</span>'}</td>
          <td>${user.draftCount ?? 0}</td>
          <td>${aiLimitCell}</td>
          <td>${escapeHtml(createdLabel)}</td>
          <td class="admin-table__ops">${ops.join("") || '<span class="admin-self">—</span>'}</td>
        </tr>`;
      }).join("")}</tbody>
    </table>`;
}

// —— 疑似同人多账号（只读复核，不提供封禁操作） ——

async function loadAdminDuplicates() {
  elements.adminDuplicatesStatus.hidden = false;
  elements.adminDuplicatesStatus.textContent = "正在加载疑似多账号…";
  try {
    const limit = 100;
    const payload = await readApiResponse(await fetch(`/api/admin/suspected-duplicates?limit=${limit}`, { cache: "no-store" }));
    const groups = payload.groups || [];
    elements.adminDuplicatesTotal.textContent = groups.length ? `${groups.length} 组疑似关联` : "";
    renderAdminDuplicates(groups);
    elements.adminDuplicatesStatus.hidden = true;
  } catch (error) {
    elements.adminDuplicatesStatus.textContent = error?.message || "加载疑似多账号失败";
  }
}

function renderAdminDuplicates(groups) {
  if (!groups.length) {
    elements.adminDuplicatesList.innerHTML = '<p class="admin-empty">未发现疑似同人多账号。</p>';
    return;
  }
  const confidenceBadge = {
    "高": '<span class="badge badge--disabled">高</span>',
    "中": '<span class="badge badge--admin">中</span>',
    "低": '<span class="badge">低</span>'
  };
  elements.adminDuplicatesList.innerHTML = `
    <table class="admin-table">
      <thead><tr><th>置信度</th><th>指纹类型</th><th>关联账号</th><th>最近出现</th><th>来源 IP</th></tr></thead>
      <tbody>${groups.map((group) => {
        const users = (group.users || []).map((user) =>
          escapeHtml(user.displayName || user.email || user.phone || "未命名") + " (" + escapeHtml(user.email || user.phone || "—") + ")"
        ).join("<br>");
        const lastSeen = new Date(group.lastSeenAt);
        const lastSeenLabel = Number.isNaN(lastSeen.getTime()) ? "—" : lastSeen.toLocaleString("zh-CN", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: false });
        const confidence = group.confidence || {};
        return `<tr>
          <td>${confidenceBadge[confidence.label] || escapeHtml(confidence.label || "—")}</td>
          <td>${escapeHtml(confidence.title || group.type || "—")}</td>
          <td><div class="admin-user">${users}</div></td>
          <td>${escapeHtml(lastSeenLabel)}</td>
          <td>${escapeHtml(group.ip || "—")}</td>
        </tr>`;
      }).join("")}</tbody>
    </table>
    <p class="admin-empty">以上为疑似关联，请人工复核后再决定是否处理；系统不会自动封禁账号。</p>`;
}

async function loadAdminDrafts() {
  const search = elements.adminResumeSearch.value.trim();
  elements.adminResumeStatus.hidden = false;
  elements.adminResumeStatus.textContent = "正在加载草稿…";
  try {
    const query = new URLSearchParams({ limit: "200", search });
    if (elements.adminResumeTemplate.value) query.set("template", elements.adminResumeTemplate.value);
    if (elements.adminResumeFrom.value) query.set("from", elements.adminResumeFrom.value);
    if (elements.adminResumeTo.value) query.set("to", elements.adminResumeTo.value);
    const payload = await readApiResponse(await fetch(`/api/admin/resumes?${query}`, { cache: "no-store" }));
    adminDrafts = payload.resumes || [];
    elements.adminResumeTotal.textContent = payload.total ? `${payload.total} 份草稿` : "";
    renderAdminDrafts();
    elements.adminResumeStatus.hidden = true;
  } catch (error) {
    elements.adminResumeStatus.textContent = error?.message || "加载草稿失败";
  }
}

function renderAdminDrafts() {
  if (!adminDrafts.length) {
    elements.adminResumeList.innerHTML = '<p class="admin-empty">没有符合条件的草稿。</p>';
    return;
  }
  elements.adminResumeList.innerHTML = `
    <table class="admin-table">
      <thead><tr><th>草稿</th><th>所属用户</th><th>模板</th><th>更新时间</th><th>操作</th></tr></thead>
      <tbody>${adminDrafts.map((draft) => {
        const updated = new Date(draft.updatedAt);
        const updatedLabel = Number.isNaN(updated.getTime()) ? "—" : updated.toLocaleString("zh-CN", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: false });
        return `<tr>
          <td><div class="admin-user"><strong>${escapeHtml(draft.candidateName)}</strong><small>${escapeHtml(draft.title)}</small></div></td>
          <td>${escapeHtml(draft.ownerIdentifier || draft.ownerId || "—")}</td>
          <td>${escapeHtml(draft.templateName)} · v${draft.templateVersion}</td>
          <td>${escapeHtml(updatedLabel)}</td>
          <td class="admin-table__ops">
            <button type="button" data-action="admin-download-draft" data-resume-id="${escapeHtml(draft.id)}">下载 JSON</button>
            ${hasAdminPermission("resumes.delete") ? `<button class="danger-link" type="button" data-action="admin-delete-draft" data-resume-id="${escapeHtml(draft.id)}" data-name="${escapeHtml(draft.candidateName)}">删除</button>` : ""}
          </td>
        </tr>`;
      }).join("")}</tbody>
    </table>`;
}

async function loadAdminOverview() {
  try {
    const stats = await readApiResponse(await fetch("/api/admin/overview", { cache: "no-store" }));
    renderAdminOverview(stats);
  } catch {
    elements.adminStats.innerHTML = "";
  }
  try {
    const metrics = await readApiResponse(await fetch("/api/admin/metrics?days=30", { cache: "no-store" }));
    renderAdminChart(metrics.days || []);
  } catch {
    elements.adminChart.hidden = true;
  }
}

function renderAdminChart(series) {
  if (!series || !series.length) {
    elements.adminChart.hidden = true;
    return;
  }
  const w = 920;
  const h = 220;
  const padL = 40;
  const padR = 16;
  const padT = 16;
  const padB = 26;
  const metricsKeys = [
    ["newUsers", "#3b82f6", "新增用户"],
    ["draftsCreated", "#10b981", "新建草稿"],
    ["exports", "#f59e0b", "导出"],
    ["aiOk", "#8b5cf6", "AI 成功"]
  ];
  const max = Math.max(1, ...series.map((d) => Math.max(d.newUsers || 0, d.draftsCreated || 0, d.exports || 0, d.aiOk || 0)));
  const x = (i) => padL + (series.length === 1 ? 0 : (i * (w - padL - padR) / (series.length - 1)));
  const y = (v) => padT + (h - padT - padB) * (1 - (v || 0) / max);
  const line = (key) => series.map((d, i) => `${x(i).toFixed(1)},${y(d[key]).toFixed(1)}`).join(" ");
  const grid = [0, 0.5, 1].map((t) => {
    const yy = (padT + (h - padT - padB) * (1 - t)).toFixed(1);
    return `<line x1="${padL}" y1="${yy}" x2="${w - padR}" y2="${yy}" stroke="#eef1f5" stroke-width="1"/>`;
  }).join("");
  const labelIndexes = [0, Math.floor((series.length - 1) / 2), series.length - 1];
  const labels = labelIndexes.map((i) => {
    const day = (series[i].day || "").slice(5);
    return `<text x="${x(i).toFixed(1)}" y="${h - 6}" fill="#8b96a6" font-size="10" text-anchor="middle">${escapeHtml(day)}</text>`;
  }).join("");
  const legend = metricsKeys.map(([, color, label]) => `<span class="chart-legend"><i style="background:${color}"></i>${label}</span>`).join("");
  elements.adminChart.innerHTML = `
    <div class="chart-title">近 ${series.length} 天趋势</div>
    <svg viewBox="0 0 ${w} ${h}" role="img" aria-label="运营趋势图" preserveAspectRatio="none">
      ${grid}
      ${metricsKeys.map(([key, color]) => `<polyline points="${line(key)}" fill="none" stroke="${color}" stroke-width="2" vector-effect="non-scaling-stroke"/>`).join("")}
      ${labels}
    </svg>
    <div class="chart-legend">${legend}</div>`;
  elements.adminChart.hidden = false;
}

function renderAdminOverview(stats) {
  const aiBadge = stats.aiEnabled
    ? '<span class="badge badge--active">已启用</span>'
    : '<span class="badge badge--disabled">未启用</span>';
  elements.adminStats.innerHTML = `
    <div class="admin-stat"><span class="admin-stat__value">${Number(stats.userCount ?? 0)}</span><span class="admin-stat__label">用户</span></div>
    <div class="admin-stat"><span class="admin-stat__value">${Number(stats.draftCount ?? 0)}</span><span class="admin-stat__label">草稿</span></div>
    <div class="admin-stat"><span class="admin-stat__value">${Number(stats.aiToday ?? 0)}</span><span class="admin-stat__label">今日 AI 调用</span></div>
    <div class="admin-stat"><span class="admin-stat__value">${Number(stats.aiTotal ?? 0)}</span><span class="admin-stat__label">累计 AI 调用</span></div>
    <div class="admin-stat admin-stat--status"><span class="admin-stat__value">${aiBadge}</span><span class="admin-stat__label">AI 状态${stats.aiConfigured ? " · 已配置 Key" : " · 未配置 Key"}</span></div>
  `;
}

async function loadAdminAiLogs() {
  const search = elements.adminAiLogSearch.value.trim();
  elements.adminAiLogStatus.hidden = false;
  elements.adminAiLogStatus.textContent = "正在加载 AI 调用记录…";
  try {
    const query = new URLSearchParams({ limit: "200", search });
    if (elements.adminAiLogStatusFilter.value) query.set("status", elements.adminAiLogStatusFilter.value);
    if (elements.adminAiLogFrom.value) query.set("from", elements.adminAiLogFrom.value);
    if (elements.adminAiLogTo.value) query.set("to", elements.adminAiLogTo.value);
    const payload = await readApiResponse(await fetch(`/api/admin/ai-logs?${query}`, { cache: "no-store" }));
    adminAiLogs = payload.logs || [];
    elements.adminAiLogTotal.textContent = payload.total ? `${payload.total} 条记录` : "";
    renderAdminAiLogs();
    elements.adminAiLogStatus.hidden = true;
  } catch (error) {
    elements.adminAiLogStatus.textContent = error?.message || "加载 AI 调用记录失败";
  }
}

function renderAdminAiLogs() {
  if (!adminAiLogs.length) {
    elements.adminAiLogList.innerHTML = '<p class="admin-empty">暂无 AI 调用记录。</p>';
    return;
  }
  const statusLabel = {
    ok: '<span class="badge badge--active">成功</span>',
    invalid_json: '<span class="badge badge--disabled">无效 JSON</span>',
    timeout: '<span class="badge badge--disabled">超时</span>',
    provider_error: '<span class="badge badge--disabled">服务异常</span>',
    rate_limited: '<span class="badge badge--disabled">上游限流</span>',
    blocked: '<span class="badge badge--disabled">已拦截</span>'
  };
  elements.adminAiLogList.innerHTML = `
    <table class="admin-table">
      <thead><tr><th>时间</th><th>用户</th><th>模型</th><th>状态</th><th>输入/输出</th><th>耗时</th><th>错误码</th></tr></thead>
      <tbody>${adminAiLogs.map((log) => {
        const time = new Date(log.createdAt);
        const timeLabel = Number.isNaN(time.getTime()) ? "—" : time.toLocaleString("zh-CN", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false });
        return `<tr>
          <td>${escapeHtml(timeLabel)}</td>
          <td>${escapeHtml(log.userIdentifier || log.userId || "—")}</td>
          <td>${escapeHtml(log.model || "—")}</td>
          <td>${statusLabel[log.status] || escapeHtml(log.status)}</td>
          <td>${Number(log.inputChars ?? 0)} / ${Number(log.outputChars ?? 0)}</td>
          <td>${Number(log.latencyMs ?? 0)} ms</td>
          <td>${escapeHtml(log.errorCode || "—")}</td>
        </tr>`;
      }).join("")}</tbody>
    </table>`;
}

async function adminToggleAdmin(target) {
  const userId = target.dataset.userId;
  const next = target.dataset.isAdmin !== "true";
  if (!(await confirmAction({ title: "变更管理员权限", message: next ? "确定将该用户设为管理员？" : "确定取消该用户的管理员权限？" }))) return;
  try {
    await readApiResponse(await fetch(`/api/admin/users/${encodeURIComponent(userId)}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isAdmin: next })
    }));
    showToast("已更新角色", "success");
    await loadAdminUsers();
  } catch (error) {
    showToast(error?.message || "操作失败", "warning");
  }
}

async function adminToggleDisabled(target) {
  const userId = target.dataset.userId;
  const next = target.dataset.disabled !== "true";
  if (!(await confirmAction({ title: next ? "禁用用户" : "启用用户", message: next ? "禁用后其会话将立即失效。" : "确定启用该用户？", danger: next }))) return;
  try {
    await readApiResponse(await fetch(`/api/admin/users/${encodeURIComponent(userId)}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ disabled: next })
    }));
    showToast(next ? "用户已禁用" : "用户已启用", "success");
    await loadAdminUsers();
  } catch (error) {
    showToast(error?.message || "操作失败", "warning");
  }
}

async function adminDeleteUser(target) {
  const userId = target.dataset.userId;
  const account = target.dataset.account;
  if (!(await confirmAction({ title: "删除用户", message: `确定删除用户「${account}」？该用户的草稿也会一并删除，且无法恢复。`, confirmLabel: "删除", danger: true }))) return;
  try {
    await readApiResponse(await fetch(`/api/admin/users/${encodeURIComponent(userId)}`, { method: "DELETE" }));
    showToast("用户已删除", "success");
    await Promise.all([loadAdminUsers(), loadAdminDrafts()]);
  } catch (error) {
    showToast(error?.message || "删除失败", "warning");
  }
}

async function adminDeleteDraft(target) {
  const id = target.dataset.resumeId;
  const name = target.dataset.name;
  if (!(await confirmAction({ title: "删除草稿", message: `确定删除草稿「${name}」？删除后无法恢复。`, confirmLabel: "删除", danger: true }))) return;
  try {
    const response = await fetch(`/api/admin/resumes/${encodeURIComponent(id)}`, { method: "DELETE" });
    if (!response.ok) await readApiResponse(response);
    showToast("草稿已删除", "success");
    await loadAdminDrafts();
  } catch (error) {
    showToast(error?.message || "删除失败", "warning");
  }
}

async function adminDownloadDraft(id) {
  try {
    const payload = await readApiResponse(await fetch(`/api/admin/resumes/${encodeURIComponent(id)}`, { cache: "no-store" }));
    const blob = new Blob([JSON.stringify(payload.resume, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `draft-${id}.json`;
    document.body.append(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
  } catch (error) {
    showToast(error?.message || "下载失败", "warning");
  }
}

async function adminSetRole(select) {
  const userId = select.dataset.userId;
  const role = select.value;
  const label = { operator: "运营", auditor: "审计" }[role] || role;
  if (!(await confirmAction({ title: "变更用户角色", message: `确定将该用户角色设为「${label}」？` }))) {
    select.value = ["operator", "auditor"].includes(select.dataset.currentRole) ? select.dataset.currentRole : "operator";
    return;
  }
  try {
    await readApiResponse(await fetch(`/api/admin/users/${encodeURIComponent(userId)}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ role })
    }));
    showToast("角色已更新", "success");
    await loadAdminUsers();
  } catch (error) {
    showToast(error?.message || "操作失败", "warning");
    await loadAdminUsers();
  }
}

async function adminSetAiLimit(input) {
  const userId = input.dataset.userId;
  const value = Number(input.value);
  if (!Number.isSafeInteger(value) || value < 1 || value > 10000) {
    showToast("请输入 1–10000 之间的整数", "warning");
    await loadAdminUsers();
    return;
  }
  try {
    await readApiResponse(await fetch(`/api/admin/users/${encodeURIComponent(userId)}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ aiDailyLimit: value })
    }));
    showToast("AI 日限额已更新", "success");
  } catch (error) {
    showToast(error?.message || "操作失败", "warning");
  }
  await loadAdminUsers();
}

async function adminRevokeSessions(target) {
  const userId = target.dataset.userId;
  if (!(await confirmAction({ title: "踢下线用户", message: "确定踢下线该用户？其所有会话将立即失效。", confirmLabel: "踢下线", danger: true }))) return;
  try {
    await readApiResponse(await fetch(`/api/admin/users/${encodeURIComponent(userId)}/revoke-sessions`, { method: "POST" }));
    showToast("已踢下线", "success");
  } catch (error) {
    showToast(error?.message || "操作失败", "warning");
  }
}

async function loadAdminAuditLogs() {
  const search = elements.adminAuditSearch.value.trim();
  elements.adminAuditStatus.hidden = false;
  elements.adminAuditStatus.textContent = "正在加载审计记录…";
  try {
    const query = new URLSearchParams({ limit: "200", search });
    if (elements.adminAuditAction.value) query.set("action", elements.adminAuditAction.value);
    if (elements.adminAuditFrom.value) query.set("from", elements.adminAuditFrom.value);
    if (elements.adminAuditTo.value) query.set("to", elements.adminAuditTo.value);
    const payload = await readApiResponse(await fetch(`/api/admin/audit-logs?${query}`, { cache: "no-store" }));
    adminAuditLogs = payload.logs || [];
    elements.adminAuditTotal.textContent = payload.total ? `${payload.total} 条记录` : "";
    renderAdminAuditLogs();
    elements.adminAuditStatus.hidden = true;
  } catch (error) {
    elements.adminAuditStatus.textContent = error?.message || "加载审计记录失败";
  }
}

function renderAdminAuditLogs() {
  if (!adminAuditLogs.length) {
    elements.adminAuditList.innerHTML = '<p class="admin-empty">暂无审计记录。</p>';
    return;
  }
  elements.adminAuditList.innerHTML = `
    <table class="admin-table">
      <thead><tr><th>时间</th><th>操作人</th><th>动作</th><th>对象类型</th><th>对象 ID</th><th>IP</th></tr></thead>
      <tbody>${adminAuditLogs.map((log) => {
        const time = new Date(log.createdAt);
        const timeLabel = Number.isNaN(time.getTime()) ? "—" : time.toLocaleString("zh-CN", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false });
        return `<tr>
          <td>${escapeHtml(timeLabel)}</td>
          <td>${escapeHtml(log.actorIdentifier || log.actorId || "系统")}</td>
          <td>${escapeHtml(log.action)}</td>
          <td>${escapeHtml(log.targetType)}</td>
          <td>${escapeHtml(log.targetId || "—")}</td>
          <td>${escapeHtml(log.ip || "—")}</td>
        </tr>`;
      }).join("")}</tbody>
    </table>`;
}

async function loadAdminRecycle() {
  const search = elements.adminRecycleSearch.value.trim();
  elements.adminRecycleStatus.hidden = false;
  elements.adminRecycleStatus.textContent = "正在加载回收站…";
  try {
    const query = new URLSearchParams({ limit: "200", search });
    if (elements.adminRecycleFrom.value) query.set("from", elements.adminRecycleFrom.value);
    if (elements.adminRecycleTo.value) query.set("to", elements.adminRecycleTo.value);
    const payload = await readApiResponse(await fetch(`/api/admin/recycle?${query}`, { cache: "no-store" }));
    adminRecycle = { users: payload.users || [], resumes: payload.resumes || [] };
    elements.adminRecycleTotal.textContent = `${Number(payload.userTotal ?? 0)} 位用户 · ${Number(payload.resumeTotal ?? 0)} 份草稿`;
    renderAdminRecycleUsers();
    renderAdminRecycleResumes();
    elements.adminRecycleStatus.hidden = true;
  } catch (error) {
    elements.adminRecycleStatus.textContent = error?.message || "加载回收站失败";
  }
}

function renderAdminRecycleUsers() {
  const canRestore = hasAdminPermission("recycle.restore");
  const canPurge = hasAdminPermission("recycle.purge");
  if (!adminRecycle.users.length) {
    elements.adminRecycleUserList.innerHTML = '<p class="admin-empty">回收站中没有用户。</p>';
    return;
  }
  elements.adminRecycleUserList.innerHTML = `
    <table class="admin-table">
      <thead><tr><th>用户</th><th>角色</th><th>删除时间</th><th>操作</th></tr></thead>
      <tbody>${adminRecycle.users.map((user) => {
        const deleted = new Date(user.deletedAt);
        const deletedLabel = Number.isNaN(deleted.getTime()) ? "—" : deleted.toLocaleString("zh-CN", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: false });
        const ops = [];
        if (canRestore) ops.push(`<button type="button" data-action="admin-restore-user" data-user-id="${escapeHtml(user.id)}">恢复</button>`);
        if (canPurge) ops.push(`<button class="danger-link" type="button" data-action="admin-purge-user" data-user-id="${escapeHtml(user.id)}" data-account="${escapeHtml(user.email || user.phone)}">彻底删除</button>`);
        return `<tr>
          <td><div class="admin-user"><strong>${escapeHtml(user.displayName || "未命名")}</strong><small>${escapeHtml(user.email || user.phone || "—")}</small></div></td>
          <td>${adminRoleBadge(user)}</td>
          <td>${escapeHtml(deletedLabel)}</td>
          <td class="admin-table__ops">${ops.join("") || '<span class="admin-self">—</span>'}</td>
        </tr>`;
      }).join("")}</tbody>
    </table>`;
}

function renderAdminRecycleResumes() {
  const canRestore = hasAdminPermission("recycle.restore");
  const canPurge = hasAdminPermission("recycle.purge");
  if (!adminRecycle.resumes.length) {
    elements.adminRecycleResumeList.innerHTML = '<p class="admin-empty">回收站中没有草稿。</p>';
    return;
  }
  elements.adminRecycleResumeList.innerHTML = `
    <table class="admin-table">
      <thead><tr><th>草稿</th><th>所属用户</th><th>模板</th><th>删除时间</th><th>操作</th></tr></thead>
      <tbody>${adminRecycle.resumes.map((draft) => {
        const deleted = new Date(draft.deletedAt);
        const deletedLabel = Number.isNaN(deleted.getTime()) ? "—" : deleted.toLocaleString("zh-CN", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: false });
        const ops = [];
        if (canRestore) ops.push(`<button type="button" data-action="admin-restore-resume" data-resume-id="${escapeHtml(draft.id)}">恢复</button>`);
        if (canPurge) ops.push(`<button class="danger-link" type="button" data-action="admin-purge-resume" data-resume-id="${escapeHtml(draft.id)}" data-name="${escapeHtml(draft.candidateName)}">彻底删除</button>`);
        return `<tr>
          <td><div class="admin-user"><strong>${escapeHtml(draft.candidateName)}</strong><small>${escapeHtml(draft.title)}</small></div></td>
          <td>${escapeHtml(draft.ownerIdentifier || draft.ownerId || "—")}</td>
          <td>${escapeHtml(draft.templateName)} · v${draft.templateVersion}</td>
          <td>${escapeHtml(deletedLabel)}</td>
          <td class="admin-table__ops">${ops.join("") || '<span class="admin-self">—</span>'}</td>
        </tr>`;
      }).join("")}</tbody>
    </table>`;
}

async function adminRestoreUser(target) {
  const userId = target.dataset.userId;
  try {
    await readApiResponse(await fetch(`/api/admin/recycle/users/${encodeURIComponent(userId)}/restore`, { method: "POST" }));
    showToast("用户已恢复", "success");
    await Promise.all([loadAdminRecycle(), loadAdminUsers()]);
  } catch (error) {
    showToast(error?.message || "恢复失败", "warning");
  }
}

async function adminPurgeUser(target) {
  const userId = target.dataset.userId;
  const account = target.dataset.account;
  if (!(await confirmAction({ title: "彻底删除用户", message: `确定彻底删除用户「${account}」？该用户及其全部草稿将永久删除，无法恢复。`, confirmLabel: "彻底删除", danger: true }))) return;
  try {
    const response = await fetch(`/api/admin/recycle/users/${encodeURIComponent(userId)}`, { method: "DELETE" });
    if (!response.ok) await readApiResponse(response);
    showToast("用户已彻底删除", "success");
    await loadAdminRecycle();
  } catch (error) {
    showToast(error?.message || "彻底删除失败", "warning");
  }
}

async function adminRestoreResume(target) {
  const id = target.dataset.resumeId;
  try {
    await readApiResponse(await fetch(`/api/admin/recycle/resumes/${encodeURIComponent(id)}/restore`, { method: "POST" }));
    showToast("草稿已恢复", "success");
    await Promise.all([loadAdminRecycle(), loadAdminDrafts()]);
  } catch (error) {
    showToast(error?.message || "恢复失败", "warning");
  }
}

async function adminPurgeResume(target) {
  const id = target.dataset.resumeId;
  const name = target.dataset.name;
  if (!(await confirmAction({ title: "彻底删除草稿", message: `确定彻底删除草稿「${name}」？删除后无法恢复。`, confirmLabel: "彻底删除", danger: true }))) return;
  try {
    const response = await fetch(`/api/admin/recycle/resumes/${encodeURIComponent(id)}`, { method: "DELETE" });
    if (!response.ok) await readApiResponse(response);
    showToast("草稿已彻底删除", "success");
    await loadAdminRecycle();
  } catch (error) {
    showToast(error?.message || "彻底删除失败", "warning");
  }
}

// —— 公告管理 ——

async function loadAdminAnnouncements() {
  const search = elements.adminAnnouncementSearch.value.trim();
  elements.adminAnnouncementLoadStatus.hidden = false;
  elements.adminAnnouncementLoadStatus.textContent = "正在加载公告…";
  try {
    const query = new URLSearchParams({ limit: "200", search });
    if (elements.adminAnnouncementFilter.value) query.set("status", elements.adminAnnouncementFilter.value);
    const payload = await readApiResponse(await fetch(`/api/admin/announcements?${query}`, { cache: "no-store" }));
    adminAnnouncements = payload.announcements || [];
    elements.adminAnnouncementTotal.textContent = payload.total ? `${payload.total} 条公告` : "";
    renderAdminAnnouncements();
    elements.adminAnnouncementLoadStatus.hidden = true;
  } catch (error) {
    elements.adminAnnouncementLoadStatus.textContent = error?.message || "加载公告失败";
  }
}

function renderAdminAnnouncements() {
  const canWrite = hasAdminPermission("announcements.write");
  if (!adminAnnouncements.length) {
    elements.adminAnnouncementList.innerHTML = '<p class="admin-empty">暂无公告。</p>';
    return;
  }
  const statusBadge = {
    draft: '<span class="badge">草稿</span>',
    published: '<span class="badge badge--active">已发布</span>',
    archived: '<span class="badge badge--disabled">已归档</span>'
  };
  elements.adminAnnouncementList.innerHTML = `
    <table class="admin-table">
      <thead><tr><th>标题</th><th>内容</th><th>状态</th><th>更新时间</th><th>操作</th></tr></thead>
      <tbody>${adminAnnouncements.map((a) => {
        const updated = new Date(a.updatedAt);
        const updatedLabel = Number.isNaN(updated.getTime()) ? "—" : updated.toLocaleString("zh-CN", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: false });
        const ops = [];
        if (canWrite) {
          ops.push(`<button type="button" data-action="admin-edit-announcement" data-announcement-id="${escapeHtml(a.id)}">编辑</button>`);
          ops.push(`<button type="button" data-action="admin-toggle-announcement" data-announcement-id="${escapeHtml(a.id)}" data-status="${escapeHtml(a.status)}">${a.status === "published" ? "下线" : "发布"}</button>`);
          ops.push(`<button class="danger-link" type="button" data-action="admin-delete-announcement" data-announcement-id="${escapeHtml(a.id)}">删除</button>`);
        }
        return `<tr>
          <td><strong>${escapeHtml(a.title)}</strong></td>
          <td>${escapeHtml((a.content || "").slice(0, 60))}</td>
          <td>${statusBadge[a.status] || escapeHtml(a.status)}</td>
          <td>${escapeHtml(updatedLabel)}</td>
          <td class="admin-table__ops">${ops.join("") || '<span class="admin-self">—</span>'}</td>
        </tr>`;
      }).join("")}</tbody>
    </table>`;
}

function openAnnouncementForm(announcement) {
  elements.adminAnnouncementId.value = announcement?.id || "";
  elements.adminAnnouncementTitle.value = announcement?.title || "";
  elements.adminAnnouncementContent.value = announcement?.content || "";
  elements.adminAnnouncementStatus.value = announcement?.status || "draft";
  elements.adminAnnouncementForm.hidden = false;
}

function cancelAnnouncementForm() {
  elements.adminAnnouncementForm.hidden = true;
  elements.adminAnnouncementId.value = "";
}

async function saveAnnouncement(event) {
  event.preventDefault();
  const id = elements.adminAnnouncementId.value;
  const title = elements.adminAnnouncementTitle.value.trim();
  if (!title) {
    showToast("标题不能为空", "warning");
    return;
  }
  const body = {
    title,
    content: elements.adminAnnouncementContent.value.trim(),
    status: elements.adminAnnouncementStatus.value
  };
  try {
    if (id) {
      await readApiResponse(await fetch(`/api/admin/announcements/${encodeURIComponent(id)}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body)
      }));
    } else {
      await readApiResponse(await fetch("/api/admin/announcements", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body)
      }));
    }
    showToast(id ? "公告已更新" : "公告已创建", "success");
    cancelAnnouncementForm();
    await loadAdminAnnouncements();
  } catch (error) {
    showToast(error?.message || "保存失败", "warning");
  }
}

async function adminToggleAnnouncement(target) {
  const id = target.dataset.announcementId;
  const next = target.dataset.status === "published" ? "draft" : "published";
  try {
    await readApiResponse(await fetch(`/api/admin/announcements/${encodeURIComponent(id)}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status: next })
    }));
    showToast(next === "published" ? "公告已发布" : "公告已下线", "success");
    await loadAdminAnnouncements();
  } catch (error) {
    showToast(error?.message || "操作失败", "warning");
  }
}

async function adminDeleteAnnouncement(target) {
  const id = target.dataset.announcementId;
  if (!(await confirmAction({ title: "删除公告", message: "确定删除该公告？", confirmLabel: "删除", danger: true }))) return;
  try {
    const response = await fetch(`/api/admin/announcements/${encodeURIComponent(id)}`, { method: "DELETE" });
    if (!response.ok) await readApiResponse(response);
    showToast("公告已删除", "success");
    await loadAdminAnnouncements();
  } catch (error) {
    showToast(error?.message || "删除失败", "warning");
  }
}

// —— 反馈工单 ——

async function loadAdminFeedbacks() {
  const search = elements.adminFeedbackSearch.value.trim();
  elements.adminFeedbackStatus.hidden = false;
  elements.adminFeedbackStatus.textContent = "正在加载反馈…";
  try {
    const query = new URLSearchParams({ limit: "200", search });
    if (elements.adminFeedbackFilter.value) query.set("status", elements.adminFeedbackFilter.value);
    const payload = await readApiResponse(await fetch(`/api/admin/feedbacks?${query}`, { cache: "no-store" }));
    adminFeedbacks = payload.feedbacks || [];
    elements.adminFeedbackTotal.textContent = payload.total ? `${payload.total} 条反馈` : "";
    renderAdminFeedbacks();
    elements.adminFeedbackStatus.hidden = true;
  } catch (error) {
    elements.adminFeedbackStatus.textContent = error?.message || "加载反馈失败";
  }
}

function renderAdminFeedbacks() {
  const canWrite = hasAdminPermission("feedback.write");
  if (!adminFeedbacks.length) {
    elements.adminFeedbackList.innerHTML = '<p class="admin-empty">暂无反馈。</p>';
    return;
  }
  const typeLabel = { bug: "问题", suggestion: "建议", question: "咨询", other: "其他" };
  const statusLabel = {
    open: '<span class="badge">待处理</span>',
    in_progress: '<span class="badge badge--admin">处理中</span>',
    resolved: '<span class="badge badge--active">已解决</span>',
    closed: '<span class="badge badge--disabled">已关闭</span>'
  };
  elements.adminFeedbackList.innerHTML = `
    <table class="admin-table">
      <thead><tr><th>时间</th><th>用户</th><th>类型</th><th>状态</th><th>操作</th></tr></thead>
      <tbody>${adminFeedbacks.map((f) => {
        const time = new Date(f.createdAt);
        const timeLabel = Number.isNaN(time.getTime()) ? "—" : time.toLocaleString("zh-CN", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: false });
        return `<tr>
          <td>${escapeHtml(timeLabel)}</td>
          <td>${escapeHtml(f.userIdentifier || f.userId || "—")}</td>
          <td>${escapeHtml(typeLabel[f.type] || f.type)}</td>
          <td>${statusLabel[f.status] || escapeHtml(f.status)}</td>
          <td class="admin-table__ops">
            <button type="button" data-action="view-feedback" data-feedback-id="${escapeHtml(f.id)}">查看</button>
            ${canWrite ? `<button type="button" data-action="admin-reply-feedback" data-feedback-id="${escapeHtml(f.id)}" data-status="${escapeHtml(f.status)}" data-reply="${escapeHtml(f.reply)}">回复</button>` : ""}
          </td>
        </tr>`;
      }).join("")}</tbody>
    </table>`;
}

function openFeedbackDetail(feedback) {
  const typeLabel = { bug: "问题", suggestion: "建议", question: "咨询", other: "其他" };
  const statusLabel = { open: "待处理", in_progress: "处理中", resolved: "已解决", closed: "已关闭" };
  const time = new Date(feedback.createdAt);
  const timeLabel = Number.isNaN(time.getTime()) ? "—" : time.toLocaleString("zh-CN", { year: "numeric", month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: false });
  elements.feedbackDetailBody.innerHTML = `
    <div class="feedback-detail__row"><span>类型</span><strong>${escapeHtml(typeLabel[feedback.type] || feedback.type || "—")}</strong></div>
    <div class="feedback-detail__row"><span>状态</span><strong>${escapeHtml(statusLabel[feedback.status] || feedback.status || "—")}</strong></div>
    <div class="feedback-detail__row"><span>用户</span><strong>${escapeHtml(feedback.userIdentifier || feedback.userId || "—")}</strong></div>
    <div class="feedback-detail__row"><span>提交时间</span><strong>${escapeHtml(timeLabel)}</strong></div>
    <div class="feedback-detail__block"><span>反馈内容</span><p>${escapeHtml(feedback.content || "—")}</p></div>
    <div class="feedback-detail__block"><span>回复</span><p>${escapeHtml(feedback.reply || "暂无回复")}</p></div>`;
  elements.feedbackDetailOverlay.hidden = false;
}

function closeFeedbackDetail() {
  elements.feedbackDetailOverlay.hidden = true;
}

function viewFeedback(target) {
  const feedback = adminFeedbacks.find((f) => f.id === target.dataset.feedbackId);
  if (feedback) openFeedbackDetail(feedback);
}

function openFeedbackReply(target) {
  elements.adminFeedbackReplyId.value = target.dataset.feedbackId;
  elements.adminFeedbackReplyStatus.value = target.dataset.status;
  elements.adminFeedbackReplyText.value = target.dataset.reply || "";
  elements.adminFeedbackReplyForm.hidden = false;
  elements.adminFeedbackReplyText.focus();
}

function cancelFeedbackReply() {
  elements.adminFeedbackReplyForm.hidden = true;
  elements.adminFeedbackReplyId.value = "";
}

async function saveFeedbackReply(event) {
  event.preventDefault();
  const id = elements.adminFeedbackReplyId.value;
  try {
    await readApiResponse(await fetch(`/api/admin/feedbacks/${encodeURIComponent(id)}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: elements.adminFeedbackReplyStatus.value, reply: elements.adminFeedbackReplyText.value.trim() })
    }));
    showToast("反馈已更新", "success");
    cancelFeedbackReply();
    await loadAdminFeedbacks();
  } catch (error) {
    showToast(error?.message || "保存失败", "warning");
  }
}

// —— 模板管理 ——

async function loadAdminTemplates() {
  const search = elements.adminTemplateSearch.value.trim();
  elements.adminTemplateStatus.hidden = false;
  elements.adminTemplateStatus.textContent = "正在加载模板…";
  try {
    const payload = await readApiResponse(await fetch("/api/admin/templates", { cache: "no-store" }));
    let templates = payload.templates || [];
    if (search) {
      const needle = search.toLowerCase();
      templates = templates.filter((t) => (t.name || "").toLowerCase().includes(needle) || (t.category || "").toLowerCase().includes(needle));
    }
    adminTemplates = templates;
    elements.adminTemplateTotal.textContent = `${templates.length} 个模板`;
    renderAdminTemplates();
    elements.adminTemplateStatus.hidden = true;
  } catch (error) {
    elements.adminTemplateStatus.textContent = error?.message || "加载模板失败";
  }
}

function renderAdminTemplates() {
  const canWrite = hasAdminPermission("templates.write");
  if (!adminTemplates.length) {
    elements.adminTemplateList.innerHTML = '<p class="admin-empty">暂无模板。</p>';
    return;
  }
  const statusLabel = {
    ready: '<span class="badge badge--active">已发布</span>',
    needs_mapping: '<span class="badge">待标注</span>',
    needs_qa: '<span class="badge badge--admin">待验收</span>',
    blocked: '<span class="badge badge--disabled">已下架</span>'
  };
  elements.adminTemplateList.innerHTML = `
    <table class="admin-table">
      <thead><tr><th>模板</th><th>分类</th><th>版本</th><th>引擎</th><th>状态</th><th>许可证</th><th>操作</th></tr></thead>
      <tbody>${adminTemplates.map((t) => {
        const ops = [];
        if (canWrite) {
          if (t.status !== "ready") ops.push(`<button type="button" data-action="admin-template-status" data-slug="${escapeHtml(t.slug)}" data-version="${t.version}" data-status="ready">发布</button>`);
          if (t.status !== "blocked") ops.push(`<button type="button" data-action="admin-template-status" data-slug="${escapeHtml(t.slug)}" data-version="${t.version}" data-status="blocked">下架</button>`);
        }
        return `<tr>
          <td><strong>${escapeHtml(t.name)}</strong><small class="admin-user small">${escapeHtml(t.slug)}</small></td>
          <td>${escapeHtml(t.category || "—")}</td>
          <td>v${t.version}</td>
          <td>${escapeHtml(t.engine || "—")}</td>
          <td>${statusLabel[t.status] || escapeHtml(t.status)}</td>
          <td>${escapeHtml(t.licenseStatus || "—")}</td>
          <td class="admin-table__ops">${ops.join("") || '<span class="admin-self">—</span>'}</td>
        </tr>`;
      }).join("")}</tbody>
    </table>`;
}

async function adminTemplateStatus(target) {
  const { slug, version, status } = target.dataset;
  try {
    await readApiResponse(await fetch(`/api/admin/templates/${encodeURIComponent(slug)}/versions/${version}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status })
    }));
    showToast("模板状态已更新", "success");
    await loadAdminTemplates();
  } catch (error) {
    showToast(error?.message || "操作失败", "warning");
  }
}

// —— AI 成本 ——

async function loadAdminCosts() {
  elements.adminCostStatus.hidden = false;
  elements.adminCostStatus.textContent = "正在加载 AI 成本…";
  try {
    const days = elements.adminCostDays.value || "30";
    const payload = await readApiResponse(await fetch(`/api/admin/ai-costs?days=${days}`, { cache: "no-store" }));
    adminCosts = { days: payload.days || [], byModel: payload.byModel || [] };
    renderAdminCosts();
    elements.adminCostStatus.hidden = true;
  } catch (error) {
    elements.adminCostStatus.textContent = error?.message || "加载 AI 成本失败";
  }
}

function renderAdminCosts() {
  const totalInput = adminCosts.byModel.reduce((sum, m) => sum + (m.inputChars || 0), 0);
  const totalOutput = adminCosts.byModel.reduce((sum, m) => sum + (m.outputChars || 0), 0);
  const totalCalls = adminCosts.byModel.reduce((sum, m) => sum + (m.calls || 0), 0);
  elements.adminCostTotal.textContent = `输入 ${totalInput.toLocaleString()} 字符 · 输出 ${totalOutput.toLocaleString()} 字符 · ${totalCalls} 次调用`;

  if (!adminCosts.byModel.length) {
    elements.adminCostModelList.innerHTML = '<p class="admin-empty">暂无 AI 用量数据。</p>';
    elements.adminCostList.innerHTML = "";
    return;
  }
  elements.adminCostModelList.innerHTML = `
    <table class="admin-table">
      <thead><tr><th>模型</th><th>输入字符</th><th>输出字符</th><th>估算 Token（输入+输出）</th><th>调用次数</th></tr></thead>
      <tbody>${adminCosts.byModel.map((m) => `<tr>
        <td>${escapeHtml(m.model)}</td>
        <td>${Number(m.inputChars || 0).toLocaleString()}</td>
        <td>${Number(m.outputChars || 0).toLocaleString()}</td>
        <td>${Number((m.inputChars || 0) + (m.outputChars || 0)).toLocaleString()}</td>
        <td>${Number(m.calls || 0)}</td>
      </tr>`).join("")}</tbody>
    </table>`;
  elements.adminCostList.innerHTML = `
    <table class="admin-table">
      <thead><tr><th>日期</th><th>模型</th><th>输入字符</th><th>输出字符</th><th>调用次数</th></tr></thead>
      <tbody>${adminCosts.days.map((d) => `<tr>
        <td>${escapeHtml(d.day)}</td>
        <td>${escapeHtml(d.model)}</td>
        <td>${Number(d.inputChars || 0).toLocaleString()}</td>
        <td>${Number(d.outputChars || 0).toLocaleString()}</td>
        <td>${Number(d.calls || 0)}</td>
      </tr>`).join("")}</tbody>
    </table>`;
}

// —— CSV 导出 ——

function adminExportCsv(target) {
  const kind = target.dataset.csv;
  const paths = { users: "/api/admin/users", resumes: "/api/admin/resumes", "ai-logs": "/api/admin/ai-logs", audit: "/api/admin/audit-logs" };
  const base = paths[kind];
  if (!base) return;
  const query = new URLSearchParams({ format: "csv", limit: "10000" });
  if (kind === "users") {
    query.set("search", elements.adminUserSearch.value.trim());
    if (elements.adminUserRole.value) query.set("role", elements.adminUserRole.value);
    if (elements.adminUserStatus.value) query.set("status", elements.adminUserStatus.value);
    if (elements.adminUserFrom.value) query.set("from", elements.adminUserFrom.value);
    if (elements.adminUserTo.value) query.set("to", elements.adminUserTo.value);
  } else if (kind === "resumes") {
    query.set("search", elements.adminResumeSearch.value.trim());
    if (elements.adminResumeTemplate.value) query.set("template", elements.adminResumeTemplate.value);
    if (elements.adminResumeFrom.value) query.set("from", elements.adminResumeFrom.value);
    if (elements.adminResumeTo.value) query.set("to", elements.adminResumeTo.value);
  } else if (kind === "ai-logs") {
    query.set("search", elements.adminAiLogSearch.value.trim());
    if (elements.adminAiLogStatusFilter.value) query.set("status", elements.adminAiLogStatusFilter.value);
    if (elements.adminAiLogFrom.value) query.set("from", elements.adminAiLogFrom.value);
    if (elements.adminAiLogTo.value) query.set("to", elements.adminAiLogTo.value);
  } else if (kind === "audit") {
    query.set("search", elements.adminAuditSearch.value.trim());
    if (elements.adminAuditAction.value) query.set("action", elements.adminAuditAction.value);
    if (elements.adminAuditFrom.value) query.set("from", elements.adminAuditFrom.value);
    if (elements.adminAuditTo.value) query.set("to", elements.adminAuditTo.value);
  }
  window.location.href = `${base}?${query}`;
}

// —— 用户反馈（普通用户入口） ——

function openFeedback() {
  if (!currentUser) {
    openLogin(window.location.pathname || "/");
    return;
  }
  closeAllAccountMenus();
  elements.feedbackError.hidden = true;
  elements.feedbackContent.value = "";
  elements.feedbackOverlay.hidden = false;
}

function closeFeedback() {
  elements.feedbackOverlay.hidden = true;
}

async function submitFeedback(event) {
  event.preventDefault();
  const content = elements.feedbackContent.value.trim();
  if (!content) {
    elements.feedbackError.textContent = "请填写反馈内容";
    elements.feedbackError.hidden = false;
    return;
  }
  try {
    await readApiResponse(await fetch("/api/feedback", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: elements.feedbackType.value, content })
    }));
    elements.feedbackContent.value = "";
    closeFeedback();
    showToast("反馈已提交，感谢！", "success");
  } catch (error) {
    elements.feedbackError.textContent = error?.message || "提交失败";
    elements.feedbackError.hidden = false;
  }
}

// —— 站内信 ——

function openMessages() {
  if (!currentUser) {
    openLogin(window.location.pathname || "/");
    return;
  }
  closeAllAccountMenus();
  elements.messagesOverlay.hidden = false;
  loadMessages();
}

function closeMessages() {
  elements.messagesOverlay.hidden = true;
}

async function loadMessages() {
  elements.messagesStatus.textContent = "正在加载…";
  try {
    const payload = await readApiResponse(await fetch("/api/me/messages", { cache: "no-store" }));
    renderMessages(payload.messages || []);
    elements.messagesStatus.textContent = "";
  } catch (error) {
    elements.messagesStatus.textContent = error?.message || "加载失败";
  }
}

function renderMessages(list) {
  if (!list.length) {
    elements.messagesList.innerHTML = '<p class="admin-empty">暂无站内信。</p>';
    return;
  }
  elements.messagesList.innerHTML = list.map((m) => {
    const time = new Date(m.createdAt);
    const timeLabel = Number.isNaN(time.getTime()) ? "—" : time.toLocaleString("zh-CN", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: false });
    return `<article class="message-item${m.readAt ? "" : " is-unread"}">
      <div class="message-item__head"><strong>${escapeHtml(m.title)}</strong><small>${escapeHtml(timeLabel)}</small></div>
      <p>${escapeHtml(m.content)}</p>
      ${m.readAt ? "" : `<button type="button" data-action="message-mark-read" data-message-id="${escapeHtml(m.id)}">标记已读</button>`}
    </article>`;
  }).join("");
}

async function markMessageRead(target) {
  const id = target.dataset.messageId;
  try {
    await readApiResponse(await fetch(`/api/me/messages/${encodeURIComponent(id)}/read`, { method: "POST" }));
    await loadMessages();
    await refreshUnreadCount();
  } catch {
    // 忽略
  }
}

function applyUnreadBadges(unread) {
  const count = Number(unread) || 0;
  document.querySelectorAll("[data-msg-badge]").forEach((node) => {
    node.hidden = count === 0;
    node.textContent = String(count);
  });
  document.querySelectorAll("[data-account-unread]").forEach((node) => {
    node.hidden = count === 0;
    node.textContent = count > 99 ? "99+" : String(count);
  });
}

async function refreshUnreadCount() {
  if (!currentUser) {
    applyUnreadBadges(0);
    return;
  }
  try {
    const payload = await readApiResponse(await fetch("/api/me/messages", { cache: "no-store" }));
    applyUnreadBadges(payload.unread || 0);
  } catch {
    // 忽略
  }
}

// —— 首页公告 banner ——

async function loadAnnouncementBanner() {
  try {
    const payload = await readApiResponse(await fetch("/api/announcements", { cache: "no-store" }));
    renderAnnouncementBanner((payload.announcements || [])[0]);
  } catch {
    // 忽略
  }
}

function renderAnnouncementBanner(announcement) {
  let banner = document.querySelector("#announcementBanner");
  if (!banner) {
    banner = document.createElement("div");
    banner.id = "announcementBanner";
    banner.className = "announcement-banner";
    const homeMain = document.querySelector(".home-main");
    if (homeMain) homeMain.prepend(banner);
    else return;
  }
  if (!announcement || localStorage.getItem("dismissedBanner") === announcement.id) {
    banner.hidden = true;
    return;
  }
  banner.hidden = false;
  banner.innerHTML = `<div class="announcement-banner__body"><strong>${escapeHtml(announcement.title)}</strong><span>${escapeHtml(announcement.content)}</span></div><button type="button" data-action="dismiss-banner" data-banner-id="${escapeHtml(announcement.id)}" aria-label="关闭">×</button>`;
}

// —— 账户下拉注入反馈/站内信入口，填充草稿模板筛选 ——

function injectAccountItems() {
  document.querySelectorAll("[data-account-dropdown]").forEach((dropdown) => {
    if (dropdown.querySelector("[data-action='open-feedback']")) return;
    const settings = dropdown.querySelector("[data-action='open-settings']");
    if (!settings) return;
    const feedbackBtn = document.createElement("button");
    feedbackBtn.className = "account-dropdown__item";
    feedbackBtn.type = "button";
    feedbackBtn.dataset.action = "open-feedback";
    feedbackBtn.textContent = "意见反馈";
    const msgBtn = document.createElement("button");
    msgBtn.className = "account-dropdown__item";
    msgBtn.type = "button";
    msgBtn.dataset.action = "open-messages";
    msgBtn.innerHTML = '站内信 <span class="msg-badge" data-msg-badge hidden>0</span>';
    settings.after(feedbackBtn);
    feedbackBtn.after(msgBtn);
    const themeBtn = document.createElement("button");
    themeBtn.className = "account-dropdown__item";
    themeBtn.type = "button";
    themeBtn.dataset.action = "toggle-theme";
    themeBtn.setAttribute("aria-pressed", "false");
    msgBtn.after(themeBtn);
  });
  refreshThemeButtons();

  // 在账户按钮右上角追加未读红点徽标（与下拉菜单里的数字徽标共用同一未读数）。
  document.querySelectorAll(".account-button").forEach((button) => {
    if (button.querySelector("[data-account-unread]")) return;
    const badge = document.createElement("span");
    badge.className = "account-unread-badge";
    badge.dataset.accountUnread = "";
    badge.hidden = true;
    button.appendChild(badge);
  });
}

function populateAdminResumeTemplates() {
  const select = elements.adminResumeTemplate;
  const current = select.value;
  select.innerHTML = `<option value="">全部模板</option>${(availableTemplates || []).map((t) => `<option value="${escapeHtml(t.slug)}"${t.slug === current ? " selected" : ""}>${escapeHtml(t.name)}</option>`).join("")}`;
}

// —— 配置中心 ——

async function loadAdminConfig() {
  elements.adminConfigMsg.hidden = false;
  elements.adminConfigMsg.textContent = "正在加载配置…";
  try {
    const payload = await readApiResponse(await fetch("/api/admin/config", { cache: "no-store" }));
    renderAdminConfig(payload.schema || {}, payload.config || {});
    elements.adminConfigMsg.hidden = true;
    elements.adminConfigMsg.textContent = "";
  } catch (error) {
    elements.adminConfigMsg.textContent = error?.message || "加载配置失败";
  }
}

async function loadAdminAuthStatus() {
  try {
    const payload = await readApiResponse(await fetch("/api/admin/auth-status", { cache: "no-store" }));
    const badge = (configured, offText = "未配置（开发模式）") => configured
      ? '<span class="auth-status-badge is-on">已配置</span>'
      : `<span class="auth-status-badge is-off">${offText}</span>`;
    elements.adminAuthStatus.innerHTML = `
      <span class="admin-auth-status__label">认证渠道状态</span>
      <span class="admin-auth-status__item">人机验证（阿里云验证码）：${payload.captchaEnabled ? "开启" : "关闭"} · 密钥 ${badge(payload.captchaConfigured, "未配置密钥")}</span>
      <span class="admin-auth-status__item">邮箱验证码登录：${payload.emailCodeLoginEnabled ? "开启" : "关闭"} · 通道 ${badge(payload.emailConfigured)}</span>
      <span class="admin-auth-status__item">手机验证码登录：${payload.phoneCodeLoginEnabled ? "开启" : "关闭"} · 通道 ${badge(payload.phoneConfigured)}</span>
      <small>开关在「运行配置」中设置；密钥在「认证配置」中填写（加密落库，优先于环境变量）。</small>`;
  } catch {
    elements.adminAuthStatus.innerHTML = "";
  }
}

const AUTH_SECRET_FIELDS = [
  { key: "aliyun_captcha_access_key_id", label: "AccessKey ID（RAM）", group: "人机验证（阿里云验证码）", type: "text" },
  { key: "aliyun_captcha_access_key_secret", label: "AccessKey Secret（RAM）", group: "人机验证（阿里云验证码）", type: "password" },
  { key: "aliyun_captcha_scene_id", label: "场景 ID（SceneId）", group: "人机验证（阿里云验证码）", type: "text" },
  { key: "aliyun_captcha_prefix", label: "身份标（prefix）", group: "人机验证（阿里云验证码）", type: "text" },
  { key: "smtp_host", label: "SMTP 主机", group: "邮箱验证码（SMTP）", type: "text" },
  { key: "smtp_port", label: "SMTP 端口", group: "邮箱验证码（SMTP）", type: "text" },
  { key: "smtp_secure", label: "SMTP 加密（true/false）", group: "邮箱验证码（SMTP）", type: "text" },
  { key: "smtp_user", label: "SMTP 账号", group: "邮箱验证码（SMTP）", type: "text" },
  { key: "smtp_pass", label: "SMTP 密码/授权码", group: "邮箱验证码（SMTP）", type: "password" },
  { key: "smtp_from", label: "发件人地址", group: "邮箱验证码（SMTP）", type: "text" },
  { key: "aliyun_sms_access_key_id", label: "AccessKey ID", group: "手机验证码（阿里云短信）", type: "text" },
  { key: "aliyun_sms_access_key_secret", label: "AccessKey Secret", group: "手机验证码（阿里云短信）", type: "password" },
  { key: "aliyun_sms_sign_name", label: "短信签名", group: "手机验证码（阿里云短信）", type: "text" },
  { key: "aliyun_sms_template_code", label: "模板 Code", group: "手机验证码（阿里云短信）", type: "text" }
];

function renderAdminAuthSecrets(secrets) {
  const groups = {};
  for (const field of AUTH_SECRET_FIELDS) {
    (groups[field.group] ||= []).push(field);
  }
  const canWrite = hasAdminPermission("config.write");
  elements.adminAuthSecretFields.innerHTML = Object.entries(groups).map(([group, fields]) => `
    <div class="admin-secret-group">
      <span class="admin-secret-group__label">${escapeHtml(group)}</span>
      ${fields.map((field) => {
        const record = secrets?.[field.key] || {};
        const placeholder = record.set ? record.hint || "已配置" : "未配置";
        return `
          <div class="admin-field">
            <span class="admin-field__label">${escapeHtml(field.label)}</span>
            <div class="admin-key-row">
              <input type="${field.type}" data-secret-key="${escapeHtml(field.key)}" placeholder="${escapeHtml(placeholder)}" autocomplete="new-password" ${canWrite ? "" : "disabled"} />
              ${record.set && canWrite ? `<button type="button" class="danger-link" data-action="admin-clear-secret" data-secret-key="${escapeHtml(field.key)}">清除</button>` : ""}
            </div>
          </div>`;
      }).join("")}
    </div>`).join("");
  const submit = elements.adminAuthSecretForm.querySelector("button[type='submit']");
  if (submit) submit.disabled = !canWrite;
}

async function loadAdminAuthSecrets() {
  try {
    const payload = await readApiResponse(await fetch("/api/admin/auth-secrets", { cache: "no-store" }));
    renderAdminAuthSecrets(payload.secrets || {});
  } catch {
    renderAdminAuthSecrets({});
  }
}

async function saveAdminAuthSecrets(event) {
  event.preventDefault();
  const body = {};
  elements.adminAuthSecretFields.querySelectorAll("[data-secret-key]").forEach((input) => {
    const value = input.value.trim();
    if (value) body[input.dataset.secretKey] = value;
  });
  elements.adminAuthSecretMsg.hidden = false;
  elements.adminAuthSecretMsg.textContent = "正在保存…";
  try {
    const result = await readApiResponse(await fetch("/api/admin/auth-secrets", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    }));
    renderAdminAuthSecrets(result.secrets || {});
    elements.adminAuthSecretMsg.textContent = "已保存";
    showToast("密钥已保存", "success");
    loadAdminAuthStatus();
  } catch (error) {
    elements.adminAuthSecretMsg.textContent = error?.message || "保存失败";
  }
}

async function clearAdminSecret(target) {
  const key = target.dataset.secretKey;
  if (!key) return;
  elements.adminAuthSecretMsg.hidden = false;
  elements.adminAuthSecretMsg.textContent = "正在清除…";
  try {
    const result = await readApiResponse(await fetch("/api/admin/auth-secrets", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ [key]: "" })
    }));
    renderAdminAuthSecrets(result.secrets || {});
    elements.adminAuthSecretMsg.textContent = "已清除";
    loadAdminAuthStatus();
  } catch (error) {
    elements.adminAuthSecretMsg.textContent = error?.message || "清除失败";
  }
}

function renderAdminConfig(schema, values) {
  adminConfigSchema = schema;
  const canWrite = hasAdminPermission("config.write");
  elements.adminConfigFields.innerHTML = Object.entries(schema).map(([key, meta]) => `
    <label class="admin-check-row">
      <input type="checkbox" data-config-key="${escapeHtml(key)}" ${values[key] ? "checked" : ""} ${canWrite ? "" : "disabled"} />
      <span><strong>${escapeHtml(meta.label || key)}</strong><small>${escapeHtml(meta.description || "")}</small></span>
    </label>`).join("");
  const submit = elements.adminConfigForm.querySelector("button[type='submit']");
  if (submit) submit.disabled = !canWrite;
}

async function saveAdminConfig(event) {
  event.preventDefault();
  const body = {};
  document.querySelectorAll("[data-config-key]").forEach((checkbox) => {
    body[checkbox.dataset.configKey] = checkbox.checked;
  });
  elements.adminConfigMsg.hidden = false;
  elements.adminConfigMsg.textContent = "正在保存…";
  try {
    const result = await readApiResponse(await fetch("/api/admin/config", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    }));
    renderAdminConfig(adminConfigSchema, result.config || {});
    elements.adminConfigMsg.textContent = "已保存";
    showToast("配置已保存", "success");
  } catch (error) {
    elements.adminConfigMsg.textContent = error?.message || "保存失败";
  }
}

// —— 系统运维面板 ——

async function loadAdminSystem() {
  elements.adminSystemStatus.hidden = false;
  elements.adminSystemStatus.textContent = "正在加载运维状态…";
  try {
    const payload = await readApiResponse(await fetch("/api/admin/system", { cache: "no-store" }));
    renderAdminSystem(payload);
    elements.adminSystemStatus.hidden = true;
  } catch (error) {
    elements.adminSystemStatus.textContent = error?.message || "加载运维状态失败";
  }
}

function renderAdminSystem(sys) {
  const dbOk = !sys.database?.configured || sys.database?.ok;
  const redisOk = !sys.redis?.configured || sys.redis?.ok;
  const badge = (ok) => (ok ? '<span class="badge badge--active">正常</span>' : '<span class="badge badge--disabled">异常</span>');
  const queueRow = (label, q) => {
    if (!q) return `<tr><td>${label}</td><td>未配置</td><td colspan="4">—</td></tr>`;
    const c = q.counts || {};
    return `<tr><td>${label}（${escapeHtml(q.backend)}）</td><td>${badge(true)}</td><td>${c.waiting ?? 0}</td><td>${c.active ?? 0}</td><td>${c.completed ?? 0}</td><td>${c.failed ?? 0}</td></tr>`;
  };
  elements.adminSystemStats.innerHTML = `
    <div class="admin-stat"><span class="admin-stat__value">${dbOk ? "正常" : "异常"}</span><span class="admin-stat__label">数据库</span></div>
    <div class="admin-stat"><span class="admin-stat__value">${redisOk ? "正常" : (sys.redis?.configured ? "异常" : "未启用")}</span><span class="admin-stat__label">Redis</span></div>
    <div class="admin-stat"><span class="admin-stat__value">${sys.exportQueue?.counts?.failed ?? 0}</span><span class="admin-stat__label">导出失败</span></div>
    <div class="admin-stat"><span class="admin-stat__value">${sys.previewQueue?.counts?.failed ?? 0}</span><span class="admin-stat__label">预览失败</span></div>
    <div class="admin-stat"><span class="admin-stat__value">${sys.ai?.enabled ? "启用" : "停用"}</span><span class="admin-stat__label">AI 状态</span></div>
  `;
  elements.adminSystemDetail.innerHTML = `
    <table class="admin-table">
      <thead><tr><th>组件</th><th>状态</th><th>等待</th><th>处理中</th><th>完成</th><th>失败</th></tr></thead>
      <tbody>
        <tr><td>数据库</td><td>${badge(dbOk)}</td><td colspan="4">${sys.database?.configured ? (sys.database?.ok ? "连接正常" : (sys.database?.error || "不可用")) : "未配置（内存降级）"}</td></tr>
        <tr><td>Redis</td><td>${badge(redisOk)}</td><td colspan="4">${sys.redis?.configured ? (sys.redis?.ok ? "连接正常" : "连接异常") : "未配置"}</td></tr>
        ${queueRow("导出队列", sys.exportQueue)}
        ${queueRow("预览队列", sys.previewQueue)}
      </tbody>
    </table>
    <p class="admin-subhead">服务信息：${escapeHtml(sys.service || "")} · Node ${escapeHtml(sys.node || "")} · 已运行 ${escapeHtml(formatUptime(sys.uptimeSeconds || 0))} · AI 模型 ${escapeHtml(sys.ai?.model || "未配置")}</p>`;
}

function formatUptime(seconds) {
  const s = Math.max(0, Number(seconds) || 0);
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (d > 0) return `${d} 天 ${h} 小时`;
  if (h > 0) return `${h} 小时 ${m} 分`;
  return `${m} 分 ${s % 60} 秒`;
}

// —— 告警与一键补救 ——

async function loadAdminAlerts() {
  try {
    const payload = await readApiResponse(await fetch("/api/admin/alerts", { cache: "no-store" }));
    renderAdminAlerts(payload.alerts || []);
  } catch {
    elements.adminAlertList.innerHTML = '<p class="admin-empty">暂无告警。</p>';
  }
}

function renderAdminAlerts(alerts) {
  const canWrite = hasAdminPermission("system.write");
  if (!alerts.length) {
    elements.adminAlertList.innerHTML = '<p class="admin-empty">暂无告警。</p>';
    return;
  }
  const levelBadge = {
    info: '<span class="badge">info</span>',
    warn: '<span class="badge badge--admin">warn</span>',
    error: '<span class="badge badge--disabled">error</span>'
  };
  elements.adminAlertList.innerHTML = `
    <table class="admin-table">
      <thead><tr><th>时间</th><th>级别</th><th>类型</th><th>内容</th><th>状态</th><th>操作</th></tr></thead>
      <tbody>${alerts.map((a) => {
        const time = new Date(a.createdAt);
        const timeLabel = Number.isNaN(time.getTime()) ? "—" : time.toLocaleString("zh-CN", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false });
        return `<tr>
          <td>${escapeHtml(timeLabel)}</td>
          <td>${levelBadge[a.level] || escapeHtml(a.level)}</td>
          <td>${escapeHtml(a.kind)}</td>
          <td>${escapeHtml(a.message)}</td>
          <td>${a.acknowledged ? '<span class="badge badge--active">已确认</span>' : '<span class="badge badge--disabled">未确认</span>'}</td>
          <td class="admin-table__ops">${canWrite && !a.acknowledged ? `<button type="button" data-action="admin-ack-alert" data-alert-id="${escapeHtml(a.id)}">确认</button>` : '<span class="admin-self">—</span>'}</td>
        </tr>`;
      }).join("")}</tbody>
    </table>`;
}

async function adminRetryFailed() {
  if (!(await confirmAction({ title: "重试失败任务", message: "确定重试所有失败任务？" }))) return;
  try {
    const result = await readApiResponse(await fetch("/api/admin/system/retry-failed", { method: "POST" }));
    showToast(`已重试：导出 ${result.exportRetried} 个，预览 ${result.previewRetried} 个`, "success");
    await Promise.all([loadAdminSystem(), loadAdminAlerts()]);
  } catch (error) {
    showToast(error?.message || "重试失败", "warning");
  }
}

async function adminCleanQueue(target) {
  const type = target.dataset.type || "completed";
  const label = type === "failed" ? "失败" : "已完成";
  if (!(await confirmAction({ title: "清理任务", message: `确定清理${label}任务？相关导出/预览文件将一并删除。`, confirmLabel: "清理", danger: true }))) return;
  try {
    const result = await readApiResponse(await fetch("/api/admin/system/clean", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ queue: "all", type })
    }));
    showToast(`已清理 ${result.removed} 个任务`, "success");
    await loadAdminSystem();
  } catch (error) {
    showToast(error?.message || "清理失败", "warning");
  }
}

async function adminAckAlert(target) {
  const id = target.dataset.alertId;
  try {
    await readApiResponse(await fetch(`/api/admin/alerts/${encodeURIComponent(id)}/ack`, { method: "POST" }));
    await loadAdminAlerts();
  } catch (error) {
    showToast(error?.message || "确认失败", "warning");
  }
}

async function loadAdminAiConfig() {
  elements.adminAiStatus.hidden = false;
  elements.adminAiStatus.textContent = "正在加载 AI 配置…";
  try {
    const payload = await readApiResponse(await fetch("/api/admin/ai-config", { cache: "no-store" }));
    renderAdminAiConfig(payload.config || {});
    elements.adminAiStatus.textContent = "";
    elements.adminAiStatus.hidden = true;
  } catch (error) {
    elements.adminAiStatus.textContent = error?.message || "加载 AI 配置失败";
  }
}

function renderAdminAiConfig(config) {
  elements.adminAiEnabled.checked = Boolean(config.enabled);
  elements.adminAiOptimizeEnabled.checked = config.optimizeEnabled !== false;
  elements.adminAiBaseUrl.value = config.baseUrl || "";
  elements.adminAiModel.value = config.model || "";
  elements.adminAiTemperature.value = config.temperature ?? 0.2;
  elements.adminAiMaxInput.value = config.maxInputChars ?? 8000;
  elements.adminAiMaxOutput.value = config.maxOutputTokens ?? 1600;
  elements.adminAiTimeout.value = config.timeoutMs ?? 30000;
  elements.adminAiSystemPrompt.value = config.systemPrompt || "";
  elements.adminAiApiKey.value = "";
  elements.adminAiKeyHint.textContent = config.apiKeySet ? `已保存：${config.apiKeyHint || "****"}` : "尚未配置";
  const canWrite = hasAdminPermission("ai_config.write");
  elements.adminAiForm.querySelectorAll("input, textarea, select, button").forEach((node) => {
    node.disabled = !canWrite;
  });
  if (!canWrite) elements.adminAiStatus.textContent = "当前角色仅可查看配置";
}

async function saveAdminAiConfig(event) {
  event.preventDefault();
  const payload = {
    enabled: elements.adminAiEnabled.checked,
    optimizeEnabled: elements.adminAiOptimizeEnabled.checked,
    baseUrl: elements.adminAiBaseUrl.value.trim(),
    model: elements.adminAiModel.value.trim(),
    temperature: Number(elements.adminAiTemperature.value),
    maxInputChars: Number(elements.adminAiMaxInput.value),
    maxOutputTokens: Number(elements.adminAiMaxOutput.value),
    timeoutMs: Number(elements.adminAiTimeout.value),
    systemPrompt: elements.adminAiSystemPrompt.value
  };
  const apiKey = elements.adminAiApiKey.value.trim();
  if (apiKey) payload.apiKey = apiKey;

  elements.adminAiStatus.hidden = false;
  elements.adminAiStatus.textContent = "正在保存…";
  try {
    const result = await readApiResponse(await fetch("/api/admin/ai-config", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    }));
    renderAdminAiConfig(result.config || {});
    elements.adminAiStatus.textContent = "已保存";
    showToast("AI 配置已保存", "success");
  } catch (error) {
    elements.adminAiStatus.textContent = error?.message || "保存失败";
  }
}

async function clearAdminAiKey() {
  if (!(await confirmAction({ title: "清除 API Key", message: "确定清除已保存的 API Key？清除后 AI 生成将不可用，直到重新配置。", confirmLabel: "清除", danger: true }))) return;
  try {
    const result = await readApiResponse(await fetch("/api/admin/ai-config", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ apiKey: "" })
    }));
    renderAdminAiConfig(result.config || {});
    showToast("API Key 已清除", "success");
  } catch (error) {
    showToast(error?.message || "清除失败", "warning");
  }
}

function aiTemplateRef() {
  const template = availableTemplates.find((item) => item.slug === "clean-single");
  return {
    slug: "clean-single",
    version: 1,
    name: template?.name || "极简轻",
    engine: template?.engine || "html-native",
    editorSchema: template?.editorSchema || getTemplateSchema("clean-single")
  };
}

const AI_JOB_STAGE_LABELS = {
  internship: "找实习",
  graduate: "应届求职",
  experienced: "有经验求职",
  career_switch: "转行求职",
  unsure: "暂不确定"
};

function renderAiGuide() {
  const stepIndex = { role: 1, stage: 2, jobDescription: 3 }[aiGuideStep] || 1;
  elements.aiGuideProgress.style.width = `${stepIndex / 3 * 100}%`;
  let content = "";
  if (aiGuideStep === "role") {
    content = `<div class="ai-guide-question"><span class="ai-guide-avatar">AI</span><div><span class="eyebrow">第 1 个问题</span><h2>你准备投递什么岗位？</h2><p>我会根据目标岗位决定简历应当突出哪些经历。</p></div></div>
      <div class="ai-guide-answer"><input id="aiGuideRole" type="text" maxlength="120" value="${escapeHtml(aiJobContext.targetRole)}" placeholder="例如：产品经理、Java 开发、品牌运营" autocomplete="off" />
      <div class="ai-guide-actions"><button type="button" class="ai-submit" data-action="ai-guide-role-next">继续</button><button type="button" class="link-button" data-action="ai-guide-role-skip">暂时不确定，跳过</button></div></div>`;
  } else if (aiGuideStep === "stage") {
    content = `<div class="ai-guide-question"><span class="ai-guide-avatar">AI</span><div><span class="eyebrow">第 2 个问题</span><h2>你目前处于哪个求职阶段？</h2><p>不同阶段适合强调不同类型的经历。</p></div></div><div class="ai-stage-options">${Object.entries(AI_JOB_STAGE_LABELS).map(([value, label]) => `<button type="button" data-action="ai-guide-stage" data-stage="${value}">${label}</button>`).join("")}</div>`;
  } else {
    content = `<div class="ai-guide-question"><span class="ai-guide-avatar">AI</span><div><span class="eyebrow">最后一个问题</span><h2>有具体职位描述吗？</h2><p>粘贴 JD 后，我可以更准确地匹配招聘要求。这一项可以跳过。</p></div></div>
      <div class="ai-guide-answer"><textarea id="aiGuideJd" rows="6" maxlength="5000" placeholder="粘贴职位职责和任职要求……">${escapeHtml(aiJobContext.jobDescription)}</textarea>
      <div class="ai-guide-actions"><button type="button" class="ai-submit" data-action="ai-guide-jd-next">整理好了，继续</button><button type="button" class="link-button" data-action="ai-guide-jd-skip">暂时没有，跳过</button></div></div>`;
  }
  elements.aiGuideCard.classList.remove("is-entering");
  elements.aiGuideCard.innerHTML = content;
  requestAnimationFrame(() => elements.aiGuideCard.classList.add("is-entering"));
  elements.aiGuideCard.querySelector("input")?.focus();
}

function setAiGuideStep(step) {
  elements.aiGuideCard.classList.add("is-leaving");
  window.setTimeout(() => {
    aiGuideStep = step;
    elements.aiGuideCard.classList.remove("is-leaving");
    renderAiGuide();
  }, 180);
}

function aiDescriptionHint() {
  if (aiJobContext.jobStage === "internship") return "可以介绍教育背景、课程项目、实习、竞赛、社团和技能，不需要整理格式。";
  if (aiJobContext.jobStage === "graduate") return "可以介绍教育背景、项目实践、校园经历和技能，我会帮你突出潜力。";
  if (aiJobContext.jobStage === "career_switch") return "介绍过去的经历和想转向的方向，我会帮你提取可迁移能力。";
  return "可以介绍工作、项目、教育经历和成果，不需要整理格式，我会帮你组织。";
}

function renderAiContextSummary() {
  const role = aiJobContext.targetRole || "未设置（生成通用版本）";
  const stage = AI_JOB_STAGE_LABELS[aiJobContext.jobStage] || "未设置";
  const jd = aiJobContext.jobDescription ? `已添加 ${aiJobContext.jobDescription.length} 字` : "未添加";
  const focus = aiJobContext.jobStage === "internship" ? ["项目与实践经历", "学习能力与岗位技能"]
    : aiJobContext.jobStage === "graduate" ? ["教育与项目成果", "岗位相关技能"]
    : aiJobContext.jobStage === "career_switch" ? ["可迁移能力", "与目标岗位相关的成果"]
    : ["岗位相关经历", "职责、行动与成果"];
  elements.aiContextSummary.innerHTML = `<dl class="ai-context-list"><div><dt>目标岗位</dt><dd>${escapeHtml(role)}</dd></div><div><dt>求职阶段</dt><dd>${escapeHtml(stage)}</dd></div><div><dt>职位描述</dt><dd>${escapeHtml(jd)}</dd></div></dl><div class="ai-context-focus"><strong>本次生成将重点突出</strong><ul>${focus.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul></div>`;
  elements.aiDescriptionHint.textContent = aiDescriptionHint();
  elements.aiGenerateButton.textContent = aiJobContext.targetRole ? "根据求职目标生成简历" : "生成通用简历";
}

function openAiWorkspace() {
  elements.aiOnboarding.classList.add("is-complete");
  window.setTimeout(() => {
    elements.aiOnboarding.hidden = true;
    elements.aiWorkspace.hidden = false;
    renderAiContextSummary();
    requestAnimationFrame(() => elements.aiWorkspace.classList.add("is-entering"));
    elements.aiDescription.focus();
  }, 220);
}

function restartAiGuide() {
  elements.aiWorkspace.hidden = true;
  elements.aiWorkspace.classList.remove("is-entering");
  elements.aiOnboarding.hidden = false;
  elements.aiOnboarding.classList.remove("is-complete");
  aiGuideStep = "role";
  renderAiGuide();
}

function showAiPage() {
  document.documentElement.classList.remove("home-page-mode");
  document.documentElement.classList.remove("template-library-mode");
  elements.homePage.hidden = true;
  elements.templateLibrary.hidden = true;
  elements.draftPage.hidden = true;
  elements.app.hidden = true;
  elements.adminPage.hidden = true;
  elements.loginPage.hidden = true;
  revealView(elements.aiPage);
  if (!elements.aiWorkspace.hidden || !elements.aiOnboarding.hidden) {
    if (!aiJobContext.targetRole) aiJobContext.targetRole = currentUser?.settings?.ai?.targetRole || "";
    restartAiGuide();
  }
  updateAiCharCount();
  loadAiLimits().catch(() => {});
  window.scrollTo({ top: 0, behavior: "auto" });
}

function hideAiPage() {
  elements.aiPage.hidden = true;
}

function renderAiNotices() {
  if (!aiResult) return;
  const parts = [];
  if (aiResult.uncertain?.length) {
    parts.push(`<div class="ai-notice ai-notice--warn"><strong>以下字段 AI 无法确认，请保存前核对：</strong>${aiResult.uncertain.map((field) => `<code>${escapeHtml(field)}</code>`).join("、")}</div>`);
  }
  for (const notice of aiResult.notices || []) {
    parts.push(`<div class="ai-notice ai-notice--info">${escapeHtml(notice)}</div>`);
  }
  if (!parts.length) {
    parts.push('<div class="ai-notice ai-notice--info">已按描述完成结构化填充，确认无误后即可保存草稿。</div>');
  }
  elements.aiNotices.innerHTML = parts.join("");
}

function renderAiPreview() {
  if (!aiResult) return;
  const template = aiTemplateRef();
  aiResult.resume.template = {
    slug: template.slug,
    version: template.version,
    name: template.name,
    engine: template.engine,
    editorSchema: template.editorSchema
  };
  applyResumeSettings(elements.aiPreviewPaper, aiResult.resume.settings);
  applyResumeTemplate(elements.aiPreviewPaper, aiResult.resume.template);
  elements.aiPreviewFlow.innerHTML = renderResumeMarkup(aiResult.resume);
}

// —— Word 简历导入：懒加载 mammoth → docx 纯文本 → 回填描述框 ——

function loadMammoth() {
  if (window.mammoth) return Promise.resolve(window.mammoth);
  if (!mammothPromise) {
    mammothPromise = new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = "/vendor/mammoth.browser.min.js";
      script.async = true;
      script.onload = () => resolve(window.mammoth);
      script.onerror = () => {
        mammothPromise = null;
        reject(new Error("Word 解析组件加载失败，请刷新后重试"));
      };
      document.head.appendChild(script);
    });
  }
  return mammothPromise;
}

function wordHtmlToStructure(html) {
  const doc = new DOMParser().parseFromString(String(html || ""), "text/html");
  const lines = [];
  const cleanText = (node) => String(node?.textContent || "").replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim();
  const push = (marker, text) => {
    const value = String(text || "").trim();
    if (value) lines.push(`[${marker}] ${value}`);
  };
  const visit = (node) => {
    if (!(node instanceof Element)) return;
    const tag = node.tagName.toLowerCase();
    if (/^h[1-6]$/.test(tag)) {
      push(`HEADING level=${tag.slice(1)}`, cleanText(node));
      return;
    }
    if (tag === "li") {
      push("BULLET", cleanText(node));
      return;
    }
    if (tag === "tr") {
      const cells = [...node.querySelectorAll(":scope > th, :scope > td")].map(cleanText).filter(Boolean);
      if (cells.length) push("ROW", cells.join(" | "));
      return;
    }
    if (tag === "p") {
      const text = cleanText(node);
      const emphasized = text && [...node.children].some((child) => ["strong", "b"].includes(child.tagName.toLowerCase()) && cleanText(child) === text);
      push(`PARAGRAPH emphasis=${emphasized}`, text);
      return;
    }
    [...node.children].forEach(visit);
  };
  [...doc.body.children].forEach(visit);
  return lines.join("\n");
}

function aiProjectItems() {
  return aiResult?.resume?.sections?.find((section) => section.id === "projects")?.items || [];
}

function projectTechStack(content) {
  const doc = new DOMParser().parseFromString(`<div>${String(content || "")}</div>`, "text/html");
  const node = [...doc.querySelectorAll("li, p")].find((item) => /^技术栈\s*[：:]/.test(item.textContent.trim()));
  return node ? node.textContent.replace(/^技术栈\s*[：:]\s*/, "").trim() : "";
}

function replaceProjectTechStack(content, value) {
  const doc = new DOMParser().parseFromString(`<div id="root">${String(content || "")}</div>`, "text/html");
  const root = doc.querySelector("#root");
  const existing = [...root.querySelectorAll("li, p")].find((item) => /^技术栈\s*[：:]/.test(item.textContent.trim()));
  const text = String(value || "").trim();
  if (existing && text) existing.textContent = `技术栈：${text}`;
  else if (existing) existing.remove();
  else if (text) {
    const list = root.querySelector("ul");
    const node = doc.createElement(list ? "li" : "p");
    node.textContent = `技术栈：${text}`;
    if (list) list.prepend(node);
    else root.prepend(node);
  }
  return root.innerHTML;
}

function setAiProjectReviewState(confirmed) {
  aiProjectReviewConfirmed = confirmed;
  if (elements.aiSaveButton) elements.aiSaveButton.disabled = !confirmed;
  const status = elements.aiProjectReview?.querySelector("[data-project-review-status]");
  if (status) {
    status.textContent = confirmed ? "已确认" : "待确认";
    status.classList.toggle("is-confirmed", confirmed);
  }
}

const AI_PROJECT_FIELD_ALIASES = {
  organization: ["projectName", "name", "organization"],
  role: ["projectRole", "role"],
  techStack: ["techStack", "technology"],
  start: ["start"],
  end: ["end"]
};

// 将模型的 uncertain 路径（如 projects[0].projectName）映射到确认面板字段，实现字段级高亮；
// 整条项目不确定时至少高亮项目名称。
function aiProjectUncertainFields(index) {
  const result = { any: false, fields: new Set() };
  const prefix = `projects[${index}]`;
  for (const raw of aiResult?.uncertain || []) {
    const path = String(raw || "");
    if (path === prefix) {
      result.any = true;
      continue;
    }
    if (!path.startsWith(`${prefix}.`) && !path.startsWith(`${prefix}[`)) continue;
    result.any = true;
    const leaf = path.slice(prefix.length).replace(/^[.[\]]+/, "").split(".").pop();
    for (const [fieldName, aliases] of Object.entries(AI_PROJECT_FIELD_ALIASES)) {
      if (aliases.includes(leaf)) result.fields.add(fieldName);
    }
  }
  if (result.any && result.fields.size === 0) result.fields.add("organization");
  return result;
}

function aiProjectFieldUncertain(index, fieldName) {
  return aiProjectUncertainFields(index).fields.has(fieldName);
}

function aiProjectFieldValue(index, fieldName) {
  const project = aiProjectItems()[index];
  if (!project) return "";
  if (fieldName === "techStack") return projectTechStack(project.content);
  return project[fieldName] ?? "";
}

function renderAiProjectReview() {
  const projects = aiProjectItems();
  if (!projects.length) {
    elements.aiProjectReview.hidden = true;
    elements.aiProjectReview.innerHTML = "";
    setAiProjectReviewState(true);
    return;
  }
  elements.aiProjectReview.hidden = false;
  const field = (index, key, label, { required = false, placeholder = "" } = {}) => {
    const uncertain = aiProjectFieldUncertain(index, key);
    return `<label class="${uncertain ? "is-uncertain" : ""}">
      <span>${label}${required ? " *" : ""}${uncertain ? '<i class="ai-project-review__hint" title="AI 无法确认该字段">待核对</i>' : ""}</span>
      <input type="text" value="${escapeHtml(aiProjectFieldValue(index, key))}" placeholder="${escapeHtml(placeholder)}" data-ai-project-index="${index}" data-ai-project-field="${key}" />
    </label>`;
  };
  elements.aiProjectReview.innerHTML = `
    <div class="ai-project-review__head">
      <div><span class="eyebrow">PROJECT CHECK</span><h3>确认项目识别结果</h3><p>核对项目名称、角色、时间与技术栈；高亮字段请重点确认，修改会立即同步到预览。</p></div>
      <span class="ai-project-review__status" data-project-review-status>待确认</span>
    </div>
    <div class="ai-project-review__list">
      ${projects.map((project, index) => {
        const source = aiResult.projectReview?.[index]?.sourceText || "";
        const cardUncertain = aiProjectUncertainFields(index).any;
        return `<article class="ai-project-review__card ${cardUncertain ? "is-uncertain" : ""}">
          <div class="ai-project-review__title">
            <strong>项目 ${index + 1}</strong>
            ${cardUncertain ? '<span class="ai-project-review__flag">AI 标记为不确定</span>' : ""}
          </div>
          <div class="ai-project-review__body">
            <div class="ai-project-review__fields">
              ${field(index, "organization", "项目名称", { required: true, placeholder: "项目正式名称" })}
              ${field(index, "role", "项目角色", { placeholder: "如：项目负责人" })}
              ${field(index, "techStack", "技术栈", { placeholder: "如：Vue / Node.js" })}
              <div class="ai-project-review__dates">
                ${field(index, "start", "开始时间", { placeholder: "如 2021-04" })}
                ${field(index, "end", "结束时间", { placeholder: "如 至今" })}
              </div>
            </div>
            ${source ? `<div class="ai-project-review__source"><div class="ai-project-review__source-title">导入原文</div><pre>${escapeHtml(source)}</pre></div>` : ""}
          </div>
        </article>`;
      }).join("")}
    </div>
    <div class="ai-project-review__footer"><span>带 * 的项目名称不能为空；确认前无法保存草稿。</span><button type="button" class="ai-save" data-action="ai-confirm-projects">确认项目信息</button></div>`;
  setAiProjectReviewState(false);
}

function updateAiProjectReviewField(target) {
  const project = aiProjectItems()[Number(target.dataset.aiProjectIndex)];
  if (!project) return;
  const fieldName = target.dataset.aiProjectField;
  if (fieldName === "techStack") project.content = replaceProjectTechStack(project.content, target.value);
  else if (["organization", "role", "start", "end"].includes(fieldName)) project[fieldName] = target.value;
  setAiProjectReviewState(false);
  renderAiPreview();
}

function confirmAiProjects() {
  const projects = aiProjectItems();
  const missingIndex = projects.findIndex((project) => !String(project.organization || "").trim());
  if (missingIndex >= 0) {
    const input = elements.aiProjectReview.querySelector(`[data-ai-project-index="${missingIndex}"][data-ai-project-field="organization"]`);
    input?.focus();
    showToast(`请填写项目 ${missingIndex + 1} 的名称`, "warning");
    return;
  }
  projects.forEach((project) => {
    project.organization = String(project.organization || "").trim();
    project.role = String(project.role || "").trim();
    project.start = String(project.start || "").trim();
    project.end = String(project.end || "").trim();
  });
  setAiProjectReviewState(true);
  showToast("项目经历已确认", "success");
}

async function extractWordText(file) {
  if (!file) throw new Error("未选择文件");
  if (!/\.docx$/i.test(file.name)) {
    throw new Error("仅支持 .docx 文件，旧版 .doc 请先在 Word 中另存为 .docx");
  }
  if (file.size > AI_MAX_WORD_BYTES) throw new Error("文件超过 5 MB，请精简后重试");
  const mammoth = await loadMammoth();
  const arrayBuffer = await file.arrayBuffer();
  const [rawResult, htmlResult] = await Promise.all([
    mammoth.extractRawText({ arrayBuffer }),
    mammoth.convertToHtml({ arrayBuffer }, {
      styleMap: [
        "p[style-name='Title'] => h1:fresh",
        "p[style-name='Heading 1'] => h1:fresh",
        "p[style-name='Heading 2'] => h2:fresh",
        "p[style-name='标题 1'] => h1:fresh",
        "p[style-name='标题 2'] => h2:fresh"
      ]
    })
  ]);
  const text = String(rawResult?.value || "").replace(/\u00a0/g, " ").trim();
  if (!text) throw new Error("未能提取到文字，该文件可能是图片/扫描件简历");
  return { text, structure: wordHtmlToStructure(htmlResult?.value) };
}

async function handleAiWordImport(file) {
  if (aiWordImporting) return;
  if (elements.aiDescription.value.trim()) {
    if (!(await confirmAction({ title: "覆盖描述内容", message: "当前描述内容将被导入的 Word 文本覆盖，继续吗？", confirmLabel: "继续覆盖" }))) return;
  }
  aiWordImporting = true;
  elements.aiImportStatus.textContent = "正在解析 Word 简历…";
  elements.aiImportStatus.classList.remove("is-error");
  try {
    const { text, structure } = await extractWordText(file);
    aiWordDocumentStructure = structure;
    elements.aiDescription.value = text;
    updateAiCharCount();
    elements.aiImportStatus.textContent = `已提取 ${text.length} 字，可先修改再生成`;
    showToast("Word 文本已提取", "success");
  } catch (error) {
    elements.aiImportStatus.textContent = error?.message || "导入失败，请重试";
    elements.aiImportStatus.classList.add("is-error");
    showToast(error?.message || "导入失败", "warning");
  } finally {
    aiWordImporting = false;
    elements.aiWordFile.value = "";
  }
}

// —— 语音输入：Web Speech API 将口述实时转成文字，追加到「个人经历描述」 ——

function speechRecognitionCtor() {
  return window.SpeechRecognition || window.webkitSpeechRecognition || null;
}

function setAiVoiceState(recording) {
  aiVoiceActive = recording;
  const btn = elements.aiVoiceBtn;
  if (!btn) return;
  btn.classList.toggle("is-recording", recording);
  btn.setAttribute("aria-pressed", String(recording));
  const label = btn.querySelector("[data-ai-voice-label]");
  if (label) label.textContent = recording ? "停止输入" : "语音输入";
}

function aiVoiceErrorText(code) {
  switch (code) {
    case "not-allowed":
    case "service-not-allowed":
      return "麦克风权限被拒绝，请在浏览器地址栏允许麦克风访问";
    case "no-speech":
      return "未检测到语音，请靠近麦克风再试";
    case "audio-capture":
      return "未找到麦克风设备，请检查设备连接";
    case "network":
      return "语音识别网络异常，请检查网络后重试";
    case "aborted":
      return "";
    default:
      return "语音识别出错，请重试";
  }
}

function stopAiVoice() {
  if (aiRecognition) {
    try { aiRecognition.stop(); } catch { /* 已停止则忽略 */ }
  }
  setAiVoiceState(false);
}

function toggleAiVoice() {
  if (!speechRecognitionCtor()) {
    showToast("当前浏览器不支持语音输入，请使用 Chrome、Edge 或 Safari", "warning");
    return;
  }
  if (aiVoiceActive) {
    stopAiVoice();
    return;
  }
  if (!window.isSecureContext) {
    showToast("语音输入需要 HTTPS 或 localhost 环境，请改用 https 访问", "warning");
    return;
  }

  const recognition = new (speechRecognitionCtor())();
  aiRecognition = recognition;
  recognition.lang = "zh-CN";
  recognition.continuous = true;
  recognition.interimResults = true;
  recognition.maxAlternatives = 1;

  // 以当前描述内容为基准，识别结果追加到其后。
  aiVoiceBase = elements.aiDescription.value;
  aiVoicePrefix = aiVoiceBase && !/\s$/.test(aiVoiceBase) ? " " : "";

  recognition.onstart = () => setAiVoiceState(true);
  recognition.onresult = (event) => {
    let finalText = "";
    let interimText = "";
    for (let i = 0; i < event.results.length; i++) {
      const result = event.results[i];
      const text = result[0]?.transcript ?? "";
      if (result.isFinal) finalText += text;
      else interimText += text;
    }
    elements.aiDescription.value = aiVoiceBase + aiVoicePrefix + finalText + interimText;
    updateAiCharCount();
  };
  recognition.onerror = (event) => {
    const message = aiVoiceErrorText(event.error);
    stopAiVoice();
    if (message) showToast(message, "warning");
  };
  recognition.onend = () => {
    if (aiRecognition === recognition) {
      setAiVoiceState(false);
      aiRecognition = null;
    }
  };

  try {
    recognition.start();
  } catch {
    aiRecognition = null;
    setAiVoiceState(false);
    showToast("无法启动语音识别，请检查麦克风权限", "warning");
  }
}

function aiMaxInputChars() {
  return Number.isFinite(aiLimits?.maxInputChars) && aiLimits.maxInputChars > 0
    ? aiLimits.maxInputChars
    : AI_FALLBACK_MAX_CHARS;
}

function updateAiCharCount() {
  if (!elements.aiCharCount) return;
  const length = elements.aiDescription.value.length;
  const max = aiMaxInputChars();
  const over = length > max;
  elements.aiCharCount.textContent = `${length} / ${max} 字`;
  elements.aiCharCount.classList.toggle("is-over", over);
  elements.aiCharCount.title = over
    ? `超出服务端上限 ${max} 字，请精简后再生成`
    : `服务端上限 ${max} 字`;
}

async function loadAiLimits() {
  if (!currentUser) return;
  try {
    const payload = await readApiResponse(await fetch("/api/ai/limits", { cache: "no-store" }));
    aiLimits = {
      maxInputChars: Number.isFinite(payload.maxInputChars) ? payload.maxInputChars : AI_FALLBACK_MAX_CHARS,
      enabled: payload.enabled !== false,
      daily: payload.daily || null
    };
  } catch {
    aiLimits = { maxInputChars: AI_FALLBACK_MAX_CHARS, enabled: true, daily: null };
  }
  updateAiCharCount();
}

function aiToneValue() {
  const checked = elements.aiTone?.querySelector('input[type="radio"]:checked');
  return checked?.value || "professional";
}

async function generateAi() {
  if (aiGenerating) return;
  if (!currentUser) {
    openLogin("/ai");
    return;
  }
  const description = elements.aiDescription.value.trim();
  if (!description) {
    showToast("请先填写个人经历描述", "warning");
    elements.aiDescription.focus();
    return;
  }
  const maxChars = aiMaxInputChars();
  if (description.length > maxChars) {
    elements.aiStatus.hidden = false;
    elements.aiStatus.textContent = `内容过长（上限 ${maxChars} 字，当前 ${description.length} 字），请精简后再试`;
    showToast(`描述超过 ${maxChars} 字，请精简`, "warning");
    return;
  }
  aiGenerating = true;
  elements.aiStatus.hidden = false;
  elements.aiStatus.textContent = "AI 正在生成，请稍候…";
  try {
    aiResult = await readApiResponse(await fetch("/api/ai/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        templateSlug: "clean-single",
        description,
        documentStructure: aiWordDocumentStructure,
        tone: aiToneValue(),
        targetRole: aiJobContext.targetRole,
        jobStage: aiJobContext.jobStage,
        jobDescription: aiJobContext.jobDescription
      })
    }));
    renderAiPreview();
    renderAiProjectReview();
    renderAiNotices();
    elements.aiResult.hidden = false;
    elements.aiStatus.textContent = "";
    elements.aiStatus.hidden = true;
    elements.aiResult.scrollIntoView({ behavior: "smooth", block: "start" });
  } catch (error) {
    elements.aiStatus.textContent = error?.message || "AI 生成失败，请稍后重试";
    showToast(error?.message || "AI 生成失败", "warning");
  } finally {
    aiGenerating = false;
  }
}

async function saveAiDraft() {
  if (!aiResult || aiGenerating) return;
  if (!aiProjectReviewConfirmed) {
    elements.aiProjectReview?.scrollIntoView({ behavior: "smooth", block: "center" });
    showToast("请先确认项目经历识别结果", "warning");
    return;
  }
  const data = { ...aiResult.resume };
  delete data.template;
  try {
    const draft = await readApiResponse(await fetch("/api/resumes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ templateSlug: "clean-single", templateVersion: 1, data })
    }));
    showToast("草稿已保存，正在打开编辑器", "success");
    updateBrowserRoute({ name: "resume", resumeId: draft.id });
    await applyCurrentRoute();
  } catch (error) {
    showToast(error?.message || "保存草稿失败", "warning");
  }
}

// —— AI 优化：左侧聊天框 → 结构化提案 → 用户确认后应用到当前简历 ——

const AI_FIELD_LABELS = {
  name: "姓名", job: "求职岗位", mobile: "联系电话", email: "联系邮箱", city: "城市",
  workYears: "工作年限", birthday: "出生年月", gender: "性别", start: "开始时间", end: "结束时间",
  organization: "名称", role: "职位", content: "内容", level: "级别", date: "时间",
  salary: "期望薪资", availability: "到岗时间", items: "兴趣"
};

function plainText(value) {
  return String(value ?? "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

function aiFieldLabel(section, field) {
  const def = (section?.fields || []).find((item) => item.key === field);
  return def?.label || AI_FIELD_LABELS[field] || field;
}

function aiSectionTitle(sectionId) {
  return sectionById(sectionId)?.title || sectionId;
}

function aiChangeTargetLabel(change) {
  if (change.op === "addModule") return `新增模块 · ${aiSectionTitle(change.sectionId)}`;
  if (change.op === "removeModule") return `移除模块 · ${aiSectionTitle(change.sectionId)}`;
  if (change.op === "add") return `${aiSectionTitle(change.sectionId)} · 新增条目`;
  if (change.op === "remove") {
    const section = sectionById(change.sectionId);
    const item = section?.items?.[change.itemIndex];
    const summary = plainText([item?.organization, item?.role, item?.name, item?.content].filter(Boolean).join(" "));
    return `${aiSectionTitle(change.sectionId)} · 删除条目${summary ? `（${summary.slice(0, 24)}）` : ""}`;
  }
  if (!change.sectionId) return `基本信息 · ${aiFieldLabel(null, change.field)}`;
  const base = aiSectionTitle(change.sectionId);
  const label = aiFieldLabel(sectionById(change.sectionId), change.field);
  return change.itemIndex !== undefined ? `${base} · 第 ${change.itemIndex + 1} 条 · ${label}` : `${base} · ${label}`;
}

function aiReadField(change) {
  if (!change.sectionId) return resume.profile?.[change.field];
  const section = sectionById(change.sectionId);
  if (!section) return "";
  if (change.itemIndex !== undefined) return section.items?.[change.itemIndex]?.[change.field];
  if (section.type === "richtext" && change.field === "content") return section.content;
  if (section.data && change.field in section.data) return section.data[change.field];
  return section[change.field];
}

function aiChangeBeforeText(change) {
  if (change.op === "add") return "";
  if (change.op === "addModule") return "";
  if (change.op === "removeModule") {
    const section = sectionById(change.sectionId);
    const count = Array.isArray(section?.items) ? section.items.length : 0;
    return count ? `（含 ${count} 条内容）` : "（空模块）";
  }
  if (change.op === "remove") {
    const section = sectionById(change.sectionId);
    const item = section?.items?.[change.itemIndex];
    return plainText([item?.organization, item?.role, item?.name, item?.level, item?.date, item?.content].filter(Boolean).join(" "));
  }
  return plainText(aiReadField(change));
}

function aiApplyChange(change) {
  if (change.op === "addModule") {
    const section = sectionById(change.sectionId);
    if (section) section.visible = true;
    return;
  }
  if (change.op === "removeModule") {
    const section = sectionById(change.sectionId);
    if (section) section.visible = false;
    return;
  }
  if (change.op === "remove") {
    const section = sectionById(change.sectionId);
    if (section?.items) section.items.splice(change.itemIndex, 1);
    return;
  }
  if (change.op === "add") {
    const section = sectionById(change.sectionId);
    if (!section?.items) return;
    const definition = renderableSectionSchemas().find((value) => value.id === section.id);
    const base = definition?.type === "timeline"
      ? emptyTimelineItem(section.id)
      : emptyStructuredItem(section.id, (section.fields || []).map((fieldItem) => fieldItem.key));
    const item = { ...base, ...(change.item || {}), id: makeId(section.id) };
    for (const fieldItem of (section.fields || [])) {
      if (item[fieldItem.key] === undefined) item[fieldItem.key] = "";
    }
    section.items.push(item);
    return;
  }
  if (!change.sectionId) {
    resume.profile[change.field] = change.after;
    return;
  }
  const section = sectionById(change.sectionId);
  if (!section) return;
  if (change.itemIndex !== undefined) {
    const item = section.items?.[change.itemIndex];
    if (item) item[change.field] = change.after;
  } else if (section.type === "richtext" && change.field === "content") {
    section.content = change.after;
  } else if (section.data !== undefined) {
    section.data[change.field] = change.after;
  } else {
    section[change.field] = change.after;
  }
}

function setAiChatOpen(open) {
  elements.aiChatPanel.classList.toggle("is-open", open);
  elements.aiChatPanel.setAttribute("aria-hidden", String(!open));
  if (elements.aiFloatBtn) {
    elements.aiFloatBtn.setAttribute("aria-pressed", String(open));
    elements.aiFloatBtn.hidden = open;
  }
}

// 浮动按钮拖动：pointer 拖拽调整位置，点击（未拖动）才切换面板。
let aiFloatDragging = false;
let aiFloatMoved = false;
let aiFloatStart = { x: 0, y: 0, left: 0, top: 0 };

function restoreAiFloatPosition(btn) {
  try {
    const saved = JSON.parse(localStorage.getItem("aiFloatPos") || "null");
    if (saved?.left && saved?.top) {
      btn.style.left = saved.left;
      btn.style.top = saved.top;
    }
  } catch { /* 忽略无效的本地存储 */ }
}

function setupAiFloatDrag() {
  const btn = elements.aiFloatBtn;
  if (!btn) return;
  restoreAiFloatPosition(btn);

  btn.addEventListener("pointerdown", (event) => {
    const rect = btn.getBoundingClientRect();
    aiFloatDragging = true;
    aiFloatMoved = false;
    aiFloatStart = { x: event.clientX, y: event.clientY, left: rect.left, top: rect.top };
    try { btn.setPointerCapture(event.pointerId); } catch { /* 忽略 */ }
  });
  btn.addEventListener("pointermove", (event) => {
    if (!aiFloatDragging) return;
    const dx = event.clientX - aiFloatStart.x;
    const dy = event.clientY - aiFloatStart.y;
    if (Math.abs(dx) + Math.abs(dy) > 5) aiFloatMoved = true;
    if (!aiFloatMoved) return;
    const rect = btn.getBoundingClientRect();
    const left = Math.max(8, Math.min(window.innerWidth - rect.width - 8, aiFloatStart.left + dx));
    const top = Math.max(8, Math.min(window.innerHeight - rect.height - 8, aiFloatStart.top + dy));
    btn.style.left = `${left}px`;
    btn.style.top = `${top}px`;
  });
  btn.addEventListener("pointerup", () => {
    if (aiFloatMoved) {
      try {
        localStorage.setItem("aiFloatPos", JSON.stringify({ left: btn.style.left, top: btn.style.top }));
      } catch { /* 忽略 */ }
    }
    aiFloatDragging = false;
  });
  btn.addEventListener("click", (event) => {
    if (aiFloatMoved) {
      aiFloatMoved = false;
      event.stopPropagation();
      event.preventDefault();
    }
  });
}

function ensureAiChatHint() {
  if (!elements.aiChatBody.children.length) {
    elements.aiChatBody.innerHTML = '<p class="ai-chat__hint">描述你想怎么改这份简历，AI 会先给你一份修改方案，确认后才应用。例如：把工作经历写得更量化、新增一条项目经历、删除第二条教育经历。</p>';
  }
}

function toggleAiChat() {
  const open = !elements.aiChatPanel.classList.contains("is-open");
  setAiChatOpen(open);
  if (open) {
    ensureAiChatHint();
    elements.aiChatInput.focus();
  }
}

function closeAiChat() {
  setAiChatOpen(false);
}

function appendAiMessage(kind, text) {
  const msg = document.createElement("div");
  msg.className = `ai-msg ai-msg--${kind}`;
  msg.textContent = text;
  elements.aiChatBody.appendChild(msg);
  elements.aiChatBody.scrollTop = elements.aiChatBody.scrollHeight;
}

function clearAiChat() {
  elements.aiChatBody.innerHTML = "";
}

function renderAiProposal(proposal) {
  const changes = proposal.changes || [];
  const opText = { set: "改", add: "增", remove: "删", addModule: "加模块", removeModule: "删模块" };
  const changesHtml = changes.map((change) => {
    const opClass = change.op === "addModule" ? "ai-change__op--add" : change.op === "removeModule" ? "ai-change__op--remove" : `ai-change__op--${change.op}`;
    let diffHtml = "";
    if (change.op === "set") {
      const before = aiChangeBeforeText(change);
      diffHtml = `<div class="ai-change__diff">
        <div class="ai-change__before">${escapeHtml(before || "（空）")}</div>
        <div class="ai-change__arrow">↓</div>
        <div class="ai-change__after">${escapeHtml(plainText(change.after) || "（空）")}</div>
      </div>`;
    } else if (change.op === "add") {
      const section = sectionById(change.sectionId);
      const fields = Object.entries(change.item || {}).filter(([, value]) => String(value).trim());
      diffHtml = `<div class="ai-change__diff"><div class="ai-change__after">${fields.length ? fields.map(([key, value]) => `${escapeHtml(aiFieldLabel(section, key))}：${escapeHtml(plainText(value))}`).join("；") : "（空条目）"}</div></div>`;
    } else if (change.op === "remove") {
      diffHtml = `<div class="ai-change__diff"><div class="ai-change__before">${escapeHtml(aiChangeBeforeText(change) || "（空条目）")}</div></div>`;
    } else if (change.op === "addModule") {
      diffHtml = `<div class="ai-change__diff"><div class="ai-change__after">启用该模块（当前未显示）</div></div>`;
    } else if (change.op === "removeModule") {
      diffHtml = `<div class="ai-change__diff"><div class="ai-change__before">${escapeHtml(aiChangeBeforeText(change) || "隐藏该模块")}</div></div>`;
    }
    return `<div class="ai-change">
      <div class="ai-change__target">${escapeHtml(aiChangeTargetLabel(change))}<span class="ai-change__op ${opClass}">${opText[change.op]}</span></div>
      ${diffHtml}
    </div>`;
  }).join("");

  const card = document.createElement("div");
  card.className = "ai-proposal";
  card.innerHTML = `
    ${proposal.summary ? `<div class="ai-proposal__summary">${escapeHtml(proposal.summary)}</div>` : ""}
    <div class="ai-proposal__list">${changesHtml}</div>
    <div class="ai-proposal__actions">
      <button type="button" class="ai-proposal__cancel" data-action="ai-cancel">取消</button>
      <button type="button" class="ai-proposal__apply" data-action="ai-apply">确认应用</button>
    </div>`;
  elements.aiChatBody.appendChild(card);
  elements.aiChatBody.scrollTop = elements.aiChatBody.scrollHeight;
}

async function handleAiChatSubmit(event) {
  event.preventDefault();
  if (aiOptimizing) return;
  const instruction = elements.aiChatInput.value.trim();
  if (!instruction) {
    showToast("请先填写修改要求", "warning");
    elements.aiChatInput.focus();
    return;
  }
  if (!currentUser) {
    showToast("登录后才能使用 AI 优化", "info");
    openLogin("/editor");
    return;
  }
  aiOptimizing = true;
  elements.aiChatSend.disabled = true;
  elements.aiChatSend.textContent = "生成中…";
  appendAiMessage("user", instruction);
  elements.aiChatInput.value = "";

  try {
    const deviceId = await getDeviceId().catch(() => "");
    const headers = { "Content-Type": "application/json" };
    if (deviceId) headers["X-Device-Id"] = deviceId;
    const proposal = await readApiResponse(await fetch("/api/ai/optimize", {
      method: "POST",
      headers,
      body: JSON.stringify({ resume, instruction })
    }));
    aiOptimizePending = proposal;
    renderAiProposal(proposal);
  } catch (error) {
    appendAiMessage("error", error?.message || "AI 优化失败，请稍后重试");
  } finally {
    aiOptimizing = false;
    elements.aiChatSend.disabled = false;
    elements.aiChatSend.textContent = "发送";
  }
}

function applyAiOptimize() {
  if (!aiOptimizePending) return;
  for (const change of (aiOptimizePending.changes || [])) aiApplyChange(change);
  aiOptimizePending = null;
  clearAiChat();
  renderAll();
  scheduleSave(0);
  showToast("AI 修改已应用", "success");
}

function cancelAiOptimize() {
  aiOptimizePending = null;
  clearAiChat();
  showToast("已取消 AI 修改", "info");
}

async function createRemoteDraft() {
  const template = resume.template || { slug: "clean-single", version: 1 };
  const draft = await readApiResponse(await fetch("/api/resumes", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ templateSlug: template.slug, templateVersion: template.version, data: resume })
  }));
  resume.remoteId = draft.id;
  resume.remoteRevision = draft.revision;
  saveLocalResume();
  updateBrowserRoute({ name: "resume", resumeId: draft.id }, "replace");
}

async function persistRemoteDraft() {
  if (!resume.remoteId) {
    await createRemoteDraft();
    return;
  }

  try {
    const result = await readApiResponse(await fetch(`/api/resumes/${encodeURIComponent(resume.remoteId)}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ revision: resume.remoteRevision || 1, data: resume })
    }));
    resume.remoteRevision = result.revision;
  } catch (error) {
    if (error?.status !== 404) throw error;
    delete resume.remoteId;
    delete resume.remoteRevision;
    await createRemoteDraft();
  }
}

function delay(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function exportResume() {
  if (exportInProgress) return;
  if (!currentUser) {
    openLogin(window.location.pathname || "/");
    showToast("登录后才能导出", "info");
    return;
  }
  closePopovers();
  saveNow();
  setExportState(true, "正在提交…");

  try {
    await persistRemoteDraft();
    hasUnsavedChanges = false;
    saveLocalResume();
    updateStatusCards();
    const format = elements.exportFormat.value;
    let job = await readApiResponse(await fetch("/api/exports", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        resumeId: resume.remoteId,
        revision: resume.remoteRevision,
        format,
        template: resume.template || { slug: "clean-single", version: 1 },
        fileName: `${resume.profile.name || "简历"}-${resume.title || "在线简历"}.${format}`
      })
    }));

    for (let attempt = 0; attempt < 120; attempt += 1) {
      if (job.status === "completed") break;
      if (job.status === "failed") throw new Error(job.error || "PDF 生成失败");
      setExportState(true, job.status === "processing" ? "后端排版中…" : "等待导出…");
      await delay(500);
      job = await readApiResponse(await fetch(
        `/api/exports/${encodeURIComponent(job.id)}?token=${encodeURIComponent(job.token)}`,
        { cache: "no-store" }
      ));
    }

    if (job.status !== "completed" || !job.downloadUrl) throw new Error("PDF 生成超时，请稍后重试");
    const anchor = document.createElement("a");
    anchor.href = job.downloadUrl;
    anchor.download = "";
    document.body.append(anchor);
    anchor.click();
    anchor.remove();
    const formatLabel = format === "docx" ? "Word" : "PDF";
    showToast(`${formatLabel} 已由后端生成${job.pageCount ? `，共 ${job.pageCount} 页` : ""}`);
  } catch (error) {
    showToast(error?.message || "PDF 导出失败", "warning");
  } finally {
    setExportState(false);
  }
}

function showTemplateLibrary({ historyMode = "none" } = {}) {
  if (!resume.remoteId && resume.template) {
    clearTimeout(saveTimer);
    clearTimeout(fidelityTimer);
    saveTimer = null;
    fidelityTimer = null;
    resume = createInitialResume();
    activeModuleId = "profile";
    activeItemBySection.clear();
    hasUnsavedChanges = false;
    localStorage.removeItem(STORAGE_KEY);
    localStorage.removeItem(LEGACY_STORAGE_KEY);
  }
  if (historyMode !== "none") updateBrowserRoute({ name: "templates" }, historyMode);
  document.documentElement.classList.remove("home-page-mode");
  document.documentElement.classList.add("template-library-mode");
  elements.homePage.hidden = true;
  elements.draftPage.hidden = true;
  elements.app.hidden = true;
  elements.adminPage.hidden = true;
  elements.loginPage.hidden = true;
  elements.aiPage.hidden = true;
  revealView(elements.templateLibrary);
  loadDrafts();
  window.scrollTo({ top: 0, behavior: "auto" });
}

function renderDrafts() {
  const emptyText = currentUser
    ? "还没有草稿，从模板库创建一份简历。"
    : "登录后即可在云端保存和查看草稿。";
  elements.draftCount.textContent = availableDrafts.length ? `${availableDrafts.length} 份草稿` : "";
  elements.draftEmptyState.textContent = emptyText;
  elements.homeEmptyState.textContent = emptyText;
  elements.draftEmptyState.hidden = availableDrafts.length > 0;
  elements.draftList.innerHTML = availableDrafts.map((draft) => {
    const updatedAt = new Date(draft.updatedAt);
    const updatedLabel = Number.isNaN(updatedAt.getTime())
      ? "刚刚更新"
      : updatedAt.toLocaleString("zh-CN", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: false });
    return `
      <article class="draft-item">
        <div class="draft-item__identity"><strong>${escapeHtml(draft.candidateName)}</strong><span>${escapeHtml(draft.title)}</span></div>
        <div class="draft-item__meta"><span>${escapeHtml(draft.templateName)} · v${draft.templateVersion}</span><span>${escapeHtml(updatedLabel)} · 修订 ${draft.revision}</span></div>
        <div class="draft-item__actions">
          <button class="draft-continue" type="button" data-action="continue-draft" data-resume-id="${escapeHtml(draft.id)}">继续编辑 <span aria-hidden="true">→</span></button>
          <button class="draft-delete" type="button" data-action="delete-draft" data-resume-id="${escapeHtml(draft.id)}" aria-label="删除 ${escapeHtml(draft.candidateName)} 的草稿" title="删除草稿">删除</button>
        </div>
      </article>`;
  }).join("");
  const recent = availableDrafts.slice(0, 5);
  elements.homeDraftCount.textContent = recent.length ? `${availableDrafts.length} 份草稿` : "";
  elements.homeEmptyState.hidden = recent.length > 0;
  elements.homeDraftList.innerHTML = recent.map((draft) => `
    <a class="home-draft-item" href="/resumes/${encodeURIComponent(draft.id)}/edit">
      <span><strong>${escapeHtml(draft.candidateName)}</strong><small>${escapeHtml(draft.title)}</small></span>
      <span><small>${escapeHtml(draft.templateName)}</small><strong aria-hidden="true">→</strong></span>
    </a>`).join("");
}

async function loadDrafts() {
  if (!currentUser) {
    availableDrafts = [];
    renderDrafts();
    return;
  }
  try {
    const payload = await readApiResponse(await fetch("/api/resumes?limit=20", { cache: "no-store" }));
    availableDrafts = payload.resumes || [];
    renderDrafts();
  } catch (error) {
    if (error?.status === 401) {
      currentUser = null;
      updateAccountUi();
    }
    availableDrafts = [];
    renderDrafts();
  }
}

function hideTemplateLibrary() {
  document.documentElement.classList.remove("template-library-mode");
  elements.templateLibrary.hidden = true;
  revealView(elements.app);
}

function showDraftPage() {
  document.documentElement.classList.remove("home-page-mode");
  document.documentElement.classList.add("template-library-mode");
  elements.homePage.hidden = true;
  elements.templateLibrary.hidden = true;
  elements.app.hidden = true;
  elements.adminPage.hidden = true;
  elements.loginPage.hidden = true;
  elements.aiPage.hidden = true;
  revealView(elements.draftPage);
  loadDrafts();
  window.scrollTo({ top: 0, behavior: "auto" });
}

function hideDraftPage() {
  elements.draftPage.hidden = true;
}

function showHomePage() {
  document.documentElement.classList.remove("template-library-mode");
  document.documentElement.classList.add("home-page-mode");
  elements.app.hidden = true;
  elements.templateLibrary.hidden = true;
  elements.draftPage.hidden = true;
  elements.adminPage.hidden = true;
  elements.loginPage.hidden = true;
  elements.aiPage.hidden = true;
  revealView(elements.homePage);
  loadDrafts();
  window.scrollTo({ top: 0, behavior: "auto" });
}

function hideHomePage() {
  document.documentElement.classList.remove("home-page-mode");
  elements.homePage.hidden = true;
}

function updateBrowserRoute(route, mode = "push") {
  const path = routePath(route);
  if (window.location.pathname === path) return;
  window.history[mode === "replace" ? "replaceState" : "pushState"]({}, "", path);
}

async function loadRemoteResume(id) {
  const payload = await readApiResponse(await fetch(`/api/resumes/${encodeURIComponent(id)}`, { cache: "no-store" }));
  const draft = payload.resume;
  let localDraft = null;
  try {
    const saved = localStorage.getItem(draftStorageKey(id));
    localDraft = saved ? JSON.parse(saved) : null;
  } catch {
    localDraft = null;
  }
  const canRestoreLocal = localDraft?.remoteId === id
    && Number(localDraft.remoteRevision) === Number(draft.revision)
    && Number(localDraft.revision || 0) > Number(draft.data?.revision || 0);
  resume = normalizeResume(canRestoreLocal ? localDraft : (draft.data || {}));
  resume.remoteId = draft.id;
  resume.remoteRevision = draft.revision;
  resume.template = {
    slug: draft.templateSlug,
    version: draft.templateVersion,
    name: availableTemplates.find((item) => item.slug === draft.templateSlug)?.name || draft.templateSlug,
    engine: availableTemplates.find((item) => item.slug === draft.templateSlug)?.engine || "html-native",
    editorSchema: draft.editorSchema || availableTemplates.find((item) => item.slug === draft.templateSlug)?.editorSchema || getTemplateSchema(draft.templateSlug),
    previewUrl: availableTemplates.find((item) => item.slug === draft.templateSlug)?.previewUrl || null
  };
  applyTemplateEditorSchema(resume, resume.template.editorSchema);
  hasUnsavedChanges = canRestoreLocal;
  saveLocalResume();
}

async function applyCurrentRoute({ replaceInvalid = false } = {}) {
  const route = parseAppRoute(window.location.pathname);
  if (route.name === "home") {
    showHomePage();
    return;
  }
  if (route.name === "templates") {
    showTemplateLibrary();
    return;
  }
  if (route.name === "drafts") {
    showDraftPage();
    return;
  }
  if (route.name === "login") {
    showLoginPage();
    return;
  }
  if (route.name === "ai") {
    if (!currentUser) {
      openLogin("/ai", "replace");
      return;
    }
    showAiPage();
    return;
  }
  if (route.name === "admin") {
    if (!currentUser) {
      openLogin("/admin", "replace");
      return;
    }
    if (!currentUser.isAdmin) {
      showToast("需要管理员权限", "warning");
      showHomePage();
      updateBrowserRoute({ name: "home" }, "replace");
      return;
    }
    showAdminPage();
    return;
  }
  if (route.name === "resume") {
    if (!currentUser) {
      openLogin(`/resumes/${route.resumeId}/edit`, "replace");
      return;
    }
    try {
      await loadRemoteResume(route.resumeId);
      hideHomePage();
      hideDraftPage();
      hideTemplateLibrary();
      hideAdminPage();
      hideLoginPage();
      elements.aiPage.hidden = true;
      renderAll();
      setSavedState("云端草稿已保存");
      return;
    } catch (error) {
      showToast(error?.message || "无法打开该草稿", "warning");
      showTemplateLibrary({ historyMode: "replace" });
      return;
    }
  }
  if (route.name === "editor" && resume.remoteId) {
    try {
      await loadRemoteResume(resume.remoteId);
    } catch (error) {
      if (error?.status === 404) {
        delete resume.remoteId;
        delete resume.remoteRevision;
      } else {
        showToast("暂时无法确认云端草稿，已保留本机内容", "warning");
      }
      hasUnsavedChanges = true;
      saveLocalResume();
    }
  }
  if (resume.template) {
    hideHomePage();
    hideDraftPage();
    hideTemplateLibrary();
    hideAdminPage();
    hideLoginPage();
    elements.aiPage.hidden = true;
    renderAll();
    const target = resume.remoteId
      ? { name: "resume", resumeId: resume.remoteId }
      : { name: "editor" };
    if (route.name === "home" || replaceInvalid) updateBrowserRoute(target, "replace");
  } else {
    showTemplateLibrary({ historyMode: "replace" });
  }
}

function renderTemplateCard(template) {
  const ready = template.selectable === true;
  const recommended = template.slug === "clean-single";
  const statusText = ready ? "可使用"
    : template.status === "blocked" ? "安全检查未通过"
      : template.status === "needs_qa" ? "待高保真验收" : "待字段标注";
  const preview = template.previewUrl
    ? `<img src="${escapeHtml(template.previewUrl)}" alt="${escapeHtml(template.name)}模板预览" loading="lazy" />`
    : `<div class="template-preview-placeholder"><span>${escapeHtml(template.name.slice(0, 1))}</span></div>`;
  const description = recommended
    ? "AI 快速生成的默认模板 · 极简清晰 · ATS 友好，无需整理个人信息即可导出。"
    : (template.description || "结构化简历模板");
  return `
    <article class="template-card ${ready ? "is-ready" : "is-pending"}${recommended ? " is-recommended" : ""}">
      <div class="template-preview">${preview}${recommended ? `<span class="template-badge">★ 推荐</span>` : ""}<span class="template-status">${statusText}</span></div>
      <div class="template-card__body">
        <div><strong>${escapeHtml(template.name)}</strong><span>${escapeHtml(template.category)} · v${template.version}</span></div>
        <p>${escapeHtml(description)}</p>
        <button type="button" data-action="select-template" data-template-slug="${escapeHtml(template.slug)}" data-template-version="${template.version}" ${ready ? "" : "disabled"}>
          ${ready ? (recommended ? "使用推荐模板" : "使用此模板") : template.status === "needs_qa" ? "验收后开放" : "标注后开放"}
        </button>
      </div>
    </article>`;
}

// —— 推荐模板旁的「编辑器操作」演示循环：模拟在编辑面板逐模块填写字段、实时更新预览 ——
let featuredDemoStarted = false;

const featuredDemoSteps = [
  { tab: "profile", label: "姓名", text: "林晓", score: 22, fill: "profile" },
  { tab: "experience", label: "工作内容", text: "负责订单系统重构，接口 QPS 提升 50%", score: 55, fill: "experience" },
  { tab: "skills", label: "技能描述", text: "Java · Spring · Redis · MySQL", score: 82, fill: "skills" },
  { tab: "summary", label: "自我评价", text: "5 年后端，擅长高并发与系统稳定性", score: 100, fill: "summary" }
];

function featuredDemoReducedMotion() {
  return window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches === true;
}

function featuredDemoSleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function typeFeaturedDemoText(el, text, speed) {
  for (let i = 0; i <= text.length; i += 1) {
    el.textContent = text.slice(0, i);
    await featuredDemoSleep(speed);
  }
}

function setFeaturedDemoTab(root, tab) {
  root.querySelectorAll("[data-fed-tab]").forEach((node) => {
    node.classList.toggle("is-active", node.dataset.fedTab === tab);
  });
}

function setFeaturedDemoScore(root, score) {
  const scoreEl = root.querySelector("[data-fed-score]");
  const barEl = root.querySelector("[data-fed-bar]");
  if (scoreEl) scoreEl.textContent = `${score}%`;
  if (barEl) barEl.style.width = `${score}%`;
}

function applyFeaturedDemoFill(root, fill) {
  if (fill === "profile") {
    const nameEl = root.querySelector("[data-fed-name]");
    const roleEl = root.querySelector("[data-fed-role]");
    if (nameEl) nameEl.textContent = "林晓";
    if (roleEl) roleEl.textContent = "产品经理 · 5 年经验";
    return;
  }
  const section = root.querySelector(`[data-fed-section="${fill}"]`);
  if (section) section.classList.add("is-filled");
}

function resetFeaturedDemo(root) {
  const nameEl = root.querySelector("[data-fed-name]");
  const roleEl = root.querySelector("[data-fed-role]");
  const textEl = root.querySelector("[data-fed-text]");
  if (nameEl) nameEl.textContent = "";
  if (roleEl) roleEl.textContent = "";
  if (textEl) textEl.textContent = "";
  root.querySelectorAll("[data-fed-section]").forEach((section) => section.classList.remove("is-filled"));
  setFeaturedDemoScore(root, 0);
}

function fillFeaturedDemo() {
  const root = document.getElementById("featuredDemo");
  if (!root) return;
  featuredDemoSteps.forEach((step) => applyFeaturedDemoFill(root, step.fill));
  setFeaturedDemoTab(root, "summary");
  setFeaturedDemoScore(root, 100);
  const textEl = root.querySelector("[data-fed-text]");
  const labelEl = root.querySelector("[data-fed-label]");
  const last = featuredDemoSteps[featuredDemoSteps.length - 1];
  if (textEl) textEl.textContent = last.text;
  if (labelEl) labelEl.textContent = last.label;
}

async function runFeaturedDemo() {
  if (featuredDemoStarted) return;
  featuredDemoStarted = true;
  const root = document.getElementById("featuredDemo");
  if (!root) return;
  if (featuredDemoReducedMotion()) {
    fillFeaturedDemo();
    return;
  }
  const textEl = root.querySelector("[data-fed-text]");
  const labelEl = root.querySelector("[data-fed-label]");
  if (!textEl) return;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    resetFeaturedDemo(root);
    for (const step of featuredDemoSteps) {
      setFeaturedDemoTab(root, step.tab);
      if (labelEl) labelEl.textContent = step.label;
      await typeFeaturedDemoText(textEl, step.text, 30);
      await featuredDemoSleep(240);
      applyFeaturedDemoFill(root, step.fill);
      setFeaturedDemoScore(root, step.score);
      await featuredDemoSleep(640);
    }
    await featuredDemoSleep(1600);
  }
}

function renderFeaturedTemplate(template) {
  const ready = template.selectable === true;
  const preview = template.previewUrl
    ? `<img src="${escapeHtml(template.previewUrl)}" alt="${escapeHtml(template.name)}模板预览" />`
    : `<div class="template-preview-placeholder"><span>${escapeHtml(template.name.slice(0, 1))}</span></div>`;
  return `
    <div class="template-featured__grid">
      <article class="template-card is-ready is-recommended template-card--featured">
        <div class="template-preview">${preview}<span class="template-badge">★ 推荐</span><span class="template-status">可使用</span></div>
        <div class="template-card__body">
          <div><strong>${escapeHtml(template.name)}</strong><span>${escapeHtml(template.category)} · v${template.version}</span></div>
          <p>${escapeHtml("AI 快速生成的默认模板，极简清晰、ATS 友好。")}</p>
          <div class="template-recommend-reason"><strong>推荐理由</strong>：无需整理个人信息，粘贴经历描述即可由 AI 自动生成结构化简历。</div>
          <button type="button" data-action="select-template" data-template-slug="${escapeHtml(template.slug)}" data-template-version="${template.version}" ${ready ? "" : "disabled"}>快速开始</button>
        </div>
      </article>
      <div class="featured-editor-demo template-featured__demo" id="featuredDemo" aria-hidden="true">
        <div class="fed-paper">
          <div class="fed-paper__name" data-fed-name></div>
          <div class="fed-paper__role" data-fed-role></div>
          <div class="fed-section" data-fed-section="experience">
            <span class="fed-section__title">工作经历</span>
            <div class="fed-section__lines"><i></i><i></i><i></i></div>
          </div>
          <div class="fed-section" data-fed-section="skills">
            <span class="fed-section__title">技能特长</span>
            <div class="fed-section__lines"><i></i><i></i></div>
          </div>
          <div class="fed-section" data-fed-section="summary">
            <span class="fed-section__title">自我评价</span>
            <div class="fed-section__lines"><i></i><i></i></div>
          </div>
        </div>
        <div class="fed-drawer">
          <div class="fed-tabs">
            <span class="fed-tab is-active" data-fed-tab="profile">基本信息</span>
            <span class="fed-tab" data-fed-tab="experience">工作经历</span>
            <span class="fed-tab" data-fed-tab="skills">技能特长</span>
            <span class="fed-tab" data-fed-tab="summary">自我评价</span>
          </div>
          <div class="fed-field">
            <span class="fed-field__label" data-fed-label>姓名</span>
            <div class="fed-field__input"><span data-fed-text></span><span class="fed-caret"></span></div>
          </div>
        </div>
        <div class="fed-status">
          <span class="fed-status__score">完成度 <strong data-fed-score>0%</strong></span>
          <span class="fed-status__bar"><i data-fed-bar></i></span>
        </div>
      </div>
    </div>`;
}

function renderTemplateLibrary() {
  elements.templateLibraryStatus.hidden = availableTemplates.length > 0;
  const ordered = [...availableTemplates].sort((a, b) => {
    const aRecommended = a.slug === "clean-single" ? 1 : 0;
    const bRecommended = b.slug === "clean-single" ? 1 : 0;
    return bRecommended - aRecommended; // 推荐模板置顶，其余保持原顺序
  });
  const featured = ordered.find((item) => item.slug === "clean-single");
  const grid = ordered.filter((item) => item.slug !== "clean-single");

  if (featured) {
    elements.templateFeatured.innerHTML = renderFeaturedTemplate(featured);
    elements.templateFeatured.hidden = false;
    runFeaturedDemo();
  } else {
    elements.templateFeatured.hidden = true;
    elements.templateFeatured.innerHTML = "";
  }

  elements.templateList.innerHTML = grid.map(renderTemplateCard).join("");
}

async function loadTemplates() {
  try {
    const payload = await readApiResponse(await fetch("/api/templates", { cache: "no-store" }));
    availableTemplates = payload.templates || [];
    renderTemplateLibrary();
  } catch (error) {
    elements.templateLibraryStatus.hidden = false;
    elements.templateLibraryStatus.textContent = error?.message || "模板库加载失败";
  }
}

async function continueDraft(id) {
  if (!currentUser) {
    openLogin(window.location.pathname || "/drafts");
    return;
  }
  updateBrowserRoute({ name: "resume", resumeId: id });
  await applyCurrentRoute();
}

async function deleteDraft(id) {
  const draft = availableDrafts.find((item) => item.id === id);
  if (!draft) return;
  if (!(await confirmAction({ title: "删除草稿", message: `确定删除「${draft.candidateName} - ${draft.title}」？删除后无法恢复。`, confirmLabel: "删除", danger: true }))) return;
  try {
    const response = await fetch(`/api/resumes/${encodeURIComponent(id)}`, { method: "DELETE" });
    if (!response.ok) await readApiResponse(response);
    if (resume.remoteId === id) {
      resume = createInitialResume();
      localStorage.removeItem(STORAGE_KEY);
    }
    localStorage.removeItem(draftStorageKey(id));
    availableDrafts = availableDrafts.filter((item) => item.id !== id);
    renderDrafts();
    showToast("草稿已删除", "info");
  } catch (error) {
    showToast(error?.message || "删除草稿失败", "warning");
  }
}

async function selectTemplate(target) {
  const template = availableTemplates.find((item) =>
    item.slug === target.dataset.templateSlug && item.version === Number(target.dataset.templateVersion)
  );
  if (!template?.selectable) return;
  if (!currentUser) {
    openLogin("/templates");
    showToast("登录后开始编辑", "info");
    return;
  }
  target.disabled = true;
  resume = createResumeForTemplate({
    slug: template.slug,
    version: template.version,
    name: template.name,
    engine: template.engine,
    previewUrl: template.previewUrl,
    editorSchema: template.editorSchema || getTemplateSchema(template.slug),
    defaultResume: template.defaultResume || null
  });
  activeModuleId = "profile";
  activeItemBySection.clear();
  hasUnsavedChanges = true;
  saveNow();
  hideTemplateLibrary();
  updateBrowserRoute({ name: "editor" });
  renderAll();
  showToast("模板已应用，点击保存后加入草稿", "info");
  target.disabled = false;
  target.textContent = "使用此模板";
}

function manualEdit() {
  const template = availableTemplates.find((item) => item.slug === "clean-single");
  resume = createResumeForTemplate({
    slug: "clean-single",
    version: template?.version || 1,
    name: template?.name || "极简轻",
    engine: template?.engine || "html-native",
    previewUrl: template?.previewUrl || null,
    editorSchema: template?.editorSchema || getTemplateSchema("clean-single"),
    defaultResume: template?.defaultResume || null
  });
  activeModuleId = "profile";
  activeItemBySection.clear();
  hasUnsavedChanges = true;
  saveNow();
  if (!currentUser) {
    openLogin("/editor");
    showToast("登录后开始编辑", "info");
    return;
  }
  hideAiPage();
  revealView(elements.app);
  updateBrowserRoute({ name: "editor" });
  renderAll();
  showToast("已进入手动编辑，填写内容后点击保存即可生成草稿", "info");
}

function fitOnePage() {
  if (currentPages <= 1) {
    showToast("当前已经是一页简历", "info");
    return;
  }
  const tryFit = () => {
    if (currentPages <= 1 || resume.settings.sectionGap <= 8) {
      scheduleSave(0);
      showToast(currentPages <= 1 ? "已压缩模块间距并调整为一页" : "已达到最小间距，请适当删减内容", currentPages <= 1 ? "success" : "warning");
      renderEditor();
      return;
    }
    resume.settings.sectionGap = Math.max(8, resume.settings.sectionGap - 2);
    applySettings();
    renderPreview();
    requestAnimationFrame(() => requestAnimationFrame(tryFit));
  };
  tryFit();
}

document.addEventListener("click", async (event) => {
  const commandButton = event.target.closest("[data-command]");
  if (commandButton) {
    event.preventDefault();
    const command = commandButton.dataset.command;
    const editor = commandButton.closest(".rich-editor-box")?.querySelector(".rich-editor");
    editor?.focus();
    if (command === "createLink") {
      const url = await promptValue({ title: "添加链接", message: "请输入以 http:// 或 https:// 开头的链接地址。", value: "https://", confirmLabel: "插入链接" });
      if (url && /^https?:\/\//i.test(url)) document.execCommand(command, false, url);
    } else document.execCommand(command, false, null);
    if (editor) updateRichEditor(editor);
    return;
  }

  const popoverButton = event.target.closest("[data-popover]");
  if (popoverButton) {
    event.preventDefault();
    const id = popoverButton.dataset.popover;
    const popover = document.querySelector(`#${id}`);
    const willOpen = popover.hidden;
    closePopovers(id);
    popover.hidden = !willOpen;
    return;
  }

  if (!event.target.closest(".popover") && !event.target.closest("[data-popover]")) closePopovers();

  const previewTarget = event.target.closest("[data-open-module]");
  if (previewTarget) {
    activeModuleId = previewTarget.dataset.openModule;
    drawerOpen = true;
    renderTabs();
    renderEditor();
    elements.drawer.classList.add("is-open");
    return;
  }

  const actionTarget = event.target.closest("[data-action]");
  if (!actionTarget) return;
  const action = actionTarget.dataset.action;

  if (action === "account") { if (currentUser) toggleAccountMenu(actionTarget); else openLogin(window.location.pathname || "/"); }
  else if (action === "toggle-theme") toggleTheme();
  else if (action === "open-settings") openSettings();
  else if (action === "close-settings") closeSettings();
  else if (action === "close-login") closeLogin();
  else if (action === "logout") handleLogout();
  else if (action === "admin-toggle-admin") adminToggleAdmin(actionTarget);
  else if (action === "admin-toggle-disabled") adminToggleDisabled(actionTarget);
  else if (action === "admin-delete-user") adminDeleteUser(actionTarget);
  else if (action === "admin-download-draft") adminDownloadDraft(actionTarget.dataset.resumeId);
  else if (action === "admin-delete-draft") adminDeleteDraft(actionTarget);
  else if (action === "admin-clear-ai-key") clearAdminAiKey();
  else if (action === "admin-clear-secret") clearAdminSecret(actionTarget);
  else if (action === "admin-revoke-sessions") adminRevokeSessions(actionTarget);
  else if (action === "admin-restore-user") adminRestoreUser(actionTarget);
  else if (action === "admin-purge-user") adminPurgeUser(actionTarget);
  else if (action === "admin-restore-resume") adminRestoreResume(actionTarget);
  else if (action === "admin-purge-resume") adminPurgeResume(actionTarget);
  else if (action === "admin-new-announcement") openAnnouncementForm();
  else if (action === "admin-cancel-announcement") cancelAnnouncementForm();
  else if (action === "admin-edit-announcement") {
    const announcement = adminAnnouncements.find((item) => item.id === actionTarget.dataset.announcementId);
    openAnnouncementForm(announcement);
  } else if (action === "admin-toggle-announcement") adminToggleAnnouncement(actionTarget);
  else if (action === "admin-delete-announcement") adminDeleteAnnouncement(actionTarget);
  else if (action === "admin-reply-feedback") openFeedbackReply(actionTarget);
  else if (action === "view-feedback") viewFeedback(actionTarget);
  else if (action === "close-feedback-detail") closeFeedbackDetail();
  else if (action === "admin-cancel-feedback") cancelFeedbackReply();
  else if (action === "admin-template-status") adminTemplateStatus(actionTarget);
  else if (action === "admin-export-csv") adminExportCsv(actionTarget);
  else if (action === "admin-refresh-system") loadAdminSystem();
  else if (action === "admin-retry-failed") adminRetryFailed();
  else if (action === "admin-clean-queue") adminCleanQueue(actionTarget);
  else if (action === "admin-ack-alert") adminAckAlert(actionTarget);
  else if (action === "open-feedback") openFeedback();
  else if (action === "close-feedback") closeFeedback();
  else if (action === "open-messages") openMessages();
  else if (action === "close-messages") closeMessages();
  else if (action === "message-mark-read") markMessageRead(actionTarget);
  else if (action === "dismiss-banner") {
    localStorage.setItem("dismissedBanner", actionTarget.dataset.bannerId);
    const banner = actionTarget.closest("#announcementBanner");
    if (banner) banner.hidden = true;
  }
  else if (action === "ai-guide-role-next") {
    aiJobContext.targetRole = document.querySelector("#aiGuideRole")?.value.trim() || "";
    setAiGuideStep("stage");
  }
  else if (action === "ai-guide-role-skip") {
    aiJobContext.targetRole = "";
    setAiGuideStep("stage");
  }
  else if (action === "ai-guide-stage") {
    aiJobContext.jobStage = actionTarget.dataset.stage || "unsure";
    setAiGuideStep("jobDescription");
  }
  else if (action === "ai-guide-jd-next") {
    aiJobContext.jobDescription = document.querySelector("#aiGuideJd")?.value.trim() || "";
    openAiWorkspace();
  }
  else if (action === "ai-guide-jd-skip") {
    aiJobContext.jobDescription = "";
    openAiWorkspace();
  }
  else if (action === "ai-restart-guide") restartAiGuide();
  else if (action === "ai-generate") generateAi();
  else if (action === "ai-regen") generateAi();
  else if (action === "ai-save") saveAiDraft();
  else if (action === "ai-confirm-projects") confirmAiProjects();
  else if (action === "ai-import-word") elements.aiWordFile.click();
  else if (action === "ai-voice") toggleAiVoice();
  else if (action === "manual-edit") manualEdit();
  else if (action === "toggle-add-module") toggleAddModuleMenu();
  else if (action === "add-module") addModule(actionTarget.dataset.moduleId);
  else if (action === "select-template") selectTemplate(actionTarget);
  else if (action === "save-draft") saveDraft();
  else if (action === "change-template") showTemplateLibrary({ historyMode: "push" });
  else if (action === "continue-draft") continueDraft(actionTarget.dataset.resumeId);
  else if (action === "delete-draft") deleteDraft(actionTarget.dataset.resumeId);
  else if (action === "select-module") {
    activeModuleId = actionTarget.dataset.moduleId;
    drawerOpen = true;
    renderTabs();
    renderEditor();
    elements.drawer.classList.add("is-open");
  } else if (action === "toggle-module") {
    event.stopPropagation();
    const section = sectionById(actionTarget.dataset.moduleId);
    section.visible = !section.visible;
    renderAll();
    scheduleSave();
  } else if (action === "move-module") {
    event.stopPropagation();
    const index = resume.sections.findIndex((section) => section.id === actionTarget.dataset.moduleId);
    const direction = Number(actionTarget.dataset.direction);
    const schemaById = new Map(renderableSectionSchemas().map((value) => [value.id, value]));
    let targetIndex = index + direction;
    while (targetIndex >= 0 && targetIndex < resume.sections.length && !schemaById.has(resume.sections[targetIndex].id)) targetIndex += direction;
    if (schemaById.get(resume.sections[index].id)?.zone !== schemaById.get(resume.sections[targetIndex]?.id)?.zone) return;
    resume.sections = moveItem(resume.sections, index, targetIndex);
    renderAll();
    scheduleSave();
  } else if (action === "toggle-drawer") {
    drawerOpen = !drawerOpen;
    elements.drawer.classList.toggle("is-open", drawerOpen);
  } else if (action === "toggle-ai-chat") {
    toggleAiChat();
  } else if (action === "close-ai-chat") {
    closeAiChat();
  } else if (action === "ai-apply") {
    applyAiOptimize();
  } else if (action === "ai-cancel") {
    cancelAiOptimize();
  } else if (action === "select-entry") {
    activeItemBySection.set(actionTarget.dataset.sectionId, actionTarget.dataset.itemId);
    renderEditor();
  } else if (action === "add-entry") {
    const section = sectionById(actionTarget.dataset.sectionId);
    const definition = renderableSectionSchemas().find((value) => value.id === section.id);
    const item = definition?.type === "timeline"
      ? emptyTimelineItem(section.id)
      : emptyStructuredItem(section.id, (section.fields || []).map((fieldItem) => fieldItem.key));
    for (const fieldItem of (section.fields || [])) {
      if (item[fieldItem.key] === undefined) item[fieldItem.key] = "";
    }
    section.items.push(item);
    activeItemBySection.set(section.id, item.id);
    renderEditor();
    renderPreview();
    scheduleSave();
  } else if (action === "toggle-field") {
    const section = sectionById(actionTarget.dataset.sectionId);
    const fieldItem = (section?.fields || []).find((item) => item.key === actionTarget.dataset.fieldKey);
    if (!fieldItem) return;
    fieldItem.visible = fieldItem.visible === false;
    renderEditor();
    renderPreview();
    scheduleSave();
  } else if (action === "move-field") {
    const section = sectionById(actionTarget.dataset.sectionId);
    if (!Array.isArray(section?.fields)) return;
    const index = section.fields.findIndex((item) => item.key === actionTarget.dataset.fieldKey);
    const targetIndex = index + Number(actionTarget.dataset.direction);
    if (index < 0 || targetIndex < 0 || targetIndex >= section.fields.length) return;
    section.fields = moveItem(section.fields, index, targetIndex);
    renderEditor();
    renderPreview();
    scheduleSave();
  } else if (action === "delete-field") {
    const section = sectionById(actionTarget.dataset.sectionId);
    const fieldItem = (section?.fields || []).find((item) => item.key === actionTarget.dataset.fieldKey);
    if (!fieldItem) return;
    if (fieldHasData(section, fieldItem) && !(await confirmAction({ title: "删除字段", message: `字段「${fieldItem.label}」已有内容，删除后其内容将不再显示（数据保留，可通过「恢复默认字段」找回）。`, confirmLabel: "删除", danger: true }))) return;
    section.fields = section.fields.filter((item) => item.key !== fieldItem.key);
    renderEditor();
    renderPreview();
    scheduleSave();
  } else if (action === "show-add-field") {
    const form = document.querySelector(`[data-add-field-form][data-section-id="${CSS.escape(actionTarget.dataset.sectionId)}"]`);
    if (form) {
      form.hidden = false;
      form.querySelector("[data-add-field-label]")?.focus();
    }
  } else if (action === "cancel-add-field") {
    const form = document.querySelector(`[data-add-field-form][data-section-id="${CSS.escape(actionTarget.dataset.sectionId)}"]`);
    if (form) {
      form.hidden = true;
      const input = form.querySelector("[data-add-field-label]");
      if (input) input.value = "";
    }
  } else if (action === "add-field") {
    const section = sectionById(actionTarget.dataset.sectionId);
    if (!section) return;
    const form = document.querySelector(`[data-add-field-form][data-section-id="${CSS.escape(section.id)}"]`);
    const label = (form?.querySelector("[data-add-field-label]")?.value || "").trim();
    const type = form?.querySelector("[data-add-field-type]")?.value || "text";
    if (!label) {
      showToast("请填写字段名称", "warning");
      return;
    }
    (section.fields ||= []).push({
      key: nextCustomFieldKey(section.fields),
      label,
      type,
      role: type === "richtext" ? "body" : "meta",
      builtin: false,
      visible: true
    });
    if (form) {
      form.hidden = true;
      form.querySelector("[data-add-field-label]").value = "";
    }
    renderEditor();
    renderPreview();
    scheduleSave();
  } else if (action === "reset-fields") {
    const section = sectionById(actionTarget.dataset.sectionId);
    if (!section) return;
    if (!(await confirmAction({ title: "恢复默认字段", message: "恢复该模块的默认字段？自定义字段声明将被移除（已填内容仍保留在数据中）。", confirmLabel: "恢复" }))) return;
    section.fields = defaultFieldsFor(section.id);
    renderEditor();
    renderPreview();
    scheduleSave();
  } else if (action === "delete-entry") {
    const section = sectionById(actionTarget.dataset.sectionId);
    if (!section?.items?.length) return;
    const index = section.items.findIndex((item) => item.id === actionTarget.dataset.itemId);
    if (index === -1) return;
    section.items.splice(index, 1);
    if (section.items.length) {
      activeItemBySection.set(section.id, section.items[Math.max(0, index - 1)].id);
    } else {
      activeItemBySection.delete(section.id);
    }
    renderEditor();
    renderPreview();
    scheduleSave();
  } else if (action === "fit-one-page") fitOnePage();
  else if (action === "export-resume") exportResume();
  else if (action === "download-json") {
    saveNow();
    const blob = new Blob([JSON.stringify(resume, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${resume.profile.name || "简历"}-备份.json`;
    anchor.click();
    URL.revokeObjectURL(url);
    showToast("简历 JSON 备份已下载");
  } else if (action === "reset") {
    if (!(await confirmAction({ title: "恢复演示内容", message: "确定恢复演示内容？当前本地草稿将被覆盖。", confirmLabel: "恢复", danger: true }))) return;
    resume = createInitialResume();
    activeModuleId = "profile";
    localStorage.removeItem(STORAGE_KEY);
    renderAll();
    scheduleSave(0);
    showTemplateLibrary({ historyMode: "push" });
    showToast("已恢复演示简历", "info");
  }
});

document.addEventListener("input", (event) => {
  const target = event.target;
  if (target.matches("[data-ai-project-field]")) {
    updateAiProjectReviewField(target);
  } else if (target.matches("[data-setting]")) {
    const key = target.dataset.setting;
    resume.settings[key] = target.type === "range" ? Number(target.value) : target.value;
    applySettings();
    renderPreview();
    scheduleSave();
  } else if (target === elements.themeInput) {
    resume.settings.theme = target.value;
    applySettings();
    renderPreview();
    scheduleSave();
  } else if (target.matches('[data-scope="field-label"]')) updateFieldLabel(target);
  else if (target.matches("[data-rich-section-id]")) updateRichEditor(target);
  else if (target.matches(".month-range__year")) updateMonthRange(target);
  else updateStandardField(target);
});

document.addEventListener("focusout", (event) => {
  if (event.target.matches("[data-rich-section-id]")) {
    clearTimeout(saveTimer);
    saveNow();
  }
});

document.addEventListener("change", (event) => {
  const filterEl = event.target.closest("[data-admin-filter]");
  if (filterEl) {
    const loaders = {
      users: loadAdminUsers,
      resumes: loadAdminDrafts,
      logs: loadAdminAiLogs,
      audit: loadAdminAuditLogs,
      recycle: loadAdminRecycle,
      announcements: loadAdminAnnouncements,
      feedback: loadAdminFeedbacks,
      costs: loadAdminCosts
    };
    loaders[filterEl.dataset.adminFilter]?.();
    return;
  }
  if (event.target.id === "photoUpload") {
    const [file] = event.target.files || [];
    if (!file) return;
    if (file.size > 1.5 * 1024 * 1024) {
      showToast("用于后端导出的本地照片请控制在 1.5MB 内", "warning");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      resume.profile.photo = String(reader.result || "");
      renderEditor();
      renderPreview();
      scheduleSave();
    };
    reader.readAsDataURL(file);
  } else if (event.target.matches('[data-action="admin-set-role"]')) {
    adminSetRole(event.target);
  } else if (event.target.matches('[data-action="admin-set-ai-limit"]')) {
    adminSetAiLimit(event.target);
  } else if (event.target.matches(".month-range__month")) {
    updateMonthRange(event.target);
  } else if (event.target.matches('[data-scope="field-type"]')) {
    updateFieldType(event.target);
  }
});

elements.importFile.addEventListener("change", () => {
  const [file] = elements.importFile.files || [];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const imported = normalizeResume(JSON.parse(String(reader.result || "{}")));
      resume = imported;
      activeModuleId = "profile";
      renderAll();
      scheduleSave(0);
      updateBrowserRoute(resume.remoteId
        ? { name: "resume", resumeId: resume.remoteId }
        : { name: "editor" }, "replace");
      showToast("简历备份导入成功");
    } catch {
      showToast("无法读取该 JSON 文件", "warning");
    } finally {
      elements.importFile.value = "";
    }
  };
  reader.readAsText(file, "utf-8");
});

elements.exportFormat.addEventListener("change", () => {
  const label = elements.exportFormat.value === "docx" ? "导出 Word" : "导出 PDF";
  document.querySelector('.topbar__actions [data-export-label]').textContent = label;
});

elements.appDialogCancel.addEventListener("click", () => closeDialog(dialogState.mode === "prompt" ? null : false));
elements.appDialogSubmit.addEventListener("click", () => {
  closeDialog(dialogState.mode === "prompt" ? elements.appDialogInput.value : true);
});
elements.appDialog.addEventListener("click", (event) => {
  if (event.target === elements.appDialog) closeDialog(dialogState.mode === "prompt" ? null : false);
});
elements.appDialogInput.addEventListener("keydown", (event) => {
  if (event.key === "Enter") closeDialog(elements.appDialogInput.value);
});
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && !elements.appDialog.hidden) closeDialog(dialogState.mode === "prompt" ? null : false);
});

document.querySelectorAll("[data-preview-mode]").forEach((button) => {
  button.addEventListener("click", async () => setPreviewMode(button.dataset.previewMode));
});

elements.tabs.addEventListener("dragstart", (event) => {
  const wrap = event.target.closest("[data-drag-module]");
  if (!wrap) return;
  draggedModuleId = wrap.dataset.dragModule;
  wrap.classList.add("is-dragging");
  event.dataTransfer.effectAllowed = "move";
});

elements.tabs.addEventListener("dragover", (event) => {
  if (event.target.closest("[data-drag-module]")) event.preventDefault();
});

elements.tabs.addEventListener("drop", (event) => {
  event.preventDefault();
  const target = event.target.closest("[data-drag-module]");
  if (!target || !draggedModuleId || target.dataset.dragModule === draggedModuleId) return;
  const source = elements.tabs.querySelector(`[data-drag-module="${CSS.escape(draggedModuleId)}"]`);
  if (!source || source.dataset.zone !== target.dataset.zone) {
    showToast("模块只能在当前版式分区内排序", "warning");
    return;
  }
  const from = resume.sections.findIndex((section) => section.id === draggedModuleId);
  const to = resume.sections.findIndex((section) => section.id === target.dataset.dragModule);
  resume.sections = moveItem(resume.sections, from, to);
  renderAll();
  scheduleSave();
});

elements.tabs.addEventListener("dragend", () => {
  draggedModuleId = "";
  elements.tabs.querySelectorAll(".is-dragging").forEach((node) => node.classList.remove("is-dragging"));
});

window.addEventListener("beforeunload", () => {
  if (saveTimer) saveNow();
});

window.addEventListener("resize", schedulePagination);
window.addEventListener("popstate", () => applyCurrentRoute());

// 站内界面链接走 SPA 导航（pushState + applyCurrentRoute），避免整页刷新。
document.addEventListener("click", (event) => {
  if (event.defaultPrevented || event.button !== 0) return;
  if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;

  const link = event.target.closest("a[href]");
  if (!link) return;
  if (link.target && link.target !== "_self") return;
  if (link.hasAttribute("download")) return;

  const href = link.getAttribute("href");
  if (!href || /^(#|mailto:|tel:|javascript:)/i.test(href)) return;

  let url;
  try {
    url = new URL(href, window.location.origin);
  } catch {
    return;
  }
  if (url.origin !== window.location.origin) return;
  if (/^\/(api|internal|template-assets|exports|previews)\//.test(url.pathname)) return;
  if (!isAppPath(url.pathname)) return;

  event.preventDefault();
  const targetPath = url.pathname + url.search + url.hash;
  if (window.location.pathname === url.pathname && window.location.search === url.search) {
    if (window.location.hash !== url.hash) window.history.replaceState({}, "", targetPath);
    return;
  }
  window.history.pushState({}, "", targetPath);
  applyCurrentRoute();
});

elements.loginForm.addEventListener("submit", handleLoginSubmit);
elements.settingsForm.addEventListener("submit", handleSettingsSubmit);
elements.loginMethodSwitch.addEventListener("click", toggleLoginMethod);
elements.loginTabLogin.addEventListener("click", () => setAuthTab("login"));
elements.loginTabRegister.addEventListener("click", () => setAuthTab("register"));
elements.sendCodeButton.addEventListener("click", handleSendCode);
document.addEventListener("click", (event) => {
  if (!event.target.closest(".account-area")) closeAllAccountMenus();
  if (!event.target.closest(".module-add")) elements.addModuleMenu.hidden = true;
  if (event.target.closest(".auth-dialog")) return;
  if (event.target.closest("#settingsOverlay") && !elements.settingsOverlay.hidden) closeSettings();
});

document.addEventListener("click", (event) => {
  const tabButton = event.target.closest("[data-admin-tab]");
  if (tabButton) setAdminTab(tabButton.dataset.adminTab);
});

elements.adminUserSearch.addEventListener("input", () => {
  clearTimeout(adminUserSearchTimer);
  adminUserSearchTimer = setTimeout(() => loadAdminUsers(), 300);
});
elements.adminResumeSearch.addEventListener("input", () => {
  clearTimeout(adminResumeSearchTimer);
  adminResumeSearchTimer = setTimeout(() => loadAdminDrafts(), 300);
});

elements.adminAiLogSearch.addEventListener("input", () => {
  clearTimeout(adminAiLogSearchTimer);
  adminAiLogSearchTimer = setTimeout(() => loadAdminAiLogs(), 300);
});

elements.adminAuditSearch.addEventListener("input", () => {
  clearTimeout(adminAuditSearchTimer);
  adminAuditSearchTimer = setTimeout(() => loadAdminAuditLogs(), 300);
});

elements.adminRecycleSearch.addEventListener("input", () => {
  clearTimeout(adminRecycleSearchTimer);
  adminRecycleSearchTimer = setTimeout(() => loadAdminRecycle(), 300);
});

elements.adminAnnouncementSearch.addEventListener("input", () => {
  clearTimeout(adminAnnouncementSearchTimer);
  adminAnnouncementSearchTimer = setTimeout(() => loadAdminAnnouncements(), 300);
});

elements.adminFeedbackSearch.addEventListener("input", () => {
  clearTimeout(adminFeedbackSearchTimer);
  adminFeedbackSearchTimer = setTimeout(() => loadAdminFeedbacks(), 300);
});

elements.adminTemplateSearch.addEventListener("input", () => {
  clearTimeout(adminTemplateSearchTimer);
  adminTemplateSearchTimer = setTimeout(() => loadAdminTemplates(), 300);
});

elements.adminAiForm.addEventListener("submit", saveAdminAiConfig);
elements.adminAnnouncementForm.addEventListener("submit", saveAnnouncement);
elements.adminFeedbackReplyForm.addEventListener("submit", saveFeedbackReply);
elements.feedbackForm.addEventListener("submit", submitFeedback);
elements.adminConfigForm.addEventListener("submit", saveAdminConfig);
elements.adminAuthSecretForm.addEventListener("submit", saveAdminAuthSecrets);

// Word 简历导入：文件选择、字数实时统计、拖拽导入。
elements.aiWordFile.addEventListener("change", () => {
  const file = elements.aiWordFile.files?.[0];
  if (file) handleAiWordImport(file);
});

elements.aiDescription.addEventListener("input", () => {
  // 用户手工修改后不再提交可能已过期的 Word 结构；正文仍照常生成。
  aiWordDocumentStructure = "";
  updateAiCharCount();
});
elements.aiGuideCard?.addEventListener("keydown", (event) => {
  if (event.key !== "Enter" || event.shiftKey || event.target.tagName === "TEXTAREA") return;
  if (event.target.id === "aiGuideRole") {
    event.preventDefault();
    elements.aiGuideCard.querySelector('[data-action="ai-guide-role-next"]')?.click();
  }
});

elements.aiChatForm.addEventListener("submit", handleAiChatSubmit);

if (elements.aiInputCard) {
  elements.aiInputCard.addEventListener("dragover", (event) => {
    if (!Array.from(event.dataTransfer?.types || []).includes("Files")) return;
    event.preventDefault();
    elements.aiInputCard.classList.add("is-dragging");
  });
  elements.aiInputCard.addEventListener("dragleave", () => {
    elements.aiInputCard.classList.remove("is-dragging");
  });
  elements.aiInputCard.addEventListener("drop", (event) => {
    event.preventDefault();
    elements.aiInputCard.classList.remove("is-dragging");
    const file = event.dataTransfer?.files?.[0];
    if (file) handleAiWordImport(file);
  });
}

async function initialize() {
  injectAccountItems();
  setupAiFloatDrag();
  await refreshSession();
  await Promise.all([loadTemplates(), loadDrafts(), loadAnnouncementBanner()]);
  populateAdminResumeTemplates();
  await applyCurrentRoute({ replaceInvalid: true });
}

initialize();
