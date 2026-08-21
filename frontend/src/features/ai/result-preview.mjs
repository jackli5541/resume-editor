import { h, onBeforeUnmount, onMounted, ref } from "vue";

export const AiResultPreview = {
  name: "AiResultPreview",
  setup() {
    const markup = ref("");
    function setMarkup(nextMarkup) { markup.value = String(nextMarkup || ""); }
    onMounted(() => { window.__resumeVueAiResultPreview = { setMarkup }; });
    onBeforeUnmount(() => { if (window.__resumeVueAiResultPreview?.setMarkup === setMarkup) delete window.__resumeVueAiResultPreview; });
    return () => h("div", { class: "vue-ai-result-preview", innerHTML: markup.value });
  }
};
