import { isIP } from "node:net";
import { lookup } from "node:dns/promises";

export class UnsafeBaseUrlError extends Error {
  constructor(reason) {
    super(`模型服务地址不安全：${reason}`);
    this.name = "UnsafeBaseUrlError";
    this.code = "unsafe_base_url";
  }
}

// 判断 IP 是否属于私网/回环/链路本地/CGNAT/组播/保留等不可外连地址。
export function isPrivateIpAddress(address) {
  const value = String(address || "").trim();
  const version = isIP(value);
  if (version === 4) return isPrivateIpv4(value);
  if (version === 6) return isPrivateIpv6(value);
  return true; // 无法识别的地址一律视为不安全
}

function isPrivateIpv4(ip) {
  const parts = ip.split(".");
  if (parts.length !== 4 || parts.some((part) => !/^\d{1,3}$/.test(part))) return true;
  const [a, b, c] = parts.map(Number);
  if (a === 0 || a === 10 || a === 127) return true;
  if (a === 169 && b === 254) return true; // 链路本地 / 云元数据 169.254.169.254
  if (a === 172 && b >= 16 && b <= 31) return true; // 私网
  if (a === 192 && b === 168) return true; // 私网
  if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT 100.64.0.0/10
  if (a === 192 && b === 0 && (c === 0 || c === 2)) return true; // 文档/测试网段
  if (a === 198 && (b === 18 || b === 19)) return true; // 基准测试
  if (a >= 224) return true; // 组播/保留
  return false;
}

function isPrivateIpv6(ip) {
  const lower = ip.toLowerCase();
  if (lower === "::" || lower === "::1") return true;
  if (lower.startsWith("fc") || lower.startsWith("fd")) return true; // fc00::/7 唯一本地
  if (/^fe[89ab]/.test(lower)) return true; // fe80::/10 链路本地
  if (lower.startsWith("ff")) return true; // 组播
  const mapped = lower.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  if (mapped) return isPrivateIpv4(mapped[1]);
  return false;
}

// 结构校验：协议、凭据、端口、IP 字面量。不解析域名（由 assertSafeBaseUrlResolved 完成）。
export function assertSafeBaseUrl(value, options = {}) {
  const raw = String(value || "").trim();
  let url;
  try {
    url = new URL(raw);
  } catch {
    throw new UnsafeBaseUrlError("不是合法 URL");
  }

  const hostname = url.hostname.replace(/^\[|\]$/g, "");
  const allowHttpLocalhost = options.allowHttpLocalhost === true;
  const isLocalhost = hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1";

  if (url.protocol !== "https:" && !(url.protocol === "http:" && allowHttpLocalhost && isLocalhost)) {
    throw new UnsafeBaseUrlError("必须使用 HTTPS");
  }
  if (url.username || url.password) {
    throw new UnsafeBaseUrlError("地址不得包含用户名或密码");
  }
  if (url.port && !["80", "443"].includes(url.port)) {
    throw new UnsafeBaseUrlError("端口仅允许 80 或 443");
  }
  if (isIP(hostname) && isPrivateIpAddress(hostname) && !(allowHttpLocalhost && isLocalhost)) {
    throw new UnsafeBaseUrlError("地址指向内网或保留网段");
  }
  return url;
}

// 在结构校验基础上解析域名，并对解析出的地址逐一校验（防 DNS rebinding）。
export async function assertSafeBaseUrlResolved(value, options = {}) {
  const url = assertSafeBaseUrl(value, options);
  const hostname = url.hostname.replace(/^\[|\]$/g, "");
  if (isIP(hostname)) return url;

  let addresses;
  try {
    addresses = await lookup(hostname, { all: true, verbatim: true });
  } catch {
    throw new UnsafeBaseUrlError("域名无法解析");
  }
  if (!addresses.length) throw new UnsafeBaseUrlError("域名无法解析");
  for (const entry of addresses) {
    if (isPrivateIpAddress(entry.address)) {
      throw new UnsafeBaseUrlError("域名解析到内网地址");
    }
  }
  return url;
}
