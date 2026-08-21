import { h, onBeforeUnmount, onMounted, ref } from "vue";

const STAGES = { internship: "找实习", graduate: "应届求职", experienced: "有经验求职", career_switch: "转行求职", unsure: "暂不确定" };
function focusFor(stage) {
  if (stage === "internship") return ["项目与实践经历", "学习能力与岗位技能"];
  if (stage === "graduate") return ["教育与项目成果", "岗位相关技能"];
  if (stage === "career_switch") return ["可迁移能力", "与目标岗位相关的成果"];
  return ["岗位相关经历", "职责、行动与成果"];
}

export const AiContextSummary = {
  name: "AiContextSummary",
  setup() {
    const context = ref({});
    const setContext = (value) => { context.value = value || {}; };
    onMounted(() => { window.__resumeVueAiContextSummary = { setContext }; });
    onBeforeUnmount(() => { if (window.__resumeVueAiContextSummary?.setContext === setContext) delete window.__resumeVueAiContextSummary; });
    return () => {
      const value = context.value;
      const details = [["目标岗位", value.targetRole || "未设置（生成通用版本）"], ["求职阶段", STAGES[value.jobStage] || "未设置"], ["职位描述", value.jobDescription ? `已添加 ${value.jobDescription.length} 字` : "未添加"]];
      return [h("dl", { class: "ai-context-list" }, details.map(([label, text]) => h("div", [h("dt", label), h("dd", text)]))), h("div", { class: "ai-context-focus" }, [h("strong", "本次生成将重点突出"), h("ul", focusFor(value.jobStage).map((item) => h("li", item)))])];
    };
  }
};
