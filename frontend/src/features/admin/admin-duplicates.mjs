import { h, onBeforeUnmount, onMounted, ref } from "vue";

const PAGE_SIZE = 20;
const confidenceClass = { 高: "badge--disabled", 中: "badge--admin", 低: "" };

function formatTime(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : date.toLocaleString("zh-CN", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: false });
}

export const AdminDuplicates = {
  name: "AdminDuplicates",
  setup() {
    const groups = ref([]);
    const total = ref(0);
    const page = ref(1);
    const loading = ref(false);
    const error = ref("");
    async function load({ resetPage = false } = {}) {
      if (resetPage) page.value = 1;
      loading.value = true;
      error.value = "";
      try {
        const params = new URLSearchParams({ limit: String(PAGE_SIZE), offset: String((page.value - 1) * PAGE_SIZE) });
        const response = await fetch(`/api/admin/suspected-duplicates?${params}`, { cache: "no-store" });
        if (!response.ok) throw new Error("加载疑似多账号失败");
        const payload = await response.json();
        groups.value = Array.isArray(payload.groups) ? payload.groups : [];
        total.value = Number(payload.total) || 0;
      } catch (requestError) {
        error.value = requestError?.message || "加载疑似多账号失败";
      } finally {
        loading.value = false;
      }
    }
    function go(next) {
      const pages = Math.max(1, Math.ceil(total.value / PAGE_SIZE));
      if (next < 1 || next > pages || next === page.value) return;
      page.value = next;
      load();
    }
    onMounted(() => {
      window.__resumeVueAdminDuplicates = { load };
      if (!document.querySelector("#adminPage")?.hidden) load();
    });
    onBeforeUnmount(() => {
      if (window.__resumeVueAdminDuplicates?.load === load) delete window.__resumeVueAdminDuplicates;
    });
    return () => {
      const pages = Math.max(1, Math.ceil(total.value / PAGE_SIZE));
      return h("section", { class: "admin-panel", "data-admin-panel": "duplicates" }, [
        h("div", { class: "admin-toolbar" }, [h("h2", { class: "admin-subhead" }, "疑似同人多账号（只读复核）"), h("span", { id: "adminDuplicatesTotal", class: "section-count" }, total.value ? `${total.value} 组疑似关联` : "")]),
        h("div", { id: "adminDuplicatesList", class: "admin-table-wrap", "aria-live": "polite" }, groups.value.length || loading.value ? h("table", { class: "admin-table" }, [
          h("thead", [h("tr", ["置信度", "指纹类型", "关联账号", "最近出现", "来源 IP"].map((label) => h("th", label)))]),
          h("tbody", groups.value.map((group) => {
            const confidence = group.confidence || {};
            return h("tr", [
              h("td", h("span", { class: `badge${confidenceClass[confidence.label] ? ` ${confidenceClass[confidence.label]}` : ""}` }, confidence.label || "—")),
              h("td", confidence.title || group.type || "—"),
              h("td", [h("div", { class: "admin-user" }, (group.users || []).flatMap((user) => [h("strong", user.displayName || user.email || user.phone || "未命名"), h("small", user.email || user.phone || "—")]))]),
              h("td", formatTime(group.lastSeenAt)), h("td", group.ip || "—")
            ]);
          }))
        ]) : h("p", { class: "admin-empty" }, "未发现疑似同人多账号。")),
        h("p", { class: "admin-empty" }, "以上为疑似关联，请人工复核后再决定是否处理；系统不会自动封禁账号。"),
        total.value > PAGE_SIZE ? h("nav", { class: "admin-pagination", "aria-label": "记录分页" }, [h("button", { type: "button", disabled: page.value <= 1, onClick: () => go(page.value - 1) }, "上一页"), h("span", `第 ${page.value} / ${pages} 页`), h("button", { type: "button", disabled: page.value >= pages, onClick: () => go(page.value + 1) }, "下一页")]) : null,
        loading.value ? h("p", { class: "library-status" }, "正在加载疑似多账号…") : error.value ? h("p", { class: "library-status" }, error.value) : null
      ]);
    };
  }
};
