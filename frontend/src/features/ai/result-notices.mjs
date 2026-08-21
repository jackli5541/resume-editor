import { h, onBeforeUnmount, onMounted, ref } from "vue";

export const AiResultNotices = {
  name: "AiResultNotices",
  setup() {
    const uncertain = ref([]), notices = ref([]);
    function setNotices(next = {}) { uncertain.value = Array.isArray(next.uncertain) ? next.uncertain : []; notices.value = Array.isArray(next.notices) ? next.notices : []; }
    onMounted(() => { window.__resumeVueAiResultNotices = { setNotices }; });
    onBeforeUnmount(() => { if (window.__resumeVueAiResultNotices?.setNotices === setNotices) delete window.__resumeVueAiResultNotices; });
    return () => [
      uncertain.value.length ? h("div", { class: "ai-notice ai-notice--warn" }, [h("strong", "以下字段 AI 无法确认，请保存前核对："), ...uncertain.value.flatMap((field, index) => [index ? "、" : "", h("code", String(field))])]) : null,
      ...(notices.value.length ? notices.value.map((notice) => h("div", { class: "ai-notice ai-notice--info" }, String(notice))) : [h("div", { class: "ai-notice ai-notice--info" }, "已按描述完成结构化填充，确认无误后即可保存草稿。")])
    ];
  }
};
