import {
  PAGE_HEIGHT,
  STORAGE_KEY,
  clone,
  completionScore,
  createInitialResume,
  escapeHtml,
  formatRange,
  makeId,
  moveItem,
  normalizeResume,
  pageCountForHeight
} from "./core.mjs";
import {
  applyResumeSettings,
  paginateResumeLayout,
  renderResumeMarkup,
  sanitizeRichHtml
} from "./resume-renderer.mjs";

const elements = {
  app: document.querySelector("#app"),
  templateLibrary: document.querySelector("#templateLibrary"),
  templateList: document.querySelector("#templateList"),
  templateLibraryStatus: document.querySelector("#templateLibraryStatus"),
  paper: document.querySelector("#resumePaper"),
  flow: document.querySelector("#resumeFlow"),
  markers: document.querySelector("#pageMarkers"),
  tabs: document.querySelector("#moduleTabs"),
  editor: document.querySelector("#drawerContent"),
  drawer: document.querySelector("#editorDrawer"),
  saveState: document.querySelector("#saveState"),
  pageCount: document.querySelector("#pageCountBadge"),
  sidePageCount: document.querySelector("#sidePageCount"),
  completionScore: document.querySelector("#completionScore"),
  completionBar: document.querySelector("#completionBar"),
  completionHint: document.querySelector("#completionHint"),
  revision: document.querySelector("#revisionText"),
  title: document.querySelector("#resumeTitle"),
  themeInput: document.querySelector("#themeInput"),
  themeDot: document.querySelector("#themeDot"),
  importFile: document.querySelector("#importFile"),
  exportFormat: document.querySelector("#exportFormat"),
  toastRegion: document.querySelector("#toastRegion")
};

let resume = loadResume();
let activeModuleId = "profile";
let drawerOpen = true;
let saveTimer = null;
let paginationFrame = null;
let currentPages = 1;
let draggedModuleId = "";
let exportInProgress = false;
let availableTemplates = [];
const activeItemBySection = new Map();

function loadResume() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    return normalizeResume(saved ? JSON.parse(saved) : createInitialResume());
  } catch {
    return createInitialResume();
  }
}

function sectionById(id) {
  return resume.sections.find((section) => section.id === id);
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
  applyResumeSettings(elements.paper, settings);
  elements.themeInput.value = settings.theme;
  elements.themeDot.style.background = settings.theme;

  document.querySelectorAll("[data-setting]").forEach((control) => {
    const value = settings[control.dataset.setting];
    if (value !== undefined) control.value = value;
  });
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

  const sectionTabs = resume.sections.map((section, index) => `
    <div class="module-tab-wrap ${section.visible ? "" : "is-hidden"}" draggable="true" data-drag-module="${section.id}">
      <button class="module-tab ${activeModuleId === section.id ? "is-active" : ""}" type="button" data-action="select-module" data-module-id="${section.id}">
        <span class="module-tab__status ${section.visible ? "is-on" : ""}" data-action="toggle-module" data-module-id="${section.id}" title="${section.visible ? "隐藏模块" : "显示模块"}"></span>
        <strong>${escapeHtml(section.title)}</strong>
      </button>
      <span class="module-tab__ops">
        <button type="button" data-action="move-module" data-module-id="${section.id}" data-direction="-1" ${index === 0 ? "disabled" : ""} title="前移">‹</button>
        <button type="button" data-action="move-module" data-module-id="${section.id}" data-direction="1" ${index === resume.sections.length - 1 ? "disabled" : ""} title="后移">›</button>
      </span>
    </div>`).join("");

  elements.tabs.innerHTML = profileTab + sectionTabs;
}

function renderEditor() {
  if (activeModuleId === "profile") {
    elements.editor.innerHTML = renderProfileEditor();
    return;
  }
  const section = sectionById(activeModuleId) || resume.sections[0];
  if (!section) return;
  activeModuleId = section.id;
  if (section.type === "objective") elements.editor.innerHTML = renderObjectiveEditor(section);
  else if (["education", "experience", "projects"].includes(section.type)) elements.editor.innerHTML = renderTimelineEditor(section);
  else elements.editor.innerHTML = renderRichEditor(section);
}

