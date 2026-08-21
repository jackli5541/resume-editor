import { h, onMounted } from "vue";

// 保留原表单 DOM 契约，让验证码 SDK 与既有认证状态机继续使用同一组节点。
export const LoginContent = {
  name: "LoginContent",
  props: { preservedMarkup: { type: String, default: "" } },
  setup(props) {
    onMounted(() => window.__resumeVueLoginContentMounted?.());
    return () => h("div", { class: "vue-login-content", innerHTML: props.preservedMarkup });
  }
};
