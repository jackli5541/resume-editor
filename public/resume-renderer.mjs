import { escapeHtml, formatRange } from "./core.mjs";

const FONT_MAP = {
  system: 'Inter, "PingFang SC", "Microsoft YaHei", sans-serif',
  serif: '"Songti SC", SimSun, serif',
  rounded: '"Arial Rounded MT Bold", "PingFang SC", "Microsoft YaHei", sans-serif'
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
  const contact = [profile.mobile, profile.email, profile.city, profile.workYears].filter(Boolean);
  const photo = safeImageUrl(profile.photo);
  const sections = resume.sections.filter((section) => section.visible !== false);

  return `
    <header class="resume-header" data-open-module="profile">
      <div class="resume-header__main">
        <div class="resume-name-row">
          <h1>${escapeHtml(profile.name || "你的姓名")}</h1>
          <span>${escapeHtml(profile.job || "求职岗位")}</span>
        </div>
        <div class="contact-row">
          ${contact.map((value, index) => `<span>${index === 0 ? "" : "· "}${escapeHtml(value)}</span>`).join("")}
        </div>
      </div>
      ${photo ? `<img class="resume-photo" src="${escapeHtml(photo)}" alt="个人照片" />` : ""}
    </header>
    <div class="resume-rule"><i></i></div>
    <main class="resume-sections">
      ${sections.map((section) => renderResumeSection(section, documentRef)).join("")}
    </main>
    <footer class="resume-footer"><span>轻简历 · 结构化排版</span><span>${escapeHtml(resume.title)}</span></footer>`;
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

function renderResumeSection(section, documentRef) {
  let body = "";
  if (section.type === "objective") {
    const values = [
      ["意向岗位", section.data?.job],
      ["意向城市", section.data?.city],
      ["期望薪资", section.data?.salary],
      ["到岗时间", section.data?.availability]
    ].filter(([, value]) => value);
    body = `<div class="objective-grid">${values.map(([label, value]) => `<div><span>${label}</span><strong>${escapeHtml(value)}</strong></div>`).join("")}</div>`;
  } else if (Array.isArray(section.items)) {
    body = `<div class="timeline-list">${section.items.map((item) => `
      <article class="timeline-item">
        <div class="timeline-item__top">
          <time>${escapeHtml(formatRange(item.start, item.end))}</time>
          <strong>${escapeHtml(item.organization)}</strong>
          <span>${escapeHtml(item.role)}</span>
        </div>
        <div class="rich-preview">${sanitizeRichHtml(item.content, documentRef)}</div>
      </article>`).join("")}</div>`;
  } else {
    body = `<div class="rich-preview rich-preview--standalone">${sanitizeRichHtml(section.content, documentRef)}</div>`;
  }

  return `
    <section class="resume-section" id="preview-${escapeHtml(section.id)}" data-open-module="${escapeHtml(section.id)}">
      <div class="section-heading"><span>${escapeHtml(section.title)}</span><i></i></div>
      ${body}
    </section>`;
}