function field(label, value, scope, key, options = {}) {
  const type = options.type || "text";
  const placeholder = options.placeholder || "";
  return `
    <label class="form-field ${options.wide ? "form-field--wide" : ""}">
      <span>${label}</span>
      <input type="${type}" value="${escapeHtml(value)}" placeholder="${escapeHtml(placeholder)}" data-scope="${scope}" data-field="${key}" ${options.sectionId ? `data-section-id="${options.sectionId}"` : ""} ${options.itemId ? `data-item-id="${options.itemId}"` : ""} />
    </label>`;
}

function renderProfileEditor() {
  const profile = resume.profile;
  return `
    <div class="editor-heading">
      <div><span class="eyebrow">PERSONAL INFO</span><h2>基本信息</h2></div>
      <p>填写的信息会实时排版到简历中，所有修改自动保存在本机。</p>
    </div>
    <div class="editor-grid editor-grid--profile">
      ${field("姓名", profile.name, "profile", "name", { placeholder: "请输入姓名" })}
      ${field("求职岗位", profile.job, "profile", "job", { placeholder: "例如：产品经理" })}
      ${field("联系电话", profile.mobile, "profile", "mobile")}
      ${field("联系邮箱", profile.email, "profile", "email", { type: "email" })}
      ${field("所在城市", profile.city, "profile", "city")}
      ${field("出生年月", profile.birthday, "profile", "birthday", { type: "month" })}
      ${field("工作年限", profile.workYears, "profile", "workYears")}
      ${field("照片 URL", profile.photo, "profile", "photo", { placeholder: "可选：粘贴公开图片地址", wide: true })}
    </div>
    <div class="editor-footer-actions">
      <label class="inline-upload">上传本地照片<input type="file" id="photoUpload" accept="image/png,image/jpeg,image/webp" /></label>
      <button class="ghost-button" type="button" data-action="fit-one-page">自动调整为一页</button>
    </div>`;
}

function renderObjectiveEditor(section) {
  const data = section.data || {};
  return `
    ${renderSectionHeading(section, "CAREER OBJECTIVE")}
    <div class="editor-grid">
      ${field("求职岗位", data.job, "section-data", "job", { sectionId: section.id })}
      ${field("意向城市", data.city, "section-data", "city", { sectionId: section.id })}
      ${field("期望薪资", data.salary, "section-data", "salary", { sectionId: section.id })}
      ${field("到岗时间", data.availability, "section-data", "availability", { sectionId: section.id })}
    </div>`;
}

function renderSectionHeading(section, eyebrow) {
  return `
    <div class="editor-heading editor-heading--section">
      <div><span class="eyebrow">${eyebrow}</span><h2>${escapeHtml(section.title)}</h2></div>
      <label class="title-edit"><span>模块标题</span><input value="${escapeHtml(section.title)}" data-scope="section" data-section-id="${section.id}" data-field="title" /></label>
    </div>`;
}

function renderTimelineEditor(section) {
  if (!section.items) section.items = [];
  if (!section.items.length) section.items.push(emptyTimelineItem(section.type));
  let activeItemId = activeItemBySection.get(section.id);
  if (!itemById(section, activeItemId)) activeItemId = section.items[0].id;
  activeItemBySection.set(section.id, activeItemId);
  const item = itemById(section, activeItemId);
  const labels = section.type === "education"
    ? { organization: "学校名称", role: "专业与学历" }
    : section.type === "projects"
      ? { organization: "项目名称", role: "项目角色" }
      : { organization: "公司名称", role: "职位名称" };

  return `
    ${renderSectionHeading(section, section.type === "education" ? "EDUCATION" : section.type === "projects" ? "PROJECTS" : "EXPERIENCE")}
    <div class="timeline-editor">
      <aside class="entry-nav">
        <div class="entry-nav__heading"><span>经历条目</span><small>${section.items.length} 条</small></div>
        <div class="entry-nav__list">
          ${section.items.map((entry, index) => `
            <button class="entry-nav__item ${entry.id === activeItemId ? "is-active" : ""}" type="button" data-action="select-entry" data-section-id="${section.id}" data-item-id="${entry.id}">
              <strong>${escapeHtml(entry.organization || `未命名条目 ${index + 1}`)}</strong>
              <span>${escapeHtml(entry.role || formatRange(entry.start, entry.end) || "请填写内容")}</span>
            </button>`).join("")}
        </div>
        <button class="add-entry-button" type="button" data-action="add-entry" data-section-id="${section.id}">＋ 添加一段经历</button>
      </aside>
      <div class="entry-editor">
        <div class="editor-grid editor-grid--entry">
          ${field("开始时间", item.start, "entry", "start", { sectionId: section.id, itemId: item.id, type: "month" })}
          ${field("结束时间", item.end, "entry", "end", { sectionId: section.id, itemId: item.id, placeholder: "例如：至今" })}
          ${field(labels.organization, item.organization, "entry", "organization", { sectionId: section.id, itemId: item.id })}
          ${field(labels.role, item.role, "entry", "role", { sectionId: section.id, itemId: item.id })}
        </div>
        ${richTextBox(item.content, section.id, item.id)}
        <div class="entry-editor__footer">
          <span>富文本停止输入 5 秒或失焦后自动保存</span>
          <button class="danger-link" type="button" data-action="delete-entry" data-section-id="${section.id}" data-item-id="${item.id}" ${section.items.length === 1 ? "disabled" : ""}>删除此条</button>
        </div>
      </div>
    </div>`;
}

