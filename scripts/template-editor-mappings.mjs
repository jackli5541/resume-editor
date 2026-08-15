const PROFILE_DEFINITIONS = {
  name: { label: "姓名", type: "text" }, job: { label: "求职岗位", type: "text" },
  mobile: { label: "联系电话", type: "text" }, email: { label: "联系邮箱", type: "email" },
  city: { label: "所在城市", type: "text" }, photo: { label: "个人照片", type: "image" },
  age: { label: "年龄", type: "text" }, birthday: { label: "出生年月", type: "text" },
  gender: { label: "性别", type: "text" }, education: { label: "学历", type: "text" },
  workYears: { label: "工作年限", type: "text" }, politicalStatus: { label: "政治面貌", type: "text" },
  school: { label: "毕业院校", type: "text" }, major: { label: "专业", type: "text" },
  nativePlace: { label: "籍贯", type: "text" }, ethnicity: { label: "民族", type: "text" },
  height: { label: "身高", type: "text" }
};

const SECTION_DEFINITIONS = {
  objective: { title: "求职意向", type: "richtext" }, education: { title: "教育背景", type: "timeline" },
  experience: { title: "工作经历", type: "timeline" }, campus: { title: "校园经历", type: "richtext" },
  skills: { title: "技能特长", type: "richtext" }, certificates: { title: "技能证书", type: "richtext" },
  awards: { title: "奖项荣誉", type: "richtext" }, courses: { title: "主修课程", type: "richtext" },
  interests: { title: "兴趣爱好", type: "richtext" }, languages: { title: "语言能力", type: "richtext" },
  competencies: { title: "专业能力", type: "richtext" }, summary: { title: "自我评价", type: "richtext" }
};

// Audited against the modules visibly present in each original DOCX. Basic and
// contact information stays in profileFields instead of being duplicated here.
const TEMPLATE_MAPPINGS = {
  "resume-collection-cn-001": { name: "商务圆角", layout: "single-banner", sections: [["summary", "自我评价"], ["education", "教育背景"], ["experience", "工作经验"], ["skills", "职业技能"]] },
  "resume-collection-cn-002": { name: "经典青灰", layout: "single-compact", sections: [["education", "教育背景"], ["summary", "自我评价"], ["experience", "实习经历"], ["campus", "校园经历"], ["certificates", "技能证书"]] },
  "resume-collection-cn-003": { name: "深蓝专业", layout: "single-rule", sections: [["education", "教育背景"], ["courses", "主修课程"], ["skills", "个人能力"], ["awards", "获奖情况"], ["experience", "工作经验"], ["summary", "自我评价"]] },
  "resume-collection-cn-004": { name: "珊瑚侧栏", layout: "sidebar-left", sections: [["experience", "工作经验"], ["education", "教育背景"], ["certificates", "荣誉&证书"], ["summary", "自我评价"]] },
  "resume-collection-cn-005": { name: "深蓝图标", layout: "sidebar-left", sections: [["objective", "求职意向"], ["education", "教育背景"], ["experience", "工作经验"], ["awards", "奖项荣誉"], ["summary", "自我评价"], ["interests", "兴趣爱好"]] },
  "resume-collection-cn-006": { name: "蓝色几何", layout: "single-geometric", sections: [["summary", "个人简介"], ["objective", "求职意向"], ["education", "教育背景"], ["experience", "工作经历"], ["campus", "校园经历"], ["certificates", "技能证书"], ["interests", "兴趣爱好"]] },
  "resume-collection-cn-007": { name: "灰蓝右栏", layout: "sidebar-right", sections: [["summary", "个人简介"], ["experience", "工作经历"], ["education", "教育/培训经历"], ["courses", "主修课程"], ["awards", "获得荣誉"], ["skills", "技能"], ["languages", "语言"]] },
  "resume-collection-cn-008": { name: "插画侧栏", layout: "sidebar-left", sections: [["summary", "个人简介"], ["experience", "工作实践"], ["objective", "求职目标"], ["education", "教育培训"], ["courses", "主修课程"], ["awards", "奖项荣誉"], ["competencies", "我所具备的"], ["certificates", "我的证书"]] },
  "resume-collection-cn-009": { name: "清新双栏", layout: "columns", sections: [["summary", "自我评价"], ["education", "教育背景"], ["experience", "工作经历"], ["campus", "校园经历"], ["awards", "获得荣誉"]] },
  "resume-collection-cn-010": { name: "时间轴双栏", layout: "columns", sections: [["summary", "自我评价"], ["education", "教育背景"], ["experience", "工作经历"], ["awards", "获得荣誉"]] }
};

function sectionFields(id, tags, repeatable) {
  if (!repeatable) return ["content"];
  return ["start", "end", "organization", "role", "name", "level", "date", "content"]
    .filter((field) => tags.has(`resume:item.${field}`));
}

export function buildEditorSchema(slug, nativeSlots) {
  const mapping = TEMPLATE_MAPPINGS[slug];
  if (!mapping) throw new Error(`Missing editor mapping for ${slug}`);
  const tags = new Set(nativeSlots.tags || []);
  const profileFields = Object.keys(PROFILE_DEFINITIONS).filter((field) => tags.has(`resume:profile.${field}`));
  const sections = mapping.sections.map(([id, templateTitle]) => {
    const definition = SECTION_DEFINITIONS[id];
    const repeatable = tags.has(`resume:repeat:${id}`);
    if (!definition || (!repeatable && !tags.has(`resume:section:${id}.content`))) {
      throw new Error(`${slug} is missing the DOCX slot for required module ${id}`);
    }
    const zoneTag = [...tags].find((tag) => tag.startsWith("resume:zone:"));
    const sortable = Boolean(zoneTag && tags.has(`resume:section-block:${id}`));
    return {
      id, title: templateTitle, type: repeatable ? "timeline" : definition.type,
      zone: zoneTag?.slice("resume:zone:".length) || "main", fields: sectionFields(id, tags, repeatable),
      capabilities: { addItems: repeatable, removeItems: repeatable, hide: tags.has(`resume:section:${id}.visible`),
        sort: sortable, editTitle: true, titleSlot: tags.has(`resume:section:${id}.title`) }
    };
  });
  const zones = [...new Set(sections.map((section) => section.zone))].map((id) => ({
    id, sortable: sections.some((section) => section.zone === id && section.capabilities.sort)
  }));
  return {
    schemaVersion: 3, slug, name: mapping.name, profileFields,
    profileDefinitions: Object.fromEntries(profileFields.map((field) => [field, PROFILE_DEFINITIONS[field]])),
    sections, zones: zones.length ? zones : [{ id: "main", sortable: false }],
    layoutSchema: { renderer: "docx-pages", layout: mapping.layout },
    styleControls: { fontFamily: false, fontSize: false, theme: false, lineHeight: false, pagePadding: false, sectionGap: false },
    capabilities: { fixedTemplateElementsLocked: true },
    renderers: { preview: "docx-native", pdf: "docx-native", docx: "docx-native" }
  };
}

export { TEMPLATE_MAPPINGS };
