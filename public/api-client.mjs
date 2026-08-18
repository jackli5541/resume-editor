export async function readApiResponse(response, { onUnauthorized } = {}) {
  const payload = await response.json().catch(() => ({}));
  if (response.ok) return payload;

  if (response.status === 401) onUnauthorized?.();
  const error = new Error(payload.error || `服务请求失败 (${response.status})`);
  error.status = response.status;
  throw error;
}

export async function requestJson(path, options = {}, hooks = {}) {
  const headers = new Headers(options.headers || {});
  if (options.body !== undefined && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  const response = await fetch(path, { ...options, headers });
  return readApiResponse(response, hooks);
}
