import { h, onBeforeUnmount, onMounted, ref } from "vue";
import { requestJson } from "../../../../public/api-client.mjs";

export const FeedbackDialog = {
  name: "FeedbackDialog",
  setup() {
    const visible = ref(false), type = ref("suggestion"), content = ref(""), errorMessage = ref(""), submitting = ref(false), callbacks = ref({});
    function open(nextCallbacks = {}) { callbacks.value = nextCallbacks; type.value = "suggestion"; content.value = ""; errorMessage.value = ""; visible.value = true; }
    function close() { visible.value = false; errorMessage.value = ""; }
    async function submit() {
      const text = content.value.trim(); errorMessage.value = "";
      if (!text) { errorMessage.value = "请填写反馈内容"; return; }
      submitting.value = true;
      try {
        await requestJson("/api/feedback", { method: "POST", body: JSON.stringify({ type: type.value, content: text }) });
        content.value = ""; close(); callbacks.value.onToast?.("反馈已提交，感谢！", "success");
      } catch (error) { errorMessage.value = error?.message || "提交失败"; } finally { submitting.value = false; }
    }
    onMounted(() => { window.__resumeVueFeedback = { open, close }; });
    onBeforeUnmount(() => { if (window.__resumeVueFeedback?.open === open) delete window.__resumeVueFeedback; });
    return () => h("div", { class: "auth-overlay", id: "feedbackOverlay", hidden: !visible.value, onClick: (event) => { if (event.target === event.currentTarget) close(); } }, [h("div", { class: "auth-dialog", role: "dialog", "aria-modal": "true", "aria-labelledby": "feedbackTitle" }, [h("div", { class: "auth-dialog__head" }, [h("div", [h("span", { class: "eyebrow" }, "FEEDBACK"), h("h2", { id: "feedbackTitle" }, "意见反馈")]), h("button", { class: "auth-dialog__close", type: "button", "data-action": "close-feedback", "aria-label": "关闭", onClick: close }, "×")]), h("form", { id: "feedbackForm", noValidate: true, onSubmit: (event) => { event.preventDefault(); submit(); } }, [h("label", { class: "form-field" }, [h("span", "类型"), h("select", { id: "feedbackType", value: type.value, onChange: (event) => { type.value = event.target.value; } }, [["suggestion", "建议"], ["bug", "问题 / Bug"], ["question", "咨询"], ["other", "其他"]].map(([value, label]) => h("option", { value }, label)))]), h("label", { class: "form-field" }, [h("span", "反馈内容"), h("textarea", { id: "feedbackContent", rows: 4, maxlength: 4000, placeholder: "请描述你的建议或遇到的问题", value: content.value, onInput: (event) => { content.value = event.target.value; } })]), h("p", { class: "auth-error", id: "feedbackError", role: "alert", hidden: !errorMessage.value }, errorMessage.value), h("button", { class: "primary-button auth-submit", type: "submit", disabled: submitting.value }, submitting.value ? "正在提交…" : "提交反馈")])])]);
  }
};
