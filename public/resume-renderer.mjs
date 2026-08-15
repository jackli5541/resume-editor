import { escapeHtml, formatRange } from "./core.mjs";
import { getTemplateSchema } from "./template-schemas.mjs";

const FONT_MAP = {
  system: 'Inter, "PingFang SC", "Microsoft YaHei", sans-serif',
  serif: '"Songti SC", SimSun, serif',
  rounded: '"Arial Rounded MT Bold", "PingFang SC", "Microsoft YaHei", sans-serif'
};

const TEMPLATE_THEMES = {
  "resume-collection-cn-001": "#5a779b",
  "resume-collection-cn-002": "#3f6f78",
  "resume-collection-cn-003": "#173e5a",
  "resume-collection-cn-004": "#ef6464",
  "resume-collection-cn-005": "#294d70",
  "resume-collection-cn-006": "#438fc9",
  "resume-collection-cn-007": "#08a8de",
  "resume-collection-cn-008": "#3498db",
  "resume-collection-cn-009": "#1599c7",
  "resume-collection-cn-010": "#009dcc"
};

const ALLOWED_RICH_TAGS = new Set([
  "A", "B", "BR", "EM", "I", "LI", "OL", "P", "SPAN", "STRONG", "U", "UL"
]);

export function colorWithAlpha(hex, alpha) {
  const value = String(hex || "").replace("#", "");
  if (!/^[0-9a-f]{6}$/i.test(value)) return "rgba(18, 167, 125, 0.11)";
  const red = Number.parseInt(value.slice(0, 2), 16);
  const green = Number.parseInt(value.slice(2, 4), 16);
  const blue = Number.parseInt(value.slice(4, 6), 16);
  return `rgba(${red}, ${green}, ${blue}, ${alpha})`;
}

export function applyResumeSettings(element, settings) {
  element.style.setProperty("--theme", settings.theme);
  element.style.setProperty("--accent", colorWithAlpha(settings.theme, 0.11));
  element.style.setProperty("--resume-font", FONT_MAP[settings.fontFamily] || FONT_MAP.system);
  element.style.setProperty("--font-size", `${settings.fontSize}px`);
  element.style.setProperty("--line-height", settings.lineHeight);
  element.style.setProperty("--page-padding", `${settings.pagePadding}px`);
  element.style.setProperty("--section-gap", `${settings.sectionGap}px`);
}

export function applyResumeTemplate(element, template) {
  const slug = String(template?.slug || "clean-single");
  element.dataset.template = /^[a-z0-9-]+$/i.test(slug) ? slug : "clean-single";
  const theme = TEMPLATE_THEMES[slug];
  if (theme) {
    element.style.setProperty("--theme", theme);
    element.style.setProperty("--accent", colorWithAlpha(theme, 0.11));
  }
}

export function sanitizeRichHtml(html, documentRef = document) {
  const template = documentRef.createElement("template");
  template.innerHTML = String(html || "");
  template.content
    .querySelectorAll("script,style,iframe,object,embed,form,input,button,meta,link,svg,math")
    .forEach((node) => node.remove());

  [...template.content.querySelectorAll("*")].reverse().forEach((node) => {
    if (!ALLOWED_RICH_TAGS.has(node.tagName)) {
      node.replaceWith(...node.childNodes);
      return;
    }

    const rawHref = node.tagName === "A" ? String(node.getAttribute("href") || "").trim() : "";
    [...node.attributes].forEach((attribute) => node.removeAttribute(attribute.name));
    if (node.tagName === "A") {
      if (/^(https?:|mailto:)/i.test(rawHref)) {
        node.setAttribute("href", rawHref);
        node.setAttribute("rel", "noopener noreferrer");
      }
    }
  });
  return template.innerHTML;
}

