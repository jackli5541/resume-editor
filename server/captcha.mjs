// 阿里云验证码（Captcha 2.0）人机验证：服务端调用 VerifyIntelligentCaptcha 校验前端 captchaVerifyParam。
// 未配置 AccessKey / SceneId 时视为未启用，调用方应以「是否配置完整」作为开关。
// 签名方式与阿里云短信一致：RPC 风格 + HMAC-SHA1（V1.0）。

import { createHmac, randomUUID } from "node:crypto";

const ALIYUN_ENDPOINT = "https://captcha.cn-shanghai.aliyuncs.com/";

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

export async function verifyCaptchaToken(token, { accessKeyId, accessKeySecret, sceneId, ip = "", timeoutMs = 5000 } = {}) {
  if (!accessKeyId || !accessKeySecret || !sceneId || !token) return false;

  const params = {
    AccessKeyId: accessKeyId,
    Action: "VerifyIntelligentCaptcha",
    CaptchaVerifyParam: String(token),
    Format: "JSON",
    RegionId: "cn-shanghai",
    SceneId: sceneId,
    SignatureMethod: "HMAC-SHA1",
    SignatureNonce: randomUUID(),
    SignatureVersion: "1.0",
    Timestamp: new Date().toISOString().replace(/\.\d{3}Z$/, "Z"),
    Version: "2023-03-05"
  };

  const query = buildQuery(params);
  const signature = signAliyun(query, accessKeySecret);
  const body = `${query}&Signature=${percentEncode(signature)}`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(ALIYUN_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
      signal: controller.signal
    });
    if (!response.ok) return false;
    const data = await response.json().catch(() => null);
    // VerifyIntelligentCaptcha 成功时返回 Result.VerifyResult=true（VerifyCode=PASS）。
    return Boolean(data?.Result?.VerifyResult) || data?.Result?.VerifyCode === "PASS";
  } catch {
    // 网络异常/超时按失败处理，避免「验证服务不可用时放行」造成的绕过。
    return false;
  } finally {
    clearTimeout(timer);
  }
}
