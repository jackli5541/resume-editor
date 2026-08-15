// 确保本地开发有可用的 AI 主密钥：优先用环境变量，其次复用 var/.ai-enc-key，否则生成并持久化。
// 仅供本地开发启动脚本（start.bat / start_dev.bat）使用；生产环境必须通过密钥系统注入 AI_CONFIG_ENC_KEY。
import { randomBytes } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const keyPath = join(root, "var", ".ai-enc-key");
const HEX64 = /^[0-9a-f]{64}$/i;

// 环境变量优先（不校验格式，交给 server/ai/crypto.mjs 的 loadEncryptionKey 把关）。
const fromEnv = String(process.env.AI_CONFIG_ENC_KEY || "").trim();
if (fromEnv) {
  console.log(fromEnv);
  process.exit(0);
}

// 复用上次生成并持久化的本地密钥，保证重启后仍能解密已保存的 API Key。
if (existsSync(keyPath)) {
  const saved = String(readFileSync(keyPath, "utf8")).trim();
  if (HEX64.test(saved)) {
    console.log(saved);
    process.exit(0);
  }
}

// 生成并持久化到 gitignore 的 var/ 目录。
const key = randomBytes(32).toString("hex");
mkdirSync(join(root, "var"), { recursive: true });
writeFileSync(keyPath, key, { encoding: "utf8" });
console.log(key);
