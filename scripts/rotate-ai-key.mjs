// 主密钥轮换：用旧主密钥解密已存储的 API Key，再用新主密钥重新加密并写回。
// 用法（需 DATABASE_URL）：
//   $env:AI_CONFIG_ENC_KEY = "<旧主密钥>"
//   $env:AI_CONFIG_ENC_KEY_NEW = "<新主密钥>"
//   node scripts/rotate-ai-key.mjs
import { createDatabase } from "../server/database.mjs";
import { decryptSecret, encryptSecret, loadEncryptionKey } from "../server/ai/crypto.mjs";

const oldKey = loadEncryptionKey(process.env.AI_CONFIG_ENC_KEY);
const newKey = loadEncryptionKey(process.env.AI_CONFIG_ENC_KEY_NEW);

if (!oldKey) {
  console.error("AI_CONFIG_ENC_KEY 缺失或不是 32 字节（hex/base64）。");
  process.exitCode = 1;
}
if (!newKey) {
  console.error("AI_CONFIG_ENC_KEY_NEW 缺失或不是 32 字节（hex/base64）。");
  process.exitCode = 1;
}
if (!oldKey || !newKey) process.exit();

const database = createDatabase();
if (!database) {
  console.error("DATABASE_URL 未配置，无法轮换。");
  process.exit(1);
}

try {
  const result = await database.query("SELECT api_key_enc FROM ai_model_config WHERE id = 1");
  const enc = result.rows[0]?.api_key_enc || "";
  if (!enc) {
    console.log("未配置 API Key，无需轮换。");
    process.exit(0);
  }

  const plaintext = decryptSecret(enc, oldKey);
  const reencrypted = encryptSecret(plaintext, newKey);

  await database.query("UPDATE ai_model_config SET api_key_enc = $1, updated_at = now() WHERE id = 1", [reencrypted]);
  console.log("已用新主密钥重新加密 API Key。请同步更新部署环境中的 AI_CONFIG_ENC_KEY。");
} catch (error) {
  console.error("轮换失败:", error?.message || error);
  process.exitCode = 1;
} finally {
  await database.end().catch(() => {});
}
