import { h, onBeforeUnmount, onMounted, ref } from "vue";

const STATUS = {
  ready: ["已发布", "badge badge--active"],
  needs_mapping: ["待标注", "badge"],
  needs_qa: ["待验收", "badge badge--admin"],
  blocked: ["已下架", "badge badge--disabled"]
};

export const AdminTemplates = {
  name: "AdminTemplates",
  setup() {
    const templates = ref([]), selected = ref(new Set()), canWrite = ref(false);
    function setTemplates(items, options = {}) {
      templates.value = Array.isArray(items) ? items : [];
      selected.value = new Set(options.selected || []);
      canWrite.value = Boolean(options.canWrite);
    }
    onMounted(() => { window.__resumeVueAdminTemplates = { setTemplates }; });
    onBeforeUnmount(() => { if (window.__resumeVueAdminTemplates?.setTemplates === setTemplates) delete window.__resumeVueAdminTemplates; });
    const action = (label, attributes) => h("button", { type: "button", ...attributes }, label);
    return () => {
      if (!templates.value.length) return h("p", { class: "admin-empty" }, "暂无模板。");
      const allSelected = templates.value.every((item) => selected.value.has(`${item.slug}@${item.version}`));
      return h("table", { class: "admin-table" }, [
        h("thead", [h("tr", [
          h("th", { class: "admin-check" }, [h("input", { type: "checkbox", "data-admin-template-select-all": "", "aria-label": "全选当前结果", checked: allSelected })]),
          ...["模板", "分类", "标签", "版本", "引擎", "状态", "许可证", "操作"].map((label) => h("th", label))
        ])]),
        h("tbody", templates.value.map((template) => {
          const key = `${template.slug}@${template.version}`;
          const status = STATUS[template.status];
          const operations = [];
          if (canWrite.value) {
            operations.push(action("编辑", { "data-action": "admin-edit-template", "data-slug": template.slug }));
            if (template.status !== "ready") operations.push(action("发布", { "data-action": "admin-template-status", "data-slug": template.slug, "data-version": template.version, "data-status": "ready" }));
            if (template.status !== "blocked") operations.push(action("下架", { "data-action": "admin-template-status", "data-slug": template.slug, "data-version": template.version, "data-status": "blocked" }));
          }
          return h("tr", { key }, [
            h("td", { class: "admin-check" }, [h("input", { type: "checkbox", "data-admin-template-select": key, "aria-label": `选择 ${template.name || ""}`, checked: selected.value.has(key) })]),
            h("td", [h("strong", template.name || ""), h("small", { class: "admin-user small" }, template.slug || "")]),
            h("td", template.category || "—"),
            h("td", template.tags?.length ? template.tags.map((tag) => h("span", { class: "admin-template-tag" }, tag)) : "—"),
            h("td", `v${template.version}`), h("td", template.engine || "—"),
            h("td", status ? [h("span", { class: status[1] }, status[0])] : (template.status || "")),
            h("td", template.licenseStatus || "—"),
            h("td", { class: "admin-table__ops" }, operations.length ? operations : [h("span", { class: "admin-self" }, "—")])
          ]);
        }))
      ]);
    };
  }
};
