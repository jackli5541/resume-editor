import { h, onBeforeUnmount, onMounted, ref } from "vue";

const SECTION_LABELS = { objective: "求职意向", education: "教育背景", experience: "工作经历", projects: "项目经验", skills: "技能特长", summary: "自我评价", campus: "校园经历", certificates: "证书资质", awards: "荣誉奖项", languages: "语言能力", interests: "兴趣爱好" };
function field(index, key, label, value, uncertain, options = {}) {
  return h("label", { class: uncertain ? "is-uncertain" : "" }, [h("span", [label, options.required ? " *" : "", uncertain ? h("i", { class: "ai-project-review__hint", title: "AI 无法确认该字段" }, "待核对") : null]), h("input", { type: "text", value: value || "", placeholder: options.placeholder || "", "data-ai-project-index": index, "data-ai-project-field": key })]);
}

export const AiProjectReview = {
  name: "AiProjectReview",
  setup() {
    const projects = ref([]); const setProjects = (items) => { projects.value = Array.isArray(items) ? items : []; };
    onMounted(() => { window.__resumeVueAiProjectReview = { setProjects }; });
    onBeforeUnmount(() => { if (window.__resumeVueAiProjectReview?.setProjects === setProjects) delete window.__resumeVueAiProjectReview; });
    return () => projects.value.length ? [
      h("div", { class: "ai-project-review__head" }, [h("div", [h("span", { class: "eyebrow" }, "PROJECT CHECK"), h("h3", "确认项目识别结果"), h("p", "核对项目名称、角色、时间与技术栈；高亮字段请重点确认，修改会立即同步到预览。")]), h("span", { class: "ai-project-review__status", "data-project-review-status": "" }, "待确认")]),
      h("div", { class: "ai-project-review__list" }, projects.value.map((project, index) => h("article", { class: `ai-project-review__card ${project.uncertain?.any ? "is-uncertain" : ""}` }, [h("div", { class: "ai-project-review__title" }, [h("strong", `项目 ${index + 1}`), project.uncertain?.any ? h("span", { class: "ai-project-review__flag" }, "AI 标记为不确定") : null]), h("div", { class: "ai-project-review__body" }, [h("div", { class: "ai-project-review__fields" }, [field(index, "organization", "项目名称", project.organization, project.uncertain?.fields?.includes("organization"), { required: true, placeholder: "项目正式名称" }), field(index, "role", "项目角色", project.role, project.uncertain?.fields?.includes("role"), { placeholder: "如：项目负责人" }), field(index, "techStack", "技术栈", project.techStack, project.uncertain?.fields?.includes("techStack"), { placeholder: "如：Vue / Node.js" }), h("div", { class: "ai-project-review__dates" }, [field(index, "start", "开始时间", project.start, project.uncertain?.fields?.includes("start"), { placeholder: "如 2021-04" }), field(index, "end", "结束时间", project.end, project.uncertain?.fields?.includes("end"), { placeholder: "如 至今" })])]), project.source ? h("div", { class: "ai-project-review__source" }, [h("div", { class: "ai-project-review__source-title" }, "导入原文"), h("pre", project.source)]) : null])]))),
      h("div", { class: "ai-project-review__footer" }, [h("span", "带 * 的项目名称不能为空；确认前无法保存草稿。"), h("button", { type: "button", class: "ai-save", "data-action": "ai-confirm-projects" }, "确认项目信息")])
    ] : null;
  }
};

export const AiModuleReview = {
  name: "AiModuleReview",
  setup() {
    const mappings = ref([]); const setMappings = (items) => { mappings.value = Array.isArray(items) ? items : []; };
    onMounted(() => { window.__resumeVueAiModuleReview = { setMappings }; });
    onBeforeUnmount(() => { if (window.__resumeVueAiModuleReview?.setMappings === setMappings) delete window.__resumeVueAiModuleReview; });
    return () => mappings.value.length ? [h("div", { class: "ai-project-review__head" }, [h("div", [h("span", { class: "eyebrow" }, "MODULE CHECK"), h("h3", "确认非标准模块映射"), h("p", "以下标题无法确定性匹配，请确认系统建议的归属后再进入编辑器。")]), h("span", { class: "ai-project-review__status", "data-module-review-status": "" }, "待确认")]), h("div", { class: "ai-module-review__list" }, mappings.value.map((mapping, index) => h("label", { class: "ai-module-review__item" }, [h("input", { type: "checkbox", "data-ai-module-confirm": index }), h("span", [h("small", "DOCX 原模块名"), h("strong", mapping.sourceTitle || "")]), h("span", { class: "ai-module-review__arrow", "aria-hidden": "true" }, "→"), h("span", [h("small", "系统建议归入"), h("strong", SECTION_LABELS[mapping.targetId] || mapping.targetId || "")])]))), h("div", { class: "ai-project-review__footer" }, [h("span", "请逐项核对；全部确认后才可进入编辑器。"), h("button", { type: "button", class: "ai-save", "data-action": "ai-confirm-modules" }, "确认模块映射")])] : null;
  }
};
