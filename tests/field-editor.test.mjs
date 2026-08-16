import test from "node:test";
import assert from "node:assert/strict";

import {
  createInitialResume,
  nextCustomFieldKey,
  normalizeResume
} from "../public/core.mjs";
import {
  defaultFieldsFor,
  resolveSectionFields
} from "../public/template-schemas.mjs";
import { validateExportPayload } from "../server/validation.mjs";

test("默认字段表携带 label/type/role/builtin 元信息", () => {
  const fields = defaultFieldsFor("experience");
  assert.equal(fields[0].key, "start");
  assert.equal(fields[0].type, "month");
  assert.equal(fields[0].role, "range");
  assert.equal(fields[0].builtin, true);
  assert.equal(fields.find((field) => field.key === "content").role, "body");
  assert.equal(fields.find((field) => field.key === "organization").label, "公司名称");
});

test("老草稿（无 fields）经 normalizeResume 后自动物化字段表", () => {
  const resume = normalizeResume(createInitialResume());
  const experience = resume.sections.find((section) => section.id === "experience");
  assert.ok(Array.isArray(experience.fields));
  assert.ok(experience.fields.length > 0);

  // 直接传入不带 fields 的老数据结构也能补齐
  const legacy = createInitialResume();
  for (const section of legacy.sections) delete section.fields;
  const migrated = normalizeResume(legacy);
  assert.ok(migrated.sections.every((section) => Array.isArray(section.fields) && section.fields.length > 0));
});

test("resolveSectionFields 保存值优先、默认值回退", () => {
  const section = { id: "certificates", fields: [{ key: "custom_0", label: "编号", type: "text", role: "meta", builtin: false, visible: true }] };
  assert.equal(resolveSectionFields(section).length, 1);
  assert.equal(resolveSectionFields({ id: "certificates" }).length, 3);
});

test("nextCustomFieldKey 递增生成不冲突的键", () => {
  assert.equal(nextCustomFieldKey([]), "custom_0");
  assert.equal(nextCustomFieldKey([{ key: "custom_0" }, { key: "custom_2" }]), "custom_3");
});

test("服务端校验透传已声明自定义字段（不丢数据）", () => {
  const resume = normalizeResume(createInitialResume());
  const experience = resume.sections.find((section) => section.id === "experience");
  experience.fields.push({ key: "custom_0", label: "公司规模", type: "text", role: "meta", builtin: false, visible: true });
  experience.items[0].custom_0 = "2000 人";

  const { resume: canonical } = validateExportPayload({ resume, template: { slug: "clean-single", version: 1 } });
  const saved = canonical.sections.find((section) => section.id === "experience");
  assert.equal(saved.items[0].custom_0, "2000 人");
  assert.ok(saved.fields.some((field) => field.key === "custom_0" && field.label === "公司规模"));
});

test("未声明的字段被丢弃，字段类型与角色收敛到白名单", () => {
  const resume = normalizeResume(createInitialResume());
  const experience = resume.sections.find((section) => section.id === "experience");
  experience.items[0].undeclaredKey = "会被丢弃";
  experience.fields.push({ key: "custom_0", label: "规模", type: "evil", role: "hacker", builtin: false, visible: true });
  experience.items[0].custom_0 = "500 人";

  const { resume: canonical } = validateExportPayload({ resume, template: { slug: "clean-single", version: 1 } });
  const saved = canonical.sections.find((section) => section.id === "experience");
  assert.equal(saved.items[0].undeclaredKey, undefined);
  const custom = saved.fields.find((field) => field.key === "custom_0");
  assert.equal(custom.type, "text");
  assert.equal(custom.role, "meta");
});

test("自定义字段数量与单模块字段数受到限制", () => {
  const resume = normalizeResume(createInitialResume());
  const experience = resume.sections.find((section) => section.id === "experience");
  for (let index = 0; index < 11; index += 1) {
    experience.fields.push({ key: `custom_${index}`, label: `字段${index}`, type: "text", role: "meta", builtin: false, visible: true });
  }
  assert.throws(
    () => validateExportPayload({ resume, template: { slug: "clean-single", version: 1 } }),
    /自定义字段数量超过限制/
  );
});

test("objective 模块的自定义字段进入 data 并透传", () => {
  const resume = normalizeResume(createInitialResume());
  const objective = resume.sections.find((section) => section.id === "objective");
  objective.fields.push({ key: "custom_0", label: "期望行业", type: "text", role: "meta", builtin: false, visible: true });
  objective.data.custom_0 = "互联网";

  const { resume: canonical } = validateExportPayload({ resume, template: { slug: "clean-single", version: 1 } });
  const saved = canonical.sections.find((section) => section.id === "objective");
  assert.equal(saved.data.custom_0, "互联网");
});
