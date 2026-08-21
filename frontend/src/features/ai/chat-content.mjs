import { h, onBeforeUnmount, onMounted, ref } from "vue";

const FOLLOWUPS = [["继续优化其他经历", "继续优化其他经历"], ["检查事实风险", "检查简历中是否存在缺少事实依据或可能夸大的表达"], ["继续精简表达", "继续精简表达并突出最重要的成果"]];
let nextId = 1;

export const AiChatContent = {
  name: "AiChatContent",
  setup() {
    const entries = ref([]), content = ref(null);
    const add = (entry) => { const id = nextId++; entries.value = [...entries.value, { ...entry, id }]; return id; };
    const ensureHint = () => { if (!entries.value.length) add({ type: "hint", text: "描述你想怎么改这份简历，AI 会先给你一份修改方案，确认后才应用。例如：把工作经历写得更量化、新增一条项目经历、删除第二条教育经历。" }); };
    const appendMessage = (kind, text) => add({ type: "message", kind, text });
    const showProposal = (proposal) => add({ type: "proposal", proposal, selection: (proposal.changes || []).map(() => true) });
    const updateProposal = (id, selection) => { entries.value = entries.value.map((entry) => entry.id === id ? { ...entry, selection: [...selection] } : entry); };
    const completeProposal = (id, label, summary, round) => { entries.value = entries.value.map((entry) => entry.id === id ? { ...entry, type: "completed", label, summary, round } : entry); };
    const appendFollowup = (message) => add({ type: "followup", message });
    const clear = () => { entries.value = []; };
    const getContent = () => content.value;
    onMounted(() => { window.__resumeVueAiChatContent = { ensureHint, appendMessage, showProposal, updateProposal, completeProposal, appendFollowup, clear, getContent }; });
    onBeforeUnmount(() => { if (window.__resumeVueAiChatContent?.clear === clear) delete window.__resumeVueAiChatContent; });
    const proposalNode = (entry) => h("div", { class: "ai-proposal" }, [entry.proposal.summary ? h("div", { class: "ai-proposal__summary" }, entry.proposal.summary) : null, h("div", { class: "ai-proposal__list" }, (entry.proposal.changes || []).map((change, index) => h("div", { class: `ai-change${entry.selection[index] === false ? " is-rejected" : ""}`, "data-proposal-change": index }, [h("div", { class: "ai-change__target" }, [change.target || "", h("span", { class: `ai-change__op ai-change__op--${change.op || "set"}` }, change.opLabel || "改")]), h("div", { class: "ai-change__diff" }, [change.before !== undefined ? h("div", { class: "ai-change__before" }, change.before || "（空）") : null, change.before !== undefined ? h("div", { class: "ai-change__arrow" }, "↓") : null, h("div", { class: "ai-change__after" }, change.after || "（空）")]), h("div", { class: "proposal-decision" }, [h("button", { type: "button", class: entry.selection[index] === false ? "" : "is-selected", "data-action": "ai-decide-change", "data-change-index": index, "data-accepted": "true" }, "接受"), h("button", { type: "button", class: entry.selection[index] === false ? "is-selected" : "", "data-action": "ai-decide-change", "data-change-index": index, "data-accepted": "false" }, "拒绝")])]))), h("div", { class: "ai-proposal__actions" }, [h("button", { type: "button", class: "ai-proposal__cancel", "data-action": "ai-cancel" }, "全部拒绝"), h("button", { type: "button", class: "ai-proposal__apply", "data-action": "ai-apply" }, "应用已接受项")])]);
    return () => h("div", { class: "vue-ai-chat-content", ref: content }, entries.value.map((entry) => {
      if (entry.type === "hint") return h("p", { class: "ai-chat__hint", key: entry.id }, entry.text);
      if (entry.type === "message") return h("div", { class: `ai-msg ai-msg--${entry.kind}`, key: entry.id }, entry.text);
      if (entry.type === "proposal") return proposalNode(entry);
      if (entry.type === "completed") return h("div", { class: "ai-proposal is-completed", key: entry.id }, [h("details", [h("summary", [h("span", `第 ${entry.round || ""} 轮 · ${entry.summary || "AI 修改提案"}`), h("strong", entry.label)]), h("p", "本轮决策已记录，后续建议会参考你的接受和拒绝结果。")])]);
      return h("div", { class: "ai-round-followup", key: entry.id }, [h("p", entry.message), h("span", "接下来可以："), h("div", FOLLOWUPS.map(([label, prompt]) => h("button", { type: "button", "data-action": "ai-followup", "data-prompt": prompt }, label)))]);
    }));
  }
};
