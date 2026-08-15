// 在单进程内运行测试文件，规避沙箱下 `node --test` 派生子进程触发 EPERM 的限制。
// 用法：node scripts/run-tests-inprocess.mjs tests/admin-ops.test.mjs tests/auth.test.mjs
import { run } from "node:test";
import { spec } from "node:test/reporters";
import process from "node:process";
import { pathToFileURL } from "node:url";

const files = process.argv.slice(2);
for (const file of files) {
  await import(pathToFileURL(file).href);
}

const stream = run({ files: [], concurrency: 1 });
let failed = false;
stream.on("test:fail", () => {
  failed = true;
});
stream.compose(spec).pipe(process.stdout);
stream.once("end", () => {
  process.exitCode = failed ? 1 : 0;
});