export function safeImageUrl(value) {
  const url = String(value || "").trim();
  if (/^https?:\/\//i.test(url) || /^data:image\/(png|jpeg|webp);base64,/i.test(url)) return url;
  return "";
}

export function renderResumeMarkup(resume, documentRef = document) {
  const { profile } = resume;
  const schema = resume.template?.editorSchema || getTemplateSchema(resume.template);
  const contactKeys = schema.profileFields.filter((key) => !["name", "job", "photo"].includes(key));
  const contact = contactKeys.map((key) => profile[key]).filter(Boolean);
  const photo = safeImageUrl(profile.photo);
  const definitions = new Map(schema.sections.map((section) => [section.id, section]));
  const sections = resume.sections.filter((section) => section.visible !== false && definitions.has(section.id));
  const slug = String(resume.template?.slug || "clean-single");
  const layout = schema.layoutSchema?.layout || "single";
  const header = renderProfileHeader(profile, contact, photo, schema);
  const footer = `<footer class="resume-footer"><span>轻简历 · 结构化排版</span><span>${escapeHtml(resume.title)}</span></footer>`;
  const decorations = `<div class="template-decor template-decor--${escapeHtml(layout)}" aria-hidden="true"><i></i><i></i><i></i><i></i><i></i></div>`;

  if (layout === "sidebar-left" || layout === "sidebar-right") {
    const sidebarSections = sections.filter((section) => definitions.get(section.id)?.zone === "sidebar");
    const mainSections = sections.filter((section) => definitions.get(section.id)?.zone === "main");
    return `${decorations}
      <div class="template-layout template-layout--sidebar ${layout === "sidebar-right" ? "is-right" : "is-left"}">
        <aside class="template-sidebar">${header}<div class="template-sidebar__sections">${sidebarSections.map((section) => renderResumeSection(section, definitions.get(section.id), documentRef)).join("")}</div></aside>
        <main class="resume-sections template-main">${mainSections.map((section) => renderResumeSection(section, definitions.get(section.id), documentRef)).join("")}</main>
        ${footer}
      </div>`;
  }

  if (layout === "columns") {
    const left = sections.filter((section) => definitions.get(section.id)?.zone === "left");
    const right = sections.filter((section) => definitions.get(section.id)?.zone === "right");
    return `${decorations}${header}<div class="resume-rule"><i></i></div>
      <main class="template-columns">
        <div>${left.map((section) => renderResumeSection(section, definitions.get(section.id), documentRef)).join("")}</div>
        <div>${right.map((section) => renderResumeSection(section, definitions.get(section.id), documentRef)).join("")}</div>
      </main>${footer}`;
  }

  return `<div class="template-native-layout template-native-layout--${escapeHtml(layout)}">${decorations}${header}
    <div class="resume-rule"><i></i></div>
    <main class="resume-sections">
      ${sections.map((section) => renderResumeSection(section, definitions.get(section.id), documentRef)).join("")}
    </main>${footer}</div>`;
}

function renderProfileHeader(profile, contact, photo, schema) {
  return `<header class="resume-header" data-open-module="profile">
      <div class="resume-header__main">
        <div class="resume-name-row">
          <h1>${escapeHtml(profile.name || "你的姓名")}</h1>
          <span>${escapeHtml(profile.job || "求职岗位")}</span>
        </div>
        <div class="contact-row">
          ${contact.map((value, index) => `<span>${index === 0 ? "" : "· "}${escapeHtml(value)}</span>`).join("")}
        </div>
      </div>
      ${schema.profileFields.includes("photo")
        ? photo
          ? `<img class="resume-photo" src="${escapeHtml(photo)}" alt="个人照片" />`
          : `<div class="resume-photo resume-photo--placeholder" aria-hidden="true"><span>${escapeHtml((profile.name || "你").slice(0, 1))}</span></div>`
        : ""}
    </header>`;
}

export function paginateResumeLayout(flow, pageHeight) {
  flow.querySelectorAll(".has-page-break").forEach((node) => {
    node.classList.remove("has-page-break");
    node.style.removeProperty("--page-break-before");
  });

  const flowTop = () => flow.getBoundingClientRect().top;
  const placeBlock = (node, measuredHeight) => {
    const rect = node.getBoundingClientRect();
    const top = rect.top - flowTop();
    const height = measuredHeight ?? rect.height;
    const pageOffset = ((top % pageHeight) + pageHeight) % pageHeight;
    const available = pageHeight - pageOffset;
    if (pageOffset > 0.5 && height <= pageHeight && height > available + 0.5) {
      node.classList.add("has-page-break");
      node.style.setProperty("--page-break-before", `${available}px`);
    }
  };

  flow.querySelectorAll(".resume-section").forEach((section) => {
    const items = [...section.querySelectorAll(":scope > .timeline-list > .timeline-item")];
    if (!items.length) {
      placeBlock(section);
      return;
    }

    const sectionRect = section.getBoundingClientRect();
    const firstItemRect = items[0].getBoundingClientRect();
    placeBlock(section, firstItemRect.bottom - sectionRect.top);
    items.slice(1).forEach((item) => placeBlock(item));
  });

  return Math.max(pageHeight, flow.scrollHeight);
}

function renderResumeSection(section, definition, documentRef) {
  let body = "";
  if (definition?.type === "keyValues") {
    const values = [
      ["意向岗位", section.data?.job],
      ["意向城市", section.data?.city],
      ["期望薪资", section.data?.salary],
      ["到岗时间", section.data?.availability]
    ].filter(([, value]) => value);
    body = `<div class="objective-grid">${values.map(([label, value]) => `<div><span>${label}</span><strong>${escapeHtml(value)}</strong></div>`).join("")}</div>`;
  } else if (definition?.type === "timeline") {
    body = `<div class="timeline-list">${section.items.map((item) => `
      <article class="timeline-item">
        <div class="timeline-item__top">
          <time>${escapeHtml(formatRange(item.start, item.end))}</time>
          <strong>${escapeHtml(item.organization)}</strong>
          <span>${escapeHtml(item.role)}</span>
        </div>
        <div class="rich-preview">${sanitizeRichHtml(item.content, documentRef)}</div>
      </article>`).join("")}</div>`;
  } else if (definition?.type === "list") {
    body = `<div class="compact-list">${(section.items || []).map((item) => `<div><strong>${escapeHtml(item.name)}</strong><span>${escapeHtml([item.level, item.date].filter(Boolean).join(" · "))}</span></div>`).join("")}</div>`;
  } else if (definition?.type === "levels") {
    body = `<div class="level-list">${(section.items || []).map((item) => `<div><span>${escapeHtml(item.name)}</span><strong>${escapeHtml(item.level)}</strong><i style="--level:${levelPercent(item.level)}%"></i></div>`).join("")}</div>`;
  } else if (definition?.type === "tags") {
    body = `<div class="tag-list">${(section.items || []).map((item) => `<span>${escapeHtml(item)}</span>`).join("")}</div>`;
  } else {
    body = `<div class="rich-preview rich-preview--standalone">${sanitizeRichHtml(section.content, documentRef)}</div>`;
  }

  const parsedLineHeight = Number(section.lineHeight);
  const lineHeightStyle = Number.isFinite(parsedLineHeight) && parsedLineHeight > 0
    ? `style="line-height:${parsedLineHeight}"`
    : "";

  return `
    <section class="resume-section resume-section--${escapeHtml(section.id)}" id="preview-${escapeHtml(section.id)}" data-open-module="${escapeHtml(section.id)}" ${lineHeightStyle}>
      <div class="section-heading"><span>${escapeHtml(section.title)}</span><i></i></div>
      ${body}
    </section>`;
}

function levelPercent(level) {
  const value = String(level || "");
  if (/精通|母语|专家/.test(value)) return 95;
  if (/熟练|高级/.test(value)) return 78;
  if (/良好|中级/.test(value)) return 62;
  return 45;
}
