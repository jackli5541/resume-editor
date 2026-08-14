import { createReadStream } from "node:fs";
import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { dirname, extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";
import { checkDatabase, createDatabase } from "./server/database.mjs";
import { ExportService } from "./server/export-service.mjs";
import { renderPrintDocument } from "./server/print-document.mjs";
import { TemplateRepository } from "./server/template-repository.mjs";
import { RequestValidationError, validateExportPayload } from "./server/validation.mjs";

const publicRoot = fileURLToPath(new URL("./public/", import.meta.url));
const projectRoot = dirname(fileURLToPath(import.meta.url));
const defaultPort = Number.parseInt(process.env.PORT || "4173", 10);
const defaultHost = process.env.HOST || "127.0.0.1";
const defaultOutputDir = process.env.EXPORT_DIR || join(projectRoot, "var", "exports");
const defaultTemplateStorageDir = process.env.TEMPLATE_STORAGE_DIR || join(projectRoot, "var", "templates");
const maxRequestBytes = Number.parseInt(process.env.MAX_EXPORT_REQUEST_BYTES || "2097152", 10);
const allowedImageHosts = (process.env.EXPORT_IMAGE_HOSTS || "")
  .split(",")
  .map((value) => value.trim())
  .filter(Boolean);

const contentTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp"
};

function resolveStaticPath(urlPath) {
  const requested = urlPath === "/" ? "index.html" : urlPath.replace(/^\/+/, "");
  const resolved = normalize(join(publicRoot, requested));
  return resolved.startsWith(publicRoot) ? resolved : null;
}

function sendJson(response, statusCode, value) {
  response.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff"
  });
  response.end(JSON.stringify(value));
}

async function readJson(request) {
  const declaredLength = Number.parseInt(request.headers["content-length"] || "0", 10);
  if (declaredLength > maxRequestBytes) throw new RequestValidationError("请求体超过 2 MB", 413);
  const chunks = [];
  let received = 0;
  for await (const chunk of request) {
    received += chunk.length;
    if (received > maxRequestBytes) throw new RequestValidationError("请求体超过 2 MB", 413);
    chunks.push(chunk);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw new RequestValidationError("请求体不是有效 JSON");
  }
}

function sendExportFile(response, job) {
  const encodedName = encodeURIComponent(job.fileName);
  const contentType = job.format === "docx"
    ? "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    : "application/pdf";
  response.writeHead(200, {
    "Content-Type": contentType,
    "Content-Disposition": `attachment; filename="resume.${job.format}"; filename*=UTF-8''${encodedName}`,
    "Cache-Control": "private, no-store",
    "X-Content-Type-Options": "nosniff"
  });
  createReadStream(job.outputPath).pipe(response);
}

