import { h, onBeforeUnmount, onMounted, ref } from "vue";

const STAGES = { internship: "找实习", graduate: "应届求职", experienced: "有经验求职", career_switch: "转行求职", unsure: "暂不确定" };
function question(number, title, description) {
  return h("div", { class: "ai-guide-question" }, [h("span", { class: "ai-guide-avatar" }, "AI"), h("div", [h("span", { class: "eyebrow" }, number), h("h2", title), h("p", description)])]);
}
function actions(next, skip) { return h("div", { class: "ai-guide-actions" }, [h("button", { type: "button", class: "ai-submit", "data-action": next }, next === "ai-guide-jd-next" ? "整理好了，继续" : "继续"), h("button", { type: "button", class: "link-button", "data-action": skip }, next === "ai-guide-jd-next" ? "暂时没有，跳过" : "暂时不确定，跳过")]); }

export const AiGuideCard = {
  name: "AiGuideCard",
  setup() {
    const step = ref("role"), context = ref({});
    const setGuide = (nextStep, nextContext) => { step.value = nextStep || "role"; context.value = nextContext || {}; };
    onMounted(() => { window.__resumeVueAiGuideCard = { setGuide }; });
    onBeforeUnmount(() => { if (window.__resumeVueAiGuideCard?.setGuide === setGuide) delete window.__resumeVueAiGuideCard; });
    return () => {
      if (step.value === "stage") return [question("第 2 个问题", "你目前处于哪个求职阶段？", "不同阶段适合强调不同类型的经历。"), h("div", { class: "ai-stage-options" }, Object.entries(STAGES).map(([value, label]) => h("button", { type: "button", "data-action": "ai-guide-stage", "data-stage": value }, label)))];
      if (step.value === "jobDescription") return [question("最后一个问题", "有具体职位描述吗？", "粘贴 JD 后，我可以更准确地匹配招聘要求。这一项可以跳过。"), h("div", { class: "ai-guide-answer" }, [h("textarea", { id: "aiGuideJd", rows: 6, maxlength: 5000, placeholder: "粘贴职位职责和任职要求……", value: context.value.jobDescription || "" }), actions("ai-guide-jd-next", "ai-guide-jd-skip")])];
      return [question("第 1 个问题", "你准备投递什么岗位？", "我会根据目标岗位决定简历应当突出哪些经历。"), h("div", { class: "ai-guide-answer" }, [h("input", { id: "aiGuideRole", type: "text", maxlength: 120, value: context.value.targetRole || "", placeholder: "例如：产品经理、Java 开发、品牌运营", autocomplete: "off" }), actions("ai-guide-role-next", "ai-guide-role-skip")])];
    };
  }
};
