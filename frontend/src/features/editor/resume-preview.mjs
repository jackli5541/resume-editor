import { h, nextTick, onBeforeUnmount, onMounted, ref } from "vue";

// 模板 HTML 的结构由既有、经过测试的渲染器生成；该组件只接管浏览器 DOM 生命周期。
export const ResumePreview = {
  name: "ResumePreview",
  setup() {
    const markup = ref("");
    function setMarkup(nextMarkup, onRendered) {
      markup.value = String(nextMarkup || "");
      nextTick(() => onRendered?.());
    }
    onMounted(() => { window.__resumeVuePreview = { setMarkup }; });
    onBeforeUnmount(() => { if (window.__resumeVuePreview?.setMarkup === setMarkup) delete window.__resumeVuePreview; });
    return () => h("div", { class: "vue-resume-preview-content", innerHTML: markup.value });
  }
};
