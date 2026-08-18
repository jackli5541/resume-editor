import test from "node:test";
import assert from "node:assert/strict";

import { createInitialResume } from "../public/core.mjs";
import { AiJobRepository, publicAiJob } from "../server/ai/job-repository.mjs";
import { startServer } from "../server.mjs";

function cookieFrom(response) {
  return response.headers.get("set-cookie")?.split(";")[0] || "";
}

async function register(app, identifier) {
  const response = await fetch(`${app.origin}/api/auth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ identifier, password: "Test1234!" })
  });
  assert.equal(response.status, 201);
  return cookieFrom(response);
}

async function pollJob(app, id, cookie) {
  let job = null;
  for (let attempt = 0; attempt < 50; attempt += 1) {
    const response = await fetch(`${app.origin}/api/ai/jobs/${id}`, { headers: { Cookie: cookie } });
    assert.equal(response.status, 200);
    job = (await response.json()).job;
    if (["completed", "failed"].includes(job.status)) return job;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  return job;
}

function fakeAiService() {
  return {
    async generate({ description }) {
      await new Promise((resolve) => setTimeout(resolve, 20));
      const resume = createInitialResume();
      resume.profile.name = description;
      return { resume, uncertain: [], notices: [], usage: { model: "test-model" } };
    },
    async translate() {
      await new Promise((resolve) => setTimeout(resolve, 20));
      const resume = createInitialResume();
      resume.title = "Translated Resume";
      resume.profile.name = "张三";
      resume.profile.job = "Product Manager";
      return { resume, uncertain: [], notices: [], usage: { model: "test-model" } };
    }
  };
}

test("AI 任务仓储按用户隔离，公开视图不泄漏原始输入", async () => {
  const repository = new AiJobRepository({ ttlMs: 60_000 });
  const created = await repository.create({ userId: "u1", type: "generate", payload: { description: "敏感简历正文" } });
  assert.equal((await repository.get(created.id, "u2")), null);
  assert.equal(publicAiJob(created).payload, undefined);
  assert.equal(publicAiJob(created).status, "queued");
  assert.equal((await repository.findRunning("u1", "generate")).id, created.id);
  await repository.consume(created.id, "u1");
  assert.equal(await repository.findLatestRecoverable("u1", "generate"), null);
});

test("生成任务可在刷新后通过 latest 恢复，并在处理后消失", async (context) => {
  const app = await startServer({ port: 0, database: null, useRedis: false, aiService: fakeAiService(), disableFidelityPreview: true });
  context.after(() => new Promise((resolve) => app.server.close(resolve)));
  const alice = await register(app, "ai-job-alice@example.com");
  const bob = await register(app, "ai-job-bob@example.com");

  const submitted = await fetch(`${app.origin}/api/ai/jobs`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: alice },
    body: JSON.stringify({ type: "generate", payload: { description: "Alice", templateSlug: "resume-collection-cn-001", templateVersion: 1 } })
  });
  assert.equal(submitted.status, 202);
  const created = (await submitted.json()).job;

  const forbidden = await fetch(`${app.origin}/api/ai/jobs/${created.id}`, { headers: { Cookie: bob } });
  assert.equal(forbidden.status, 404);

  const completed = await pollJob(app, created.id, alice);
  assert.equal(completed.status, "completed");
  assert.equal(completed.progress, 100);
  assert.equal(completed.result.resume.profile.name, "Alice");
  assert.equal(completed.result.template.slug, "resume-collection-cn-001");
  assert.deepEqual(completed.result.resume.sections.slice(0, 4).map((section) => section.id), ["summary", "education", "experience", "skills"]);

  const restored = await (await fetch(`${app.origin}/api/ai/jobs/latest?type=generate`, { headers: { Cookie: alice } })).json();
  assert.equal(restored.job.id, created.id);
  assert.equal(restored.job.result.resume.profile.name, "Alice");

  const consumed = await fetch(`${app.origin}/api/ai/jobs/${created.id}/consume`, { method: "POST", headers: { Cookie: alice } });
  assert.equal(consumed.status, 200);
  const empty = await (await fetch(`${app.origin}/api/ai/jobs/latest?type=generate`, { headers: { Cookie: alice } })).json();
  assert.equal(empty.job, null);
});

test("翻译任务在服务端完成草稿创建，页面退出不影响结果", async (context) => {
  const app = await startServer({ port: 0, database: null, useRedis: false, aiService: fakeAiService(), disableFidelityPreview: true });
  context.after(() => new Promise((resolve) => app.server.close(resolve)));
  const cookie = await register(app, "ai-job-translate@example.com");

  const response = await fetch(`${app.origin}/api/ai/jobs`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: cookie },
    body: JSON.stringify({
      type: "translate",
      payload: {
        description: "张三，产品经理",
        targetLanguage: "en",
        templateSlug: "clean-single",
        templateVersion: 1
      }
    })
  });
  assert.equal(response.status, 202);
  const created = (await response.json()).job;
  const completed = await pollJob(app, created.id, cookie);
  assert.equal(completed.status, "completed");
  assert.match(completed.result.resumeId, /^[0-9a-f-]{36}$/i);

  const draft = await fetch(`${app.origin}/api/resumes/${completed.result.resumeId}`, { headers: { Cookie: cookie } });
  assert.equal(draft.status, 200);
  const payload = await draft.json();
  assert.equal(payload.resume.data.profile.name, "张三");
  assert.equal(payload.resume.data.profile.job, "Product Manager");
});
