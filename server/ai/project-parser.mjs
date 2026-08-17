const SECTION_NAMES = ["教育背景", "教育经历", "工作经历", "实习经历", "项目经历", "项目经验", "项目实践", "技能特长", "专业技能", "个人技能", "自我评价", "个人总结", "证书资质", "荣誉奖项", "校园经历", "语言能力", "兴趣爱好"];
const TECH_PREFIX = /^(?:技术栈|技术关键词|开发环境|使用技术|核心技术|技术架构)\s*[：:]/i;
const BULLET_PREFIX = /^(?:[-*•◆◇▪●◦‣➢➤♦]|\d+[.)、])\s*/;
const STRUCTURE_PREFIX = /^\[(?:HEADING(?:\s+level=\d+)?|PARAGRAPH(?:\s+emphasis=(?:true|false))?|BULLET|ROW)\]\s*/i;
const ROLE_WORDS = /(?:项目负责人|负责人|独立开发|核心成员|项目成员|产品负责人|产品经理|技术负责人|开发工程师|前端开发|后端开发|全栈开发|架构师|设计师|主导|参与)/i;
const TECH_WORDS = /(?:JavaScript|TypeScript|Python|Java|Go|C\+\+|HTML|CSS|Vue|React|Spring|MySQL|Redis|Docker|Node\.js)/i;

function cleanLine(value) {
  return String(value ?? "")
    .replace(/\u00a0/g, " ")
    .replace(STRUCTURE_PREFIX, "")
    .replace(/\s+/g, " ")
    .trim();
}

function markerOf(value) {
  return String(value ?? "").match(/^\[([^\]]+)\]/)?.[1]?.toLowerCase() || "";
}

function sectionNameOf(value) {
  const text = cleanLine(value).replace(/[\s·|｜/_-]+/g, "");
  return SECTION_NAMES.find((name) => {
    if (text === name) return true;
    if (!text.startsWith(name)) return false;
    return /^[A-Za-z]+$/.test(text.slice(name.length));
  }) || "";
}

function isBullet(value) {
  const raw = String(value ?? "").trim();
  return markerOf(raw) === "bullet" || BULLET_PREFIX.test(cleanLine(raw));
}

function isLikelyRole(value) {
  const text = cleanLine(value);
  return Boolean(text) && text.length <= 40 && ROLE_WORDS.test(text);
}

function isLikelyTech(value) {
  const text = cleanLine(value);
  return Boolean(text) && (TECH_PREFIX.test(text) || (TECH_WORDS.test(text) && /[/、,，+]/.test(text)));
}

function splitProjectHeader(value) {
  const text = cleanLine(value);
  const parts = text.split(/\s*[|｜]\s*/).map((part) => part.trim()).filter(Boolean);
  if (parts.length >= 2) {
    return {
      projectName: parts[0],
      projectRole: parts.slice(1).join(" / ")
    };
  }
  const labeled = text.match(/^(?:项目名称|项目名)\s*[：:]\s*(.+)$/);
  if (labeled) return { projectName: labeled[1].trim(), projectRole: "" };
  return { projectName: text, projectRole: "" };
}

function isCandidateHeader(raw, text, nextText = "") {
  const marker = markerOf(raw);
  if (!text || isBullet(raw) || TECH_PREFIX.test(text) || sectionNameOf(text)) return false;
  if (/^(?:项目描述|项目职责|主要职责|工作内容|职责描述)\s*[：:]?$/i.test(text)) return false;
  if (/[|｜]/.test(text) || /^(?:项目名称|项目名)\s*[：:]/.test(text)) return true;
  if (TECH_PREFIX.test(nextText) && text.length <= 100) return true;
  if (marker.startsWith("heading") || marker.includes("emphasis=true")) return text.length <= 100;
  return false;
}

export function parseProjectCandidates(description) {
  const lines = String(description ?? "").split(/\r?\n/);
  const candidates = [];
  let inProjects = false;
  let current = null;

  const commit = () => {
    if (!current?.projectName) return;
    current.sourceId = `project-${candidates.length + 1}`;
    current.sourceText = current.sourceLines.join("\n");
    delete current.sourceLines;
    candidates.push(current);
    current = null;
  };

  for (let lineIndex = 0; lineIndex < lines.length; lineIndex += 1) {
    const raw = lines[lineIndex];
    const text = cleanLine(raw);
    if (!text) continue;
    const sectionName = sectionNameOf(text);
    if (sectionName) {
      if (["项目经历", "项目经验", "项目实践"].includes(sectionName)) {
        inProjects = true;
      } else if (inProjects) {
        commit();
        break;
      }
      continue;
    }
    if (!inProjects) continue;

    const nextText = cleanLine(lines.slice(lineIndex + 1).find((line) => cleanLine(line)) || "");
    if (isCandidateHeader(raw, text, nextText)) {
      commit();
      const header = splitProjectHeader(text);
      current = { ...header, techStack: "", highlights: [], sourceLines: [text] };
      continue;
    }
    if (!current) continue;

    current.sourceLines.push(text);
    if (TECH_PREFIX.test(text)) {
      current.techStack = text.replace(TECH_PREFIX, "").trim();
    } else if (!current.projectRole && isLikelyRole(text) && !isLikelyTech(text)) {
      current.projectRole = text;
    } else {
      current.highlights.push(text.replace(BULLET_PREFIX, "").trim());
    }
  }
  commit();
  return candidates.slice(0, 12);
}

export function projectCandidatePrompt(candidates) {
  if (!Array.isArray(candidates) || candidates.length === 0) return "";
  return JSON.stringify(candidates.map(({ sourceId, projectName, projectRole, techStack, highlights, sourceText }) => ({
    sourceId, projectName, projectRole, techStack, highlights, sourceText
  })), null, 2);
}

export function looksLikeProjectRole(value) {
  return isLikelyRole(value);
}

export function looksLikeTechnology(value) {
  return isLikelyTech(value);
}
