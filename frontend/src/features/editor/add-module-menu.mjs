import { h, onBeforeUnmount, onMounted, ref } from "vue";

export const AddModuleMenu = {
  name: "AddModuleMenu",
  setup() {
    const available = ref([]);
    function setAvailable(next) { available.value = Array.isArray(next) ? next : []; }
    onMounted(() => { window.__resumeVueAddModuleMenu = { setAvailable }; });
    onBeforeUnmount(() => { if (window.__resumeVueAddModuleMenu?.setAvailable === setAvailable) delete window.__resumeVueAddModuleMenu; });
    return () => available.value.map((section) => h("button", { type: "button", class: "module-add__item", "data-action": "add-module", "data-module-id": section.id, key: section.id }, section.title));
  }
};
