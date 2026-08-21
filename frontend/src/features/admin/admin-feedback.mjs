import { h, onBeforeUnmount, onMounted, ref } from "vue";

const PAGE_SIZE = 20;
const TYPES = { bug: "问题", suggestion: "建议", question: "咨询", other: "其他" };
const STATUSES = { open: ["待处理", ""], in_progress: ["处理中", "badge--admin"], resolved: ["已解决", "badge--active"], closed: ["已关闭", "badge--disabled"] };
function date(value) { const parsed = new Date(value); return Number.isNaN(parsed.getTime()) ? "—" : parsed.toLocaleString("zh-CN", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: false }); }
function statusOptions(selected) { return [["", "全部状态"], ...Object.entries(STATUSES).map(([value, [label]]) => [value, label])].map(([value, label]) => h("option", { value, selected: selected === value }, label)); }

export const AdminFeedback = {
  name: "AdminFeedback",
  setup() {
    const rows = ref([]), total = ref(0), page = ref(1), search = ref(""), filter = ref(""), loading = ref(false), message = ref(""), canWrite = ref(false), detail = ref(null), reply = ref(null);
    let searchTimer = null;
    async function load({ resetPage = false } = {}) {
      if (resetPage) page.value = 1;
      loading.value = true;
      const params = new URLSearchParams({ limit: String(PAGE_SIZE), offset: String((page.value - 1) * PAGE_SIZE), search: search.value.trim() });
      if (filter.value) params.set("status", filter.value);
      try {
        const response = await fetch(`/api/admin/feedbacks?${params}`, { cache: "no-store" });
        if (!response.ok) throw new Error("加载反馈失败");
        const payload = await response.json(); rows.value = payload.feedbacks || []; total.value = Number(payload.total) || 0; message.value = "";
      } catch (error) { message.value = error?.message || "加载反馈失败"; } finally { loading.value = false; }
    }
    async function permissions() { try { const response = await fetch("/api/auth/session", { cache: "no-store" }); const user = response.ok ? (await response.json()).user : null; canWrite.value = user?.role === "super_admin" || user?.permissions?.includes("feedback.write"); } catch {} }
    function updateSearch(event) { search.value = event.target.value; clearTimeout(searchTimer); searchTimer = setTimeout(() => load({ resetPage: true }), 250); }
    function changePage(next) { const pages = Math.max(1, Math.ceil(total.value / PAGE_SIZE)); if (next >= 1 && next <= pages && next !== page.value) { page.value = next; load(); } }
    function openDetail(item, event) { event.stopPropagation(); detail.value = item; }
    function openReply(item, event) { event.stopPropagation(); reply.value = { id: item.id, status: item.status, text: item.reply || "" }; }
    async function saveReply(event) {
      event.preventDefault();
      try { const response = await fetch(`/api/admin/feedbacks/${encodeURIComponent(reply.value.id)}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status: reply.value.status, reply: reply.value.text.trim() }) }); if (!response.ok) throw new Error("保存失败"); reply.value = null; message.value = "反馈已更新"; await load(); } catch (error) { message.value = error?.message || "保存失败"; }
    }
    onMounted(async () => { await permissions(); window.__resumeVueAdminFeedback = { load }; if (!document.querySelector("#adminPage")?.hidden) load(); });
    onBeforeUnmount(() => { clearTimeout(searchTimer); if (window.__resumeVueAdminFeedback?.load === load) delete window.__resumeVueAdminFeedback; });
    return () => {
      const pages = Math.max(1, Math.ceil(total.value / PAGE_SIZE));
      return h("section", { class: "admin-panel", "data-admin-panel": "feedback" }, [
        h("div", { class: "admin-toolbar" }, [h("input", { id: "adminFeedbackSearch", type: "search", value: search.value, placeholder: "搜索内容、类型或用户", "aria-label": "搜索反馈", onInput: updateSearch }), h("select", { id: "adminFeedbackFilter", value: filter.value, "aria-label": "筛选状态", onChange: (event) => { filter.value = event.target.value; load({ resetPage: true }); } }, statusOptions(filter.value)), h("span", { id: "adminFeedbackTotal", class: "section-count" }, total.value ? `${total.value} 条反馈` : "")]),
        reply.value ? h("form", { id: "adminFeedbackReplyForm", class: "admin-form admin-inline-form", novalidate: true, onSubmit: saveReply }, [h("input", { id: "adminFeedbackReplyId", type: "hidden", value: reply.value.id }), h("div", { class: "admin-form__grid" }, [h("label", { class: "admin-field" }, [h("span", { class: "admin-field__label" }, "状态"), h("select", { id: "adminFeedbackReplyStatus", value: reply.value.status, onChange: (event) => { reply.value.status = event.target.value; } }, Object.entries(STATUSES).map(([value, [label]]) => h("option", { value, selected: value === reply.value.status }, label)))]), h("label", { class: "admin-field admin-field--wide" }, [h("span", { class: "admin-field__label" }, "回复内容"), h("textarea", { id: "adminFeedbackReplyText", rows: "2", value: reply.value.text, onInput: (event) => { reply.value.text = event.target.value; } })])]), h("div", { class: "admin-form__footer" }, [h("button", { type: "submit", class: "admin-submit" }, "保存回复"), h("button", { type: "button", class: "admin-link", "data-action": "admin-cancel-feedback", onClick: (event) => { event.stopPropagation(); reply.value = null; } }, "取消")])]) : null,
        h("div", { id: "adminFeedbackList", class: "admin-table-wrap", "aria-live": "polite" }, rows.value.length || loading.value ? h("table", { class: "admin-table" }, [h("thead", [h("tr", ["时间", "用户", "类型", "状态", "操作"].map((label) => h("th", label)))]), h("tbody", rows.value.map((item) => { const itemStatus = STATUSES[item.status] || [item.status || "—", ""]; return h("tr", [h("td", date(item.createdAt)), h("td", item.userIdentifier || item.userId || "—"), h("td", TYPES[item.type] || item.type || "—"), h("td", h("span", { class: `badge${itemStatus[1] ? ` ${itemStatus[1]}` : ""}` }, itemStatus[0])), h("td", { class: "admin-table__ops" }, [h("button", { type: "button", "data-action": "view-feedback", "data-feedback-id": item.id, onClick: (event) => openDetail(item, event) }, "查看"), canWrite.value ? h("button", { type: "button", "data-action": "admin-reply-feedback", "data-feedback-id": item.id, "data-status": item.status, "data-reply": item.reply || "", onClick: (event) => openReply(item, event) }, "回复") : null])]); }))]) : h("p", { class: "admin-empty" }, "暂无反馈。")),
        total.value > PAGE_SIZE ? h("nav", { class: "admin-pagination", "aria-label": "记录分页" }, [h("button", { type: "button", disabled: page.value <= 1, onClick: () => changePage(page.value - 1) }, "上一页"), h("span", `第 ${page.value} / ${pages} 页`), h("button", { type: "button", disabled: page.value >= pages, onClick: () => changePage(page.value + 1) }, "下一页")]) : null,
        h("p", { id: "adminFeedbackStatus", class: "library-status", role: "status", hidden: !loading.value && !message.value }, loading.value ? "正在加载反馈…" : message.value),
        detail.value ? h("div", { id: "vueFeedbackDetailOverlay", class: "auth-overlay", onClick: () => { detail.value = null; } }, [h("div", { class: "auth-dialog", role: "dialog", "aria-modal": "true", "aria-labelledby": "vueFeedbackDetailTitle", onClick: (event) => event.stopPropagation() }, [h("div", { class: "auth-dialog__header" }, [h("div", [h("span", { class: "eyebrow" }, "FEEDBACK"), h("h2", { id: "vueFeedbackDetailTitle" }, "反馈详情")]), h("button", { class: "auth-dialog__close", type: "button", "data-action": "close-feedback-detail", "aria-label": "关闭", onClick: (event) => { event.stopPropagation(); detail.value = null; } }, "×")]), h("div", { id: "vueFeedbackDetailBody", class: "feedback-detail" }, [
          ...[["类型", TYPES[detail.value.type] || detail.value.type || "—"], ["状态", (STATUSES[detail.value.status] || [detail.value.status || "—"])[0]], ["用户", detail.value.userIdentifier || detail.value.userId || "—"], ["提交时间", date(detail.value.createdAt)]].map(([label, value]) => h("div", { class: "feedback-detail__row" }, [h("span", label), h("strong", value)])), h("div", { class: "feedback-detail__block" }, [h("span", "反馈内容"), h("p", detail.value.content || "—")]), h("div", { class: "feedback-detail__block" }, [h("span", "回复"), h("p", detail.value.reply || "暂无回复")])
        ])])]) : null
      ]);
    };
  }
};
