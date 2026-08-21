import test from "node:test";
import assert from "node:assert/strict";

import { createInitialResume } from "../public/core.mjs";
import {
  createResumeBackup,
  importResumeBackup,
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

test("A 模板备份导入 B 模板时保留 B 模板和当前草稿身份", () => {
  const source = createInitialResume();
  source.template = { slug: "template-a", version: 1, name: "A 模板" };
  source.remoteId = "source-draft";
  source.remoteRevision = 9;
  source.profile.name = "备份中的姓名";

  const target = createInitialResume();
  target.id = "target-local-id";
  target.remoteId = "target-draft";
  target.remoteRevision = 3;
  target.template = {
    slug: "template-b",
    version: 2,
    name: "B 模板",
    editorSchema: { sections: [{ id: "summary", title: "个人总结", type: "richtext" }] }
  };

  const imported = importResumeBackup(createResumeBackup(source), target);
  assert.equal(imported.profile.name, "备份中的姓名");
  assert.equal(imported.template.slug, "template-b");
  assert.equal(imported.template.version, 2);
  assert.equal(imported.id, "target-local-id");
  assert.equal(imported.remoteId, "target-draft");
  assert.equal(imported.remoteRevision, 3);
});

test("备份导入未保存的 B 模板时不会沿用 A 模板的云端草稿 ID", () => {
  const source = createInitialResume();
  source.remoteId = "source-draft";
  source.remoteRevision = 9;
  const target = createInitialResume();
  target.template = { slug: "template-b", version: 1 };

  const imported = importResumeBackup(createResumeBackup(source), target);
  assert.equal(imported.template.slug, "template-b");
  assert.equal(Object.hasOwn(imported, "remoteId"), false);
  assert.equal(Object.hasOwn(imported, "remoteRevision"), false);
});

test("拒绝任意 JSON、残缺简历和未知备份版本", () => {
  assert.throws(() => readResumeBackup({}), /轻简历导出的 JSON 备份文件/);
  assert.throws(() => readResumeBackup({ schemaVersion: 2, profile: {}, sections: [] }), /轻简历导出的 JSON 备份文件/);
  assert.throws(() => readResumeBackup({ format: RESUME_BACKUP_FORMAT, version: 99, resume: createInitialResume() }), /备份版本/);
});
