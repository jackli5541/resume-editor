import test from "node:test";
import assert from "node:assert/strict";

import { createInitialResume, migrateResumeToTemplate } from "../public/core.mjs";
import { TEMPLATE_SCHEMAS } from "../public/template-schemas.mjs";
import { startServer } from "../server.mjs";

test("更换模板保留草稿身份、用户内容和目标模板未展示的模块", () => {
  const source = createInitialResume();
  source.remoteId = "draft-id";
  source.remoteRevision = 7;
  source.profile.name = "张凯迪";
  source.sections.find((section) => section.id === "summary").content = "用户填写的自我评价";
  source.sections.push({ id: "private-notes", title: "未展示模块", type: "richtext", visible: true, content: "不能丢失" });

  const targetSchema = TEMPLATE_SCHEMAS["resume-collection-cn-004"];
  const migrated = migrateResumeToTemplate(source, {
    slug: targetSchema.slug,
    version: 1,
    name: targetSchema.name,
    editorSchema: targetSchema
  });

  assert.equal(migrated.remoteId, "draft-id");
  assert.equal(migrated.remoteRevision, 7);
  assert.equal(migrated.profile.name, "张凯迪");
  assert.equal(migrated.sections.find((section) => section.id === "summary").content, "用户填写的自我评价");
  assert.equal(migrated.sections.find((section) => section.id === "private-notes").content, "不能丢失");
  assert.equal(migrated.template.slug, "resume-collection-cn-004");
});

test("云端草稿可原地更新模板协议而不新建草稿", async (context) => {
  const app = await startServer({ port: 0, requireAuth: false });
  context.after(() => new Promise((resolve) => app.server.close(resolve)));
  const source = createInitialResume();
  source.profile.name = "张凯迪";

  const createdResponse = await fetch(`${app.origin}/api/resumes`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ templateSlug: "clean-single", templateVersion: 1, data: source })
  });
  assert.equal(createdResponse.status, 201);
  const created = await createdResponse.json();

  const changedResponse = await fetch(`${app.origin}/api/resumes/${created.id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      revision: created.revision,
      templateSlug: "resume-collection-cn-004",
      templateVersion: 1,
      data: source
    })
  });
  assert.equal(changedResponse.status, 200);

  const loaded = await (await fetch(`${app.origin}/api/resumes/${created.id}`)).json();
  assert.equal(loaded.resume.id, created.id);
  assert.equal(loaded.resume.templateSlug, "resume-collection-cn-004");
  assert.equal(loaded.resume.data.profile.name, "张凯迪");
});
