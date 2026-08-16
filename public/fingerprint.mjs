// 轻量客户端设备指纹（L2）：canvas / WebGL / 字体采样 / 屏幕与语言信息生成稳定 deviceId。
// 结果缓存于 localStorage，随注册/登录请求经 X-Device-Id 头回传服务端，用于同人多账号检测。
// 自包含实现，不依赖外部脚本（兼容 CSP `script-src 'self'`），失败时降级为 FNV-1a 字符串哈希。

const STORAGE_KEY = "resume-device-id:v1";

function fnv1a(text) {
  let hash = 0x811c9dc5;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

function canvasHash() {
  try {
    const canvas = document.createElement("canvas");
    canvas.width = 240;
    canvas.height = 60;
    const ctx = canvas.getContext("2d");
    if (!ctx) return "";
    ctx.textBaseline = "top";
    ctx.font = "14px Arial";
    ctx.fillStyle = "#f60";
    ctx.fillRect(125, 1, 62, 20);
    ctx.fillStyle = "#069";
    ctx.fillText("resume-editor <canvas> 2d", 2, 15);
    ctx.fillStyle = "rgba(102, 204, 0, 0.7)";
    ctx.fillText("fingerprint", 4, 17);
    return canvas.toDataURL();
  } catch {
    return "";
  }
}

function webglInfo() {
  try {
    const canvas = document.createElement("canvas");
    const gl = canvas.getContext("webgl") || canvas.getContext("experimental-webgl");
    if (!gl) return "";
    const ext = gl.getExtension("WEBGL_debug_renderer_info");
    const renderer = ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER);
    const vendor = ext ? gl.getParameter(ext.UNMASKED_VENDOR_WEBGL) : gl.getParameter(gl.VENDOR);
    return `${renderer || ""}|${vendor || ""}`;
  } catch {
    return "";
  }
}

function fontFingerprint() {
  try {
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");
    if (!ctx) return "";
    const samples = [
      "Arial", "Helvetica", "Times New Roman", "Courier New", "Georgia", "Verdana",
      "SimSun", "Microsoft YaHei", "PingFang SC", "Segoe UI", "Roboto", "sans-serif", "monospace"
    ];
    const base = ["sans-serif", "serif", "monospace"];
    const width = (font) => {
      ctx.font = `72px '${font}'`;
      return ctx.measureText("mmmmmmmmmmlli").width.toFixed(1);
    };
    return samples.map((font) => `${font}:${base.map((fallback) => width(`${font.replaceAll("'", "")}', ${fallback}`)).join(",")}`).join("|");
  } catch {
    return "";
  }
}

function timezoneAndLocale() {
  let timezone = "";
  try {
    timezone = Intl.DateTimeFormat?.().resolvedOptions?.().timeZone || "";
  } catch {
    // 忽略
  }
  const languages = (navigator.languages || [navigator.language]).join(",");
  return `${timezone}|${languages}`;
}

async function sha256Hex(text) {
  if (globalThis.crypto?.subtle) {
    try {
      const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
      return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
    } catch {
      // 非安全上下文或实现不支持时降级。
    }
  }
  return fnv1a(text);
}

export async function getDeviceId() {
  try {
    const cached = localStorage.getItem(STORAGE_KEY);
    if (cached) return cached;
  } catch {
    // localStorage 不可用时忽略缓存。
  }

  const signals = [
    navigator.userAgent || "",
    navigator.platform || "",
    `${screen.width || 0}x${screen.height || 0}`,
    String(screen.colorDepth || 0),
    String(navigator.hardwareConcurrency || 0),
    String(navigator.deviceMemory || 0),
    navigator.maxTouchPoints != null ? String(navigator.maxTouchPoints) : "",
    timezoneAndLocale(),
    canvasHash(),
    webglInfo(),
    fontFingerprint()
  ].join("\n");

  const deviceId = await sha256Hex(signals);
  try {
    localStorage.setItem(STORAGE_KEY, deviceId);
  } catch {
    // 忽略写入失败。
  }
  return deviceId;
}