export function createAppServer(options = {}) {
  const database = options.database === undefined ? createDatabase() : options.database;
  const templateStorageDir = options.templateStorageDir || defaultTemplateStorageDir;
  const templateRepository = options.templateRepository || new TemplateRepository({
    database,
    storageDir: templateStorageDir
  });
  const service = new ExportService({
    outputDir: options.outputDir || defaultOutputDir,
    origin: options.origin,
    renderer: options.renderer,
    ttlMs: options.ttlMs,
    docxRenderer: options.docxRenderer,
    renderers: options.renderers
  });

  const server = createServer(async (request, response) => {
    const requestUrl = new URL(request.url || "/", "http://localhost");
    const pathname = requestUrl.pathname;

    if (request.method === "GET" && pathname === "/health") {
      const databaseStatus = await checkDatabase(database);
      sendJson(response, databaseStatus.configured && !databaseStatus.ok ? 503 : 200, {
        ok: !databaseStatus.configured || databaseStatus.ok,
        service: "resume-editor-mvp",
        exportWorker: "ready",
        database: databaseStatus
      });
      return;
    }

    if (request.method === "GET" && pathname === "/api/templates") {
      try {
        sendJson(response, 200, { templates: await templateRepository.list() });
      } catch (error) {
        sendJson(response, 503, { error: error?.message || "模板库不可用" });
      }
      return;
    }

    const templateMatch = pathname.match(/^\/api\/templates\/([a-z0-9-]+)$/i);
    if (request.method === "GET" && templateMatch) {
      const template = await templateRepository.get(templateMatch[1], Number(requestUrl.searchParams.get("version")) || null);
      if (!template) sendJson(response, 404, { error: "模板不存在" });
      else sendJson(response, 200, { template });
      return;
    }

    if (request.method === "POST" && pathname === "/api/resumes") {
      try {
        if (!String(request.headers["content-type"] || "").toLowerCase().startsWith("application/json")) {
          throw new RequestValidationError("Content-Type 必须是 application/json", 415);
        }
        const payload = await readJson(request);
        const template = await templateRepository.get(payload.templateSlug, Number(payload.templateVersion) || 1);
        if (!template) throw new RequestValidationError("模板不存在", 404);
        if ((template.status || "ready") !== "ready") throw new RequestValidationError("模板尚未完成字段映射，暂不能使用", 409);
        sendJson(response, 201, await templateRepository.createResume({
          templateSlug: template.slug,
          templateVersion: template.version,
          data: payload.data || {}
        }));
      } catch (error) {
        const statusCode = error instanceof RequestValidationError ? error.statusCode : 500;
        sendJson(response, statusCode, { error: error?.message || "创建简历失败" });
      }
      return;
    }

    if (request.method === "POST" && pathname === "/api/exports") {
      try {
        if (!String(request.headers["content-type"] || "").toLowerCase().startsWith("application/json")) {
          throw new RequestValidationError("Content-Type 必须是 application/json", 415);
        }
        const payload = validateExportPayload(await readJson(request), { allowedImageHosts });
        const template = await templateRepository.get(payload.template.slug, payload.template.version);
        if (!template) throw new RequestValidationError("导出模板不存在", 404);
        if ((template.status || "ready") !== "ready") {
          throw new RequestValidationError("该模板仍在适配中，暂不能导出", 409);
        }
        sendJson(response, 202, await service.create(payload));
      } catch (error) {
        const statusCode = error instanceof RequestValidationError ? error.statusCode : 500;
        sendJson(response, statusCode, { error: error?.message || "创建导出任务失败" });
      }
      return;
    }

    const statusMatch = pathname.match(/^\/api\/exports\/([0-9a-f-]+)$/i);
    if (request.method === "GET" && statusMatch) {
      const job = service.get(statusMatch[1], requestUrl.searchParams.get("token"));
      if (!job) sendJson(response, 404, { error: "导出任务不存在或已过期" });
      else sendJson(response, 200, service.toPublic(job));
      return;
    }

    const fileMatch = pathname.match(/^\/api\/exports\/([0-9a-f-]+)\/file$/i);
    if (request.method === "GET" && fileMatch) {
      const job = service.get(fileMatch[1], requestUrl.searchParams.get("token"));
      if (!job || job.status !== "completed") sendJson(response, 404, { error: "导出文件尚未生成或已过期" });
      else sendExportFile(response, job);
      return;
    }

    const printMatch = pathname.match(/^\/internal\/print\/([0-9a-f-]+)$/i);
    if (request.method === "GET" && printMatch) {
      const job = service.get(printMatch[1], requestUrl.searchParams.get("token"));
      if (!job) {
        response.writeHead(404);
        response.end("Not found");
      } else {
        response.writeHead(200, {
          "Content-Type": "text/html; charset=utf-8",
          "Cache-Control": "no-store",
          "Content-Security-Policy": "default-src 'self'; img-src 'self' data: https:; style-src 'self' 'unsafe-inline'; script-src 'self'; connect-src 'none'; frame-ancestors 'none'; base-uri 'none'",
          "X-Content-Type-Options": "nosniff",
          "X-Frame-Options": "DENY"
        });
        response.end(renderPrintDocument(job));
      }
      return;
    }

    if (request.method !== "GET" && request.method !== "HEAD") {
      sendJson(response, 405, { error: "Method not allowed" });
      return;
    }

    if (pathname.startsWith("/template-assets/")) {
      const relativePath = decodeURIComponent(pathname.slice("/template-assets/".length));
      const assetPath = normalize(join(templateStorageDir, relativePath));
      if (!assetPath.startsWith(normalize(templateStorageDir))) {
        response.writeHead(403);
        response.end("Forbidden");
        return;
      }
      try {
        const body = await readFile(assetPath);
        response.writeHead(200, {
          "Content-Type": contentTypes[extname(assetPath).toLowerCase()] || "application/octet-stream",
          "Cache-Control": "public, max-age=3600",
          "X-Content-Type-Options": "nosniff"
        });
        response.end(request.method === "HEAD" ? undefined : body);
      } catch {
        response.writeHead(404);
        response.end("Not found");
      }
      return;
    }

    if (pathname.startsWith("/api/") || pathname.startsWith("/internal/")) {
      sendJson(response, 404, { error: "Not found" });
      return;
    }

    let path = resolveStaticPath(pathname);
    if (!path) {
      response.writeHead(403);
      response.end("Forbidden");
      return;
    }

    try {
      if ((await stat(path)).isDirectory()) path = join(path, "index.html");
      const body = await readFile(path);
      response.writeHead(200, {
        "Content-Type": contentTypes[extname(path).toLowerCase()] || "application/octet-stream",
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff"
      });
      response.end(request.method === "HEAD" ? undefined : body);
    } catch {
      try {
        const body = await readFile(join(publicRoot, "index.html"));
        response.writeHead(200, {
          "Content-Type": "text/html; charset=utf-8",
          "Cache-Control": "no-store",
          "X-Content-Type-Options": "nosniff"
        });
        response.end(request.method === "HEAD" ? undefined : body);
      } catch {
        response.writeHead(404);
        response.end("Not found");
      }
    }
  });

  server.on("close", () => {
    service.dispose();
    database?.end().catch(() => {});
  });
  return { server, service, database, templateRepository };
}

export async function startServer(options = {}) {
  const listenPort = options.port ?? defaultPort;
  const listenHost = options.host ?? defaultHost;
  const app = createAppServer(options);
  await new Promise((resolve, reject) => {
    app.server.once("error", reject);
    app.server.listen(listenPort, listenHost, resolve);
  });
  const address = app.server.address();
  const actualPort = typeof address === "object" ? address.port : listenPort;
  const origin = options.origin || `http://${listenHost}:${actualPort}`;
  app.service.setOrigin(origin);
  console.log(`Resume editor running at ${origin}`);
  return { ...app, origin };
}

if (process.argv[1] && normalize(process.argv[1]) === normalize(fileURLToPath(import.meta.url))) {
  startServer().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
