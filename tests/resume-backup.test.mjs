import test from "node:test";
import assert from "node:assert/strict";

import { createInitialResume } from "../public/core.mjs";
import {
  createResumeBackup,
  readResumeBackup,
  RESUME_BACKUP_FORMAT,
  RESUME_BACKUP_VERSION
} from "../public/resume-backup.mjs";

test("下载备份包含本站格式标识、版本和完整简历", () => {
  const resume = createInitialResume();
  const backup = createResumeBackup(resume, new Date("2026-08-19T00:00:00.000Z"));
  assert.equal(backup.format, RESUME_BACKUP_FORMAT);
  assert.equal(backup.version, RESUME_BACKUP_VERSION);
  assert.equal(backup.exportedAt, "2026-08-19T00:00:00.000Z");
  assert.equal(backup.resume.profile.name, resume.profile.name);
});

test("导入新版备份并兼容本站旧版裸简历 JSON", () => {
  const resume = createInitialResume();
  assert.equal(readResumeBackup(createResumeBackup(resume)).profile.name, resume.profile.name);
  assert.equal(readResumeBackup(resume).profile.name, resume.profile.name);
});

test("拒绝任意 JSON、残缺简历和未知备份版本", () => {
  assert.throws(() => readResumeBackup({}), /轻简历导出的 JSON 备份文件/);
  assert.throws(() => readResumeBackup({ schemaVersion: 2, profile: {}, sections: [] }), /轻简历导出的 JSON 备份文件/);
  assert.throws(() => readResumeBackup({ format: RESUME_BACKUP_FORMAT, version: 99, resume: createInitialResume() }), /备份版本/);
});
