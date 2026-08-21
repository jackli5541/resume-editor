import { h, onBeforeUnmount, onMounted, ref } from "vue";

function dateTime(value) { const date = new Date(value); return Number.isNaN(date.getTime()) ? "—" : date.toLocaleString("zh-CN", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: false }); }
function actions(item, type, permissions) { const id = type === "user" ? item.id : item.id; const result = []; if (permissions.restore) result.push(h("button", { type: "button", "data-action": type === "user" ? "admin-restore-user" : "admin-restore-resume", [type === "user" ? "data-user-id" : "data-resume-id"]: id }, "恢复")); if (permissions.purge) result.push(h("button", { class: "danger-link", type: "button", "data-action": type === "user" ? "admin-purge-user" : "admin-purge-resume", [type === "user" ? "data-user-id" : "data-resume-id"]: id, [type === "user" ? "data-account" : "data-name"]: type === "user" ? (item.email || item.phone || "") : (item.candidateName || "") }, "彻底删除")); return result.length ? result : h("span", { class: "admin-self" }, "—"); }

function useRecycleBridge(name) { const items = ref([]), permissions = ref({ restore: false, purge: false }), page = ref(1), total = ref(0), pageSize = ref(20); function setItems(nextItems, nextPermissions = {}, nextPage = 1, nextTotal = 0, nextPageSize = 20) { items.value = Array.isArray(nextItems) ? nextItems : []; permissions.value = nextPermissions; page.value = nextPage; total.value = nextTotal; pageSize.value = nextPageSize; } onMounted(() => { window[name] = { setItems }; }); onBeforeUnmount(() => { if (window[name]?.setItems === setItems) delete window[name]; }); return { items, permissions, page, total, pageSize }; }

export const AdminRecycleUsers = {
  name: "AdminRecycleUsers",
  setup() {
    const state = useRecycleBridge("__resumeVueAdminRecycleUsers");
    return () => state.items.value.length ? h("table", { class: "admin-table" }, [
      h("thead", [h("tr", ["用户", "角色", "删除时间", "操作"].map((label) => h("th", label)))]),
      h("tbody", state.items.value.map((user) => h("tr", { key: user.id }, [
        h("td", [h("div", { class: "admin-user" }, [h("strong", user.displayName || "未命名"), h("small", user.email || user.phone || "—")])]),
        h("td", h("span", { class: user.isAdmin ? "badge badge--admin" : "badge" }, user.isAdmin ? "管理员" : "用户")), h("td", dateTime(user.deletedAt)), h("td", { class: "admin-table__ops" }, actions(user, "user", state.permissions.value))
      ])))
    ]) : h("p", { class: "admin-empty" }, "回收站中没有用户。");
  }
};

export const AdminRecycleResumes = {
  name: "AdminRecycleResumes",
  setup() {
    const state = useRecycleBridge("__resumeVueAdminRecycleResumes");
    return () => {
      const pages = Math.max(1, Math.ceil(state.total.value / state.pageSize.value));
      const table = state.items.value.length ? h("table", { class: "admin-table" }, [
        h("thead", [h("tr", ["草稿", "所属用户", "模板", "删除时间", "操作"].map((label) => h("th", label)))]),
        h("tbody", state.items.value.map((draft) => h("tr", { key: draft.id }, [
          h("td", h("div", { class: "admin-user" }, [h("strong", draft.candidateName || "未命名"), h("small", draft.title || "—")])), h("td", draft.ownerIdentifier || draft.ownerId || "—"), h("td", `${draft.templateName || "—"} · v${draft.templateVersion || 1}`), h("td", dateTime(draft.deletedAt)), h("td", { class: "admin-table__ops" }, actions(draft, "resume", state.permissions.value))
        ])))
      ]) : h("p", { class: "admin-empty" }, "回收站中没有草稿。");
      const pager = state.total.value > state.pageSize.value ? h("nav", { class: "admin-pagination", "aria-label": "记录分页" }, [h("button", { type: "button", "data-admin-page": "recycle", "data-page": state.page.value - 1, disabled: state.page.value <= 1 }, "上一页"), h("span", `第 ${state.page.value} / ${pages} 页`), h("button", { type: "button", "data-admin-page": "recycle", "data-page": state.page.value + 1, disabled: state.page.value >= pages }, "下一页")]) : null;
      return [table, pager];
    };
  }
};
