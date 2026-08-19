import { TONE_HINTS } from "./extract.mjs";

// AI 简历优化：给定当前简历 + 一条修改指令，模型输出「结构化修改提案」（不直接改动简历），
// 由前端展示 diff 供用户确认后应用。提案用最小、可校验的 op 表达：set / add / remove。

const MAX_CHANGES = 8;
const MAX_VALUE_LEN = 8000;
const MAX_FIELD_LEN = 80;

const OPTIMIZE_BASE_SYSTEM_PROMPT = `你是专业的简历改写助手。用户会给你一份当前简历的 JSON 和一条修改指令，你要判断需要修改哪些地方，并输出一个结构化的修改提案（不要直接改写整份简历，只输出提案）。
必须遵守：
1. 只输出一个合法 JSON 对象，不要输出任何解释、注释、Markdown 代码块或多余文字。
2. 只修改与用户指令相关的内容；未要求的内容保持不动，绝不新增未提及的事实、数字、成果、职责、技能、项目或年限。
3. 改写专业、具体、尽量量化已有成果，但不夸大、不编造。
4. content 类字段输出 HTML，只允许 <p>、<ul>、<ol>、<li>、<strong>、<em> 标签，每条要点用 <li>；其它字段输出纯文本。
5. op 取值：set（修改字段）、add（新增条目）、remove（删除条目）、addModule（启用/新增模块）、removeModule（隐藏/删除模块）。
6. 用最少的修改达成目标；能改就改，能不删就不删，能不新增就不新增。
7. 如果提供了此前轮次的用户决策，必须尊重被拒绝的建议；除非用户在本轮明确要求重新考虑，否则不要再次提出相同事实、数字或改写方向。

输出 JSON 结构（字段名固定，不要增删）：
{
  "summary": "一句话说明本次修改",
  "changes": [
    {"op":"set","field":"job","after":"新的字段值"},
    {"op":"set","sectionId":"experience","itemId":"稳定条目ID","field":"content","after":"<ul><li>...</li></ul>"},
    {"op":"set","sectionId":"objective","field":"city","after":"北京"},
    {"op":"set","sectionId":"summary","field":"content","after":"<p>...</p>"},
    {"op":"add","sectionId":"experience","item":{"start":"","end":"","organization":"","role":"","content":"<p>...</p>"}},
    {"op":"remove","sectionId":"experience","itemId":"稳定条目ID"},
    {"op":"addModule","sectionId":"campus"},
    {"op":"removeModule","sectionId":"awards"}
  ]
}
定位说明：基本信息字段不带 sectionId；求职意向字段用 sectionId="objective"；工作/教育/项目等条目必须优先使用 sectionId + itemId 定位；技能/自我评价等富文本用 sectionId + field="content"；addModule 启用一个当前隐藏的可选模块，removeModule 隐藏模块。`;

function cleanStr(value, maxLen) {
  return String(value ?? "").trim().slice(0, maxLen);
}

function buildOptimizeSystemPrompt(customPrompt = "") {
  const extra = cleanStr(customPrompt, 4000);
  return extra ? `${OPTIMIZE_BASE_SYSTEM_PROMPT}\n\n管理员附加要求：\n${extra}` : OPTIMIZE_BASE_SYSTEM_PROMPT;
}

// 精简简历，去掉 id/template/updatedAt/revision/settings，减少 token 且不泄漏无关字段。
function serializeResumeForOptimize(resume) {
  const source = resume && typeof resume === "object" ? resume : {};
  return {
    profile: source.profile || {},
    sections: (Array.isArray(source.sections) ? source.sections : []).map((section) => ({
      id: section?.id,
      type: section?.type,
      title: section?.title,
      visible: section?.visible,
      data: section?.data,
      content: section?.content,
      items: section?.items
    }))
  };
}

export function normalizeOptimizeDecisionContext(value) {
  if (!Array.isArray(value)) return [];
  return value.slice(-6).map((round) => ({
    instruction: cleanStr(round?.instruction, 500),
    summary: cleanStr(round?.summary, 500),
    accepted: (Array.isArray(round?.accepted) ? round.accepted : []).slice(0, MAX_CHANGES).map((item) => cleanStr(item, 500)).filter(Boolean),
    rejected: (Array.isArray(round?.rejected) ? round.rejected : []).slice(0, MAX_CHANGES).map((item) => cleanStr(item, 500)).filter(Boolean)
  })).filter((round) => round.instruction || round.accepted.length || round.rejected.length);
}

