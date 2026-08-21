import { h, onBeforeUnmount, onMounted, ref } from "vue";

const METRICS = [
  ["newUsers", "#3b82f6", "新增用户"],
  ["draftsCreated", "#10b981", "新建草稿"],
  ["exports", "#f59e0b", "导出"],
  ["aiOk", "#8b5cf6", "AI 成功"]
];

function asNumber(value) {
  return Number(value ?? 0) || 0;
}

function overviewCards(stats) {
  const aiEnabled = Boolean(stats.value?.aiEnabled);
  const aiConfigured = Boolean(stats.value?.aiConfigured);
  const items = [
    [asNumber(stats.value?.userCount), "用户"],
    [asNumber(stats.value?.draftCount), "草稿"],
    [asNumber(stats.value?.aiToday), "今日 AI 调用"],
    [asNumber(stats.value?.aiTotal), "累计 AI 调用"]
  ];
  return [
    ...items.map(([value, label]) => h("div", { class: "admin-stat" }, [
      h("span", { class: "admin-stat__value" }, String(value)),
      h("span", { class: "admin-stat__label" }, label)
    ])),
    h("div", { class: "admin-stat admin-stat--status" }, [
      h("span", { class: "admin-stat__value" }, [
        h("span", { class: `badge ${aiEnabled ? "badge--active" : "badge--disabled"}` }, aiEnabled ? "已启用" : "未启用")
      ]),
      h("span", { class: "admin-stat__label" }, `AI 状态 · ${aiConfigured ? "已配置 Key" : "未配置 Key"}`)
    ])
  ];
}

function trendChart(series) {
  if (!series.length) return null;
  const width = 920;
  const height = 220;
  const padL = 40;
  const padR = 16;
  const padT = 16;
  const padB = 26;
  const max = Math.max(1, ...series.map((day) => Math.max(...METRICS.map(([key]) => asNumber(day[key])))));
  const x = (index) => padL + (series.length === 1 ? 0 : index * (width - padL - padR) / (series.length - 1));
  const y = (value) => padT + (height - padT - padB) * (1 - asNumber(value) / max);
  const points = (key) => series.map((day, index) => `${x(index).toFixed(1)},${y(day[key]).toFixed(1)}`).join(" ");
  const grid = [0, 0.5, 1].map((point) => h("line", {
    x1: padL,
    y1: (padT + (height - padT - padB) * (1 - point)).toFixed(1),
    x2: width - padR,
    y2: (padT + (height - padT - padB) * (1 - point)).toFixed(1),
    stroke: "#eef1f5",
    "stroke-width": "1"
  }));
  const labelIndexes = [...new Set([0, Math.floor((series.length - 1) / 2), series.length - 1])];
  const labels = labelIndexes.map((index) => h("text", {
    x: x(index).toFixed(1),
    y: height - 6,
    fill: "#8b96a6",
    "font-size": "10",
    "text-anchor": "middle"
  }, String(series[index].day || "").slice(5)));

  return h("div", { id: "adminChart", class: "admin-chart" }, [
    h("div", { class: "chart-title" }, `近 ${series.length} 天趋势`),
    h("svg", { viewBox: `0 0 ${width} ${height}`, role: "img", "aria-label": "运营趋势图", preserveAspectRatio: "none" }, [
      ...grid,
      ...METRICS.map(([key, color]) => h("polyline", {
        points: points(key), fill: "none", stroke: color, "stroke-width": "2", "vector-effect": "non-scaling-stroke"
      })),
      ...labels
    ]),
    h("div", { class: "chart-legend" }, METRICS.map(([, color, label]) => h("span", { class: "chart-legend" }, [
      h("i", { style: { background: color } }), label
    ])))
  ]);
}

export const AdminOverview = {
  name: "AdminOverview",
  setup() {
    const stats = ref({});
    const series = ref([]);
    const loading = ref(false);

    async function load() {
      if (loading.value) return;
      loading.value = true;
      try {
        const [overviewResponse, metricsResponse] = await Promise.all([
          fetch("/api/admin/overview", { cache: "no-store" }),
          fetch("/api/admin/metrics?days=30", { cache: "no-store" })
        ]);
        if (!overviewResponse.ok || !metricsResponse.ok) return;
        stats.value = await overviewResponse.json();
        const metrics = await metricsResponse.json();
        series.value = Array.isArray(metrics.days) ? metrics.days : [];
      } catch {
        // 页面既有行为是概览加载失败时保持为空；避免在无权限时泄漏错误细节。
      } finally {
        loading.value = false;
      }
    }

    onMounted(() => {
      window.__resumeVueAdminOverview = { load };
    });
    onBeforeUnmount(() => {
      if (window.__resumeVueAdminOverview?.load === load) delete window.__resumeVueAdminOverview;
    });

    return () => h("div", { class: "vue-admin-overview" }, [
      h("div", { id: "adminStats", class: "admin-stats", "aria-live": "polite" }, overviewCards(stats)),
      trendChart(series.value)
    ]);
  }
};
