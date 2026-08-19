import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("顶部 AI 导航分别提供生成、JD 定制、精修和翻译入口", async () => {
  const html = await readFile(new URL("../public/index.html", import.meta.url), "utf8");
  const styles = await readFile(new URL("../public/styles.css", import.meta.url), "utf8");
  assert.match(html, /<a[^>]+href="\/ai"[^>]*>AI 生成简历<\/a>/);
  assert.match(html, /<a[^>]+href="\/ai\/translate"[^>]*>AI 翻译简历<\/a>/);
  assert.match(html, /<a[^>]+href="\/ai\/optimize\?mode=target"[^>]*>按 JD 定制<\/a>/);
  assert.match(html, /<a[^>]+href="\/ai\/optimize\?mode=optimize"[^>]*>AI 精修<\/a>/);
  assert.doesNotMatch(html, />AI 简历工具</);
  assert.doesNotMatch(styles, /\.ai-tool-menu/);
});

test("首页展示四个 AI 入口和逐项决策承诺", async () => {
  const html = await readFile(new URL("../public/index.html", import.meta.url), "utf8");
  const styles = await readFile(new URL("../public/styles.css", import.meta.url), "utf8");
  assert.match(html, /class="home-tool-grid"/);
  for (const label of ["AI 生成简历", "按 JD 定制", "AI 精修简历", "AI 翻译简历"]) assert.match(html, new RegExp(label));
  assert.match(html, /href="\/ai\/optimize\?mode=target"/);
  assert.match(html, /href="\/ai\/optimize\?mode=optimize"/);
  assert.match(html, /id="optimizeWordFile"/);
  assert.match(html, /id="optimizeDraftList"/);
  assert.match(html, /逐项接受或拒绝/);
  assert.match(styles, /@media screen and \(max-width: 640px\)[\s\S]*?\.home-tool-grid\s*\{\s*grid-template-columns:\s*1fr;/);
});

test("AI 精修应用后保留轮次记录并等待用户主动继续", async () => {
  const app = await readFile(new URL("../public/app.mjs", import.meta.url), "utf8");
  assert.match(app, /decisionContext:\s*aiOptimizeHistory/);
  assert.match(app, /archiveAiProposal\(round/);
  assert.match(app, /data-action="ai-followup"/);
  assert.doesNotMatch(app, /function applyAiOptimize\(\)[\s\S]*?clearAiChat\(\);[\s\S]*?function cancelAiOptimize/);
});

test("桌面端 AI 侧边栏支持有上限的拖拽调宽，窄屏禁用拖拽", async () => {
  const html = await readFile(new URL("../public/index.html", import.meta.url), "utf8");
  const styles = await readFile(new URL("../public/styles.css", import.meta.url), "utf8");
  const app = await readFile(new URL("../public/app.mjs", import.meta.url), "utf8");
  assert.match(html, /id="aiChatResizeHandle"[^>]+role="separator"/);
  assert.match(styles, /width:\s*clamp\(320px,[^;]+720px[^;]+45vw/);
  assert.match(styles, /@media screen and \(max-width:\s*900px\)[\s\S]*?\.ai-chat__resize-handle\s*\{\s*display:\s*none;/);
  assert.match(app, /AI_CHAT_MAX_WIDTH\s*=\s*720/);
  assert.match(app, /setPointerCapture\(event\.pointerId\)/);
  assert.match(app, /localStorage\.setItem\(AI_CHAT_WIDTH_KEY/);
});

test("岗位计划默认只展开当前任务并保留进度与全部计划入口", async () => {
  const app = await readFile(new URL("../public/app.mjs", import.meta.url), "utf8");
  assert.match(app, /function renderTargetPlan\(diagnosis\)/);
  assert.match(app, /findIndex\(\(item\) => !\["applied", "skipped"\]\.includes\(item\.status\)\)/);
  assert.match(app, /class="target-plan__progress"/);
  assert.match(app, /class="target-plan__next"/);
  assert.match(app, /查看全部 \$\{plan\.length\} 项计划/);
  assert.equal((app.match(/class="target-plan__item is-current"/g) || []).length, 1);
});

test("宽屏 AI 使用停靠布局并为完整简历预览让出空间", async () => {
  const styles = await readFile(new URL("../public/styles.css", import.meta.url), "utf8");
  const app = await readFile(new URL("../public/app.mjs", import.meta.url), "utf8");
  assert.match(styles, /@media screen and \(min-width:\s*1201px\)[\s\S]*?html\.ai-chat-docked \.workspace\s*\{[\s\S]*?grid-template-columns:\s*820px;/);
  assert.match(styles, /html\.ai-chat-docked \.workspace > \.side-panel\s*\{\s*display:\s*none;/);
  assert.match(styles, /html\.ai-chat-docked \.editor-drawer\s*\{\s*left:\s*var\(--ai-chat-docked-width/);
  assert.match(styles, /html\.ai-chat-docked \.drawer__inner\s*\{\s*width:\s*min\(1200px, calc\(100% - 24px\)\)/);
  assert.match(app, /classList\.toggle\("ai-chat-docked", open && window\.innerWidth > 1200\)/);
  assert.match(app, /window\.innerWidth \* 0\.45/);
});

test("编辑器顶部在备份操作左侧显示同步完成度", async () => {
  const html = await readFile(new URL("../public/index.html", import.meta.url), "utf8");
  const app = await readFile(new URL("../public/app.mjs", import.meta.url), "utf8");
  const completionIndex = html.indexOf('id="topCompletionScore"');
  const backupIndex = html.indexOf("导入备份", completionIndex);
  assert.ok(completionIndex >= 0 && backupIndex > completionIndex);
  assert.match(app, /topCompletionScore:\s*document\.querySelector\("#topCompletionScore"\)/);
  assert.match(app, /elements\.topCompletionScore\.textContent\s*=\s*`\$\{score\}%`/);
});

test("切换草稿会重置 JD 工作区并阻止旧会话异步覆盖", async () => {
  const app = await readFile(new URL("../public/app.mjs", import.meta.url), "utf8");
  assert.match(app, /async function loadRemoteResume[\s\S]*?targetState\s*=\s*\{[^}]*diagnosis:\s*null[\s\S]*?resetTargetWorkspace\(\)/);
  assert.match(app, /const requestedResumeId\s*=\s*resume\.remoteId/);
  assert.match(app, /if \(resume\.remoteId !== requestedResumeId\) return/);
});

test("岗位修改被事实校验退回时显示持久醒目反馈而非短暂 toast", async () => {
  const app = await readFile(new URL("../public/app.mjs", import.meta.url), "utf8");
  const styles = await readFile(new URL("../public/styles.css", import.meta.url), "utf8");
  assert.match(app, /class="target-plan__feedback"[^>]+role="alert"/);
  assert.match(app, /item\.aiFeedback\s*=\s*proposal\.summary/);
  assert.match(app, /feedback\?\.scrollIntoView/);
  assert.doesNotMatch(app, /if \(!proposal\.changes\?\.length\)\s*\{?[^}]*showToast/);
  assert.match(styles, /\.target-plan__feedback\s*\{[^}]*border-left:\s*4px solid var\(--danger\)/);
  assert.doesNotMatch(styles, /\.target-plan__item\s*>\s*div:not\(\.target-plan__actions\)/);
  assert.match(styles, /\.target-plan__summary\s*\{[^}]*grid-template-columns:\s*22px 1fr/);
});
