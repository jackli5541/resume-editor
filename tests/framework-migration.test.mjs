import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("Vue migration bootstrap remains opt-in", async () => {
  const source = await readFile(new URL("../frontend/src/bootstrap.mjs", import.meta.url), "utf8");
  const html = await readFile(new URL("../public/index.html", import.meta.url), "utf8");

  assert.match(source, /data-vue-enabled/);
  assert.match(source, /enabled === true/);
  assert.doesNotMatch(html, /data-vue-enabled="true"/);
  assert.doesNotMatch(html, /assets\/vue\/bootstrap\.mjs/);
});

test("Vue build writes only to its isolated static asset directory", async () => {
  const config = await readFile(new URL("../frontend/vite.config.mjs", import.meta.url), "utf8");

  assert.match(config, /public\/assets\/vue\//);
  assert.match(config, /bootstrap\.mjs/);
  assert.match(config, /publicDir:\s*false/);
  assert.doesNotMatch(config, /publicRoot|public\/index\.html/);
});

test("production image builds Vue assets without shipping build dependencies", async () => {
  const dockerfile = await readFile(new URL("../Dockerfile", import.meta.url), "utf8");

  assert.match(dockerfile, /FROM node:22-bookworm-slim AS web-build/);
  assert.match(dockerfile, /RUN npm run build:web/);
  assert.match(dockerfile, /npm ci --omit=dev/);
  assert.match(dockerfile, /COPY --from=web-build \/build\/public\/assets\/vue \.\/public\/assets\/vue/);
});
