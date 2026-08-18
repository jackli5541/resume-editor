import { join, normalize, sep } from "node:path";

import { RequestValidationError } from "./validation.mjs";

export const contentTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".otf": "font/otf",
  ".ttf": "font/ttf",
  ".woff2": "font/woff2"
};

export function isPathWithin(root, candidate) {
  const base = normalize(root);
  const target = normalize(candidate);
  if (target === base) return true;
  const prefix = base.endsWith(sep) ? base : base + sep;
  return target.startsWith(prefix);
}

export function resolveStaticPath(publicRoot, urlPath) {
  const requested = urlPath === "/" ? "index.html" : urlPath.replace(/^\/+/, "");
  const resolved = normalize(join(publicRoot, requested));
  return isPathWithin(publicRoot, resolved) ? resolved : null;
}

export function sendJson(response, statusCode, value) {
  response.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff"
  });
  response.end(JSON.stringify(value));
}

export async function readJson(request, limit) {
  const declaredLength = Number.parseInt(request.headers["content-length"] || "0", 10);
  if (declaredLength > limit) throw new RequestValidationError("请求体超过 4 MB", 413);
  const chunks = [];
  let received = 0;
  for await (const chunk of request) {
    received += chunk.length;
    if (received > limit) throw new RequestValidationError("请求体超过 4 MB", 413);
    chunks.push(chunk);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw new RequestValidationError("请求体不是有效 JSON");
  }
}

export async function readBinary(request, limit) {
  const declaredLength = Number.parseInt(request.headers["content-length"] || "0", 10);
  if (declaredLength > limit) throw new RequestValidationError("图片超过 2 MB", 413);
  const chunks = [];
  let received = 0;
  for await (const chunk of request) {
    received += chunk.length;
    if (received > limit) throw new RequestValidationError("图片超过 2 MB", 413);
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}
