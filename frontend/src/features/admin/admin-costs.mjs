import { h, onBeforeUnmount, onMounted, ref } from "vue";

function number(value) { return (Number(value) || 0).toLocaleString(); }

export const AdminCosts = {
  name: "AdminCosts",
  setup() {
    const days = ref("30"), byModel = ref([]), byDay = ref([]), loading = ref(false), message = ref("");
    async function load() {
      loading.value = true;
      try {
        const response = await fetch(`/api/admin/ai-costs?days=${encodeURIComponent(days.value)}`, { cache: "no-store" });
        if (!response.ok) throw new Error("加载 AI 成本失败");
        const payload = await response.json(); byModel.value = payload.byModel || []; byDay.value = payload.days || []; message.value = "";
      } catch (error) { message.value = error?.message || "加载 AI 成本失败"; } finally { loading.value = false; }
    }
    onMounted(() => { window.__resumeVueAdminCosts = { load }; if (!document.querySelector("#adminPage")?.hidden) load(); });
    onBeforeUnmount(() => { if (window.__resumeVueAdminCosts?.load === load) delete window.__resumeVueAdminCosts; });
    return () => {
      const input = byModel.value.reduce((sum, item) => sum + (Number(item.inputChars) || 0), 0);
      const output = byModel.value.reduce((sum, item) => sum + (Number(item.outputChars) || 0), 0);
      const calls = byModel.value.reduce((sum, item) => sum + (Number(item.calls) || 0), 0);
      const modelTable = byModel.value.length ? h("table", { class: "admin-table" }, [h("thead", [h("tr", ["模型", "输入字符", "输出字符", "估算 Token（输入+输出）", "调用次数"].map((label) => h("th", label)))]), h("tbody", byModel.value.map((item) => h("tr", [h("td", item.model || "—"), h("td", number(item.inputChars)), h("td", number(item.outputChars)), h("td", number((Number(item.inputChars) || 0) + (Number(item.outputChars) || 0))), h("td", String(Number(item.calls) || 0))])))]) : h("p", { class: "admin-empty" }, "暂无 AI 用量数据。");
      return h("section", { class: "admin-panel", "data-admin-panel": "costs" }, [
        h("div", { class: "admin-toolbar" }, [h("select", { id: "adminCostDays", value: days.value, "aria-label": "时间范围", onChange: (event) => { days.value = event.target.value; load(); } }, [["7", "近 7 天"], ["30", "近 30 天"], ["90", "近 90 天"]].map(([value, label]) => h("option", { value, selected: value === days.value }, label))), h("span", { id: "adminCostTotal", class: "section-count" }, `输入 ${number(input)} 字符 · 输出 ${number(output)} 字符 · ${number(calls)} 次调用`)]),
        h("h2", { class: "admin-subhead" }, "按模型汇总"), h("div", { id: "adminCostModelList", class: "admin-table-wrap" }, modelTable),
        h("h2", { class: "admin-subhead" }, "按日明细"), h("div", { id: "adminCostList", class: "admin-table-wrap" }, byDay.value.length ? h("table", { class: "admin-table" }, [h("thead", [h("tr", ["日期", "模型", "输入字符", "输出字符", "调用次数"].map((label) => h("th", label)))]), h("tbody", byDay.value.map((item) => h("tr", [h("td", item.day || "—"), h("td", item.model || "—"), h("td", number(item.inputChars)), h("td", number(item.outputChars)), h("td", String(Number(item.calls) || 0))])))]) : null),
        h("p", { id: "adminCostStatus", class: "library-status", role: "status", hidden: !loading.value && !message.value }, loading.value ? "正在加载 AI 成本…" : message.value)
      ]);
    };
  }
};
