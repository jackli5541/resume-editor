export const HTML_CSP = [
  "default-src 'self'",
  "object-src 'none'",
  "img-src 'self' data: https:",
  // 阿里云验证码：SDK 会动态加载 alicdn 的 JS / CSS / iframe 资源，故统一放行 *.alicdn.com。
  "style-src 'self' 'unsafe-inline' https://*.alicdn.com",
  "script-src 'self' https://*.alicdn.com",
  "script-src-attr 'none'",
  "frame-src https://*.alicdn.com https://*.aliyuncs.com https://*.aliyun.com",
  "connect-src 'self' https://*.alicdn.com https://*.aliyuncs.com https://*.aliyun.com",
  "font-src 'self' data: https://*.alicdn.com",
  "media-src 'self' data: blob:",
  "worker-src 'self' blob:",
  "manifest-src 'self'",
  "frame-ancestors 'none'",
  "base-uri 'none'",
  "form-action 'self'"
].join("; ");

export function applySecurityHeaders(response, { html = false, secure = false } = {}) {
  response.setHeader("X-Content-Type-Options", "nosniff");
  response.setHeader("X-Frame-Options", "DENY");
  response.setHeader("Referrer-Policy", "no-referrer");
  response.setHeader("X-Permitted-Cross-Domain-Policies", "none");
  response.setHeader("X-DNS-Prefetch-Control", "off");
  response.setHeader("Cross-Origin-Resource-Policy", "same-origin");
  response.setHeader("Cross-Origin-Opener-Policy", "same-origin");
  response.setHeader(
    "Permissions-Policy",
    "camera=(), microphone=(), geolocation=(), payment=(), usb=(), browsing-topics=()"
  );
  if (html) {
    response.setHeader("Content-Security-Policy", HTML_CSP);
  }
  if (secure) {
    response.setHeader("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
  }
}

export function isSecureRequest(request) {
  if (process.env.COOKIE_SECURE === "true") return true;
  return request.socket?.encrypted === true || request.headers["x-forwarded-proto"] === "https";
}

// 状态变更请求的 CSRF 防护：浏览器会携带 Sec-Fetch-Site / Origin。
// 显式跨站请求直接拒绝；未携带这些头（如服务端测试、curl）按同源放行。
export function isCrossSiteRequest(request) {
  const site = String(request.headers["sec-fetch-site"] || "").toLowerCase();
  if (site && site !== "same-origin" && site !== "none" && site !== "same-site") {
    return true;
  }
  const origin = request.headers.origin;
  const host = request.headers.host;
  if (origin && host) {
    try {
      return new URL(origin).host !== host;
    } catch {
      return true;
    }
  }
  return false;
}

export function getClientIp(request) {
  if (process.env.TRUST_PROXY === "true") {
    const forwarded = String(request.headers["x-forwarded-for"] || "")
      .split(",")[0]
      ?.trim();
    if (forwarded) return forwarded;
  }
  return request.socket?.remoteAddress || "unknown";
}
