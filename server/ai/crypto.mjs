import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

const KEY_BYTES = 32;
const IV_BYTES = 12;
const TAG_BYTES = 16;

// 主密钥只允许通过 AI_CONFIG_ENC_KEY 注入：32 字节，hex(64 字符) 或 base64 均可。
export function loadEncryptionKey(raw = process.env.AI_CONFIG_ENC_KEY) {
  const value = String(raw || "").trim();
  if (!value) return null;
  let key;
  if (/^[0-9a-f]{64}$/i.test(value)) {
    key = Buffer.from(value, "hex");
  } else {
    key = Buffer.from(value, "base64");
  }
  if (key.length !== KEY_BYTES) return null;
  return key;
}

export function isEncryptionKeyConfigured() {
  return loadEncryptionKey() !== null;
}

// 密文格式：base64(iv(12B) | authTag(16B) | ciphertext)
export function encryptSecret(plaintext, key = loadEncryptionKey()) {
  if (!key) throw new Error("未配置 AI_CONFIG_ENC_KEY，无法加密 API Key");
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([cipher.update(String(plaintext), "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, ciphertext]).toString("base64");
}

export function decryptSecret(encoded, key = loadEncryptionKey()) {
  const value = String(encoded || "").trim();
  if (!value) return "";
  if (!key) throw new Error("未配置 AI_CONFIG_ENC_KEY，无法解密 API Key");
  const raw = Buffer.from(value, "base64");
  if (raw.length < IV_BYTES + TAG_BYTES) return "";
  const iv = raw.subarray(0, IV_BYTES);
  const tag = raw.subarray(IV_BYTES, IV_BYTES + TAG_BYTES);
  const ciphertext = raw.subarray(IV_BYTES + TAG_BYTES);
  const decipher = createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");
}

export function maskSecret(plaintext) {
  const value = String(plaintext || "").trim();
  if (!value) return "";
  if (value.length <= 4) return "****";
  return `${value.slice(0, 3)}****${value.slice(-4)}`;
}
