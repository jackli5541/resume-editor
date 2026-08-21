import { h, onBeforeUnmount, onMounted, ref } from "vue";

export const ModuleTabs = {
  name: "ModuleTabs",
  setup() {
    const activeModuleId = ref("profile"), sections = ref([]);
    function setTabs(next = {}) { activeModuleId.value = next.activeModuleId || "profile"; sections.value = Array.isArray(next.sections) ? next.sections : []; }
    onMounted(() => { window.__resumeVueModuleTabs = { setTabs }; });
    onBeforeUnmount(() => { if (window.__resumeVueModuleTabs?.setTabs === setTabs) delete window.__resumeVueModuleTabs; });
    return () => [
      h("button", { class: ["module-tab", { "is-active": activeModuleId.value === "profile" }], type: "button", "data-action": "select-module", "data-module-id": "profile" }, [h("span", { class: "module-tab__status module-tab__status--always" }), h("strong", "基本信息")]),
      ...sections.value.map((section) => h("div", { class: ["module-tab-wrap", { "is-hidden": !section.visible }], draggable: section.capabilities.sort === true, "data-drag-module": section.id, "data-zone": section.zone || "main", key: section.id }, [
        h("button", { class: ["module-tab", { "is-active": activeModuleId.value === section.id }], type: "button", "data-action": "select-module", "data-module-id": section.id }, [
          section.capabilities.hide ? h("span", { class: ["module-tab__status", { "is-on": section.visible }], "data-action": "toggle-module", "data-module-id": section.id, title: section.visible ? "隐藏模块" : "显示模块" }) : h("span", { class: "module-tab__status module-tab__status--always" }), h("strong", section.title)
        ]),
        section.capabilities.sort ? h("span", { class: "module-tab__ops" }, [h("button", { type: "button", "data-action": "move-module", "data-module-id": section.id, "data-direction": "-1", disabled: !section.canMoveUp, title: "前移" }, "‹"), h("button", { type: "button", "data-action": "move-module", "data-module-id": section.id, "data-direction": "1", disabled: !section.canMoveDown, title: "后移" }, "›")]) : null
      ]))
    ];
  }
};
