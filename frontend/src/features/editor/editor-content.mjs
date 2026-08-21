import { h, onBeforeUnmount, onMounted, ref } from "vue";

// 表单 HTML 继续由现有 schema 渲染器提供，Vue 接管抽屉内容替换与销毁。
export const EditorContent = {
  name: "EditorContent",
  setup() {
    const markup = ref("");
    function setMarkup(nextMarkup) { markup.value = String(nextMarkup || ""); }
    onMounted(() => { window.__resumeVueEditorContent = { setMarkup }; });
    onBeforeUnmount(() => { if (window.__resumeVueEditorContent?.setMarkup === setMarkup) delete window.__resumeVueEditorContent; });
    return () => h("div", { class: "vue-editor-content", innerHTML: markup.value });
  }
};
