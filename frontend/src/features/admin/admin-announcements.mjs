import { h, onBeforeUnmount, onMounted, ref } from "vue";

const PAGE_SIZE = 20;
const STATUSES = [["draft", "草稿", ""], ["published", "已发布", "badge--active"], ["archived", "已归档", "badge--disabled"]];

function selectOptions(selected) {
  return [["", "全部状态"], ...STATUSES.map(([value, label]) => [value, label])].map(([value, label]) => h("option", { value, selected: value === selected }, label));
}

function formatDate(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : date.toLocaleString("zh-CN", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: false });
}

export const AdminAnnouncements = {
  name: "AdminAnnouncements",
  setup() {
    const announcements = ref([]);
    const total = ref(0);
    const page = ref(1);
    const search = ref("");
    const status = ref("");
    const loading = ref(false);
    const message = ref("");
    const canWrite = ref(false);
    const form = ref(null);
    let searchTimer = null;

    async function load({ resetPage = false } = {}) {
      if (resetPage) page.value = 1;
      loading.value = true;
      const params = new URLSearchParams({ limit: String(PAGE_SIZE), offset: String((page.value - 1) * PAGE_SIZE), search: search.value.trim() });
      if (status.value) params.set("status", status.value);
      try {
        const response = await fetch(`/api/admin/announcements?${params}`, { cache: "no-store" });
        if (!response.ok) throw new Error("加载公告失败");
        const payload = await response.json();
        announcements.value = Array.isArray(payload.announcements) ? payload.announcements : [];
        total.value = Number(payload.total) || 0;
        message.value = "";
      } catch (error) {
        message.value = error?.message || "加载公告失败";
      } finally {
        loading.value = false;
      }
    }
    async function loadPermissions() {
      try {
        const response = await fetch("/api/auth/session", { cache: "no-store" });
        const user = response.ok ? (await response.json()).user : null;
        canWrite.value = user?.role === "super_admin" || user?.permissions?.includes("announcements.write");
      } catch { canWrite.value = false; }
    }
    function newForm() { form.value = { id: "", title: "", content: "", status: "draft" }; message.value = ""; }
    function edit(item, event) { event.stopPropagation(); form.value = { id: item.id, title: item.title || "", content: item.content || "", status: item.status || "draft" }; }
    function cancel(event) { event?.stopPropagation(); form.value = null; }
    async function save(event) {
      event.preventDefault();
      const data = form.value;
      if (!data?.title.trim()) { message.value = "标题不能为空"; return; }
      try {
        const response = await fetch(data.id ? `/api/admin/announcements/${encodeURIComponent(data.id)}` : "/api/admin/announcements", {
          method: data.id ? "PATCH" : "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ title: data.title.trim(), content: data.content.trim(), status: data.status })
        });
        if (!response.ok) throw new Error("保存失败");
        form.value = null;
        message.value = data.id ? "公告已更新" : "公告已创建";
        await load();
      } catch (error) { message.value = error?.message || "保存失败"; }
    }
    async function toggle(item, event) {
      event.stopPropagation();
      const next = item.status === "published" ? "draft" : "published";
      try {
        const response = await fetch(`/api/admin/announcements/${encodeURIComponent(item.id)}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status: next }) });
        if (!response.ok) throw new Error("操作失败");
        message.value = next === "published" ? "公告已发布" : "公告已下线";
        await load();
      } catch (error) { message.value = error?.message || "操作失败"; }
    }
    async function remove(item, event) {
      event.stopPropagation();
      if (!window.confirm("确定删除该公告？")) return;
      try {
        const response = await fetch(`/api/admin/announcements/${encodeURIComponent(item.id)}`, { method: "DELETE" });
        if (!response.ok) throw new Error("删除失败");
        message.value = "公告已删除";
        await load({ resetPage: announcements.value.length === 1 && page.value > 1 });
      } catch (error) { message.value = error?.message || "删除失败"; }
    }
    function changeSearch(event) {
      search.value = event.target.value;
      clearTimeout(searchTimer);
      searchTimer = setTimeout(() => load({ resetPage: true }), 250);
    }
    function changePage(next) {
      const pages = Math.max(1, Math.ceil(total.value / PAGE_SIZE));
      if (next < 1 || next > pages || next === page.value) return;
      page.value = next;
      load();
    }
    onMounted(async () => {
      await loadPermissions();
      window.__resumeVueAdminAnnouncements = { load };
      if (!document.querySelector("#adminPage")?.hidden) load();
    });
    onBeforeUnmount(() => {
      clearTimeout(searchTimer);
      if (window.__resumeVueAdminAnnouncements?.load === load) delete window.__resumeVueAdminAnnouncements;
    });
    return () => {
      const pages = Math.max(1, Math.ceil(total.value / PAGE_SIZE));
      const current = form.value;
      return h("section", { class: "admin-panel", "data-admin-panel": "announcements" }, [
        h("div", { class: "admin-toolbar" }, [
          h("input", { id: "adminAnnouncementSearch", type: "search", value: search.value, placeholder: "搜索标题或内容", "aria-label": "搜索公告", onInput: changeSearch }),
          h("select", { id: "adminAnnouncementFilter", value: status.value, "aria-label": "筛选状态", onChange: (event) => { status.value = event.target.value; load({ resetPage: true }); } }, selectOptions(status.value)),
          canWrite.value ? h("button", { type: "button", class: "admin-submit", "data-action": "admin-new-announcement", onClick: (event) => { event.stopPropagation(); newForm(); } }, "新建公告") : null,
          h("span", { id: "adminAnnouncementTotal", class: "section-count" }, total.value ? `${total.value} 条公告` : "")
        ]),
        current ? h("form", { id: "adminAnnouncementForm", class: "admin-form admin-inline-form", novalidate: true, onSubmit: save }, [
          h("input", { id: "adminAnnouncementId", type: "hidden", value: current.id }),
          h("div", { class: "admin-form__grid" }, [
            h("label", { class: "admin-field" }, [h("span", { class: "admin-field__label" }, "标题"), h("input", { id: "adminAnnouncementTitle", value: current.title, maxlength: "200", onInput: (event) => { current.title = event.target.value; } })]),
            h("label", { class: "admin-field" }, [h("span", { class: "admin-field__label" }, "状态"), h("select", { id: "adminAnnouncementStatus", value: current.status, onChange: (event) => { current.status = event.target.value; } }, STATUSES.map(([value, label]) => h("option", { value, selected: value === current.status }, label)))]),
            h("label", { class: "admin-field admin-field--wide" }, [h("span", { class: "admin-field__label" }, "内容"), h("textarea", { id: "adminAnnouncementContent", rows: "3", value: current.content, onInput: (event) => { current.content = event.target.value; } })])
          ]),
          h("div", { class: "admin-form__footer" }, [h("button", { id: "adminAnnouncementSave", type: "submit", class: "admin-submit" }, "保存公告"), h("button", { type: "button", class: "admin-link", "data-action": "admin-cancel-announcement", onClick: cancel }, "取消")])
        ]) : null,
        h("div", { id: "adminAnnouncementList", class: "admin-table-wrap", "aria-live": "polite" }, announcements.value.length || loading.value ? h("table", { class: "admin-table" }, [
          h("thead", [h("tr", ["标题", "内容", "状态", "更新时间", "操作"].map((label) => h("th", label)))]),
          h("tbody", announcements.value.map((item) => {
            const badge = STATUSES.find(([value]) => value === item.status) || [item.status, item.status, ""];
            return h("tr", [h("td", h("strong", item.title)), h("td", String(item.content || "").slice(0, 60)), h("td", h("span", { class: `badge${badge[2] ? ` ${badge[2]}` : ""}` }, badge[1])), h("td", formatDate(item.updatedAt)), h("td", { class: "admin-table__ops" }, canWrite.value ? [
              h("button", { type: "button", "data-action": "admin-edit-announcement", "data-announcement-id": item.id, onClick: (event) => edit(item, event) }, "编辑"),
              h("button", { type: "button", "data-action": "admin-toggle-announcement", "data-announcement-id": item.id, "data-status": item.status, onClick: (event) => toggle(item, event) }, item.status === "published" ? "下线" : "发布"),
              h("button", { type: "button", class: "danger-link", "data-action": "admin-delete-announcement", "data-announcement-id": item.id, onClick: (event) => remove(item, event) }, "删除")
            ] : h("span", { class: "admin-self" }, "—"))]);
          }))
        ]) : h("p", { class: "admin-empty" }, "暂无公告。")),
        total.value > PAGE_SIZE ? h("nav", { class: "admin-pagination", "aria-label": "记录分页" }, [h("button", { type: "button", disabled: page.value <= 1, onClick: () => changePage(page.value - 1) }, "上一页"), h("span", `第 ${page.value} / ${pages} 页`), h("button", { type: "button", disabled: page.value >= pages, onClick: () => changePage(page.value + 1) }, "下一页")]) : null,
        h("p", { id: "adminAnnouncementLoadStatus", class: "library-status", role: "status", hidden: !loading.value && !message.value }, loading.value ? "正在加载公告…" : message.value)
      ]);
    };
  }
};
