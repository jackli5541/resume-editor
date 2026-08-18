export function createAdminApi({ readResponse, fetchImpl = fetch }) {
  const get = async (path) => readResponse(await fetchImpl(path, { cache: "no-store" }));
  const patch = async (path, body) => readResponse(await fetchImpl(path, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  }));

  return {
    loadConfig: () => get("/api/admin/config"),
    saveConfig: (config) => patch("/api/admin/config", config),
    loadAuthStatus: () => get("/api/admin/auth-status"),
    loadAuthSecrets: () => get("/api/admin/auth-secrets"),
    saveAuthSecrets: (secrets) => patch("/api/admin/auth-secrets", secrets)
  };
}
