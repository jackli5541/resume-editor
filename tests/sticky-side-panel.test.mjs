import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

test("桌面端简历状态栏粘在顶部并可独立滚动", async () => {
  const styles = await readFile(join("public", "styles.css"), "utf8");
  assert.match(styles, /@media screen and \(min-width:\s*901px\)[\s\S]*?\.side-panel\s*\{[\s\S]*?position:\s*sticky;[\s\S]*?top:\s*118px;[\s\S]*?max-height:\s*calc\(100dvh - 118px\);[\s\S]*?overflow-y:\s*auto;/);
  assert.match(styles, /@media screen and \(max-width:\s*900px\)[\s\S]*?\.side-panel\s*\{[\s\S]*?padding-top:\s*0;/);
});
