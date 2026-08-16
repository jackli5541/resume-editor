// 认证渠道（Turnstile / SMTP / 阿里云短信）的运行时配置解析。
// 优先级：管理端配置（加密落库）> 环境变量；两者都未配置时该渠道视为未启用。

export function createAuthChannels({ secrets, config }) {
  async function secretValue(key) {
    if (!secrets) return "";
    try {
      return await secrets.getValue(key);
    } catch {
      return "";
    }
  }

  function pick(secret, env, fallback = "") {
    return secret || env || fallback;
  }

  async function turnstile() {
    const flagEnabled = config ? (await config.get("turnstile_enabled")) === true : false;
    const siteKey = pick(await secretValue("turnstile_site_key"), process.env.TURNSTILE_SITE_KEY);
    const secretKey = pick(await secretValue("turnstile_secret_key"), process.env.TURNSTILE_SECRET_KEY);
    return { enabled: flagEnabled && Boolean(siteKey) && Boolean(secretKey), siteKey, secretKey };
  }

  async function smtp() {
    const host = pick(await secretValue("smtp_host"), process.env.SMTP_HOST);
    const port = pick(await secretValue("smtp_port"), process.env.SMTP_PORT, "465");
    const secure = pick(await secretValue("smtp_secure"), process.env.SMTP_SECURE, "true") !== "false";
    const user = pick(await secretValue("smtp_user"), process.env.SMTP_USER);
    const pass = pick(await secretValue("smtp_pass"), process.env.SMTP_PASS);
    const from = pick(await secretValue("smtp_from"), process.env.SMTP_FROM);
    return {
      enabled: Boolean(host && user && pass && from),
      host, port, secure, user, pass, from
    };
  }

  async function aliyunSms() {
    const accessKeyId = pick(await secretValue("aliyun_sms_access_key_id"), process.env.ALIYUN_SMS_ACCESS_KEY_ID);
    const accessKeySecret = pick(await secretValue("aliyun_sms_access_key_secret"), process.env.ALIYUN_SMS_ACCESS_KEY_SECRET);
    const signName = pick(await secretValue("aliyun_sms_sign_name"), process.env.ALIYUN_SMS_SIGN_NAME);
    const templateCode = pick(await secretValue("aliyun_sms_template_code"), process.env.ALIYUN_SMS_TEMPLATE_CODE);
    return {
      enabled: Boolean(accessKeyId && accessKeySecret && signName && templateCode),
      accessKeyId, accessKeySecret, signName, templateCode
    };
  }

  return { turnstile, smtp, aliyunSms };
}
