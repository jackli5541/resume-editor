const resumeRoutePattern = /^\/resumes\/([0-9a-f-]+)\/edit\/?$/i;
const legalRouteNames = new Set(["privacy", "terms", "ai-notice", "data-deletion", "contact"]);

export function isLegalRoute(route) {
  return legalRouteNames.has(route?.name);
}

export function legalReturnTarget(value) {
  if (typeof value !== "string" || !value.startsWith("/") || value.startsWith("//")) return "/";
  let url;
  try {
    url = new URL(value, "https://qingjianli.local");
  } catch {
    return "/";
  }
  if (url.origin !== "https://qingjianli.local" || !isAppPath(url.pathname) || isLegalRoute(parseAppRoute(url.pathname))) return "/";
  return `${url.pathname}${url.search}${url.hash}`;
}

export function parseAppRoute(pathname) {
  const path = String(pathname || "/").replace(/\/{2,}/g, "/");
  if (path === "/" || path === "") return { name: "home" };
  if (path === "/templates" || path === "/templates/") return { name: "templates" };
  if (path === "/drafts" || path === "/drafts/") return { name: "drafts" };
  if (path === "/admin" || path === "/admin/") return { name: "admin" };
  if (path === "/login" || path === "/login/") return { name: "login" };
  if (path === "/ai" || path === "/ai/") return { name: "ai" };
  if (path === "/ai/optimize" || path === "/ai/optimize/") return { name: "ai-optimize" };
  if (path === "/ai/translate" || path === "/ai/translate/") return { name: "ai-translate" };
  if (path === "/editor" || path === "/editor/") return { name: "editor" };
  if (path === "/privacy" || path === "/privacy/") return { name: "privacy" };
  if (path === "/terms" || path === "/terms/") return { name: "terms" };
  if (path === "/ai-notice" || path === "/ai-notice/") return { name: "ai-notice" };
  if (path === "/data-deletion" || path === "/data-deletion/") return { name: "data-deletion" };
  if (path === "/contact" || path === "/contact/") return { name: "contact" };
  const match = path.match(resumeRoutePattern);
  if (match) return { name: "resume", resumeId: match[1].toLowerCase() };
  return { name: "home" };
}

const knownRoutePatterns = [
  /^\/(templates|drafts|admin|login|ai|editor|privacy|terms|ai-notice|data-deletion|contact)\/?$/i,
  /^\/ai\/(optimize|translate)\/?$/i,
  resumeRoutePattern
];

// 判断某个 pathname 是否属于本应用的界面路由（用于前端拦截导航，避免触发整页刷新）。
export function isAppPath(pathname) {
  const path = String(pathname || "/").replace(/\/{2,}/g, "/");
  if (path === "/" || path === "") return true;
  return knownRoutePatterns.some((pattern) => pattern.test(path));
}

export function routePath(route) {
  if (route.name === "home") return "/";
  if (route.name === "templates") return "/templates";
  if (route.name === "drafts") return "/drafts";
  if (route.name === "admin") return "/admin";
  if (route.name === "login") return "/login";
  if (route.name === "ai") return "/ai";
  if (route.name === "ai-optimize") return "/ai/optimize";
  if (route.name === "ai-translate") return "/ai/translate";
  if (isLegalRoute(route)) return `/${route.name}`;
  if (route.name === "resume" && route.resumeId) return `/resumes/${encodeURIComponent(route.resumeId)}/edit`;
  return "/editor";
}
