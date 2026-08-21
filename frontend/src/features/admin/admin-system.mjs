import { h, onBeforeUnmount, onMounted, ref } from "vue";

function badge(ok) {
  return h("span", { class: ok ? "badge badge--active" : "badge badge--disabled" }, ok ? "正常" : "异常");
}

function formatUptime(seconds) {
  const value = Math.max(0, Number(seconds) || 0);
  const days = Math.floor(value / 86400);
  const hours = Math.floor((value % 86400) / 3600);
  const minutes = Math.floor((value % 3600) / 60);
  if (days > 0) return `${days} 天 ${hours} 小时`;
  if (hours > 0) return `${hours} 小时 ${minutes} 分`;
  return `${minutes} 分 ${value % 60} 秒`;
}

function installBridge(name, method, handler) {
  const bridge = window[name] || {};
  bridge[method] = handler;
  window[name] = bridge;
  return () => {
    if (window[name]?.[method] !== handler) return;
    delete window[name][method];
    if (!Object.keys(window[name]).length) delete window[name];
  };
}

export const AdminSystemStats = {
  name: "AdminSystemStats",
  setup() {
    const system = ref({});
    const setSystem = (payload) => { system.value = payload || {}; };
    let uninstall;
    onMounted(() => { uninstall = installBridge("__resumeVueAdminSystem", "setStats", setSystem); });
    onBeforeUnmount(() => uninstall?.());
    return () => {
      const sys = system.value;
      const dbOk = !sys.database?.configured || sys.database?.ok;
      const redisOk = !sys.redis?.configured || sys.redis?.ok;
      const stats = [
        [dbOk ? "正常" : "异常", "数据库"],
        [redisOk ? "正常" : (sys.redis?.configured ? "异常" : "未启用"), "Redis"],
        [sys.exportQueue?.counts?.failed ?? 0, "导出失败"],
        [sys.previewQueue?.counts?.failed ?? 0, "预览失败"],
        [sys.ai?.enabled ? "启用" : "停用", "AI 状态"]
      ];
      return stats.map(([value, label]) => h("div", { class: "admin-stat" }, [
        h("span", { class: "admin-stat__value" }, String(value)),
        h("span", { class: "admin-stat__label" }, label)
      ]));
    };
  }
};

export const AdminSystemDetail = {
  name: "AdminSystemDetail",
  setup() {
    const system = ref({});
    const setSystem = (payload) => { system.value = payload || {}; };
    let uninstall;
    onMounted(() => { uninstall = installBridge("__resumeVueAdminSystem", "setDetail", setSystem); });
    onBeforeUnmount(() => uninstall?.());
    const queueRow = (label, queue) => {
      if (!queue) return h("tr", [h("td", label), h("td", "未配置"), h("td", { colspan: 4 }, "—")]);
      const counts = queue.counts || {};
      return h("tr", [h("td", `${label}（${queue.backend || ""}）`), h("td", [badge(true)]), h("td", counts.waiting ?? 0), h("td", counts.active ?? 0), h("td", counts.completed ?? 0), h("td", counts.failed ?? 0)]);
    };
    return () => {
      const sys = system.value;
      const dbOk = !sys.database?.configured || sys.database?.ok;
      const redisOk = !sys.redis?.configured || sys.redis?.ok;
      return [
        h("table", { class: "admin-table" }, [
          h("thead", [h("tr", ["组件", "状态", "等待", "处理中", "完成", "失败"].map((label) => h("th", label)))]),
          h("tbody", [
            h("tr", [h("td", "数据库"), h("td", [badge(dbOk)]), h("td", { colspan: 4 }, sys.database?.configured ? (sys.database?.ok ? "连接正常" : (sys.database?.error || "不可用")) : "未配置（内存降级）")]),
            h("tr", [h("td", "Redis"), h("td", [badge(redisOk)]), h("td", { colspan: 4 }, sys.redis?.configured ? (sys.redis?.ok ? "连接正常" : "连接异常") : "未配置")]),
            queueRow("导出队列", sys.exportQueue), queueRow("预览队列", sys.previewQueue)
          ])
        ]),
        h("p", { class: "admin-subhead" }, `服务信息：${sys.service || ""} · Node ${sys.node || ""} · 已运行 ${formatUptime(sys.uptimeSeconds || 0)} · AI 模型 ${sys.ai?.model || "未配置"}`)
      ];
    };
  }
};

export const AdminAlerts = {
  name: "AdminAlerts",
  setup() {
    const alerts = ref([]), canWrite = ref(false), page = ref(1), total = ref(0), pageSize = ref(20);
    const setAlerts = (items, options = {}) => { alerts.value = Array.isArray(items) ? items : []; canWrite.value = Boolean(options.canWrite); page.value = options.page || 1; total.value = options.total || 0; pageSize.value = options.pageSize || 20; };
    let uninstall;
    onMounted(() => { uninstall = installBridge("__resumeVueAdminAlerts", "setAlerts", setAlerts); });
    onBeforeUnmount(() => uninstall?.());
    return () => {
      if (!alerts.value.length) return h("p", { class: "admin-empty" }, "暂无告警。");
      const pages = Math.max(1, Math.ceil(total.value / pageSize.value));
      const rows = alerts.value.map((alert) => {
        const date = new Date(alert.createdAt);
        const time = Number.isNaN(date.getTime()) ? "—" : date.toLocaleString("zh-CN", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false });
        const levelClass = alert.level === "warn" ? "badge badge--admin" : alert.level === "error" ? "badge badge--disabled" : "badge";
        return h("tr", { key: alert.id }, [h("td", time), h("td", [h("span", { class: levelClass }, alert.level || "")]), h("td", alert.kind || ""), h("td", alert.message || ""), h("td", [h("span", { class: alert.acknowledged ? "badge badge--active" : "badge badge--disabled" }, alert.acknowledged ? "已确认" : "未确认")]), h("td", { class: "admin-table__ops" }, [canWrite.value && !alert.acknowledged ? h("button", { type: "button", "data-action": "admin-ack-alert", "data-alert-id": alert.id }, "确认") : h("span", { class: "admin-self" }, "—")])]);
      });
      const pager = total.value > pageSize.value ? h("nav", { class: "admin-pagination", "aria-label": "记录分页" }, [h("button", { type: "button", "data-admin-page": "alerts", "data-page": page.value - 1, disabled: page.value <= 1 }, "上一页"), h("span", `第 ${page.value} / ${pages} 页`), h("button", { type: "button", "data-admin-page": "alerts", "data-page": page.value + 1, disabled: page.value >= pages }, "下一页")]) : null;
      return [h("table", { class: "admin-table" }, [h("thead", [h("tr", ["时间", "级别", "类型", "内容", "状态", "操作"].map((label) => h("th", label)))]), h("tbody", rows)]), pager];
    };
  }
};