function renderRichEditor(section) {
  return `
    ${renderSectionHeading(section, "RICH TEXT")}
    <div class="standalone-rich-editor">
      ${richTextBox(section.content, section.id)}
      <p class="editor-tip">提示：使用简短段落和列表，突出与目标岗位最相关的能力。</p>
    </div>`;
}

function richTextBox(content, sectionId, itemId = "") {
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
      <div class="rich-editor" contenteditable="true" spellcheck="false" data-rich-section-id="${sectionId}" ${itemId ? `data-rich-item-id="${itemId}"` : ""}>${sanitizeRichHtml(content)}</div>
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

function renderPreview() {
  elements.flow.innerHTML = renderResumeMarkup(resume);
  elements.flow.style.fontSize = `${resume.settings.fontSize}px`;
  elements.title.textContent = resume.title;
  schedulePagination();
  updateStatusCards();
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
}

function scheduleSave(delay = 800) {
  elements.saveState.classList.add("is-saving");
  elements.saveState.querySelector("span").textContent = "正在保存…";
  clearTimeout(saveTimer);
  saveTimer = setTimeout(saveNow, delay);
}

function saveNow() {
  resume.updatedAt = new Date().toISOString();
  resume.revision = (resume.revision || 0) + 1;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(resume));
  elements.saveState.classList.remove("is-saving");
  elements.saveState.querySelector("span").textContent = `已保存 · ${new Date().toLocaleTimeString("zh-CN", { hour12: false })}`;
  updateStatusCards();
}

function updateStandardField(target) {
  const { scope, field, sectionId, itemId } = target.dataset;
  if (!scope || !field) return false;
  if (scope === "profile") resume.profile[field] = target.value;
  else if (scope === "section") sectionById(sectionId)[field] = target.value;
  else if (scope === "section-data") sectionById(sectionId).data[field] = target.value;
  else if (scope === "entry") itemById(sectionById(sectionId), itemId)[field] = target.value;
  else return false;
  renderPreview();
  if (scope === "section" && field === "title") renderTabs();
  scheduleSave();
  return true;
}

function updateRichEditor(target) {
  const section = sectionById(target.dataset.richSectionId);
  if (!section) return;
  const item = target.dataset.richItemId ? itemById(section, target.dataset.richItemId) : null;
  if (item) item.content = target.innerHTML;
  else section.content = target.innerHTML;
  renderPreview();
  scheduleSave(5000);
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
  if (!response.ok) throw new Error(payload.error || `服务请求失败 (${response.status})`);
  return payload;
}

