// 认证渠道（阿里云验证码 / SMTP / 阿里云短信）的运行时配置解析。
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

  async function aliyunCaptcha() {
    const flagEnabled = config ? (await config.get("captcha_enabled")) === true : false;
    const accessKeyId = pick(await secretValue("aliyun_captcha_access_key_id"), process.env.ALIYUN_CAPTCHA_ACCESS_KEY_ID);
    const accessKeySecret = pick(await secretValue("aliyun_captcha_access_key_secret"), process.env.ALIYUN_CAPTCHA_ACCESS_KEY_SECRET);
    const sceneId = pick(await secretValue("aliyun_captcha_scene_id"), process.env.ALIYUN_CAPTCHA_SCENE_ID);
    const prefix = pick(await secretValue("aliyun_captcha_prefix"), process.env.ALIYUN_CAPTCHA_PREFIX);
    return {
      enabled: flagEnabled && Boolean(accessKeyId) && Boolean(accessKeySecret) && Boolean(sceneId) && Boolean(prefix),
      accessKeyId, accessKeySecret, sceneId, prefix
    };
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

  return { aliyunCaptcha, smtp, aliyunSms };
}
