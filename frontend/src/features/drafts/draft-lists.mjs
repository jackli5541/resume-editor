import { h, onBeforeUnmount, onMounted, ref } from "vue";

function updatedAt(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "刚刚更新" : date.toLocaleString("zh-CN", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: false });
}

function useDraftBridge(name) {
  const drafts = ref([]);
  function setDrafts(value) { drafts.value = Array.isArray(value) ? value : []; }
  onMounted(() => { window[name] = { setDrafts }; });
  onBeforeUnmount(() => { if (window[name]?.setDrafts === setDrafts) delete window[name]; });
  return { drafts, setDrafts };
}

export const DraftList = {
  name: "DraftList",
  setup() {
    const { drafts } = useDraftBridge("__resumeVueDraftList");
    return () => drafts.value.map((draft) => h("article", { class: "draft-item", key: draft.id }, [
      h("div", { class: "draft-item__identity" }, [h("strong", draft.candidateName || "未命名"), h("span", draft.title || "—")]),
      h("div", { class: "draft-item__meta" }, [h("span", `${draft.templateName || "—"} · v${draft.templateVersion || 1}`), h("span", `${updatedAt(draft.updatedAt)} · 修订 ${draft.revision}`)]),
      h("div", { class: "draft-item__actions" }, [h("button", { class: "draft-continue", type: "button", "data-action": "continue-draft", "data-resume-id": draft.id }, ["继续编辑 ", h("span", { "aria-hidden": "true" }, "→")]), h("button", { class: "draft-delete", type: "button", "data-action": "delete-draft", "data-resume-id": draft.id, "aria-label": `删除 ${draft.candidateName || "未命名"} 的草稿`, title: "删除草稿" }, "删除")])
    ]));
  }
};

export const RecentDraftList = {
  name: "RecentDraftList",
  setup() {
    const { drafts } = useDraftBridge("__resumeVueRecentDraftList");
    return () => drafts.value.slice(0, 5).map((draft) => h("a", { class: "home-draft-item", href: `/resumes/${encodeURIComponent(draft.id)}/edit`, key: draft.id }, [h("span", [h("strong", draft.candidateName || "未命名"), h("small", draft.title || "—")]), h("span", [h("small", draft.templateName || "—"), h("strong", { "aria-hidden": "true" }, "→")]) ]));
  }
};