function delay(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function exportResume() {
  if (exportInProgress) return;
  closePopovers();
  saveNow();
  setExportState(true, "正在提交…");

  try {
    const format = elements.exportFormat.value;
    let job = await readApiResponse(await fetch("/api/exports", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        resume,
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

function showTemplateLibrary() {
  document.documentElement.classList.add("template-library-mode");
  elements.app.hidden = true;
  elements.templateLibrary.hidden = false;
  window.scrollTo({ top: 0, behavior: "auto" });
}

function hideTemplateLibrary() {
  document.documentElement.classList.remove("template-library-mode");
  elements.templateLibrary.hidden = true;
  elements.app.hidden = false;
}

function renderTemplateLibrary() {
  elements.templateLibraryStatus.hidden = availableTemplates.length > 0;
  elements.templateList.innerHTML = availableTemplates.map((template) => {
    const ready = template.selectable === true;
    const statusText = ready ? "可使用" : template.status === "blocked" ? "安全检查未通过" : "待字段适配";
    const preview = template.previewUrl
      ? `<img src="${escapeHtml(template.previewUrl)}" alt="${escapeHtml(template.name)}模板预览" loading="lazy" />`
      : `<div class="template-preview-placeholder"><span>${escapeHtml(template.name.slice(0, 1))}</span></div>`;
    return `
      <article class="template-card ${ready ? "is-ready" : "is-pending"}">
        <div class="template-preview">${preview}<span class="template-status">${statusText}</span></div>
        <div class="template-card__body">
          <div><strong>${escapeHtml(template.name)}</strong><span>${escapeHtml(template.category)} · v${template.version}</span></div>
          <p>${escapeHtml(template.description || "结构化简历模板")}</p>
          <button type="button" data-action="select-template" data-template-slug="${escapeHtml(template.slug)}" data-template-version="${template.version}" ${ready ? "" : "disabled"}>
            ${ready ? "使用此模板" : "适配后开放"}
          </button>
        </div>
      </article>`;
  }).join("");
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

async function selectTemplate(target) {
  const template = availableTemplates.find((item) =>
    item.slug === target.dataset.templateSlug && item.version === Number(target.dataset.templateVersion)
  );
  if (!template?.selectable) return;
  target.disabled = true;
  target.textContent = "正在创建…";
  try {
    const draft = await readApiResponse(await fetch("/api/resumes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ templateSlug: template.slug, templateVersion: template.version, data: resume })
    }));
    resume.template = { slug: template.slug, version: template.version, name: template.name };
    resume.remoteId = draft.id;
    saveNow();
    hideTemplateLibrary();
    renderAll();
  } catch (error) {
    showToast(error?.message || "无法创建简历", "warning");
    target.disabled = false;
    target.textContent = "使用此模板";
  }
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

document.addEventListener("click", (event) => {
  const commandButton = event.target.closest("[data-command]");
  if (commandButton) {
    event.preventDefault();
    const command = commandButton.dataset.command;
    const editor = commandButton.closest(".rich-editor-box")?.querySelector(".rich-editor");
    editor?.focus();
    if (command === "createLink") {
      const url = window.prompt("请输入链接地址", "https://");
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

  if (action === "select-template") selectTemplate(actionTarget);
  else if (action === "change-template") showTemplateLibrary();
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
    resume.sections = moveItem(resume.sections, index, index + Number(actionTarget.dataset.direction));
    renderAll();
    scheduleSave();
  } else if (action === "toggle-drawer") {
    drawerOpen = !drawerOpen;
    elements.drawer.classList.toggle("is-open", drawerOpen);
  } else if (action === "select-entry") {
    activeItemBySection.set(actionTarget.dataset.sectionId, actionTarget.dataset.itemId);
    renderEditor();
  } else if (action === "add-entry") {
    const section = sectionById(actionTarget.dataset.sectionId);
    const item = emptyTimelineItem(section.type);
    section.items.push(item);
    activeItemBySection.set(section.id, item.id);
    renderEditor();
    renderPreview();
    scheduleSave();
  } else if (action === "delete-entry") {
    const section = sectionById(actionTarget.dataset.sectionId);
    if (section.items.length <= 1) return;
    if (!window.confirm("确定删除这条经历吗？")) return;
    const index = section.items.findIndex((item) => item.id === actionTarget.dataset.itemId);
    section.items.splice(index, 1);
    activeItemBySection.set(section.id, section.items[Math.max(0, index - 1)].id);
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
    if (!window.confirm("确定恢复演示内容吗？当前本地草稿将被覆盖。")) return;
    resume = createInitialResume();
    activeModuleId = "profile";
    localStorage.removeItem(STORAGE_KEY);
    renderAll();
    scheduleSave(0);
    showTemplateLibrary();
    showToast("已恢复演示简历", "info");
  }
});

document.addEventListener("input", (event) => {
  const target = event.target;
  if (target.matches("[data-setting]")) {
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
  } else if (target.matches("[data-rich-section-id]")) updateRichEditor(target);
  else updateStandardField(target);
});

document.addEventListener("focusout", (event) => {
  if (event.target.matches("[data-rich-section-id]")) {
    clearTimeout(saveTimer);
    saveNow();
  }
});

document.addEventListener("change", (event) => {
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

async function initialize() {
  await loadTemplates();
  if (resume.template) {
    hideTemplateLibrary();
    renderAll();
  } else {
    showTemplateLibrary();
  }
}

initialize();
