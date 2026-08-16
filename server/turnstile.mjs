// Cloudflare Turnstile 人机验证：服务端用 secret key 调 siteverify 校验前端 token。
// 未配置 secret key 时（本地/测试）不启用，调用方应以「是否配置 secret」作为开关。

const SITEVERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";

export async function verifyTurnstileToken(token, { secretKey, ip = "", timeoutMs = 5000 } = {}) {
  if (!secretKey || !token) return false;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(SITEVERIFY_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        secret: secretKey,
        response: String(token),
        ...(ip ? { remoteip: ip } : {})
      }),
      signal: controller.signal
    });
    if (!response.ok) return false;
    const data = await response.json().catch(() => null);
    return Boolean(data?.success);
  } catch {
    // 网络异常/超时按失败处理，避免「验证服务不可用时放行」造成的绕过。
    return false;
  } finally {
    clearTimeout(timer);
  }
}
