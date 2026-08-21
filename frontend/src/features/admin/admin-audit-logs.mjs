import { h, onBeforeUnmount, onMounted, ref } from "vue";

function timeLabel(value) { const date = new Date(value); return Number.isNaN(date.getTime()) ? "—" : date.toLocaleString("zh-CN", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false }); }

export const AdminAuditLogs = {
  name: "AdminAuditLogs",
  setup() {
    const logs = ref([]), page = ref(1), total = ref(0), pageSize = ref(20);
    function setLogs(nextLogs, nextPage = 1, nextTotal = 0, nextPageSize = 20) { logs.value = Array.isArray(nextLogs) ? nextLogs : []; page.value = nextPage; total.value = nextTotal; pageSize.value = nextPageSize; }
    onMounted(() => { window.__resumeVueAdminAuditLogs = { setLogs }; });
    onBeforeUnmount(() => { if (window.__resumeVueAdminAuditLogs?.setLogs === setLogs) delete window.__resumeVueAdminAuditLogs; });
    return () => {
      const pages = Math.max(1, Math.ceil(total.value / pageSize.value));
      const table = h("table", { class: "admin-table" }, [
        h("thead", [h("tr", ["时间", "操作人", "动作", "对象类型", "对象 ID", "IP"].map((label) => h("th", label)))]),
        h("tbody", logs.value.map((log) => h("tr", { key: log.id || `${log.createdAt}-${log.action}` }, [
          h("td", timeLabel(log.createdAt)), h("td", log.actorIdentifier || log.actorId || "系统"), h("td", log.action || "—"), h("td", log.targetType || "—"), h("td", log.targetId || "—"), h("td", log.ip || "—")
        ])))
      ]);
      const pager = total.value > pageSize.value ? h("nav", { class: "admin-pagination", "aria-label": "记录分页" }, [h("button", { type: "button", "data-admin-page": "audit", "data-page": page.value - 1, disabled: page.value <= 1 }, "上一页"), h("span", `第 ${page.value} / ${pages} 页`), h("button", { type: "button", "data-admin-page": "audit", "data-page": page.value + 1, disabled: page.value >= pages }, "下一页")]) : null;
      return logs.value.length ? [table, pager] : h("p", { class: "admin-empty" }, "暂无审计记录。");
    };
  }
};
