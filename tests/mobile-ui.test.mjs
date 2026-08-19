import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("手机端 AI 工具菜单脱离横向滚动导航并限制在视口内", async () => {
  const styles = await readFile(new URL("../public/styles.css", import.meta.url), "utf8");
  const mobileStyles = styles.slice(styles.indexOf("@media screen and (max-width: 640px)", styles.indexOf("MOBILE SAFETY LAYER")));

  assert.match(mobileStyles, /\.library-header \.ai-tool-menu__panel\s*\{[^}]*position:\s*fixed;/s);
  assert.match(mobileStyles, /\.library-header \.ai-tool-menu__panel\s*\{[^}]*right:\s*12px;[^}]*left:\s*12px;/s);
  assert.match(mobileStyles, /\.library-header \.ai-tool-menu__panel\s*\{[^}]*width:\s*auto;[^}]*max-width:\s*360px;/s);
});
