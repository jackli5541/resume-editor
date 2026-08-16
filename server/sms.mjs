// 短信发送：生产用阿里云短信（HTTP 直连 + HMAC-SHA1 签名）。
// 配置来源：构造时传入的 getConfig 异步回调（管理端配置 > 环境变量），
// 或未传时直接读环境变量；未配置时降级为「开发模式」——把验证码打到服务端日志。

import { createHmac, randomUUID } from "node:crypto";

const ALIYUN_ENDPOINT = "https://dysmsapi.aliyuncs.com/";

function percentEncode(value) {
  return encodeURIComponent(value)
    .replace(/\+/g, "%20")
    .replace(/\*/g, "%2A")
    .replace(/%7E/g, "~");
}

function buildQuery(params) {
  return Object.keys(params)
    .sort()
    .map((key) => `${percentEncode(key)}=${percentEncode(params[key])}`)
    .join("&");
}

function signAliyun(queryString, accessKeySecret) {
  const stringToSign = `POST&${percentEncode("/")}&${percentEncode(queryString)}`;
  return createHmac("sha1", `${accessKeySecret}&`).update(stringToSign).digest("base64");
}

function configFromEnv() {
  return {
    accessKeyId: process.env.ALIYUN_SMS_ACCESS_KEY_ID || "",
    accessKeySecret: process.env.ALIYUN_SMS_ACCESS_KEY_SECRET || "",
    signName: process.env.ALIYUN_SMS_SIGN_NAME || "",
    templateCode: process.env.ALIYUN_SMS_TEMPLATE_CODE || ""
  };
}

export class SmsService {
  constructor({ getConfig } = {}) {
    this.getConfig = getConfig;
  }

  async send(phone, code) {
    const cfg = this.getConfig ? await this.getConfig() : configFromEnv();
    const enabled = Boolean(cfg.accessKeyId && cfg.accessKeySecret && cfg.signName && cfg.templateCode);

    if (!enabled) {
      console.log(`[SMS dev] 验证码 ${code} -> ${phone}`);
      return { dev: true };
    }

    const params = {
      AccessKeyId: cfg.accessKeyId,
      Action: "SendSms",
      Format: "JSON",
      PhoneNumbers: String(phone),
      RegionId: "cn-hangzhou",
      SignName: cfg.signName,
      SignatureMethod: "HMAC-SHA1",
      SignatureNonce: randomUUID(),
      SignatureVersion: "1.0",
      TemplateCode: cfg.templateCode,
      TemplateParam: JSON.stringify({ code }),
      Timestamp: new Date().toISOString().replace(/\.\d{3}Z$/, "Z"),
      Version: "2017-05-25"
    };

    const query = buildQuery(params);
    const signature = signAliyun(query, cfg.accessKeySecret);
    const body = `${query}&Signature=${percentEncode(signature)}`;

    const response = await fetch(ALIYUN_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body
    });
    const data = await response.json().catch(() => null);
    if (data?.Code === "OK") return { ok: true };
    const error = new Error(data?.Message || "短信发送失败，请稍后再试");
    error.code = data?.Code;
    throw error;
  }
}
