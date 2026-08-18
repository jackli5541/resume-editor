const PROFILE = {
  name: { label: "姓名", type: "text" },
  job: { label: "求职岗位", type: "text" },
  mobile: { label: "联系电话", type: "text" },
  email: { label: "联系邮箱", type: "email" },
  city: { label: "所在城市", type: "text" },
  birthday: { label: "出生年月", type: "month" },
  workYears: { label: "工作年限", type: "text" },
  gender: { label: "性别", type: "text" },
  politicalStatus: { label: "政治面貌", type: "text" },
  age: { label: "年龄", type: "text" },
  education: { label: "学历", type: "text" },
  photo: { label: "个人照片", type: "image" }
};

// 字段元信息库：字段键 → 默认标签 / 控件类型 / 显示角色。
// role 决定「怎么摆」，不决定「存什么」：range=时间区间、primary=主标题、
// secondary=副标题、body=富文本正文、meta=标签:值补充行、link=链接。
const FIELD_DEFS = {
  start: { label: "开始时间", type: "month", role: "range" },
  end: { label: "结束时间", type: "month", role: "range" },
  organization: { label: "公司名称", type: "text", role: "primary" },
  role: { label: "职位名称", type: "text", role: "secondary" },
  content: { label: "内容", type: "richtext", role: "body" },
  name: { label: "名称", type: "text", role: "primary" },
  level: { label: "级别", type: "text", role: "secondary" },
  date: { label: "获得时间", type: "month", role: "secondary" },
  job: { label: "求职岗位", type: "text", role: "meta" },
  city: { label: "意向城市", type: "text", role: "meta" },
  salary: { label: "期望薪资", type: "text", role: "meta" },
  availability: { label: "到岗时间", type: "text", role: "meta" },
  items: { label: "兴趣标签", type: "text", role: "meta" }
};

const FIELD_TYPES = ["text", "month", "textarea", "richtext", "url"];
const FIELD_ROLES = ["range", "primary", "secondary", "body", "meta", "link"];

const SECTION_DEFINITIONS = {
  objective: { title: "求职意向", type: "keyValues", fields: ["job", "city", "salary", "availability"] },
  education: { title: "教育背景", type: "timeline", fields: ["start", "end", "organization", "role", "content"], labels: { organization: "学校名称", role: "专业与学历", content: "在校经历" } },
  experience: { title: "工作经历", type: "timeline", fields: ["start", "end", "organization", "role", "content"], titleEditable: true, labels: { organization: "公司名称", role: "职位名称", content: "工作内容" } },
  projects: { title: "项目经验", type: "timeline", fields: ["start", "end", "organization", "role", "content"], labels: { organization: "项目名称", role: "项目角色", content: "项目描述" } },
  campus: { title: "校园经历", type: "timeline", fields: ["start", "end", "organization", "role", "content"], labels: { organization: "组织名称", role: "担任职务", content: "经历描述" } },
  certificates: { title: "证书资质", type: "list", fields: ["name", "level", "date"] },
  awards: { title: "荣誉奖项", type: "list", fields: ["name", "level", "date"] },
  skills: { title: "技能特长", type: "richtext", fields: ["content"], labels: { content: "技能描述" } },
  languages: { title: "语言能力", type: "levels", fields: ["name", "level"], labels: { level: "熟练程度" } },
  interests: { title: "兴趣爱好", type: "tags", fields: ["items"] },
  summary: { title: "自我评价", type: "richtext", fields: ["content"], labels: { content: "自我评价" } }
};

const STYLE_CONTROLS = {
  fontFamily: false,
  fontSize: false,
  theme: false,
  lineHeight: false,
  pagePadding: false,
  sectionGap: false
};

function section(id, zone = "main", overrides = {}) {
  return { id, zone, repeatable: ["timeline", "list", "levels"].includes(SECTION_DEFINITIONS[id].type), sortable: true, titleEditable: false, ...SECTION_DEFINITIONS[id], ...overrides };
}

function schema(slug, name, layout, profileFields, sections, overrides = {}) {
  return {
    schemaVersion: 2,
    slug,
    name,
    profileFields,
    profileDefinitions: PROFILE,
    sections,
    zones: layout.includes("sidebar")
      ? [{ id: "sidebar", sortable: true }, { id: "main", sortable: true }]
      : layout === "columns"
        ? [{ id: "left", sortable: true }, { id: "right", sortable: true }]
        : [{ id: "main", sortable: true }],
    layoutSchema: { renderer: slug, layout, ...overrides.layoutSchema },
    styleControls: { ...STYLE_CONTROLS, ...overrides.styleControls },
    renderers: { preview: slug, pdf: slug, docx: slug === "clean-single" ? "generated-v2" : "native-v2" }
  };
}

