const HTML_CSP = [
  "default-src 'self'",
  "img-src 'self' data: https:",
  "style-src 'self' 'unsafe-inline'",
  "script-src 'self'",
  "connect-src 'self'",
  "font-src 'self'",
  "frame-ancestors 'none'",
  "base-uri 'none'",
  "form-action 'self'"
].join("; ");

export function applySecurityHeaders(response, { html = false, secure = false } = {}) {
  response.setHeader("X-Content-Type-Options", "nosniff");
  response.setHeader("X-Frame-Options", "DENY");
  response.setHeader("Referrer-Policy", "no-referrer");
  response.setHeader("X-Permitted-Cross-Domain-Policies", "none");
  response.setHeader("Cross-Origin-Opener-Policy", "same-origin");
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
