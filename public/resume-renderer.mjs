import { escapeHtml, formatRange } from "./core.mjs";
import { getTemplateSchema, resolveSectionFields } from "./template-schemas.mjs";

const FONT_MAP = {
  "source-han-sans": '"Resume Source Han Sans", "Source Han Sans SC", "Noto Sans CJK SC", sans-serif',
  "source-han-serif": '"Resume Source Han Serif", "Source Han Serif SC", "Noto Serif CJK SC", serif',
  "lxgw-wenkai": '"Resume LXGW WenKai", "LXGW WenKai", serif',
  "zhuque-fangsong": '"Resume Zhuque Fangsong", "Zhuque Fangsong (technical preview)", serif',
  system: '"Resume Source Han Sans", "Source Han Sans SC", "Noto Sans CJK SC", sans-serif',
  serif: '"Resume Source Han Serif", "Source Han Serif SC", "Noto Serif CJK SC", serif',
  rounded: '"Resume Source Han Sans", "Source Han Sans SC", "Noto Sans CJK SC", sans-serif'
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
  element.style.setProperty("--resume-font", FONT_MAP[settings.fontFamily] || FONT_MAP["source-han-sans"]);
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
  if (slug === "resume-collection-cn-001") {
    return renderCn001Markup({ resume, schema, sections, definitions, documentRef });
  }
  if (["resume-collection-cn-002", "resume-collection-cn-003"].includes(slug)) {
    return renderClassicSingleMarkup({ resume, schema, sections, definitions, documentRef, slug });
  }
  if (slug === "resume-collection-cn-006") {
    return renderGeometricMarkup({ resume, schema, sections, definitions, documentRef });
  }
  if (["resume-collection-cn-004", "resume-collection-cn-005", "resume-collection-cn-007", "resume-collection-cn-008"].includes(slug)) {
    return renderCollectionSidebarMarkup({ resume, schema, sections, definitions, documentRef, slug });
  }
  if (["resume-collection-cn-009", "resume-collection-cn-010"].includes(slug)) {
    return renderCreativeColumnsMarkup({ resume, schema, sections, definitions, documentRef, slug });
  }
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

function cn001ProfileRow(label, value) {
  const text = String(value ?? "").trim();
  if (!text) return "";
  return `<div class="cn001-profile-row"><span>${escapeHtml(label)}：</span><strong>${escapeHtml(text)}</strong></div>`;
}

function cn001Date(value) {
  return String(value || "").trim().replace(/^(\d{4})-(\d{2})$/, "$1.$2");
}

function cn001Range(start, end) {
  const left = cn001Date(start);
  const right = cn001Date(end);
  if (!left && !right) return "";
  return `${left || "—"}-${right || "至今"}`;
}

function renderCn001TimelineItem(item, fields, documentRef) {
  const start = fields.find((field) => field.key === "start");
  const end = fields.find((field) => field.key === "end");
  const rangeFields = fields.filter((field) => field.role === "range");
  const rangeText = (start || end)
    ? cn001Range(item?.start, item?.end)
    : rangeFields.map((field) => item?.[field.key]).filter(Boolean).join("-");
  const organization = fields.filter((field) => field.role === "primary")
    .map((field) => item?.[field.key]).filter((value) => String(value ?? "").trim()).join(" · ");
  const role = fields.filter((field) => field.role === "secondary")
    .map((field) => item?.[field.key]).filter((value) => String(value ?? "").trim()).join(" · ");
  const bodyFields = fields.filter((field) => field.role === "body");
  const metaFields = fields.filter((field) => !["range", "primary", "secondary", "body"].includes(field.role));
  const hasHeading = role || organization || rangeText;

  return `<article class="timeline-item cn001-timeline-item">
    ${hasHeading ? `<div class="cn001-timeline-top">
      <strong>${escapeHtml(role)}</strong>
      <span>${escapeHtml(organization)}</span>
      <time>${escapeHtml(rangeText)}</time>
    </div>` : ""}
    ${bodyFields.map((field) => `<div class="rich-preview">${sanitizeRichHtml(item?.[field.key], documentRef)}</div>`).join("")}
    ${renderMetaRows(metaFields, (field) => item?.[field.key], documentRef)}
  </article>`;
}

function renderCn001Section(section, definition, documentRef) {
  const fields = visibleFields(section);
  let body = "";
  if (definition?.type === "timeline") {
    body = `<div class="timeline-list">${(section.items || []).map((item) => renderCn001TimelineItem(item, fields, documentRef)).join("")}</div>`;
  } else if (definition?.type === "list") {
    body = `<div class="compact-list">${(section.items || []).map((item) => renderListItem(item, fields, documentRef)).join("")}</div>`;
  } else {
    const contentField = fields.find((field) => field.key === "content");
    body = contentField
      ? `<div class="rich-preview rich-preview--standalone">${sanitizeRichHtml(section.content, documentRef)}</div>`
      : "";
  }
  const parsedLineHeight = Number(section.lineHeight);
  const lineHeightStyle = Number.isFinite(parsedLineHeight) && parsedLineHeight > 0
    ? `style="line-height:${parsedLineHeight}"`
    : "";
  return `<section class="resume-section cn001-section resume-section--${escapeHtml(section.id)}" id="preview-${escapeHtml(section.id)}" data-open-module="${escapeHtml(section.id)}" ${lineHeightStyle}>
    <div class="section-heading"><span>${escapeHtml(section.title)}</span><i></i></div>
    <div class="cn001-section-body">${body}</div>
  </section>`;
}

function renderCn001Markup({ resume, schema, sections, definitions, documentRef }) {
  const profile = resume.profile || {};
  const photo = safeImageUrl(profile.photo);
  const leftRows = [
    cn001ProfileRow("姓　名", profile.name),
    cn001ProfileRow("年　龄", profile.age || profile.birthday),
    cn001ProfileRow("学　历", profile.education),
    cn001ProfileRow("求职意向", profile.job)
  ].join("");
  const rightRows = [
    cn001ProfileRow("手机", profile.mobile),
    cn001ProfileRow("邮箱", profile.email),
    cn001ProfileRow("地址", profile.city)
  ].join("");
  const renderedSections = sections.map((section) => renderCn001Section(section, definitions.get(section.id), documentRef)).join("");

  return `<div class="cn001-layout">
    <header class="cn001-banner" aria-label="求职简历">
      <strong>求职简历</strong>
      <span><b>PERSONAL RESUME</b><small>我一直在努力！</small></span>
    </header>
    <section class="cn001-profile" data-open-module="profile">
      <div class="section-heading"><span>基本信息</span><i></i></div>
      <div class="cn001-profile-body">
        <div class="cn001-profile-columns"><div>${leftRows}</div><div>${rightRows}</div></div>
        ${schema.profileFields.includes("photo")
          ? photo
            ? `<img class="resume-photo" src="${escapeHtml(photo)}" alt="个人照片" />`
            : `<div class="resume-photo resume-photo--placeholder" aria-hidden="true"><span>${escapeHtml((profile.name || "你").slice(0, 1))}</span></div>`
          : ""}
      </div>
    </section>
    <main class="resume-sections cn001-sections">${renderedSections}</main>
  </div>`;
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

const COLLECTION_ASSET_ROOT = "/template-assets";
const SECTION_ICONS = {
  objective: "◎", education: "▰", experience: "▣", projects: "◇", campus: "▥",
  certificates: "♙", awards: "✹", skills: "✦", languages: "A", interests: "⌘", summary: "◉"
};
const SECTION_ENGLISH = {
  objective: "Job objective", education: "Education background", experience: "Work experience",
  projects: "Project experience", campus: "Campus experience", certificates: "Certificates",
  awards: "Get the honor", skills: "Professional skills", languages: "Languages",
  interests: "Interests", summary: "Self assessment"
};

function collectionAsset(slug, name) {
  return `${COLLECTION_ASSET_ROOT}/${slug}/v1/html-assets/${name}`;
}

function collectionPhoto(profile, schema, slug, fallback, extraClass = "") {
  if (!schema.profileFields.includes("photo")) return "";
  const photo = safeImageUrl(profile.photo) || (fallback ? collectionAsset(slug, fallback) : "");
  return photo
    ? `<img class="resume-photo ${extraClass}" src="${escapeHtml(photo)}" alt="个人照片" />`
    : `<div class="resume-photo resume-photo--placeholder ${extraClass}" aria-hidden="true"><span>${escapeHtml((profile.name || "你").slice(0, 1))}</span></div>`;
}

function renderCollectionSections(sections, definitions, documentRef) {
  return sections.map((section) => renderResumeSection(section, definitions.get(section.id), documentRef)).join("");
}

function profileValue(label, value, className = "") {
  const text = String(value ?? "").trim();
  if (!text) return "";
  return `<div class="collection-profile-value ${className}"><span>${escapeHtml(label)}</span><strong>${escapeHtml(text)}</strong></div>`;
}

function renderClassicSingleMarkup({ resume, schema, sections, definitions, documentRef, slug }) {
  const profile = resume.profile || {};
  const isTeal = slug.endsWith("002");
  const rows = [
    profileValue("姓　　名", profile.name), profileValue("性　　别", profile.gender),
    profileValue("出生年月", profile.birthday), profileValue("求职意向", profile.job),
    profileValue("联系电话", profile.mobile), profileValue("电子邮箱", profile.email),
    profileValue("所在城市", profile.city), profileValue("政治面貌", profile.politicalStatus)
  ].join("");
  const photo = collectionPhoto(profile, schema, slug, "");
  const title = isTeal
    ? `<div class="collection-document-title"><strong>个人简历</strong><span>PERSONAL RESUME</span></div>`
    : `<div class="collection-info-title"><b>&lt;&lt;&lt;</b><strong> 个人信息</strong></div>`;
  return `<div class="collection-single ${isTeal ? "collection-single--teal" : "collection-single--navy"}">
    <div class="collection-top-rule" aria-hidden="true"></div>
    ${isTeal ? title : ""}
    <section class="collection-profile-card" data-open-module="profile">
      ${isTeal ? "" : title}<div class="collection-profile-grid">${rows}</div>${photo}
    </section>
    <main class="resume-sections collection-single-sections">${renderCollectionSections(sections, definitions, documentRef)}</main>
    <div class="collection-bottom-rule" aria-hidden="true"></div>
  </div>`;
}

function renderGeometricMarkup({ resume, schema, sections, definitions, documentRef }) {
  const slug = "resume-collection-cn-006";
  const profile = resume.profile || {};
  const summary = sections.find((section) => section.id === "summary");
  const bodySections = sections.filter((section) => section.id !== "summary");
  const summaryHtml = summary ? sanitizeRichHtml(summary.content, documentRef) : "";
  const info = [
    profileValue("出生年月", profile.birthday), profileValue("性别", profile.gender),
    profileValue("籍贯", profile.city), profileValue("现居", profile.city),
    profileValue("电话", profile.mobile), profileValue("邮箱", profile.email)
  ].join("");
  return `<div class="collection-geometric">
    <header class="geometric-hero" data-open-module="profile">
      <div class="geometric-summary rich-preview">${summaryHtml}</div>
      <div class="geometric-title"><strong>个人简历</strong><b class="geometric-name">${escapeHtml(profile.name || "你的姓名")}</b><span>求职意向：${escapeHtml(profile.job || "求职岗位")}</span></div>
      ${collectionPhoto(profile, schema, slug, "image1.png")}
    </header>
    <div class="geometric-body"><main class="resume-sections">${renderCollectionSections(bodySections, definitions, documentRef)}</main>
      <aside class="geometric-profile"><h2>基本信息</h2>${info}<h2>兴趣爱好</h2><div class="geometric-hobbies">◉　✈　♬　⌕</div></aside>
    </div><div class="geometric-bottom" aria-hidden="true"></div>
  </div>`;
}

function sidebarFallback(slug) {
  return ({
    "resume-collection-cn-004": "image2.png", "resume-collection-cn-005": "image1.jpeg",
    "resume-collection-cn-007": "image1.jpeg", "resume-collection-cn-008": "image1.jpeg"
  })[slug];
}

function renderSidebarProfile(profile, schema, slug) {
  const contact = [
    profileValue("生日", profile.birthday), profileValue("性别", profile.gender),
    profileValue("电话", profile.mobile), profileValue("邮箱", profile.email), profileValue("地址", profile.city)
  ].join("");
  if (slug.endsWith("008")) {
    return `<div class="sidebar-profile sidebar-profile--nurse">${collectionPhoto(profile, schema, slug, sidebarFallback(slug))}
      <img class="nurse-cap" src="${collectionAsset(slug, "image2.png")}" alt="" />
      <div class="nurse-name"><strong>${escapeHtml(profile.name || "你的姓名")}</strong><span>求职目标：${escapeHtml(profile.job || "护士岗位")}</span></div>
      <div class="sidebar-contact-box">${contact}</div></div>`;
  }
  return `<div class="sidebar-profile">${collectionPhoto(profile, schema, slug, sidebarFallback(slug))}
    <h1>${escapeHtml(profile.name || "你的姓名")}</h1><p>${escapeHtml(profile.job || "求职岗位")}</p>
    <div class="sidebar-contact-box">${contact}</div></div>`;
}

function renderCollectionSidebarMarkup({ resume, schema, sections, definitions, documentRef, slug }) {
  const profile = resume.profile || {};
  const sidebarSections = sections.filter((section) => definitions.get(section.id)?.zone === "sidebar");
  const mainSections = sections.filter((section) => definitions.get(section.id)?.zone !== "sidebar");
  const right = slug.endsWith("007");
  const nurse = slug.endsWith("008");
  return `<div class="collection-sidebar-layout ${right ? "is-right" : "is-left"}">
    <aside class="collection-sidebar">${renderSidebarProfile(profile, schema, slug)}
      <div class="collection-sidebar-sections">${renderCollectionSections(sidebarSections, definitions, documentRef)}</div>
      ${nurse ? `<img class="nurse-illustration" src="${collectionAsset(slug, "image3.png")}" alt="护士插画" />` : ""}
    </aside>
    <main class="resume-sections collection-sidebar-main">
      ${slug.endsWith("004") ? `<div class="coral-resume-title"><span>RESUME</span></div>` : ""}
      ${slug.endsWith("005") ? `<div class="navy-main-name"><strong>${escapeHtml(profile.name || "你的姓名")}</strong><span>${escapeHtml(profile.job || "求职岗位")}</span></div>` : ""}
      ${renderCollectionSections(mainSections, definitions, documentRef)}
    </main>
  </div>`;
}

function renderCreativeColumnsMarkup({ resume, schema, sections, definitions, documentRef, slug }) {
  const profile = resume.profile || {};
  const left = sections.filter((section) => definitions.get(section.id)?.zone === "left");
  const right = sections.filter((section) => definitions.get(section.id)?.zone === "right");
  const background = collectionAsset(slug, "image2.png");
  const info = [profile.name, profile.job, profile.birthday, profile.mobile, profile.email, profile.city].filter(Boolean).join(" · ");
  return `<div class="collection-creative-columns">
    <img class="creative-background" src="${background}" alt="" />
    <header class="creative-header" data-open-module="profile"><div><strong>个人简历</strong><span>PERSONAL RESUME</span><small>${escapeHtml(info)}</small></div>
      ${collectionPhoto(profile, schema, slug, "image1.jpeg")}</header>
    <div class="creative-path" aria-hidden="true"><i></i><i></i><i></i><i></i></div>
    <main class="creative-columns"><div>${renderCollectionSections(left, definitions, documentRef)}</div><div>${renderCollectionSections(right, definitions, documentRef)}</div></main>
  </div>`;
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

function visibleFields(section) {
  return resolveSectionFields(section).filter((field) => field.visible !== false);
}

function metaValueHtml(field, value, documentRef) {
  if (field.type === "richtext") return sanitizeRichHtml(value, documentRef);
  const text = String(value ?? "").trim();
  if (!text) return "";
  if (field.type === "url" && /^https?:\/\//i.test(text)) {
    return `<a href="${escapeHtml(text)}" rel="noopener noreferrer">${escapeHtml(text)}</a>`;
  }
  return escapeHtml(text);
}

function renderMetaRows(fields, readValue, documentRef) {
  const rows = fields.map((field) => {
    const html = metaValueHtml(field, readValue(field), documentRef);
    if (!html) return "";
    return `<div class="field-meta"><span>${escapeHtml(field.label)}</span><strong>${html}</strong></div>`;
  }).join("");
  return rows ? `<div class="field-meta-list">${rows}</div>` : "";
}

function renderTimelineItem(item, fields, documentRef) {
  const start = fields.find((field) => field.key === "start" && field.visible !== false);
  const end = fields.find((field) => field.key === "end" && field.visible !== false);
  const rangeFields = fields.filter((field) => field.role === "range" && field.visible !== false);
  const rangeText = (start || end)
    ? formatRange(item?.start, item?.end)
    : rangeFields.map((field) => item?.[field.key]).filter(Boolean).join(" — ");

  const primaryText = fields.filter((field) => field.role === "primary" && field.visible !== false)
    .map((field) => item?.[field.key]).filter((value) => String(value ?? "").trim()).join(" · ");
  const secondaryText = fields.filter((field) => field.role === "secondary" && field.visible !== false)
    .map((field) => item?.[field.key]).filter((value) => String(value ?? "").trim()).join(" · ");
  const bodyFields = fields.filter((field) => field.role === "body" && field.visible !== false);
  const metaFields = fields.filter((field) => field.visible !== false && !["range", "primary", "secondary", "body"].includes(field.role));

  return `<article class="timeline-item">
    <div class="timeline-item__top">
      ${rangeText ? `<time>${escapeHtml(rangeText)}</time>` : ""}
      ${primaryText ? `<strong>${escapeHtml(primaryText)}</strong>` : ""}
      ${secondaryText ? `<span>${escapeHtml(secondaryText)}</span>` : ""}
    </div>
    ${bodyFields.map((field) => `<div class="rich-preview">${sanitizeRichHtml(item?.[field.key], documentRef)}</div>`).join("")}
    ${renderMetaRows(metaFields, (field) => item?.[field.key], documentRef)}
  </article>`;
}

function renderListItem(item, fields, documentRef) {
  const primary = fields.find((field) => field.role === "primary" && field.visible !== false);
  const secondary = fields.filter((field) => field.role === "secondary" && field.visible !== false);
  const metaFields = fields.filter((field) => field.visible !== false && field.role !== "primary" && field.role !== "secondary");
  const primaryText = primary ? String(item?.[primary.key] ?? "").trim() : "";
  const secondaryText = secondary.map((field) => item?.[field.key]).filter((value) => String(value ?? "").trim()).join(" · ");
  return `<div>
    ${primaryText ? `<strong>${escapeHtml(primaryText)}</strong>` : ""}
    ${secondaryText ? `<span>${escapeHtml(secondaryText)}</span>` : ""}
    ${renderMetaRows(metaFields, (field) => item?.[field.key], documentRef)}
  </div>`;
}

function renderLevelItem(item, fields, documentRef) {
  const primary = fields.find((field) => field.role === "primary" && field.visible !== false);
  const level = fields.find((field) => field.role === "secondary" && field.visible !== false);
  const metaFields = fields.filter((field) => field.visible !== false && field.role !== "primary" && field.role !== "secondary");
  const primaryText = primary ? String(item?.[primary.key] ?? "").trim() : "";
  const levelText = level ? String(item?.[level.key] ?? "").trim() : "";
  return `<div>
    <span>${escapeHtml(primaryText)}</span>
    ${levelText ? `<strong>${escapeHtml(levelText)}</strong><i style="--level:${levelPercent(levelText)}%"></i>` : ""}
    ${renderMetaRows(metaFields, (field) => item?.[field.key], documentRef)}
  </div>`;
}

function renderResumeSection(section, definition, documentRef) {
  const fields = visibleFields(section);
  let body = "";
  if (definition?.type === "keyValues") {
    const values = fields
      .map((field) => [field.label, section.data?.[field.key]])
      .filter(([, value]) => String(value ?? "").trim());
    body = `<div class="objective-grid">${values.map(([label, value]) => `<div><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong></div>`).join("")}</div>`;
  } else if (definition?.type === "timeline") {
    body = `<div class="timeline-list">${(section.items || []).map((item) => renderTimelineItem(item, fields, documentRef)).join("")}</div>`;
  } else if (definition?.type === "list") {
    body = `<div class="compact-list">${(section.items || []).map((item) => renderListItem(item, fields, documentRef)).join("")}</div>`;
  } else if (definition?.type === "levels") {
    body = `<div class="level-list">${(section.items || []).map((item) => renderLevelItem(item, fields, documentRef)).join("")}</div>`;
  } else if (definition?.type === "tags") {
    const itemsField = fields.find((field) => field.key === "items");
    const metaFields = fields.filter((field) => field.key !== "items");
    const tags = itemsField
      ? `<div class="tag-list">${(section.items || []).map((item) => `<span>${escapeHtml(item)}</span>`).join("")}</div>`
      : "";
    body = `${renderMetaRows(metaFields, (field) => section.data?.[field.key], documentRef)}${tags}`;
  } else {
    const contentField = fields.find((field) => field.key === "content");
    const content = contentField
      ? `<div class="rich-preview rich-preview--standalone">${sanitizeRichHtml(section.content, documentRef)}</div>`
      : "";
    const metaFields = fields.filter((field) => field.key !== "content");
    body = `${content}${renderMetaRows(metaFields, (field) => section.data?.[field.key], documentRef)}`;
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
