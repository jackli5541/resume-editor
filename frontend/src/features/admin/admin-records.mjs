import { h, onBeforeUnmount, onMounted, ref } from "vue";

const PAGE_SIZE = 20;

function formatDate(value, withTime = true) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return withTime
    ? date.toLocaleString("zh-CN", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: false })
    : date.toLocaleDateString("zh-CN");
}

function option(value, label, selected) {
  return h("option", { value, selected: value === selected }, label);
}

function pagination(total, page, changePage) {
  if (total.value <= PAGE_SIZE) return null;
  const pages = Math.max(1, Math.ceil(total.value / PAGE_SIZE));
  return h("nav", { class: "admin-pagination", "aria-label": "记录分页" }, [
    h("button", { type: "button", disabled: page.value <= 1, onClick: () => changePage(page.value - 1) }, "上一页"),
    h("span", `第 ${page.value} / ${pages} 页`),
    h("button", { type: "button", disabled: page.value >= pages, onClick: () => changePage(page.value + 1) }, "下一页")
  ]);
}

function createListFeature({ name, bridge, endpoint, emptyLabel, filters, row, actions = [] }) {
  return {
    name,
    setup() {
      const list = ref([]);
      const total = ref(0);
      const page = ref(1);
      const loading = ref(false);
      const error = ref("");
      const query = ref(Object.fromEntries(filters.map((item) => [item.key, ""])));
      let searchTimer = null;

      async function load({ resetPage = false } = {}) {
        if (resetPage) page.value = 1;
        loading.value = true;
        error.value = "";
        const params = new URLSearchParams({ limit: String(PAGE_SIZE), offset: String((page.value - 1) * PAGE_SIZE) });
        for (const item of filters) if (query.value[item.key]) params.set(item.param || item.key, query.value[item.key].trim?.() || query.value[item.key]);
        try {
          const response = await fetch(`${endpoint}?${params}`, { cache: "no-store" });
          if (!response.ok) throw new Error("加载记录失败");
          const payload = await response.json();
          list.value = payload.resumes || payload.exports || [];
          total.value = Number(payload.total) || 0;
        } catch (requestError) {
          error.value = requestError?.message || "加载记录失败";
        } finally {
          loading.value = false;
        }
      }

      function update(key, event) {
        query.value[key] = event.target.value;
        const filter = filters.find((item) => item.key === key);
        if (filter?.search) {
          clearTimeout(searchTimer);
          searchTimer = setTimeout(() => load({ resetPage: true }), 250);
        } else load({ resetPage: true });
      }
      function changePage(next) {
        const pages = Math.max(1, Math.ceil(total.value / PAGE_SIZE));
        if (next < 1 || next > pages || next === page.value) return;
        page.value = next;
        load();
      }
      function toolbar() {
        const controls = filters.map((item) => {
          const attrs = { id: item.id, value: query.value[item.key], "aria-label": item.ariaLabel, onInput: (event) => update(item.key, event), onChange: (event) => update(item.key, event) };
          if (item.type === "select") return h("select", attrs, item.options.map(([value, label]) => option(value, label, query.value[item.key])));
          return h("input", { ...attrs, type: item.type, placeholder: item.placeholder });
        });
        return h("div", { class: "admin-toolbar" }, [
          ...controls,
          ...actions.map((action) => h("button", { type: "button", class: action.className || "admin-csv", "data-action": action.action, "data-csv": action.csv }, action.label)),
          h("span", { id: name === "AdminResumes" ? "adminResumeTotal" : "adminExportTotal", class: "section-count" }, total.value ? `${total.value} ${name === "AdminResumes" ? "份草稿" : "条记录"}` : "")
        ]);
      }
      onMounted(() => {
        window[bridge] = { load };
        if (!document.querySelector("#adminPage")?.hidden) load();
      });
      onBeforeUnmount(() => {
        clearTimeout(searchTimer);
        if (window[bridge]?.load === load) delete window[bridge];
      });
      return () => h("section", { class: "admin-panel", "data-admin-panel": name === "AdminResumes" ? "resumes" : "exports" }, [
        toolbar(),
        h("div", { id: name === "AdminResumes" ? "adminResumeList" : "adminExportList", class: "admin-table-wrap", "aria-live": "polite" }, list.value.length || loading.value ? h("table", { class: "admin-table" }, row(list.value)) : h("p", { class: "admin-empty" }, emptyLabel)),
        pagination(total, page, changePage),
        loading.value ? h("p", { class: "library-status" }, "正在加载记录…") : error.value ? h("p", { class: "library-status" }, error.value) : null
      ]);
    }
  };
}

