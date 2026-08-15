export const PAGE_WIDTH = 820;
export const PAGE_HEIGHT = 1160;
export const STORAGE_KEY = "resume-editor-mvp:v2";
export const LEGACY_STORAGE_KEY = "resume-editor-mvp:v1";

export function makeId(prefix = "item") {
  const random = Math.random().toString(36).slice(2, 9);
  return `${prefix}-${Date.now().toString(36)}-${random}`;
}

export function createInitialResume() {
  return {
    schemaVersion: 2,
    id: makeId("resume"),
    title: "产品经理简历",
    template: null,
    updatedAt: new Date().toISOString(),
    revision: 1,
    settings: {
      theme: "#12a77d",
      accent: "#eaf8f4",
      fontFamily: "system",
      fontSize: 14,
      lineHeight: 1.65,
      pagePadding: 38,
      sectionGap: 18
    },
    profile: {
      name: "林知夏",
      job: "产品经理",
      mobile: "138 0000 0000",
      email: "hello@example.com",
      city: "上海",
      birthday: "1996-08",
      workYears: "5年经验",
      gender: "",
      politicalStatus: "",
      age: "",
      education: "",
      school: "",
      major: "",
      nativePlace: "",
      ethnicity: "",
      height: "",
      photo: ""
    },
    sections: [
      {
        id: "objective",
        type: "objective",
        title: "求职意向",
        visible: true,
        data: {
          job: "产品经理",
          city: "上海",
          salary: "面议",
          availability: "一个月内到岗"
        }
      },
      {
        id: "education",
        type: "education",
        title: "教育背景",
        visible: true,
        items: [
          {
            id: makeId("edu"),
            start: "2013-09",
            end: "2017-06",
            organization: "华东理工大学",
            role: "信息管理与信息系统 · 本科",
            content: "<ul><li>主修产品设计、数据分析、管理信息系统等课程</li><li>校级一等奖学金，专业排名前 10%</li></ul>"
          }
        ]
      },
      {
        id: "experience",
        type: "experience",
        title: "工作经历",
        visible: true,
        items: [
          {
            id: makeId("work"),
            start: "2021-04",
            end: "至今",
            organization: "青屿科技有限公司",
            role: "高级产品经理",
            content: "<ul><li>负责企业协作产品从 0 到 1 的规划与交付，覆盖 20 万活跃用户</li><li>通过漏斗分析重构新手引导，核心功能激活率提升 28%</li><li>协同设计、研发和销售建立季度路线图，版本准时交付率提升至 92%</li></ul>"
          },
          {
            id: makeId("work"),
            start: "2017-07",
            end: "2021-03",
            organization: "远帆网络科技",
            role: "产品经理",
            content: "<ul><li>负责数据看板、权限中心与客户配置平台</li><li>建立用户反馈分级机制，平均响应时间由 3 天缩短到 8 小时</li></ul>"
          }
        ]
      },
      {
        id: "projects",
        type: "projects",
        title: "项目经验",
        visible: true,
        items: [
          {
            id: makeId("project"),
            start: "2023-02",
            end: "2023-11",
            organization: "企业知识库智能检索",
            role: "产品负责人",
            content: "<ul><li>完成调研、原型、灰度与商业化方案，首期覆盖 6 个业务部门</li><li>搜索成功率由 61% 提升至 84%，人工咨询量下降 35%</li></ul>"
          }
        ]
      },
      {
        id: "skills",
        type: "richtext",
        title: "技能特长",
        visible: true,
        content: "<p><strong>产品：</strong>需求分析、用户研究、原型设计、数据分析、A/B 测试</p><p><strong>工具：</strong>Figma、Axure、SQL、Excel、Notion、Jira</p>"
      },
      {
        id: "summary",
        type: "richtext",
        title: "自我评价",
        visible: true,
        content: "<p>5 年互联网产品经验，擅长将复杂业务抽象成清晰产品方案。重视数据，也重视一线用户反馈；能够在目标不完全明确的环境中推动跨团队协作并持续交付。</p>"
      },
      {
        id: "campus", type: "timeline", title: "校园经历", visible: false,
        items: [{ id: makeId("campus"), start: "2015-09", end: "2016-06", organization: "校学生会", role: "宣传部负责人", content: "<p>负责校园活动策划与宣传物料统筹。</p>" }]
      },
      {
        id: "certificates", type: "list", title: "证书资质", visible: false,
        items: [{ id: makeId("certificate"), name: "英语六级", level: "CET-6", date: "2016-06" }]
      },
      {
        id: "awards", type: "list", title: "荣誉奖项", visible: false,
        items: [{ id: makeId("award"), name: "校级一等奖学金", level: "校级", date: "2016" }]
      },
      {
        id: "languages", type: "levels", title: "语言能力", visible: false,
        items: [{ id: makeId("language"), name: "英语", level: "熟练" }]
      },
      {
        id: "interests", type: "tags", title: "兴趣爱好", visible: false,
        items: ["阅读", "摄影", "旅行"]
      }
    ]
  };
}

