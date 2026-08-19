import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("顶部 AI 导航拆分为生成和翻译两个直达入口", async () => {
  const html = await readFile(new URL("../public/index.html", import.meta.url), "utf8");
  const styles = await readFile(new URL("../public/styles.css", import.meta.url), "utf8");
  assert.match(html, /<a[^>]+href="\/ai"[^>]*>AI 生成简历<\/a>/);
  assert.match(html, /<a[^>]+href="\/ai\/translate"[^>]*>AI 翻译简历<\/a>/);
  assert.doesNotMatch(html, />AI 简历工具</);
  assert.doesNotMatch(styles, /\.ai-tool-menu/);
});

test("首页展示四个 AI 入口和逐项决策承诺", async () => {
  const html = await readFile(new URL("../public/index.html", import.meta.url), "utf8");
  const styles = await readFile(new URL("../public/styles.css", import.meta.url), "utf8");
  assert.match(html, /class="home-tool-grid"/);
  for (const label of ["AI 生成简历", "按 JD 定制", "AI 精修简历", "AI 翻译简历"]) assert.match(html, new RegExp(label));
  assert.match(html, /href="\/templates\?aiMode=target"/);
  assert.match(html, /href="\/templates\?aiMode=optimize"/);
  assert.match(html, /逐项接受或拒绝/);
  assert.match(styles, /@media screen and \(max-width: 640px\)[\s\S]*?\.home-tool-grid\s*\{\s*grid-template-columns:\s*1fr;/);
});
