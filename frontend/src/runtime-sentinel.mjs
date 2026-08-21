import { h } from "vue";

export const RuntimeSentinel = {
  name: "RuntimeSentinel",
  render() {
    return h("span", {
      "aria-hidden": "true",
      "data-vue-runtime": "ready"
    });
  }
};
