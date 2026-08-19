import test from "node:test";
import assert from "node:assert/strict";
import { createInitialResume } from "../public/core.mjs";
import { buildTargetExecutionPrompt, buildTargetPrompt, mapTargetDiagnosis, mapTargetExecution, validateTargetInput } from "../server/ai/target-agent.mjs";
import { TargetAgentRepository } from "../server/ai/target-repository.mjs";
import { createProposalSelection, selectedProposalChanges, setProposalDecision } from "../public/features/ai/proposal-selection.mjs";

test("岗位诊断规范化分数、证据矩阵和计划风险", () => {
  const result = mapTargetDiagnosis({
    target: { role: "AI 产品经理", mustHave: ["RAG"] },
    scores: { requirementCoverage: 130, evidenceStrength: 58.4, quantification: -2 },
    matrix: [{ requirement: "RAG", evidence: [], status: "missing", suggestion: "补充证据" }],
    plan: [
      { id: "p1", sectionId: "projects", title: "强化项目", action: "rewrite", risk: "low" },
      { id: "p2", sectionId: "experience", title: "补充管理人数", action: "rewrite", risk: "missing_evidence", status: "ready" },
      { id: "bad", sectionId: "skills", title: "非法动作回退", action: "invent" }
    ]
  });
  assert.equal(result.target.role, "AI 产品经理");
  assert.deepEqual(result.scores, { requirementCoverage: 100, evidenceStrength: 58, quantification: 0 });
  assert.equal(result.plan[1].status, "blocked");
  assert.equal(result.plan[2].action, "rewrite");
});

test("岗位执行复用安全 Patch 校验并丢弃幻觉路径", () => {
  const resume = createInitialResume();
  const result = mapTargetExecution({ changes: [
    { op: "set", sectionId: "experience", itemIndex: 0, field: "content", after: "<p>改写</p>" },
    { op: "set", sectionId: "not-exists", field: "content", after: "幻觉" }
  ] }, resume);
  assert.equal(result.changes.length, 1);
  assert.equal(result.changes[0].sectionId, "experience");
});

test("岗位模型输入移除模板元数据，单项执行只携带相关模块", () => {
  const resume = createInitialResume();
  resume.template = { editorSchema: { oversized: "x".repeat(2000) } };
  const diagnosisPrompt = buildTargetPrompt(resume, "JD");
  const executionPrompt = buildTargetExecutionPrompt(resume, "JD", { sectionId: "experience", title: "优化经历" });
  assert.doesNotMatch(diagnosisPrompt, /oversized/);
  assert.doesNotMatch(executionPrompt, /oversized/);
  assert.match(executionPrompt, /"id":"experience"/);
  assert.doesNotMatch(executionPrompt, /"id":"education"/);
});

test("岗位 JD 必填且限制长度", () => {
  assert.throws(() => validateTargetInput(""), /粘贴/);
  assert.equal(validateTargetInput("  产品经理  "), "产品经理");
  assert.throws(() => validateTargetInput("x".repeat(12001)), /上限/);
});

test("目标任务仓储按用户恢复任务、版本和计划状态", async () => {
  const repository = new TargetAgentRepository({ database: null });
  const diagnosis = { target: { role: "产品经理" }, plan: [{ id: "p1", sectionId: "projects", title: "项目优化", status: "ready" }] };
  const session = await repository.createSession({ resumeId: "r1", ownerId: "u1", baseRevision: 3, jobDescription: "JD", diagnosis });
  assert.equal((await repository.latest("r1", "u1")).id, session.id);
  assert.equal(await repository.latest("r1", "u2"), null);
  await repository.createVersion({ resumeId: "r1", revision: 3, sessionId: session.id, label: "JD 优化前", createdBy: "agent", data: { profile: { name: "张三" } } });
  assert.equal((await repository.listVersions("r1"))[0].label, "JD 优化前");
  await repository.recordChange({ sessionId: session.id, planItemId: "p1", patch: [{ op: "set" }] });
  await repository.setChangeStatus(session.id, "p1", "applied");
  const updated = await repository.updateSession(session.id, "u1", { plan: [{ ...diagnosis.plan[0], status: "applied" }], status: "validating" });
  assert.equal(updated.status, "validating");
  assert.equal(updated.plan[0].status, "applied");
});

test("稳定 itemId 在条目重排后仍定位正确内容", () => {
  const resume = createInitialResume();
  const section = resume.sections.find((item) => item.id === "experience");
  const target = section.items[0];
  section.items.unshift({ ...target, id: "new-item", organization: "新增公司" });
  const result = mapTargetExecution({ changes: [{ op: "set", sectionId: "experience", itemId: target.id, field: "content", after: "<p>稳定修改</p>" }] }, resume);
  assert.equal(result.changes[0].itemId, target.id);
  assert.equal(result.changes[0].before, target.content);
});

test("AI 提案只应用用户接受的修改，拒绝项保持原文", () => {
  const changes = [{ op: "set", after: "接受" }, { op: "set", after: "拒绝" }, { op: "add", item: {} }];
  const selection = createProposalSelection(changes);
  setProposalDecision(selection, 1, false);
  assert.deepEqual(selectedProposalChanges(changes, selection), [changes[0], changes[2]]);
  setProposalDecision(selection, 1, true);
  assert.deepEqual(selectedProposalChanges(changes, selection), changes);
});
