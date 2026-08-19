import { mapOptimizeOutput } from "./optimize.mjs";

const MAX_JD_LENGTH = 12000;
const MAX_PLAN_ITEMS = 12;

const TARGET_SYSTEM_PROMPT = `你是求职目标诊断 Agent。根据岗位 JD 和当前简历生成可执行、可审阅的岗位定制计划。
必须遵守：
1. 只输出合法 JSON，不要 Markdown 或解释。
2. 简历中没有的事实必须标记 missing_evidence，绝不编造数字、成果、职责、技能和年限。
3. 每条岗位要求必须给出简历证据；没有证据时 evidence 为空数组。
4. 计划必须按模块拆分，动作只允许 rewrite、compress、reorder、highlight、question、remove、add_section。
5. 优先改造工作经历、项目经历、技能和自我评价；计划不超过 12 项。

输出结构：
{"target":{"role":"","seniority":"","mustHave":[],"niceToHave":[],"keywords":[]},"summary":"","scores":{"requirementCoverage":0,"evidenceStrength":0,"quantification":0},"matrix":[{"requirement":"","evidence":[],"status":"matched|partial|missing","suggestion":""}],"risks":[],"questions":[],"plan":[{"id":"plan-1","sectionId":"experience","title":"","action":"rewrite","reason":"","requiredEvidence":[],"risk":"low|missing_evidence","status":"ready|blocked"}]}`;

const EXECUTE_SYSTEM_PROMPT = `你是求职目标简历执行 Agent。你只执行一个已确认的计划项，输出结构化修改提案，不直接返回整份简历。
严格遵守：不得新增简历和用户补充信息中不存在的事实、数字、成果、职责、技能或年限。缺少证据时返回空 changes，并在 summary 中说明需要用户补充什么。
输出格式与字段固定：{"summary":"","changes":[{"op":"set","sectionId":"experience","itemIndex":0,"field":"content","after":"<ul><li>...</li></ul>"}]}。
op 只允许 set、add、remove、addModule、removeModule；content 只允许 p/ul/ol/li/strong/em HTML 标签。`;

function text(value, limit = 500) {
  return String(value ?? "").trim().slice(0, limit);
}

function stringList(value, limit = 20) {
  return (Array.isArray(value) ? value : []).slice(0, limit).map((item) => text(item, 240)).filter(Boolean);
}

function score(value) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(0, Math.min(100, Math.round(number))) : 0;
}

export function validateTargetInput(jobDescription) {
  const jd = text(jobDescription, MAX_JD_LENGTH + 1);
  if (!jd) throw Object.assign(new Error("请粘贴目标岗位 JD"), { statusCode: 400 });
  if (jd.length > MAX_JD_LENGTH) throw Object.assign(new Error(`职位描述过长（上限 ${MAX_JD_LENGTH} 字）`), { statusCode: 413 });
  return jd;
}

export function buildTargetPrompt(resume, jobDescription) {
  const source = resume && typeof resume === "object" ? resume : {};
  const modelResume = { profile: source.profile || {}, sections: Array.isArray(source.sections) ? source.sections : [] };
  return `<job_description>\n${jobDescription}\n</job_description>\n\n<current_resume>\n${JSON.stringify(modelResume)}\n</current_resume>`;
}

export function mapTargetDiagnosis(raw) {
  const source = raw && typeof raw === "object" && !Array.isArray(raw) ? raw : {};
  const target = source.target && typeof source.target === "object" ? source.target : {};
  const allowedActions = new Set(["rewrite", "compress", "reorder", "highlight", "question", "remove", "add_section"]);
  const allowedStatuses = new Set(["matched", "partial", "missing"]);
  const plan = (Array.isArray(source.plan) ? source.plan : []).slice(0, MAX_PLAN_ITEMS).map((item, index) => {
    const action = allowedActions.has(item?.action) ? item.action : "rewrite";
    const risk = item?.risk === "missing_evidence" ? "missing_evidence" : "low";
    return {
      id: text(item?.id, 80) || `plan-${index + 1}`,
      sectionId: text(item?.sectionId, 80), title: text(item?.title, 200), action,
      reason: text(item?.reason, 600), requiredEvidence: stringList(item?.requiredEvidence, 10), risk,
      status: risk === "missing_evidence" || item?.status === "blocked" ? "blocked" : "ready"
    };
  }).filter((item) => item.sectionId && item.title);
  return {
    target: { role: text(target.role, 160), seniority: text(target.seniority, 120), mustHave: stringList(target.mustHave), niceToHave: stringList(target.niceToHave), keywords: stringList(target.keywords, 40) },
    summary: text(source.summary, 1000),
    scores: { requirementCoverage: score(source.scores?.requirementCoverage), evidenceStrength: score(source.scores?.evidenceStrength), quantification: score(source.scores?.quantification) },
    matrix: (Array.isArray(source.matrix) ? source.matrix : []).slice(0, 30).map((item) => ({ requirement: text(item?.requirement, 240), evidence: stringList(item?.evidence, 10), status: allowedStatuses.has(item?.status) ? item.status : "missing", suggestion: text(item?.suggestion, 600) })).filter((item) => item.requirement),
    risks: stringList(source.risks, 20), questions: stringList(source.questions, 20), plan
  };
}

export function buildTargetExecutionPrompt(resume, jobDescription, planItem, userEvidence = "") {
  const source = resume && typeof resume === "object" ? resume : {};
  const sectionId = text(planItem?.sectionId, 80);
  const sections = (Array.isArray(source.sections) ? source.sections : []).filter((section) => section?.id === sectionId);
  const modelResume = { profile: source.profile || {}, sections };
  return `<job_description>\n${jobDescription}\n</job_description>\n<plan_item>\n${JSON.stringify(planItem || {})}\n</plan_item>\n<user_evidence>\n${text(userEvidence, 4000)}\n</user_evidence>\n<current_resume>\n${JSON.stringify(modelResume)}\n</current_resume>`;
}

export function mapTargetExecution(raw, resume) {
  return mapOptimizeOutput(raw, resume);
}

export { TARGET_SYSTEM_PROMPT, EXECUTE_SYSTEM_PROMPT, MAX_JD_LENGTH };