export function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

export function createResumeForTemplate(template) {
  const resume = createInitialResume();
  resume.template = template ? clone(template) : null;
  if (template?.defaultResume) {
    resume.profile = Object.fromEntries(Object.keys(resume.profile).map((field) => [field, ""]));
    resume.profile = { ...resume.profile, ...clone(template.defaultResume.profile || {}) };
    resume.sections = clone(template.defaultResume.sections || []);
  }
  applyTemplateEditorSchema(resume, template?.editorSchema);
  for (const definition of template?.editorSchema?.sections || []) {
    const section = resume.sections.find((item) => item.id === definition.id);
    if (section) section.title = definition.title;
  }
  return resume;
}

function emptySectionForSchema(definition) {
  const base = { id: definition.id, type: definition.type || "richtext", title: definition.title || definition.id, visible: true };
  if (definition.type === "timeline") {
    return { ...base, items: [{ id: makeId(definition.id), start: "", end: "", organization: "", role: "", content: "" }] };
  }
  return { ...base, content: "" };
}

export function applyTemplateEditorSchema(resume, editorSchema) {
  if (!editorSchema?.sections?.length) return resume;
  const existing = new Map((resume.sections || []).map((section) => [section.id, section]));
  const declared = editorSchema.sections.map((definition) => existing.get(definition.id) || emptySectionForSchema(definition));
  const declaredIds = new Set(editorSchema.sections.map((definition) => definition.id));
  // Keep data from other templates in the draft, but place it outside the active schema.
  resume.sections = [...declared, ...(resume.sections || []).filter((section) => !declaredIds.has(section.id))];
  return resume;
}

export function normalizeResume(input) {
  const fallback = createInitialResume();
  if (!input || typeof input !== "object") return fallback;

  const resume = {
    ...fallback,
    ...input,
    settings: { ...fallback.settings, ...(input.settings || {}) },
    profile: { ...fallback.profile, ...(input.profile || {}) }
  };

  if (!Array.isArray(input.sections) || input.sections.length === 0) {
    resume.sections = fallback.sections;
  } else {
    resume.sections = input.sections
      .filter((section) => section && typeof section === "object")
      .map((section, index) => ({
        id: section.id || makeId("section"),
        type: section.type || "richtext",
        title: section.title || `模块 ${index + 1}`,
        visible: section.visible !== false,
        ...section,
        items: Array.isArray(section.items)
          ? section.items.map((item) => item && typeof item === "object"
            ? { id: item.id || makeId("entry"), ...item }
            : String(item || ""))
          : section.items
      }));
  }

  resume.schemaVersion = 2;
  const known = new Set(resume.sections.map((section) => section.id));
  for (const section of fallback.sections) {
    if (!known.has(section.id)) resume.sections.push(clone(section));
  }

  resume.settings.fontSize = clamp(Number(resume.settings.fontSize), 12, 18);
  resume.settings.lineHeight = clamp(Number(resume.settings.lineHeight), 1.3, 2.1);
  resume.settings.pagePadding = clamp(Number(resume.settings.pagePadding), 24, 56);
  resume.settings.sectionGap = clamp(Number(resume.settings.sectionGap), 8, 32);
  return resume;
}

export function clamp(value, min, max) {
  const number = Number.isFinite(value) ? value : min;
  return Math.min(max, Math.max(min, number));
}

export function moveItem(list, fromIndex, toIndex) {
  if (!Array.isArray(list)) return list;
  if (fromIndex < 0 || fromIndex >= list.length) return list;
  if (toIndex < 0 || toIndex >= list.length || fromIndex === toIndex) return list;
  const next = list.slice();
  const [item] = next.splice(fromIndex, 1);
  next.splice(toIndex, 0, item);
  return next;
}

export function pageCountForHeight(height, pageHeight = PAGE_HEIGHT) {
  return Math.max(1, Math.ceil(Math.max(0, Number(height) || 0) / pageHeight));
}

export function completionScore(resume) {
  const profile = resume.profile || {};
  const profileFields = ["name", "job", "mobile", "email", "city"];
  const profileDone = profileFields.filter((key) => String(profile[key] || "").trim()).length;
  const visible = (resume.sections || []).filter((section) => section.visible !== false);
  const contentDone = visible.filter((section) => {
    if (Array.isArray(section.items)) return section.items.length > 0;
    if (section.data) return Object.values(section.data).some((value) => String(value || "").trim());
    return String(section.content || "").replace(/<[^>]+>/g, "").trim();
  }).length;
  const total = profileFields.length + Math.max(1, visible.length);
  return Math.round(((profileDone + contentDone) / total) * 100);
}

export function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

export function formatRange(start, end) {
  const left = String(start || "").trim();
  const right = String(end || "").trim();
  if (!left && !right) return "";
  return `${left || "—"} — ${right || "至今"}`;
}
