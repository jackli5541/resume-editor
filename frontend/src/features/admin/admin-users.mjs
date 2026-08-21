import { h, onBeforeUnmount, onMounted, ref } from "vue";

const PAGE_SIZE = 20;

function labelDate(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : date.toLocaleDateString("zh-CN");
}

function badge(text, type = "") {
  return h("span", { class: `badge${type ? ` ${type}` : ""}` }, text);
}

function selectOption(value, label, selected) {
  return h("option", { value, selected: value === selected }, label);
}

export const AdminUsers = {
  name: "AdminUsers",
  setup() {
    const users = ref([]);
    const total = ref(0);
    const page = ref(1);
    const loading = ref(false);
    const error = ref("");
    const query = ref({ search: "", role: "", status: "", from: "", to: "" });
    const currentUser = ref(null);
    let searchTimer = null;

    const can = (permission) => currentUser.value?.permissions?.includes(permission) || currentUser.value?.role === "super_admin";
    const isSuper = () => currentUser.value?.role === "super_admin";

    async function load({ resetPage = false } = {}) {
      if (resetPage) page.value = 1;
      loading.value = true;
      error.value = "";
      const params = new URLSearchParams({
        limit: String(PAGE_SIZE),
        offset: String((page.value - 1) * PAGE_SIZE),
        search: query.value.search.trim()
      });
      for (const key of ["role", "status", "from", "to"]) if (query.value[key]) params.set(key, query.value[key]);
      try {
        const response = await fetch(`/api/admin/users?${params}`, { cache: "no-store" });
        if (!response.ok) throw new Error("加载用户失败");
        const payload = await response.json();
        users.value = Array.isArray(payload.users) ? payload.users : [];
        total.value = Number(payload.total) || 0;
      } catch (requestError) {
        error.value = requestError?.message || "加载用户失败";
      } finally {
        loading.value = false;
      }
    }

    async function loadSession() {
      try {
        const response = await fetch("/api/auth/session", { cache: "no-store" });
        if (!response.ok) return;
        currentUser.value = (await response.json()).user || null;
      } catch {
        currentUser.value = null;
      }
    }

    function updateQuery(key, event) {
      query.value[key] = event.target.value;
      if (key === "search") {
        clearTimeout(searchTimer);
        searchTimer = setTimeout(() => load({ resetPage: true }), 250);
      } else {
        load({ resetPage: true });
      }
    }

    function changePage(nextPage) {
      const pages = Math.max(1, Math.ceil(total.value / PAGE_SIZE));
      if (nextPage < 1 || nextPage > pages || nextPage === page.value) return;
      page.value = nextPage;
      load();
    }

    function filters() {
      return h("div", { class: "admin-toolbar" }, [
        h("input", { id: "adminUserSearch", type: "search", value: query.value.search, placeholder: "搜索邮箱、手机号或昵称", "aria-label": "搜索用户", onInput: (event) => updateQuery("search", event) }),
        h("select", { id: "adminUserRole", value: query.value.role, "aria-label": "筛选角色", onChange: (event) => updateQuery("role", event) }, [
          selectOption("", "全部角色", query.value.role), selectOption("user", "普通用户", query.value.role),
          selectOption("super_admin", "超级管理员", query.value.role), selectOption("operator", "运营", query.value.role), selectOption("auditor", "审计", query.value.role)
        ]),
        h("select", { id: "adminUserStatus", value: query.value.status, "aria-label": "筛选状态", onChange: (event) => updateQuery("status", event) }, [
          selectOption("", "全部状态", query.value.status), selectOption("active", "正常", query.value.status), selectOption("disabled", "已禁用", query.value.status)
        ]),
        h("input", { id: "adminUserFrom", type: "date", value: query.value.from, "aria-label": "注册起始日期", onChange: (event) => updateQuery("from", event) }),
        h("input", { id: "adminUserTo", type: "date", value: query.value.to, "aria-label": "注册结束日期", onChange: (event) => updateQuery("to", event) }),
        h("button", { type: "button", class: "admin-csv", "data-action": "admin-export-csv", "data-csv": "users" }, "导出 CSV"),
        h("span", { id: "adminUserTotal", class: "section-count" }, total.value ? `${total.value} 位用户` : "")
      ]);
    }

    function row(user) {
      const self = currentUser.value?.id === user.id;
      const manageable = isSuper() || !user.isAdmin;
      const writable = can("users.write") && manageable && !self;
      const actions = [];
      if (self) actions.push(h("span", { class: "admin-self" }, "本人"));
      else {
        if (writable && isSuper()) actions.push(h("button", { type: "button", "data-action": "admin-toggle-admin", "data-user-id": user.id, "data-is-admin": String(Boolean(user.isAdmin)) }, user.isAdmin ? "取消管理员" : "设为管理员"));
        if (writable) actions.push(h("button", { type: "button", "data-action": "admin-toggle-disabled", "data-user-id": user.id, "data-disabled": String(Boolean(user.disabled)) }, user.disabled ? "启用" : "禁用"));
        if (isSuper() && user.isAdmin) actions.push(h("select", { "data-action": "admin-set-role", "data-user-id": user.id, "data-current-role": user.role || "operator", "aria-label": "设置角色" }, [
          selectOption("operator", "运营", user.role || "operator"), selectOption("auditor", "审计", user.role || "operator")
        ]));
        if (can("sessions.manage") && manageable) actions.push(h("button", { type: "button", "data-action": "admin-revoke-sessions", "data-user-id": user.id }, "踢下线"));
        if (can("users.delete") && manageable) actions.push(h("button", { class: "danger-link", type: "button", "data-action": "admin-delete-user", "data-user-id": user.id, "data-account": user.email || user.phone || "" }, "删除"));
      }
      const canEditLimit = writable && !user.isAdmin;
      return h("tr", [
        h("td", [h("div", { class: "admin-user" }, [h("strong", user.displayName || "未命名"), h("small", user.email || user.phone || "—")])]),
        h("td", user.isAdmin ? badge(user.role === "super_admin" ? "超级管理员" : user.role === "auditor" ? "审计" : "运营", "badge--admin") : badge("用户")),
        h("td", user.disabled ? badge("已禁用", "badge--disabled") : badge("正常", "badge--active")),
        h("td", String(user.draftCount ?? 0)),
        h("td", user.isAdmin ? h("span", { class: "admin-self" }, "不限") : canEditLimit ? h("input", { class: "admin-ai-limit-input", type: "number", min: "1", max: "10000", step: "1", value: String(Number(user.aiDailyLimit) || 8), "data-action": "admin-set-ai-limit", "data-user-id": user.id, "aria-label": "AI 日限额", title: "每日 AI 调用上限" }) : `${Number(user.aiDailyLimit) || 8} 次`),
        h("td", labelDate(user.createdAt)),
        h("td", { class: "admin-table__ops" }, actions.length ? actions : h("span", { class: "admin-self" }, "—"))
      ]);
    }

    function table() {
      if (!users.value.length && !loading.value) return h("p", { class: "admin-empty" }, "没有符合条件的用户。");
      const pages = Math.max(1, Math.ceil(total.value / PAGE_SIZE));
      return [
        h("table", { class: "admin-table" }, [
          h("thead", [h("tr", ["用户", "角色", "状态", "草稿", "AI 限额/日", "注册时间", "操作"].map((label) => h("th", label)))]),
          h("tbody", users.value.map(row))
        ]),
        total.value > PAGE_SIZE ? h("nav", { class: "admin-pagination", "aria-label": "记录分页" }, [
          h("button", { type: "button", disabled: page.value <= 1, onClick: () => changePage(page.value - 1) }, "上一页"),
          h("span", `第 ${page.value} / ${pages} 页`),
          h("button", { type: "button", disabled: page.value >= pages, onClick: () => changePage(page.value + 1) }, "下一页")
        ]) : null
      ];
    }

    onMounted(async () => {
      await loadSession();
      window.__resumeVueAdminUsers = { load };
      if (!document.querySelector("#adminPage")?.hidden) load();
    });
    onBeforeUnmount(() => {
      clearTimeout(searchTimer);
      if (window.__resumeVueAdminUsers?.load === load) delete window.__resumeVueAdminUsers;
    });
    return () => h("section", { class: "admin-panel", "data-admin-panel": "users" }, [
      filters(),
        h("div", { id: "adminUserList", class: "admin-table-wrap", "aria-live": "polite" }, table()),
      loading.value ? h("p", { class: "library-status" }, "正在加载用户…") : error.value ? h("p", { class: "library-status" }, error.value) : null
    ]);
  }
};
