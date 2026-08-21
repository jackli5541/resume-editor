import { h, onMounted } from "vue";

export const AdminAiConfig = {
  name: "AdminAiConfig",
  props: { preservedMarkup: { type: String, default: "" } },
  setup(props) {
    onMounted(() => { window.__resumeVueAdminAiConfigMounted?.(); });
    return () => h("div", { innerHTML: props.preservedMarkup });
  }
};