function buildOptimizeUserPrompt(resume, instruction, tone, decisionContext = []) {
  const hint = TONE_HINTS[tone] || TONE_HINTS.professional;
  const history = normalizeOptimizeDecisionContext(decisionContext);
  const decisions = history.length ? `\n\n<previous_user_decisions>\n${JSON.stringify(history)}\n</previous_user_decisions>` : "";
  return `<current_resume>\n${JSON.stringify(serializeResumeForOptimize(resume))}\n</current_resume>${decisions}\n\n<instruction>\n${String(instruction || "").trim()}\n</instruction>\n\n${hint}`;
}

function sectionById(resume, id) {
  return (resume?.sections || []).find((section) => section?.id === id);
}

function normalizeSetChange(change, resume) {
  const field = cleanStr(change.field, MAX_FIELD_LEN);
  if (!field) return null;
  const out = { op: "set", field, after: String(change.after ?? "").slice(0, MAX_VALUE_LEN) };

  const sectionId = cleanStr(change.sectionId, MAX_FIELD_LEN);
  if (sectionId) {
    const section = sectionById(resume, sectionId);
    if (!section) return null;
    out.sectionId = sectionId;
    if (change.itemId) {
      const itemId = cleanStr(change.itemId, MAX_FIELD_LEN);
      const index = section.items?.findIndex((item) => item?.id === itemId) ?? -1;
      if (index < 0) return null;
      out.itemId = itemId;
      out.before = String(section.items[index]?.[field] ?? "").slice(0, MAX_VALUE_LEN);
    } else if (change.itemIndex !== undefined && change.itemIndex !== null) {
      const index = Number(change.itemIndex);
      if (!Number.isInteger(index) || index < 0 || !Array.isArray(section.items) || index >= section.items.length) return null;
      out.itemIndex = index;
      out.itemId = section.items[index]?.id;
      out.before = String(section.items[index]?.[field] ?? "").slice(0, MAX_VALUE_LEN);
    }
    else out.before = String(section.type === "richtext" ? section.content ?? "" : section.data?.[field] ?? section[field] ?? "").slice(0, MAX_VALUE_LEN);
  } else {
    out.before = String(resume?.profile?.[field] ?? "").slice(0, MAX_VALUE_LEN);
  }
  return out;
}

function normalizeAddChange(change, resume) {
  const sectionId = cleanStr(change.sectionId, MAX_FIELD_LEN);
  if (!sectionId) return null;
  const section = sectionById(resume, sectionId);
  if (!section || !Array.isArray(section.items)) return null;

  const item = change.item && typeof change.item === "object" && !Array.isArray(change.item) ? change.item : {};
  const cleaned = {};
  for (const [key, value] of Object.entries(item)) {
    const field = cleanStr(key, MAX_FIELD_LEN);
    if (field) cleaned[field] = String(value ?? "").slice(0, MAX_VALUE_LEN);
  }
  return { op: "add", sectionId, item: cleaned };
}

function normalizeRemoveChange(change, resume) {
  const sectionId = cleanStr(change.sectionId, MAX_FIELD_LEN);
  if (!sectionId) return null;
  const section = sectionById(resume, sectionId);
  if (!section || !Array.isArray(section.items)) return null;
  const requestedId = cleanStr(change.itemId, MAX_FIELD_LEN);
  const index = requestedId ? section.items.findIndex((item) => item?.id === requestedId) : Number(change.itemIndex);
  if (!Number.isInteger(index) || index < 0 || index >= section.items.length) return null;
  return { op: "remove", sectionId, itemId: section.items[index]?.id, itemIndex: index, before: section.items[index] };
}

function normalizeModuleChange(change, resume, op) {
  const sectionId = cleanStr(change.sectionId, MAX_FIELD_LEN);
  if (!sectionId) return null;
  const section = sectionById(resume, sectionId);
  if (!section) return null;
  return { op, sectionId };
}

// 把模型输出映射为「可安全应用的修改提案」，逐条校验目标路径，幻觉路径直接丢弃。
export function mapOptimizeOutput(modelJson, resume) {
  const source = modelJson && typeof modelJson === "object" && !Array.isArray(modelJson) ? modelJson : {};
  const rawChanges = Array.isArray(source.changes) ? source.changes.slice(0, MAX_CHANGES) : [];

  const changes = [];
  for (const raw of rawChanges) {
    if (!raw || typeof raw !== "object") continue;
    const op = cleanStr(raw.op, 20);
    let normalized = null;
    if (op === "set") normalized = normalizeSetChange(raw, resume);
    else if (op === "add") normalized = normalizeAddChange(raw, resume);
    else if (op === "remove") normalized = normalizeRemoveChange(raw, resume);
    else if (op === "addModule") normalized = normalizeModuleChange(raw, resume, "addModule");
    else if (op === "removeModule") normalized = normalizeModuleChange(raw, resume, "removeModule");
    if (normalized) changes.push(normalized);
  }

  return { changes, summary: cleanStr(source.summary, 500) };
}

export { buildOptimizeSystemPrompt, buildOptimizeUserPrompt };
