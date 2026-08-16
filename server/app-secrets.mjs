// 管理端可配置的外部服务密钥：加密落库，公开视图只给「是否已配置 + 脱敏提示」。

import { decryptSecret, encryptSecret, loadEncryptionKey, maskSecret } from "./ai/crypto.mjs";

// 白名单密钥键；value 为密文，hint 为脱敏展示。
export const SECRET_KEYS = [
  "aliyun_captcha_access_key_id",
  "aliyun_captcha_access_key_secret",
  "aliyun_captcha_scene_id",
  "aliyun_captcha_prefix",
  "smtp_host",
  "smtp_port",
  "smtp_secure",
  "smtp_user",
  "smtp_pass",
  "smtp_from",
  "aliyun_sms_access_key_id",
  "aliyun_sms_access_key_secret",
  "aliyun_sms_sign_name",
  "aliyun_sms_template_code"
];

// 这些键的值属于敏感信息，hint 用脱敏形式；其余键（host/端口/发件人/签名等）hint 直接展示原值。
const SENSITIVE_KEYS = new Set([
  "aliyun_captcha_access_key_secret",
  "smtp_pass",
  "aliyun_sms_access_key_secret"
]);

function hintFor(key, value) {
  if (!value) return "";
  return SENSITIVE_KEYS.has(key) ? maskSecret(value) : value;
}

export class AppSecretsService {
  constructor({ database, encryptionKey } = {}) {
    this.database = database;
    this.encryptionKey = encryptionKey || loadEncryptionKey();
    this.memory = new Map(); // key -> { value, hint }
  }

  async getAll() {
    const result = {};
    for (const key of SECRET_KEYS) {
      const record = await this.getRecord(key);
      result[key] = { set: Boolean(record?.value), hint: record?.hint || "" };
    }
    return result;
  }

  async getValue(key) {
    if (!SECRET_KEYS.includes(key)) return "";
    const record = await this.getRecord(key);
    return record?.value || "";
  }

  async getRecord(key) {
    if (this.database) {
      const result = await this.database.query("SELECT value_enc, value_hint FROM app_secrets WHERE key = $1", [key]);
      const row = result.rows[0];
      if (!row?.value_enc) return { value: "", hint: "" };
      try {
        return { value: decryptSecret(row.value_enc, this.encryptionKey), hint: row.value_hint || "" };
      } catch {
        return { value: "", hint: row.value_hint || "" };
      }
    }
    return this.memory.get(key) || { value: "", hint: "" };
  }

  // 空字符串 = 清除，undefined/缺省 = 保留现有值。
  async update(entries) {
    for (const [key, raw] of Object.entries(entries || {})) {
      if (!SECRET_KEYS.includes(key)) continue;
      const value = String(raw ?? "");
      const hint = hintFor(key, value);
      if (this.database) {
        if (!this.encryptionKey) throw new Error("未配置 AI_CONFIG_ENC_KEY，无法加密保存密钥");
        const enc = value ? encryptSecret(value, this.encryptionKey) : "";
        await this.database.query(
          `INSERT INTO app_secrets (key, value_enc, value_hint) VALUES ($1, $2, $3)
           ON CONFLICT (key) DO UPDATE SET value_enc = EXCLUDED.value_enc, value_hint = EXCLUDED.value_hint, updated_at = now()`,
          [key, enc, hint]
        );
      } else {
        this.memory.set(key, { value, hint });
      }
    }
  }
}