export const AdminResumes = createListFeature({
  name: "AdminResumes",
  bridge: "__resumeVueAdminResumes",
  endpoint: "/api/admin/resumes",
  emptyLabel: "没有符合条件的草稿。",
  actions: [{ action: "admin-export-csv", csv: "resumes", label: "导出 CSV" }],
  filters: [
    { id: "adminResumeSearch", key: "search", type: "search", placeholder: "搜索姓名、标题、邮箱或手机号", ariaLabel: "搜索草稿", search: true },
    { id: "adminResumeTemplate", key: "template", type: "text", placeholder: "模板 slug", ariaLabel: "筛选模板" },
    { id: "adminResumeFrom", key: "from", type: "date", ariaLabel: "更新起始日期" },
    { id: "adminResumeTo", key: "to", type: "date", ariaLabel: "更新结束日期" }
  ],
  row: (drafts) => [
    h("thead", [h("tr", ["草稿", "所属用户", "模板", "更新时间", "操作"].map((label) => h("th", label)))]),
    h("tbody", drafts.map((draft) => h("tr", [
      h("td", [h("div", { class: "admin-user" }, [h("strong", draft.candidateName || "未命名"), h("small", draft.title || "—")])]),
      h("td", draft.ownerIdentifier || draft.ownerId || "—"),
      h("td", `${draft.templateName || "—"} · v${draft.templateVersion || 1}`),
      h("td", formatDate(draft.updatedAt)),
      h("td", { class: "admin-table__ops" }, [
        h("button", { type: "button", "data-action": "admin-download-draft", "data-resume-id": draft.id }, "下载 JSON"),
        h("button", { class: "danger-link", type: "button", "data-action": "admin-delete-draft", "data-resume-id": draft.id, "data-name": draft.candidateName || "" }, "删除")
      ])
    ])))
  ]
});

const exportStatuses = { queued: ["等待中", ""], processing: ["处理中", "badge--admin"], completed: ["成功", "badge--active"], failed: ["失败", "badge--disabled"] };

export const AdminExports = createListFeature({
  name: "AdminExports",
  bridge: "__resumeVueAdminExports",
  endpoint: "/api/admin/export-records",
  emptyLabel: "暂无导出记录。",
  filters: [
    { id: "adminExportSearch", key: "search", type: "search", placeholder: "搜索用户、姓名、草稿或模板", ariaLabel: "搜索导出记录", search: true },
    { id: "adminExportFormat", key: "format", type: "select", ariaLabel: "筛选格式", options: [["", "全部格式"], ["pdf", "PDF"], ["docx", "Word"]] },
    { id: "adminExportStatusFilter", key: "status", type: "select", ariaLabel: "筛选状态", options: [["", "全部状态"], ["queued", "等待中"], ["processing", "处理中"], ["completed", "成功"], ["failed", "失败"]] },
    { id: "adminExportFrom", key: "from", type: "date", ariaLabel: "起始日期" },
    { id: "adminExportTo", key: "to", type: "date", ariaLabel: "结束日期" }
  ],
  row: (items) => [
    h("thead", [h("tr", ["时间", "用户", "简历", "模板", "格式", "状态", "失败原因"].map((label) => h("th", label)))]),
    h("tbody", items.map((item) => {
      const status = exportStatuses[item.status] || [item.status || "—", ""];
      return h("tr", [
        h("td", formatDate(item.createdAt)), h("td", item.userIdentifier || item.userId || "—"),
        h("td", [h("div", { class: "admin-user" }, [h("strong", item.candidateName || "未命名简历"), h("small", item.title || item.resumeId || "—")])]),
        h("td", `${item.templateName || item.templateSlug || "—"} · v${item.templateVersion || 1}`),
        h("td", String(item.format || "pdf").toUpperCase()), h("td", h("span", { class: `badge${status[1] ? ` ${status[1]}` : ""}` }, status[0])), h("td", item.error || "—")
      ]);
    }))
  ]
});
