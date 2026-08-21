import { h, onBeforeUnmount, onMounted, ref } from "vue";

function ordered(templates) {
  return [...templates].sort((left, right) => Number(right.slug === "clean-single") - Number(left.slug === "clean-single"));
}

export const TemplateLibrary = {
  name: "TemplateLibrary",
  setup() {
    const templates = ref([]);
    const changing = ref(false);
    const selected = ref(null);
    function setTemplates(payload = {}) {
      templates.value = ordered(payload.templates || []);
      changing.value = Boolean(payload.templateChangeMode);
      selected.value = payload.selectedTemplate || null;
    }
    onMounted(() => { window.__resumeVueTemplateLibrary = { setTemplates }; });
    onBeforeUnmount(() => { if (window.__resumeVueTemplateLibrary?.setTemplates === setTemplates) delete window.__resumeVueTemplateLibrary; });
    return () => templates.value.map((template) => {
      const ready = template.selectable === true;
      const recommended = template.slug === "clean-single";
      const current = changing.value && selected.value?.slug === template.slug && Number(selected.value?.version || 1) === Number(template.version);
      const status = ready ? "可使用" : template.status === "blocked" ? "安全检查未通过" : template.status === "needs_qa" ? "待高保真验收" : "待字段标注";
      const description = recommended ? "AI 快速生成的默认模板 · 极简清晰 · ATS 友好，无需整理个人信息即可导出。" : template.description || "结构化简历模板";
      return h("article", { class: `template-card ${ready ? "is-ready" : "is-pending"}${recommended ? " is-recommended" : ""}`, key: `${template.slug}@${template.version}` }, [
        h("div", { class: "template-preview" }, [template.previewUrl ? h("img", { src: template.previewUrl, alt: `${template.name}模板预览`, loading: "lazy" }) : h("div", { class: "template-preview-placeholder" }, [h("span", String(template.name || "?").slice(0, 1))]), recommended ? h("span", { class: "template-badge" }, "★ 推荐") : null, h("span", { class: "template-status" }, status)]),
        h("div", { class: "template-card__body" }, [h("div", [h("strong", template.name), h("span", `${template.category} · v${template.version}`)]), h("p", description), h("button", { type: "button", "data-action": "select-template", "data-template-slug": template.slug, "data-template-version": String(template.version), disabled: !ready || current }, current ? "当前模板" : ready ? changing.value ? "更换为此模板" : recommended ? "使用推荐模板" : "使用此模板" : template.status === "needs_qa" ? "验收后开放" : "标注后开放")])
      ]);
    });
  }
};