export const TEMPLATE_SCHEMAS = {
  "clean-single": schema("clean-single", "极简轻", "single", ["name", "job", "mobile", "email", "city", "workYears", "photo"], [
    section("objective"), section("education"), section("experience"), section("projects"), section("skills"), section("summary"),
    section("campus", "main", { optional: true }),
    section("certificates", "main", { optional: true }),
    section("awards", "main", { optional: true }),
    section("languages", "main", { optional: true }),
    section("interests", "main", { optional: true })
  ], { styleControls: { fontFamily: true, fontSize: { min: 12, max: 18 }, theme: true, lineHeight: true, pagePadding: true, sectionGap: true } }),
  "resume-collection-cn-001": schema("resume-collection-cn-001", "商务圆角", "single-banner", ["name", "age", "education", "job", "mobile", "email", "city", "photo"], [
    section("summary"), section("education"), section("experience"), section("skills", "main", { title: "职业技能" }),
    section("certificates", "main", { optional: true })
  ]),
  "resume-collection-cn-002": schema("resume-collection-cn-002", "经典青灰", "single-compact", ["name", "job", "mobile", "email", "city", "birthday", "gender", "photo"], [
    section("education"), section("campus"), section("experience"), section("skills"), section("summary")
  ]),
  "resume-collection-cn-003": schema("resume-collection-cn-003", "深蓝专业", "single-rule", ["name", "job", "mobile", "email", "city", "birthday", "gender", "politicalStatus", "photo"], [
    section("education"), section("campus"), section("experience"), section("certificates"), section("skills"), section("summary")
  ]),
  "resume-collection-cn-004": schema("resume-collection-cn-004", "珊瑚侧栏", "sidebar-left", ["name", "job", "mobile", "email", "birthday", "gender", "photo"], [
    section("objective", "sidebar"), section("skills", "sidebar"), section("experience"), section("education"), section("summary")
  ]),
  "resume-collection-cn-005": schema("resume-collection-cn-005", "深蓝图标", "sidebar-left", ["name", "job", "mobile", "email", "birthday", "photo"], [
    section("skills", "sidebar"), section("interests", "sidebar"), section("education"), section("experience"), section("projects"), section("summary")
  ]),
  "resume-collection-cn-006": schema("resume-collection-cn-006", "蓝色几何", "single-geometric", ["name", "job", "mobile", "email", "birthday", "gender", "photo"], [
    section("education"), section("experience"), section("campus"), section("certificates"), section("skills")
  ]),
  "resume-collection-cn-007": schema("resume-collection-cn-007", "灰蓝右栏", "sidebar-right", ["name", "job", "mobile", "email", "city", "birthday", "photo"], [
    section("objective", "sidebar"), section("skills", "sidebar"), section("interests", "sidebar"), section("education"), section("experience"), section("summary")
  ]),
  "resume-collection-cn-008": schema("resume-collection-cn-008", "插画侧栏", "sidebar-left", ["name", "job", "mobile", "email", "birthday", "gender", "photo"], [
    section("certificates", "sidebar"), section("interests", "sidebar"), section("summary"), section("experience"), section("education"), section("campus"), section("awards")
  ]),
  "resume-collection-cn-009": schema("resume-collection-cn-009", "清新双栏", "columns", ["name", "job", "mobile", "email", "birthday", "gender", "photo"], [
    section("summary", "left"), section("education", "left"), section("skills", "left"), section("experience", "right"), section("campus", "right"), section("certificates", "right"), section("awards", "right")
  ]),
  "resume-collection-cn-010": schema("resume-collection-cn-010", "时间轴双栏", "columns", ["name", "job", "mobile", "email", "city", "birthday", "photo"], [
    section("summary", "left"), section("education", "left"), section("projects", "left"), section("experience", "right"), section("campus", "right"), section("awards", "right"), section("interests", "right")
  ])
};

export function getTemplateSchema(template) {
  const slug = typeof template === "string" ? template : template?.slug;
  return TEMPLATE_SCHEMAS[slug] || TEMPLATE_SCHEMAS["clean-single"];
}

export function publicTemplateSchema(template) {
  const value = getTemplateSchema(template);
  return JSON.parse(JSON.stringify(value));
}

// 依据模块内置定义，生成完整的字段 Schema（含 label/type/role/builtin/visible）。
export function defaultFieldsFor(sectionId) {
  const definition = SECTION_DEFINITIONS[sectionId];
  if (!definition) return [];
  return definition.fields.map((key) => ({
    key,
    label: definition.labels?.[key] || FIELD_DEFS[key]?.label || key,
    type: FIELD_DEFS[key]?.type || "text",
    role: FIELD_DEFS[key]?.role || "meta",
    builtin: true,
    visible: true
  }));
}

// 模块的「有效字段表」：草稿保存的自定义字段优先，否则回退内置默认（老草稿零迁移）。
export function resolveSectionFields(section) {
  if (Array.isArray(section?.fields)) return section.fields;
  return defaultFieldsFor(section?.id || "");
}

export function isFieldType(value) {
  return FIELD_TYPES.includes(value);
}

export function isFieldRole(value) {
  return FIELD_ROLES.includes(value);
}

export { FIELD_TYPES, FIELD_ROLES };
