import { normalizeResume } from "../public/core.mjs";

export class RequestValidationError extends Error {
  constructor(message, statusCode = 400) {
    super(message);
    this.name = "RequestValidationError";
    this.statusCode = statusCode;
  }
}

const LIMITS = {
  title: 120,
  field: 500,
  richText: 50_000,
  sections: 30,
  itemsPerSection: 50,
  totalItems: 120,
  photoBytes: 1_500_000
};

function text(value, label, limit = LIMITS.field) {
  const result = String(value ?? "");
  if (result.length > limit) throw new RequestValidationError(`${label}超过长度限制`);
  return result;
}

function canonicalItem(item, sectionTitle, index) {
  return {
    id: text(item.id, `${sectionTitle}第 ${index + 1} 条 ID`, 160),
    start: text(item.start, `${sectionTitle}第 ${index + 1} 条开始时间`, 80),
    end: text(item.end, `${sectionTitle}第 ${index + 1} 条结束时间`, 80),
    organization: text(item.organization, `${sectionTitle}第 ${index + 1} 条名称`),
    role: text(item.role, `${sectionTitle}第 ${index + 1} 条角色`),
    content: text(item.content, `${sectionTitle}第 ${index + 1} 条内容`, LIMITS.richText)
  };
}

function validatePhoto(value, allowedImageHosts) {
  const photo = String(value ?? "");
  if (!photo) return "";

  const dataMatch = photo.match(/^data:image\/(png|jpeg|webp);base64,([a-z0-9+/=]+)$/i);
  if (dataMatch) {
    const estimatedBytes = Math.floor(dataMatch[2].length * 0.75);
    if (estimatedBytes > LIMITS.photoBytes) return "";
    return photo;
  }

  let url;
  try {
    url = new URL(photo);
  } catch {
    return "";
  }
  if (url.protocol !== "https:") return "";
  if (!allowedImageHosts.has(url.hostname.toLowerCase())) return "";
  return url.href;
}

export function validateExportPayload(payload, options = {}) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw new RequestValidationError("请求体必须是 JSON 对象");
  }
  if (!payload.resume || typeof payload.resume !== "object" || Array.isArray(payload.resume)) {
    throw new RequestValidationError("缺少有效的 resume 数据");
  }

  const allowedImageHosts = new Set((options.allowedImageHosts || []).map((host) => host.toLowerCase()));
  const normalized = normalizeResume(payload.resume);
  if (normalized.sections.length > LIMITS.sections) throw new RequestValidationError("简历模块数量超过限制");

  let totalItems = 0;
  const sections = normalized.sections.map((section, sectionIndex) => {
    const title = text(section.title, `第 ${sectionIndex + 1} 个模块标题`, LIMITS.title);
    const canonical = {
      id: text(section.id, `第 ${sectionIndex + 1} 个模块 ID`, 160),
      type: ["objective", "education", "experience", "projects", "richtext"].includes(section.type)
        ? section.type
        : "richtext",
      title,
      visible: section.visible !== false
    };

    if (section.type === "objective") {
      canonical.data = {
        job: text(section.data?.job, "意向岗位"),
        city: text(section.data?.city, "意向城市"),
        salary: text(section.data?.salary, "期望薪资"),
        availability: text(section.data?.availability, "到岗时间")
      };
    } else if (Array.isArray(section.items)) {
      if (section.items.length > LIMITS.itemsPerSection) {
        throw new RequestValidationError(`${title}的条目数量超过限制`);
      }
      totalItems += section.items.length;
      canonical.items = section.items.map((item, index) => canonicalItem(item, title, index));
    } else {
      canonical.content = text(section.content, `${title}内容`, LIMITS.richText);
    }
    return canonical;
  });

  if (totalItems > LIMITS.totalItems) throw new RequestValidationError("简历经历条目总数超过限制");

  const format = ["pdf", "docx"].includes(payload.format) ? payload.format : "pdf";
  return {
    resume: {
      schemaVersion: 1,
      id: text(normalized.id, "简历 ID", 160),
      title: text(normalized.title, "简历标题", LIMITS.title),
      updatedAt: text(normalized.updatedAt, "更新时间", 80),
      revision: Number.isSafeInteger(normalized.revision) ? normalized.revision : 1,
      settings: {
        theme: /^#[0-9a-f]{6}$/i.test(normalized.settings.theme) ? normalized.settings.theme : "#12a77d",
        accent: text(normalized.settings.accent, "辅助颜色", 80),
        fontFamily: ["system", "serif", "rounded"].includes(normalized.settings.fontFamily)
          ? normalized.settings.fontFamily
          : "system",
        fontSize: normalized.settings.fontSize,
        lineHeight: normalized.settings.lineHeight,
        pagePadding: normalized.settings.pagePadding,
        sectionGap: normalized.settings.sectionGap
      },
      profile: {
        name: text(normalized.profile.name, "姓名", LIMITS.title),
        job: text(normalized.profile.job, "求职岗位", LIMITS.title),
        mobile: text(normalized.profile.mobile, "联系电话", 120),
        email: text(normalized.profile.email, "邮箱", 320),
        city: text(normalized.profile.city, "城市", LIMITS.title),
        birthday: text(normalized.profile.birthday, "出生年月", 80),
        workYears: text(normalized.profile.workYears, "工作年限", LIMITS.title),
        photo: validatePhoto(normalized.profile.photo, allowedImageHosts)
      },
      sections
    },
    format,
    template: payload.template && typeof payload.template === "object" ? {
      slug: text(payload.template.slug, "模板 ID", 160),
      version: Number.isSafeInteger(payload.template.version) ? payload.template.version : 1
    } : { slug: "clean-single", version: 1 },
    fileName: sanitizeFileName(payload.fileName || `${normalized.profile.name || "简历"}.${format}`, format)
  };
}

export function sanitizeFileName(value, format = "pdf") {
  const base = String(value || "简历.pdf")
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, "_")
    .replace(/^\.+/g, "")
    .replace(/[. ]+$/g, "")
    .slice(0, 100) || "简历";
  const withoutKnownExtension = base.replace(/\.(pdf|docx)$/i, "");
  return `${withoutKnownExtension}.${format}`;
}
