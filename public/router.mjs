const resumeRoutePattern = /^\/resumes\/([0-9a-f-]+)\/edit\/?$/i;

export function parseAppRoute(pathname) {
  const path = String(pathname || "/").replace(/\/{2,}/g, "/");
  if (path === "/" || path === "") return { name: "home" };
  if (path === "/templates" || path === "/templates/") return { name: "templates" };
  if (path === "/drafts" || path === "/drafts/") return { name: "drafts" };
  if (path === "/admin" || path === "/admin/") return { name: "admin" };
  if (path === "/login" || path === "/login/") return { name: "login" };
  if (path === "/ai" || path === "/ai/") return { name: "ai" };
  if (path === "/ai/translate" || path === "/ai/translate/") return { name: "ai-translate" };
  if (path === "/editor" || path === "/editor/") return { name: "editor" };
  const match = path.match(resumeRoutePattern);
  if (match) return { name: "resume", resumeId: match[1].toLowerCase() };
  return { name: "home" };
}

const knownRoutePatterns = [
  /^\/(templates|drafts|admin|login|ai|editor)\/?$/i,
  /^\/ai\/translate\/?$/i,
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
  if (route.name === "ai-translate") return "/ai/translate";
  if (route.name === "resume" && route.resumeId) return `/resumes/${encodeURIComponent(route.resumeId)}/edit`;
  return "/editor";
}
