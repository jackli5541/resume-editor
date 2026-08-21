import { h, onBeforeUnmount, onMounted, ref } from "vue";

const statusLabels = { ok: ["badge badge--active", "成功"], invalid_json: ["badge badge--disabled", "无效 JSON"], timeout: ["badge badge--disabled", "超时"], provider_error: ["badge badge--disabled", "服务异常"], rate_limited: ["badge badge--disabled", "上游限流"], blocked: ["badge badge--disabled", "已拦截"] };
function timeLabel(value) { const date = new Date(value); return Number.isNaN(date.getTime()) ? "—" : date.toLocaleString("zh-CN", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false }); }

export const AdminAiLogs = {
  name: "AdminAiLogs",
  setup() {
    const logs = ref([]), page = ref(1), total = ref(0), pageSize = ref(20);
    function setLogs(nextLogs, nextPage = 1, nextTotal = 0, nextPageSize = 20) { logs.value = Array.isArray(nextLogs) ? nextLogs : []; page.value = nextPage; total.value = nextTotal; pageSize.value = nextPageSize; }
    onMounted(() => { window.__resumeVueAdminAiLogs = { setLogs }; });
    onBeforeUnmount(() => { if (window.__resumeVueAdminAiLogs?.setLogs === setLogs) delete window.__resumeVueAdminAiLogs; });
    return () => {
      const pages = Math.max(1, Math.ceil(total.value / pageSize.value));
      return logs.value.length ? [h("table", { class: "admin-table" }, [h("thead", [h("tr", ["时间", "用户", "模型", "状态", "输入/输出", "耗时", "错误码"].map((label) => h("th", label)))]), h("tbody", logs.value.map((log) => {
        const label = statusLabels[log.status] || ["", log.status || "—"];
        return h("tr", { key: log.id || `${log.createdAt}-${log.userId}` }, [h("td", timeLabel(log.createdAt)), h("td", log.userIdentifier || log.userId || "—"), h("td", log.model || "—"), h("td", [h("span", { class: label[0] }, label[1])]), h("td", `${Number(log.inputChars ?? 0)} / ${Number(log.outputChars ?? 0)}`), h("td", `${Number(log.latencyMs ?? 0)} ms`), h("td", log.errorCode || "—")]);
      }))]), total.value > pageSize.value ? h("nav", { class: "admin-pagination", "aria-label": "记录分页" }, [h("button", { type: "button", "data-admin-page": "logs", "data-page": page.value - 1, disabled: page.value <= 1 }, "上一页"), h("span", `第 ${page.value} / ${pages} 页`), h("button", { type: "button", "data-admin-page": "logs", "data-page": page.value + 1, disabled: page.value >= pages }, "下一页")]) : null] : h("p", { class: "admin-empty" }, "暂无 AI 调用记录。");
    };
  }
};
