import { h, onBeforeUnmount, onMounted, ref } from "vue";

function install(name, setter) {
  onMounted(() => { window[name] = { setItems: setter }; });
  onBeforeUnmount(() => { if (window[name]?.setItems === setter) delete window[name]; });
}

export const OptimizeDraftList = {
  name: "OptimizeDraftList",
  setup() {
    const drafts = ref([]); const setItems = (items) => { drafts.value = Array.isArray(items) ? items : []; };
    install("__resumeVueOptimizeDraftList", setItems);
    return () => drafts.value.map((draft) => h("button", { type: "button", class: "optimize-draft-item", "data-action": "optimize-open-draft", "data-resume-id": draft.id }, [h("span", [h("strong", draft.candidateName || ""), h("small", draft.title || "")]), h("span", `${draft.templateName || ""} →`)]));
  }
};

function templateCards(templates, action, recommendedLabel, description) {
  return templates.map((template) => {
    const recommended = template.slug === "clean-single";
    return h("article", { class: `translate-template-card${recommended ? " is-recommended" : ""}` }, [
      h("div", { class: "translate-template-card__preview" }, [template.previewUrl ? h("img", { src: template.previewUrl, alt: `${template.name || ""}模板预览` }) : null, recommended ? h("span", `★ ${recommendedLabel}`) : null]),
      h("div", [h("strong", template.name || ""), h("p", recommended ? description.recommended : description.normal), h("button", { type: "button", "data-action": action, "data-template-slug": template.slug, "data-template-version": template.version }, recommended ? description.recommendedAction : description.normalAction)])
    ]);
  });
}

function templateListComponent(name, bridgeName, action, recommendedLabel, description) {
  return { name, setup() {
    const templates = ref([]); const setItems = (items) => { templates.value = Array.isArray(items) ? items : []; };
    install(bridgeName, setItems);
    return () => templateCards(templates.value, action, recommendedLabel, description);
  } };
}

export const AiGenerateTemplateList = templateListComponent("AiGenerateTemplateList", "__resumeVueAiGenerateTemplateList", "ai-select-template", "通用推荐", { recommended: "结构简洁、ATS 友好，适合大多数岗位", normal: "AI 生成后会自动适配此模板的字段与版式", recommendedAction: "使用推荐模板并生成", normalAction: "使用此模板并生成" });
export const TranslateTemplateList = templateListComponent("TranslateTemplateList", "__resumeVueTranslateTemplateList", "translate-select-template", "中英文推荐", { recommended: "ATS 友好，已针对中英文内容长度适配", normal: "可用于翻译草稿，英文长文本可能产生额外换行", recommendedAction: "使用推荐模板并翻译", normalAction: "使用此模板并翻译" });
