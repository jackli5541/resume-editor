import { migrateResumeToTemplate, normalizeResume } from "./core.mjs";

export const RESUME_BACKUP_FORMAT = "light-resume-backup";
export const RESUME_BACKUP_VERSION = 1;

function plainObject(value) {
  return value && typeof value === "object" && !Array.isArray(value);
}

function looksLikeExportedResume(value) {
  return plainObject(value)
    && value.schemaVersion === 2
    && typeof value.title === "string"
    && plainObject(value.profile)
    && plainObject(value.settings)
    && Array.isArray(value.sections)
    && value.sections.length > 0
    && value.sections.every((section) => plainObject(section)
      && typeof section.id === "string"
      && typeof section.title === "string"
      && typeof section.type === "string");
}

export function createResumeBackup(resume, now = new Date()) {
  if (!looksLikeExportedResume(resume)) throw new Error("当前简历无法生成备份");
  return {
    format: RESUME_BACKUP_FORMAT,
    version: RESUME_BACKUP_VERSION,
    exportedAt: now.toISOString(),
    resume
  };
}

export function readResumeBackup(input) {
  if (!plainObject(input)) throw new Error("备份文件格式无效");
  let source;
  if (input.format === RESUME_BACKUP_FORMAT) {
    if (input.version !== RESUME_BACKUP_VERSION) throw new Error("暂不支持该备份版本");
    source = input.resume;
  } else {
    // 兼容改造前由本站备份按钮导出的裸简历 JSON。
    source = input;
  }
  if (!looksLikeExportedResume(source)) throw new Error("请选择由轻简历导出的 JSON 备份文件");
  return normalizeResume(source);
}

export function importResumeBackup(input, targetResume) {
  const imported = readResumeBackup(input);
  if (!plainObject(targetResume)) return imported;

  const targetTemplate = targetResume.template;
  const restored = targetTemplate
    ? migrateResumeToTemplate(imported, targetTemplate)
    : imported;

  // A backup supplies content, but it must never redirect writes to the source
  // draft. Keep the identity of the draft currently open in the editor.
  for (const key of ["id", "remoteId", "remoteRevision"]) {
    if (Object.hasOwn(targetResume, key)) restored[key] = targetResume[key];
    else delete restored[key];
  }
  return restored;
}
