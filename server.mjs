import { createReadStream } from "node:fs";
import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { dirname, extname, join, normalize, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { checkDatabase, createDatabase } from "./server/database.mjs";
import { ExportService } from "./server/export-service.mjs";
import { renderPrintDocument } from "./server/print-document.mjs";
import { PreviewService } from "./server/preview-service.mjs";
import { TemplateRepository } from "./server/template-repository.mjs";
import { RequestValidationError, validateExportPayload } from "./server/validation.mjs";
import { BullExportService, BullPreviewService, createRedisConnection } from "./server/bull-services.mjs";
import { getObject } from "./server/object-storage.mjs";
import { AuthError, AuthService, parseCookies } from "./server/auth.mjs";
import { RateLimiter, RedisRateLimiter, clientKey } from "./server/rate-limit.mjs";
import { applySecurityHeaders, getClientIp, isCrossSiteRequest, isSecureRequest } from "./server/security.mjs";
import { seedTestUsers } from "./server/seed-users.mjs";
import { AiGenerationService } from "./server/ai/service.mjs";
import { AiConfigRepository } from "./server/ai/config-repository.mjs";
import { AiProvider } from "./server/ai/provider.mjs";
import { AiAuditLog } from "./server/ai/audit.mjs";
import { AiQuotaService } from "./server/ai/quota.mjs";
import { assertSafeBaseUrl } from "./server/ai/url-guard.mjs";
import { AdminAuditLog } from "./server/audit.mjs";
import { can, isSuperAdmin } from "./server/permissions.mjs";
import { EventLog } from "./server/events.mjs";
import { AnnouncementRepository, MessageRepository } from "./server/messaging.mjs";
import { FeedbackRepository } from "./server/feedback.mjs";
import { MetricsService } from "./server/metrics.mjs";
import { sendCsv } from "./server/csv.mjs";
import { AppConfigService, configSchema } from "./server/config.mjs";
import { AlertService } from "./server/alerts.mjs";

const publicRoot = fileURLToPath(new URL("./public/", import.meta.url));
const projectRoot = dirname(fileURLToPath(import.meta.url));
const defaultPort = Number.parseInt(process.env.PORT || "4173", 10);
const defaultHost = process.env.HOST || "127.0.0.1";
const defaultOutputDir = process.env.EXPORT_DIR || join(projectRoot, "var", "exports");
const defaultPreviewDir = process.env.PREVIEW_DIR || join(projectRoot, "var", "previews");
const defaultTemplateStorageDir = process.env.TEMPLATE_STORAGE_DIR || join(projectRoot, "var", "templates");
const maxRequestBytes = Number.parseInt(process.env.MAX_EXPORT_REQUEST_BYTES || "2097152", 10);
const allowedImageHosts = (process.env.EXPORT_IMAGE_HOSTS || "")
  .split(",")
  .map((value) => value.trim())
  .filter(Boolean);

const DEFAULT_SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const adminEmails = (process.env.ADMIN_EMAILS || "")
  .split(",")
  .map((value) => value.trim())
  .filter(Boolean);
const adminPhones = (process.env.ADMIN_PHONES || "")
  .split(",")
  .map((value) => value.trim())
  .filter(Boolean);

function errorStatusOf(error) {
  if (error instanceof RequestValidationError || error instanceof AuthError) {
    return error.statusCode;
  }
  if (error && Number.isSafeInteger(error.statusCode)) {
    return error.statusCode;
  }
  return 500;
}

async function rejectIfLimited(response, limiter, key, options) {
  const result = await limiter.check(key, options);
  if (result.allowed) return false;
  response.writeHead(429, {
    "Content-Type": "application/json; charset=utf-8",
    "Retry-After": String(result.retryAfterSeconds),
    "X-Content-Type-Options": "nosniff"
  });
  response.end(JSON.stringify({ error: "请求过于频繁，请稍后再试" }));
  return true;
}

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

function isPathWithin(root, candidate) {
  const base = normalize(root);
  const target = normalize(candidate);
  if (target === base) return true;
  const prefix = base.endsWith(sep) ? base : base + sep;
  return target.startsWith(prefix);
}

function resolveStaticPath(urlPath) {
  const requested = urlPath === "/" ? "index.html" : urlPath.replace(/^\/+/, "");
  const resolved = normalize(join(publicRoot, requested));
  return isPathWithin(publicRoot, resolved) ? resolved : null;
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

async function sendExportFile(response, job) {
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
  if (job.objectKey) {
    const object = await getObject(job.objectKey);
    object.Body.pipe(response);
  } else {
    createReadStream(job.outputPath).pipe(response);
  }
}

export function createAppServer(options = {}) {
  const database = options.database === undefined ? createDatabase() : options.database;
  const fidelityPreviewDisabled = options.disableFidelityPreview
    ?? process.env.DISABLE_FIDELITY_PREVIEW === "true";
  const templateStorageDir = options.templateStorageDir || defaultTemplateStorageDir;
  const templateRepository = options.templateRepository || new TemplateRepository({
    database,
    storageDir: templateStorageDir
  });
  const redisEnabled = Boolean(process.env.REDIS_URL) && options.useRedis !== false;
  const service = redisEnabled ? new BullExportService({
    connection: createRedisConnection(),
    outputDir: options.outputDir || defaultOutputDir
  }) : new ExportService({
    outputDir: options.outputDir || defaultOutputDir,
    origin: options.origin,
    renderer: options.renderer,
    ttlMs: options.ttlMs,
    docxRenderer: options.docxRenderer,
    renderers: options.renderers
  });
  const previewService = redisEnabled ? new BullPreviewService({
    connection: createRedisConnection(),
    outputDir: options.previewDir || defaultPreviewDir
  }) : new PreviewService({
    outputDir: options.previewDir || defaultPreviewDir,
    renderer: options.previewRenderer,
    ttlMs: options.ttlMs
  });

  const aiConfigRepository = options.aiConfigRepository
    || options.aiService?.configRepository
    || new AiConfigRepository({ database });
  const aiAuditLog = options.aiAuditLog || options.aiService?.auditLog || new AiAuditLog({ database });
  const adminAuditLog = options.adminAuditLog || new AdminAuditLog({ database });
  const eventLog = options.eventLog || new EventLog({ database });
  const announcements = options.announcements || new AnnouncementRepository({ database });
  const messages = options.messages || new MessageRepository({ database });
  const feedbacks = options.feedbacks || new FeedbackRepository({ database });
  const metrics = options.metrics || new MetricsService({ database });
  const configService = options.configService || new AppConfigService({ database });

  const getQueueStats = async () => {
    let exportFailed = 0;
    let previewFailed = 0;
    if (typeof service.queue?.getJobCounts === "function") {
      exportFailed = (await service.queue.getJobCounts()).failed || 0;
    } else {
      for (const job of service.jobs?.values?.() || []) if (job.status === "failed") exportFailed += 1;
    }
    if (typeof previewService.queue?.getJobCounts === "function") {
      previewFailed = (await previewService.queue.getJobCounts()).failed || 0;
    } else {
      for (const job of previewService.jobs?.values?.() || []) if (job.status === "failed") previewFailed += 1;
    }
    return { exportFailed, previewFailed };
  };
  const alertService = options.alertService || new AlertService({
    database,
    getQueueStats,
    webhookUrl: process.env.ALERT_WEBHOOK_URL || ""
  });
  const alertIntervalMs = Number.parseInt(process.env.ALERT_CHECK_INTERVAL_MS || "60000", 10);
  const alertTimer = setInterval(() => {
    alertService.check().catch(() => {});
  }, Math.max(alertIntervalMs, 10000));
  alertTimer.unref();
  const aiService = options.aiService || new AiGenerationService({
    configRepository: aiConfigRepository,
    provider: options.aiProvider || new AiProvider(),
    auditLog: aiAuditLog,
    quota: options.aiQuota || new AiQuotaService({
      database,
      dailyLimit: Number.parseInt(process.env.AI_USER_DAILY_LIMIT || "20", 10)
    }),
    maxConcurrency: Number.parseInt(process.env.AI_MAX_CONCURRENCY || "2", 10)
  });

  const requireAuth = options.requireAuth !== false;
  const authService = options.authService || new AuthService({
    database,
    sessionTtlMs: options.sessionTtlMs
      || Number.parseInt(process.env.SESSION_TTL_DAYS || "30", 10) * 24 * 60 * 60 * 1000,
    adminEmails: options.adminEmails || adminEmails,
    adminPhones: options.adminPhones || adminPhones
  });
  const sessionTtlMs = authService.sessionTtlMs;
  const disableRegistration = options.disableRegistration ?? process.env.DISABLE_REGISTRATION === "true";
  const redisConnection = redisEnabled ? service.connection : null;
  const loginLimiter = redisConnection ? new RedisRateLimiter(redisConnection) : new RateLimiter();
  const registerLimiter = redisConnection ? new RedisRateLimiter(redisConnection) : new RateLimiter();
  const apiLimiter = redisConnection ? new RedisRateLimiter(redisConnection) : new RateLimiter();

  function setSessionCookie(response, token, maxAgeMs, secure) {
    const parts = [
      `${authService.cookieName}=${encodeURIComponent(token)}`,
      "HttpOnly",
      "SameSite=Lax",
      "Path=/",
      `Max-Age=${Math.floor(maxAgeMs / 1000)}`
    ];
    if (secure) parts.push("Secure");
    response.setHeader("Set-Cookie", parts.join("; "));
  }

  function clearSessionCookie(response, secure) {
    const parts = [
      `${authService.cookieName}=`,
      "HttpOnly",
      "SameSite=Lax",
      "Path=/",
      "Max-Age=0"
    ];
    if (secure) parts.push("Secure");
    response.setHeader("Set-Cookie", parts.join("; "));
  }

  async function currentUser(request) {
    const cookies = parseCookies(request);
    return authService.getUserBySession(cookies[authService.cookieName]);
  }

  async function authorize(request) {
    const user = await currentUser(request);
    if (requireAuth && !user) throw new AuthError("请先登录", 401);
    return user;
  }

  async function requireAdmin(request) {
    const user = await authorize(request);
    if (!user?.isAdmin) throw new AuthError("需要管理员权限", 403);
    return user;
  }

  async function requirePermission(request, permission) {
    const admin = await requireAdmin(request);
    if (!can(admin, permission)) throw new AuthError("无此操作权限", 403);
    return admin;
  }

  function recordAudit(request, admin, action, targetType, targetId = null, before = null, after = null) {
    return adminAuditLog.record({
      actorId: admin?.id ?? null,
      action,
      targetType,
      targetId,
      before,
      after,
      ip: getClientIp(request),
      userAgent: request.headers["user-agent"] || null
    });
  }

  const server = createServer(async (request, response) => {
    const requestUrl = new URL(request.url || "/", "http://localhost");
    const pathname = requestUrl.pathname;
    const secure = isSecureRequest(request);
    applySecurityHeaders(response, { secure });

    if (request.method !== "GET" && request.method !== "HEAD" && isCrossSiteRequest(request)) {
      sendJson(response, 403, { error: "跨站请求被拒绝" });
      return;
    }

    // 维护模式：非 GET 请求（排除鉴权接口）对非管理员返回 503。
    if (request.method !== "GET" && request.method !== "HEAD" && !pathname.startsWith("/api/auth/")) {
      if ((await configService.get("maintenance_mode")) === true) {
        const maintenanceUser = await currentUser(request);
        if (!maintenanceUser?.isAdmin) {
          sendJson(response, 503, { error: "系统维护中，请稍后再试" });
          return;
        }
      }
    }

    if (request.method === "GET" && pathname === "/health") {
      const databaseStatus = await checkDatabase(database);
      let ai = { configured: false, enabled: false };
      try {
        const config = await aiConfigRepository.get();
        ai = { configured: Boolean(config.apiKeySet), enabled: Boolean(config.enabled), model: config.model || null };
      } catch {
        // AI 状态读取失败不影响健康检查主结果。
      }
      sendJson(response, databaseStatus.configured && !databaseStatus.ok ? 503 : 200, {
        ok: !databaseStatus.configured || databaseStatus.ok,
        service: "resume-editor-mvp",
        exportWorker: "ready",
        database: databaseStatus,
        ai
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

    if (request.method === "POST" && pathname === "/api/auth/register") {
      try {
        if (disableRegistration || (await configService.get("registration_enabled")) === false) {
          throw new AuthError("注册已关闭", 403);
        }
        if (!String(request.headers["content-type"] || "").toLowerCase().startsWith("application/json")) {
          throw new AuthError("Content-Type 必须是 application/json", 415);
        }
        const ip = getClientIp(request);
        if (await rejectIfLimited(response, registerLimiter, clientKey(ip, "register"), { limit: 10, windowMs: 60 * 60 * 1000 })) return;
        const payload = await readJson(request);
        const identifier = String(payload?.identifier || "").trim();
        const isEmail = identifier.includes("@");
        const user = await authService.createUser({
          email: isEmail ? identifier : "",
          phone: isEmail ? "" : identifier,
          password: payload?.password,
          displayName: payload?.displayName
        });
        const session = await authService.createSession(user.id);
        setSessionCookie(response, session.token, sessionTtlMs, secure);
        await eventLog.record({ userId: user.id, event: "register" });
        sendJson(response, 201, { user });
      } catch (error) {
        sendJson(response, errorStatusOf(error), { error: error?.message || "注册失败" });
      }
      return;
    }

    if (request.method === "POST" && pathname === "/api/auth/login") {
      try {
        if (!String(request.headers["content-type"] || "").toLowerCase().startsWith("application/json")) {
          throw new AuthError("Content-Type 必须是 application/json", 415);
        }
        const ip = getClientIp(request);
        if (await rejectIfLimited(response, loginLimiter, clientKey(ip, "login"), { limit: 30, windowMs: 15 * 60 * 1000 })) return;
        const payload = await readJson(request);
        const identifier = String(payload?.identifier || "").trim().toLowerCase();
        if (await rejectIfLimited(response, loginLimiter, clientKey(ip, `login:${identifier}`), { limit: 5, windowMs: 15 * 60 * 1000 })) return;
        const user = await authService.verifyCredentials(payload?.identifier, payload?.password);
        const session = await authService.createSession(user.id);
        setSessionCookie(response, session.token, sessionTtlMs, secure);
        await eventLog.record({ userId: user.id, event: "login" });
        sendJson(response, 200, { user });
      } catch (error) {
        sendJson(response, errorStatusOf(error), { error: error?.message || "登录失败" });
      }
      return;
    }

    if (request.method === "POST" && pathname === "/api/auth/logout") {
      try {
        const cookies = parseCookies(request);
        await authService.destroySession(cookies[authService.cookieName]);
        clearSessionCookie(response, secure);
        sendJson(response, 200, { ok: true });
      } catch (error) {
        sendJson(response, errorStatusOf(error), { error: error?.message || "退出失败" });
      }
      return;
    }

    if (request.method === "GET" && pathname === "/api/auth/session") {
      try {
        const user = await currentUser(request);
        sendJson(response, 200, { user: user || null });
      } catch (error) {
        sendJson(response, 500, { error: error?.message || "读取会话失败" });
      }
      return;
    }

    if (request.method === "PATCH" && pathname === "/api/me") {
      try {
        const user = await currentUser(request);
        if (!user) throw new AuthError("请先登录", 401);
        if (!String(request.headers["content-type"] || "").toLowerCase().startsWith("application/json")) {
          throw new AuthError("Content-Type 必须是 application/json", 415);
        }
        const payload = await readJson(request);
        const updated = await authService.updateUser(user.id, {
          displayName: payload?.displayName,
          settings: payload?.settings
        });
        sendJson(response, 200, { user: updated });
      } catch (error) {
        sendJson(response, errorStatusOf(error), { error: error?.message || "更新设置失败" });
      }
      return;
    }

    if (request.method === "GET" && pathname === "/api/admin/users") {
      try {
        await requirePermission(request, "users.read");
        const format = requestUrl.searchParams.get("format") || "";
        const limit = format === "csv" ? 10000 : Number.parseInt(requestUrl.searchParams.get("limit") || "200", 10);
        const offset = Number.parseInt(requestUrl.searchParams.get("offset") || "0", 10);
        const search = requestUrl.searchParams.get("search") || "";
        const role = requestUrl.searchParams.get("role") || "";
        const status = requestUrl.searchParams.get("status") || "";
        const from = requestUrl.searchParams.get("from") || "";
        const to = requestUrl.searchParams.get("to") || "";
        const result = await authService.listUsers({ limit, offset, search, role, status, from, to });
        if (format === "csv") {
          sendCsv(response, "users.csv",
            ["email", "phone", "displayName", "role", "disabled", "draftCount", "createdAt"],
            result.users.map((u) => ({
              email: u.email, phone: u.phone, displayName: u.displayName,
              role: u.role || "user", disabled: u.disabled ? "true" : "false",
              draftCount: u.draftCount ?? 0, createdAt: u.createdAt
            }))
          );
          return;
        }
        sendJson(response, 200, result);
      } catch (error) {
        sendJson(response, errorStatusOf(error), { error: error?.message || "读取用户失败" });
      }
      return;
    }

    const adminUserMatch = pathname.match(/^\/api\/admin\/users\/([0-9a-f-]{36})$/i);
    if (request.method === "PATCH" && adminUserMatch) {
      try {
        const admin = await requirePermission(request, "users.write");
        const targetId = adminUserMatch[1];
        if (targetId === admin.id) throw new AuthError("不能修改自己的管理员状态", 400);
        if (!String(request.headers["content-type"] || "").toLowerCase().startsWith("application/json")) {
          throw new AuthError("Content-Type 必须是 application/json", 415);
        }
        const payload = await readJson(request);
        const existing = await authService.getUserById(targetId);
        if (!existing) throw new AuthError("用户不存在", 404);
        if (isSuperAdmin(existing) && !isSuperAdmin(admin)) throw new AuthError("无权操作超级管理员", 403);
        if (payload?.role !== undefined && !isSuperAdmin(admin)) throw new AuthError("仅超级管理员可设置角色", 403);
        const before = { isAdmin: Boolean(existing.isAdmin), disabled: Boolean(existing.disabled), role: existing.role ?? null };
        if (payload?.isAdmin !== undefined) await authService.setUserAdmin(targetId, payload.isAdmin);
        if (payload?.role !== undefined) await authService.setUserRole(targetId, payload.role);
        if (payload?.disabled !== undefined) await authService.setUserDisabled(targetId, payload.disabled);
        const user = authService.toPublicUser(await authService.getUserById(targetId));
        await recordAudit(request, admin, "user.update", "user", targetId, before, {
          isAdmin: Boolean(user.isAdmin), disabled: Boolean(user.disabled), role: user.role ?? null
        });
        sendJson(response, 200, { user });
      } catch (error) {
        sendJson(response, errorStatusOf(error), { error: error?.message || "更新用户失败" });
      }
      return;
    }

    if (request.method === "DELETE" && adminUserMatch) {
      try {
        const admin = await requirePermission(request, "users.delete");
        const targetId = adminUserMatch[1];
        if (targetId === admin.id) throw new AuthError("不能删除自己的账户", 400);
        const existing = await authService.getUserById(targetId);
        if (!existing) throw new AuthError("用户不存在", 404);
        if (isSuperAdmin(existing) && !isSuperAdmin(admin)) throw new AuthError("无权删除超级管理员", 403);
        await authService.deleteUser(targetId);
        await templateRepository.softDeleteByOwner(targetId);
        await recordAudit(request, admin, "user.delete", "user", targetId);
        response.writeHead(204, {
          "Cache-Control": "no-store",
          "X-Content-Type-Options": "nosniff"
        });
        response.end();
      } catch (error) {
        sendJson(response, errorStatusOf(error), { error: error?.message || "删除用户失败" });
      }
      return;
    }

    const adminUserRevokeMatch = pathname.match(/^\/api\/admin\/users\/([0-9a-f-]{36})\/revoke-sessions$/i);
    if (request.method === "POST" && adminUserRevokeMatch) {
      try {
        const admin = await requirePermission(request, "sessions.manage");
        const targetId = adminUserRevokeMatch[1];
        const target = await authService.getUserById(targetId);
        if (!target) throw new AuthError("用户不存在", 404);
        if (isSuperAdmin(target) && !isSuperAdmin(admin)) throw new AuthError("无权操作超级管理员", 403);
        await authService.destroyUserSessions(targetId);
        await recordAudit(request, admin, "user.revoke_sessions", "user", targetId);
        sendJson(response, 200, { ok: true });
      } catch (error) {
        sendJson(response, errorStatusOf(error), { error: error?.message || "踢下线失败" });
      }
      return;
    }

    if (request.method === "GET" && pathname === "/api/admin/resumes") {
      try {
        await requirePermission(request, "resumes.read");
        const format = requestUrl.searchParams.get("format") || "";
        const limit = format === "csv" ? 10000 : Number.parseInt(requestUrl.searchParams.get("limit") || "200", 10);
        const offset = Number.parseInt(requestUrl.searchParams.get("offset") || "0", 10);
        const search = requestUrl.searchParams.get("search") || "";
        const template = requestUrl.searchParams.get("template") || "";
        const from = requestUrl.searchParams.get("from") || "";
        const to = requestUrl.searchParams.get("to") || "";
        const result = await templateRepository.listAllResumes({ limit, offset, search, template, from, to });
        if (format === "csv") {
          sendCsv(response, "resumes.csv",
            ["candidateName", "title", "ownerIdentifier", "templateName", "templateVersion", "updatedAt"],
            result.resumes.map((r) => ({
              candidateName: r.candidateName, title: r.title,
              ownerIdentifier: r.ownerIdentifier || "", templateName: r.templateName,
              templateVersion: r.templateVersion, updatedAt: r.updatedAt
            }))
          );
          return;
        }
        sendJson(response, 200, result);
      } catch (error) {
        sendJson(response, errorStatusOf(error), { error: error?.message || "读取草稿失败" });
      }
      return;
    }

    const adminResumeMatch = pathname.match(/^\/api\/admin\/resumes\/([0-9a-f-]{36})$/i);
    if (request.method === "GET" && adminResumeMatch) {
      try {
        await requirePermission(request, "resumes.read");
        const draft = await templateRepository.getResume(adminResumeMatch[1]);
        if (!draft) sendJson(response, 404, { error: "简历草稿不存在" });
        else {
          const template = typeof templateRepository.get === "function"
            ? await templateRepository.get(draft.templateSlug, draft.templateVersion)
            : null;
          sendJson(response, 200, { resume: { ...draft, editorSchema: template?.editorSchema || null } });
        }
      } catch (error) {
        sendJson(response, errorStatusOf(error), { error: error?.message || "读取草稿失败" });
      }
      return;
    }

    if (request.method === "DELETE" && adminResumeMatch) {
      try {
        const admin = await requirePermission(request, "resumes.delete");
        const deleted = await templateRepository.deleteResume(adminResumeMatch[1]);
        if (!deleted) sendJson(response, 404, { error: "简历草稿不存在" });
        else {
          await recordAudit(request, admin, "resume.delete", "resume", adminResumeMatch[1]);
          response.writeHead(204, {
            "Cache-Control": "no-store",
            "X-Content-Type-Options": "nosniff"
          });
          response.end();
        }
      } catch (error) {
        sendJson(response, errorStatusOf(error), { error: error?.message || "删除草稿失败" });
      }
      return;
    }

    if (request.method === "GET" && pathname === "/api/admin/ai-config") {
      try {
        await requirePermission(request, "ai_config.read");
        sendJson(response, 200, { config: await aiConfigRepository.get() });
      } catch (error) {
        sendJson(response, errorStatusOf(error), { error: error?.message || "读取 AI 配置失败" });
      }
      return;
    }

    if (request.method === "PATCH" && pathname === "/api/admin/ai-config") {
      try {
        const admin = await requirePermission(request, "ai_config.write");
        if (!String(request.headers["content-type"] || "").toLowerCase().startsWith("application/json")) {
          throw new RequestValidationError("Content-Type 必须是 application/json", 415);
        }
        const payload = await readJson(request);
        if (payload?.baseUrl) {
          try {
            assertSafeBaseUrl(payload.baseUrl);
          } catch (error) {
            throw new RequestValidationError(error?.message || "模型服务地址无效", 400);
          }
        }
        const config = await aiConfigRepository.update(payload, { updatedBy: admin.id });
        await recordAudit(request, admin, "ai_config.update", "ai_config", "1", null, {
          enabled: Boolean(config.enabled), provider: config.provider, model: config.model, baseUrl: config.baseUrl
        });
        sendJson(response, 200, { config });
      } catch (error) {
        sendJson(response, errorStatusOf(error), { error: error?.message || "保存 AI 配置失败" });
      }
      return;
    }

    if (request.method === "GET" && pathname === "/api/admin/ai-logs") {
      try {
        await requirePermission(request, "ai_logs.read");
        const format = requestUrl.searchParams.get("format") || "";
        const limit = format === "csv" ? 10000 : Number.parseInt(requestUrl.searchParams.get("limit") || "100", 10);
        const offset = Number.parseInt(requestUrl.searchParams.get("offset") || "0", 10);
        const search = requestUrl.searchParams.get("search") || "";
        const status = requestUrl.searchParams.get("status") || "";
        const from = requestUrl.searchParams.get("from") || "";
        const to = requestUrl.searchParams.get("to") || "";
        const result = await aiAuditLog.list({ limit, offset, search, status, from, to });
        if (format === "csv") {
          sendCsv(response, "ai-logs.csv",
            ["createdAt", "userIdentifier", "model", "status", "inputChars", "outputChars", "latencyMs", "errorCode"],
            result.logs.map((l) => ({
              createdAt: l.createdAt, userIdentifier: l.userIdentifier || "",
              model: l.model, status: l.status, inputChars: l.inputChars,
              outputChars: l.outputChars, latencyMs: l.latencyMs, errorCode: l.errorCode || ""
            }))
          );
          return;
        }
        sendJson(response, 200, result);
      } catch (error) {
        sendJson(response, errorStatusOf(error), { error: error?.message || "读取 AI 调用记录失败" });
      }
      return;
    }

    if (request.method === "GET" && pathname === "/api/admin/overview") {
      try {
        await requirePermission(request, "overview.read");
        const [users, drafts, ai, aiConfig] = await Promise.all([
          authService.listUsers({ limit: 1 }),
          templateRepository.listAllResumes({ limit: 1 }),
          aiAuditLog.stats(),
          aiConfigRepository.get()
        ]);
        sendJson(response, 200, {
          userCount: users?.total ?? 0,
          draftCount: drafts?.total ?? 0,
          aiToday: ai?.today ?? 0,
          aiTotal: ai?.total ?? 0,
          aiEnabled: Boolean(aiConfig?.enabled),
          aiConfigured: Boolean(aiConfig?.apiKeySet)
        });
      } catch (error) {
        sendJson(response, errorStatusOf(error), { error: error?.message || "读取概览失败" });
      }
      return;
    }

    if (request.method === "GET" && pathname === "/api/admin/audit-logs") {
      try {
        await requirePermission(request, "audit.read");
        const format = requestUrl.searchParams.get("format") || "";
        const limit = format === "csv" ? 10000 : Number.parseInt(requestUrl.searchParams.get("limit") || "100", 10);
        const offset = Number.parseInt(requestUrl.searchParams.get("offset") || "0", 10);
        const search = requestUrl.searchParams.get("search") || "";
        const action = requestUrl.searchParams.get("action") || "";
        const from = requestUrl.searchParams.get("from") || "";
        const to = requestUrl.searchParams.get("to") || "";
        const result = await adminAuditLog.list({ limit, offset, search, action, from, to });
        if (format === "csv") {
          sendCsv(response, "audit-logs.csv",
            ["createdAt", "actorIdentifier", "action", "targetType", "targetId", "ip"],
            result.logs.map((l) => ({
              createdAt: l.createdAt, actorIdentifier: l.actorIdentifier || "",
              action: l.action, targetType: l.targetType, targetId: l.targetId || "", ip: l.ip || ""
            }))
          );
          return;
        }
        sendJson(response, 200, result);
      } catch (error) {
        sendJson(response, errorStatusOf(error), { error: error?.message || "读取审计记录失败" });
      }
      return;
    }

    if (request.method === "GET" && pathname === "/api/admin/recycle") {
      try {
        await requirePermission(request, "recycle.read");
        const limit = Number.parseInt(requestUrl.searchParams.get("limit") || "200", 10);
        const offset = Number.parseInt(requestUrl.searchParams.get("offset") || "0", 10);
        const search = requestUrl.searchParams.get("search") || "";
        const from = requestUrl.searchParams.get("from") || "";
        const to = requestUrl.searchParams.get("to") || "";
        const [deletedUsers, deletedResumes] = await Promise.all([
          authService.listDeletedUsers({ limit, offset, search, from, to }),
          templateRepository.listDeletedResumes({ limit, offset, search, from, to })
        ]);
        sendJson(response, 200, {
          users: deletedUsers.users || [],
          userTotal: deletedUsers.total ?? 0,
          resumes: deletedResumes.resumes || [],
          resumeTotal: deletedResumes.total ?? 0
        });
      } catch (error) {
        sendJson(response, errorStatusOf(error), { error: error?.message || "读取回收站失败" });
      }
      return;
    }

    const recycleUserRestoreMatch = pathname.match(/^\/api\/admin\/recycle\/users\/([0-9a-f-]{36})\/restore$/i);
    if (request.method === "POST" && recycleUserRestoreMatch) {
      try {
        const admin = await requirePermission(request, "recycle.restore");
        const restored = await authService.restoreUser(recycleUserRestoreMatch[1]);
        if (!restored) sendJson(response, 404, { error: "回收站中不存在该用户" });
        else {
          await recordAudit(request, admin, "recycle.restore", "user", recycleUserRestoreMatch[1]);
          sendJson(response, 200, { ok: true });
        }
      } catch (error) {
        sendJson(response, errorStatusOf(error), { error: error?.message || "恢复用户失败" });
      }
      return;
    }

    const recycleUserPurgeMatch = pathname.match(/^\/api\/admin\/recycle\/users\/([0-9a-f-]{36})$/i);
    if (request.method === "DELETE" && recycleUserPurgeMatch) {
      try {
        const admin = await requirePermission(request, "recycle.purge");
        const purged = await authService.purgeUser(recycleUserPurgeMatch[1]);
        if (!purged) sendJson(response, 404, { error: "回收站中不存在该用户" });
        else {
          await templateRepository.purgeByOwner(recycleUserPurgeMatch[1]);
          await recordAudit(request, admin, "recycle.purge", "user", recycleUserPurgeMatch[1]);
          response.writeHead(204, { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" });
          response.end();
        }
      } catch (error) {
        sendJson(response, errorStatusOf(error), { error: error?.message || "彻底删除用户失败" });
      }
      return;
    }

    const recycleResumeRestoreMatch = pathname.match(/^\/api\/admin\/recycle\/resumes\/([0-9a-f-]{36})\/restore$/i);
    if (request.method === "POST" && recycleResumeRestoreMatch) {
      try {
        const admin = await requirePermission(request, "recycle.restore");
        const restored = await templateRepository.restoreResume(recycleResumeRestoreMatch[1]);
        if (!restored) sendJson(response, 404, { error: "回收站中不存在该草稿" });
        else {
          await recordAudit(request, admin, "recycle.restore", "resume", recycleResumeRestoreMatch[1]);
          sendJson(response, 200, { ok: true });
        }
      } catch (error) {
        sendJson(response, errorStatusOf(error), { error: error?.message || "恢复草稿失败" });
      }
      return;
    }

    const recycleResumePurgeMatch = pathname.match(/^\/api\/admin\/recycle\/resumes\/([0-9a-f-]{36})$/i);
    if (request.method === "DELETE" && recycleResumePurgeMatch) {
      try {
        const admin = await requirePermission(request, "recycle.purge");
        const purged = await templateRepository.purgeResume(recycleResumePurgeMatch[1]);
        if (!purged) sendJson(response, 404, { error: "回收站中不存在该草稿" });
        else {
          await recordAudit(request, admin, "recycle.purge", "resume", recycleResumePurgeMatch[1]);
          response.writeHead(204, { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" });
          response.end();
        }
      } catch (error) {
        sendJson(response, errorStatusOf(error), { error: error?.message || "彻底删除草稿失败" });
      }
      return;
    }

    // —— P1：趋势看板与 AI 成本 ——

    if (request.method === "GET" && pathname === "/api/admin/metrics") {
      try {
        await requirePermission(request, "overview.read");
        const days = Number.parseInt(requestUrl.searchParams.get("days") || "30", 10);
        const [series, totals] = await Promise.all([
          metrics.daily({ days }),
          metrics.totals()
        ]);
        sendJson(response, 200, { days: series, totals });
      } catch (error) {
        sendJson(response, errorStatusOf(error), { error: error?.message || "读取指标失败" });
      }
      return;
    }

    if (request.method === "GET" && pathname === "/api/admin/ai-costs") {
      try {
        await requirePermission(request, "ai_logs.read");
        const days = Number.parseInt(requestUrl.searchParams.get("days") || "30", 10);
        sendJson(response, 200, await metrics.aiCosts({ days }));
      } catch (error) {
        sendJson(response, errorStatusOf(error), { error: error?.message || "读取 AI 成本失败" });
      }
      return;
    }

    // —— 配置中心（Feature Flag） ——

    if (request.method === "GET" && pathname === "/api/admin/config") {
      try {
        await requirePermission(request, "config.read");
        sendJson(response, 200, { config: await configService.all(), schema: configSchema() });
      } catch (error) {
        sendJson(response, errorStatusOf(error), { error: error?.message || "读取配置失败" });
      }
      return;
    }

    if (request.method === "PATCH" && pathname === "/api/admin/config") {
      try {
        const admin = await requirePermission(request, "config.write");
        if (!String(request.headers["content-type"] || "").toLowerCase().startsWith("application/json")) {
          throw new RequestValidationError("Content-Type 必须是 application/json", 415);
        }
        const payload = await readJson(request);
        const config = await configService.set(payload, { updatedBy: admin.id });
        await recordAudit(request, admin, "config.update", "app_config", null, null, config);
        sendJson(response, 200, { config });
      } catch (error) {
        sendJson(response, errorStatusOf(error), { error: error?.message || "保存配置失败" });
      }
      return;
    }

    // —— 系统运维面板 ——

    if (request.method === "GET" && pathname === "/api/admin/system") {
      try {
        await requirePermission(request, "system.read");
        const databaseStatus = await checkDatabase(database);
        const redisEnabled = Boolean(service.connection);
        const redis = { configured: redisEnabled, ok: false };
        if (redisEnabled) {
          try {
            redis.ok = service.connection.status === "ready";
          } catch {
            redis.ok = false;
          }
        }

        const inProcessCounts = (svc) => {
          let waiting = 0;
          let active = 0;
          let completed = 0;
          let failed = 0;
          for (const job of svc.jobs?.values?.() || []) {
            if (job.status === "queued") waiting += 1;
            else if (job.status === "processing") active += 1;
            else if (job.status === "completed") completed += 1;
            else if (job.status === "failed") failed += 1;
          }
          return { backend: "in-process", counts: { waiting, active, completed, failed } };
        };

        let exportQueue;
        let previewQueue;
        if (typeof service.queue?.getJobCounts === "function") {
          const counts = await service.queue.getJobCounts();
          exportQueue = {
            backend: "bullmq",
            counts: {
              waiting: counts.waiting || 0,
              active: counts.active || 0,
              completed: counts.completed || 0,
              failed: counts.failed || 0,
              delayed: counts.delayed || 0
            }
          };
        } else {
          exportQueue = inProcessCounts(service);
        }
        if (typeof previewService.queue?.getJobCounts === "function") {
          const counts = await previewService.queue.getJobCounts();
          previewQueue = {
            backend: "bullmq",
            counts: {
              waiting: counts.waiting || 0,
              active: counts.active || 0,
              completed: counts.completed || 0,
              failed: counts.failed || 0,
              delayed: counts.delayed || 0
            }
          };
        } else {
          previewQueue = inProcessCounts(previewService);
        }

        const aiConfig = await aiConfigRepository.get();
        sendJson(response, 200, {
          service: "resume-editor-mvp",
          node: process.version,
          uptimeSeconds: Math.floor(process.uptime()),
          database: databaseStatus,
          redis,
          exportQueue,
          previewQueue,
          ai: { configured: Boolean(aiConfig.apiKeySet), enabled: Boolean(aiConfig.enabled), model: aiConfig.model || null }
        });
      } catch (error) {
        sendJson(response, errorStatusOf(error), { error: error?.message || "读取系统状态失败" });
      }
      return;
    }

    // —— 一键补救：重试失败任务 / 清理队列 ——

    if (request.method === "POST" && pathname === "/api/admin/system/retry-failed") {
      try {
        const admin = await requirePermission(request, "system.write");
        const [exportRetried, previewRetried] = await Promise.all([
          service.retryFailed().catch(() => 0),
          previewService.retryFailed().catch(() => 0)
        ]);
        await recordAudit(request, admin, "system.retry_failed", "system", null, null, { exportRetried, previewRetried });
        sendJson(response, 200, { exportRetried, previewRetried });
      } catch (error) {
        sendJson(response, errorStatusOf(error), { error: error?.message || "重试失败任务出错" });
      }
      return;
    }

    if (request.method === "POST" && pathname === "/api/admin/system/clean") {
      try {
        const admin = await requirePermission(request, "system.write");
        if (!String(request.headers["content-type"] || "").toLowerCase().startsWith("application/json")) {
          throw new RequestValidationError("Content-Type 必须是 application/json", 415);
        }
        const payload = await readJson(request);
        const queue = ["export", "preview", "all"].includes(payload?.queue) ? payload.queue : "all";
        const type = ["completed", "failed", "all"].includes(payload?.type) ? payload.type : "completed";
        let removed = 0;
        if (queue === "export" || queue === "all") removed += await service.clean(type).catch(() => 0);
        if (queue === "preview" || queue === "all") removed += await previewService.clean(type).catch(() => 0);
        await recordAudit(request, admin, "system.clean", "system", null, null, { queue, type, removed });
        sendJson(response, 200, { removed });
      } catch (error) {
        sendJson(response, errorStatusOf(error), { error: error?.message || "清理队列出错" });
      }
      return;
    }

    // —— 告警记录 ——

    if (request.method === "GET" && pathname === "/api/admin/alerts") {
      try {
        await requirePermission(request, "system.read");
        const limit = Number.parseInt(requestUrl.searchParams.get("limit") || "50", 10);
        const offset = Number.parseInt(requestUrl.searchParams.get("offset") || "0", 10);
        sendJson(response, 200, await alertService.list({ limit, offset }));
      } catch (error) {
        sendJson(response, errorStatusOf(error), { error: error?.message || "读取告警失败" });
      }
      return;
    }

    const alertAckMatch = pathname.match(/^\/api\/admin\/alerts\/(\d+)\/ack$/i);
    if (request.method === "POST" && alertAckMatch) {
      try {
        const admin = await requirePermission(request, "system.write");
        const ok = await alertService.ack(alertAckMatch[1]);
        if (!ok) sendJson(response, 404, { error: "告警不存在" });
        else {
          await recordAudit(request, admin, "alert.ack", "alert", alertAckMatch[1]);
          sendJson(response, 200, { ok: true });
        }
      } catch (error) {
        sendJson(response, errorStatusOf(error), { error: error?.message || "确认告警失败" });
      }
      return;
    }

    // —— 公告（面向全站用户，公开只读；管理端可增删改） ——

    if (request.method === "GET" && pathname === "/api/announcements") {
      try {
        sendJson(response, 200, { announcements: await announcements.listPublished({ limit: 10 }) });
      } catch (error) {
        sendJson(response, errorStatusOf(error), { error: error?.message || "读取公告失败" });
      }
      return;
    }

    if (request.method === "GET" && pathname === "/api/admin/announcements") {
      try {
        await requirePermission(request, "announcements.read");
        const limit = Number.parseInt(requestUrl.searchParams.get("limit") || "100", 10);
        const offset = Number.parseInt(requestUrl.searchParams.get("offset") || "0", 10);
        const search = requestUrl.searchParams.get("search") || "";
        const status = requestUrl.searchParams.get("status") || "";
        sendJson(response, 200, await announcements.list({ limit, offset, search, status }));
      } catch (error) {
        sendJson(response, errorStatusOf(error), { error: error?.message || "读取公告失败" });
      }
      return;
    }

    if (request.method === "POST" && pathname === "/api/admin/announcements") {
      try {
        const admin = await requirePermission(request, "announcements.write");
        if (!String(request.headers["content-type"] || "").toLowerCase().startsWith("application/json")) {
          throw new RequestValidationError("Content-Type 必须是 application/json", 415);
        }
        const payload = await readJson(request);
        if (!String(payload?.title || "").trim()) throw new RequestValidationError("公告标题不能为空", 400);
        const created = await announcements.create({
          title: payload.title,
          content: payload.content || "",
          status: payload.status || "draft",
          createdBy: admin.id
        });
        await recordAudit(request, admin, "announcement.create", "announcement", created.id);
        sendJson(response, 201, { announcement: created });
      } catch (error) {
        sendJson(response, errorStatusOf(error), { error: error?.message || "创建公告失败" });
      }
      return;
    }

    const announcementMatch = pathname.match(/^\/api\/admin\/announcements\/([0-9a-f-]{36})$/i);
    if (request.method === "PATCH" && announcementMatch) {
      try {
        const admin = await requirePermission(request, "announcements.write");
        if (!String(request.headers["content-type"] || "").toLowerCase().startsWith("application/json")) {
          throw new RequestValidationError("Content-Type 必须是 application/json", 415);
        }
        const payload = await readJson(request);
        const updated = await announcements.update(announcementMatch[1], {
          title: payload?.title,
          content: payload?.content,
          status: payload?.status
        });
        if (!updated) sendJson(response, 404, { error: "公告不存在" });
        else {
          await recordAudit(request, admin, "announcement.update", "announcement", updated.id);
          sendJson(response, 200, { announcement: updated });
        }
      } catch (error) {
        sendJson(response, errorStatusOf(error), { error: error?.message || "更新公告失败" });
      }
      return;
    }

    if (request.method === "DELETE" && announcementMatch) {
      try {
        const admin = await requirePermission(request, "announcements.write");
        const deleted = await announcements.delete(announcementMatch[1]);
        if (!deleted) sendJson(response, 404, { error: "公告不存在" });
        else {
          await recordAudit(request, admin, "announcement.delete", "announcement", announcementMatch[1]);
          response.writeHead(204, { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" });
          response.end();
        }
      } catch (error) {
        sendJson(response, errorStatusOf(error), { error: error?.message || "删除公告失败" });
      }
      return;
    }

    // —— 站内信 ——

    if (request.method === "POST" && pathname === "/api/admin/messages/broadcast") {
      try {
        const admin = await requirePermission(request, "announcements.write");
        if (!String(request.headers["content-type"] || "").toLowerCase().startsWith("application/json")) {
          throw new RequestValidationError("Content-Type 必须是 application/json", 415);
        }
        const payload = await readJson(request);
        if (!String(payload?.title || "").trim()) throw new RequestValidationError("消息标题不能为空", 400);
        const created = await messages.broadcast({ title: payload.title, content: payload.content || "" });
        await recordAudit(request, admin, "message.broadcast", "user_message", null, null, { created });
        sendJson(response, 200, { created });
      } catch (error) {
        sendJson(response, errorStatusOf(error), { error: error?.message || "发送站内信失败" });
      }
      return;
    }

    if (request.method === "GET" && pathname === "/api/me/messages") {
      try {
        const user = await authorize(request);
        if (!user?.id) throw new AuthError("请先登录", 401);
        sendJson(response, 200, await messages.listForUser(user.id, { limit: 50 }));
      } catch (error) {
        sendJson(response, errorStatusOf(error), { error: error?.message || "读取消息失败" });
      }
      return;
    }

    const messageReadMatch = pathname.match(/^\/api\/me\/messages\/([0-9a-f-]{36})\/read$/i);
    if (request.method === "POST" && messageReadMatch) {
      try {
        const user = await authorize(request);
        if (!user?.id) throw new AuthError("请先登录", 401);
        const ok = await messages.markRead(user.id, messageReadMatch[1]);
        if (!ok) sendJson(response, 404, { error: "消息不存在" });
        else sendJson(response, 200, { ok: true });
      } catch (error) {
        sendJson(response, errorStatusOf(error), { error: error?.message || "标记已读失败" });
      }
      return;
    }

    // —— 用户反馈 ——

    if (request.method === "POST" && pathname === "/api/feedback") {
      try {
        const user = await authorize(request);
        if (!String(request.headers["content-type"] || "").toLowerCase().startsWith("application/json")) {
          throw new RequestValidationError("Content-Type 必须是 application/json", 415);
        }
        const payload = await readJson(request);
        if (!String(payload?.content || "").trim()) throw new RequestValidationError("反馈内容不能为空", 400);
        const created = await feedbacks.create({
          userId: user?.id || null,
          type: payload?.type || "suggestion",
          content: payload.content
        });
        sendJson(response, 201, { feedback: created });
      } catch (error) {
        sendJson(response, errorStatusOf(error), { error: error?.message || "提交反馈失败" });
      }
      return;
    }

    if (request.method === "GET" && pathname === "/api/admin/feedbacks") {
      try {
        await requirePermission(request, "feedback.read");
        const limit = Number.parseInt(requestUrl.searchParams.get("limit") || "100", 10);
        const offset = Number.parseInt(requestUrl.searchParams.get("offset") || "0", 10);
        const search = requestUrl.searchParams.get("search") || "";
        const status = requestUrl.searchParams.get("status") || "";
        sendJson(response, 200, await feedbacks.list({ limit, offset, search, status }));
      } catch (error) {
        sendJson(response, errorStatusOf(error), { error: error?.message || "读取反馈失败" });
      }
      return;
    }

    const feedbackMatch = pathname.match(/^\/api\/admin\/feedbacks\/([0-9a-f-]{36})$/i);
    if (request.method === "PATCH" && feedbackMatch) {
      try {
        const admin = await requirePermission(request, "feedback.write");
        if (!String(request.headers["content-type"] || "").toLowerCase().startsWith("application/json")) {
          throw new RequestValidationError("Content-Type 必须是 application/json", 415);
        }
        const payload = await readJson(request);
        const updated = await feedbacks.update(feedbackMatch[1], {
          status: payload?.status,
          reply: payload?.reply,
          repliedBy: admin.id
        });
        if (!updated) sendJson(response, 404, { error: "反馈不存在" });
        else {
          await recordAudit(request, admin, "feedback.update", "feedback", updated.id);
          sendJson(response, 200, { feedback: updated });
        }
      } catch (error) {
        sendJson(response, errorStatusOf(error), { error: error?.message || "更新反馈失败" });
      }
      return;
    }

    // —— 模板管理 ——

    if (request.method === "GET" && pathname === "/api/admin/templates") {
      try {
        await requirePermission(request, "templates.read");
        sendJson(response, 200, { templates: await templateRepository.list() });
      } catch (error) {
        sendJson(response, errorStatusOf(error), { error: error?.message || "读取模板失败" });
      }
      return;
    }

    const adminTemplateVersionMatch = pathname.match(/^\/api\/admin\/templates\/([a-z0-9-]+)\/versions\/(\d+)$/i);
    if (request.method === "PATCH" && adminTemplateVersionMatch) {
      try {
        const admin = await requirePermission(request, "templates.write");
        if (!String(request.headers["content-type"] || "").toLowerCase().startsWith("application/json")) {
          throw new RequestValidationError("Content-Type 必须是 application/json", 415);
        }
        const payload = await readJson(request);
        const updated = await templateRepository.updateTemplateStatus(
          adminTemplateVersionMatch[1],
          Number.parseInt(adminTemplateVersionMatch[2], 10),
          payload?.status
        );
        if (!updated) sendJson(response, 404, { error: "模板版本不存在或状态无效" });
        else {
          await recordAudit(request, admin, "template.status", "template", `${updated.template_slug}@${updated.version}`, null, { status: updated.status });
          sendJson(response, 200, { template: updated });
        }
      } catch (error) {
        sendJson(response, errorStatusOf(error), { error: error?.message || "更新模板状态失败" });
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
        const user = await authorize(request);
        if (!String(request.headers["content-type"] || "").toLowerCase().startsWith("application/json")) {
          throw new RequestValidationError("Content-Type 必须是 application/json", 415);
        }
        const payload = await readJson(request);
        const template = await templateRepository.get(payload.templateSlug, Number(payload.templateVersion) || 1);
        if (!template) throw new RequestValidationError("模板不存在", 404);
        if ((template.status || "ready") !== "ready") throw new RequestValidationError("模板尚未完成字段映射，暂不能使用", 409);
        const data = validateExportPayload({ resume: payload.data || {}, template }).resume;
        const created = await templateRepository.createResume({
          templateSlug: template.slug,
          templateVersion: template.version,
          data,
          ownerId: user?.id
        });
        await eventLog.record({ userId: user?.id, event: "draft_created" });
        sendJson(response, 201, created);
      } catch (error) {
        sendJson(response, errorStatusOf(error), { error: error?.message || "创建简历失败" });
      }
      return;
    }

    if (request.method === "GET" && pathname === "/api/resumes") {
      try {
        const user = await authorize(request);
        const requestedLimit = Number.parseInt(requestUrl.searchParams.get("limit") || "20", 10);
        const resumes = await templateRepository.listResumes({
          limit: Number.isSafeInteger(requestedLimit) ? requestedLimit : 20,
          ownerId: user?.id
        });
        sendJson(response, 200, { resumes });
      } catch (error) {
        sendJson(response, errorStatusOf(error), { error: error?.message || "草稿列表暂不可用" });
      }
      return;
    }

    const resumeMatch = pathname.match(/^\/api\/resumes\/([0-9a-f-]{36})$/i);
    if (request.method === "GET" && resumeMatch) {
      try {
        const user = await authorize(request);
        const draft = await templateRepository.getResume(resumeMatch[1], user?.id);
        if (!draft) sendJson(response, 404, { error: "简历草稿不存在" });
        else {
          const template = typeof templateRepository.get === "function"
            ? await templateRepository.get(draft.templateSlug, draft.templateVersion)
            : null;
          sendJson(response, 200, { resume: { ...draft, editorSchema: template?.editorSchema || null } });
        }
      } catch (error) {
        sendJson(response, errorStatusOf(error), { error: error?.message || "简历草稿暂不可用" });
      }
      return;
    }

    if (request.method === "PATCH" && resumeMatch) {
      try {
        const user = await authorize(request);
        if (!String(request.headers["content-type"] || "").toLowerCase().startsWith("application/json")) {
          throw new RequestValidationError("Content-Type 必须是 application/json", 415);
        }
        const payload = await readJson(request);
        if (!Number.isSafeInteger(payload.revision) || payload.revision < 1) {
          throw new RequestValidationError("缺少有效的草稿版本号");
        }
        const existingDraft = await templateRepository.getResume(resumeMatch[1], user?.id);
        if (!existingDraft) throw new RequestValidationError("简历草稿不存在", 404);
        const canonical = validateExportPayload({
          resume: payload.data,
          template: { slug: existingDraft.templateSlug, version: existingDraft.templateVersion }
        }).resume;
        const updated = await templateRepository.updateResume({
          id: resumeMatch[1],
          revision: payload.revision,
          data: canonical,
          ownerId: user?.id
        });
        if (!updated) {
          const existing = await templateRepository.getResume(resumeMatch[1], user?.id);
          throw new RequestValidationError(existing ? "草稿已在其他位置更新，请刷新后继续" : "简历草稿不存在", existing ? 409 : 404);
        }
        sendJson(response, 200, { revision: updated.revision, updatedAt: updated.updated_at });
      } catch (error) {
        sendJson(response, errorStatusOf(error), { error: error?.message || "保存简历失败" });
      }
      return;
    }

    if (request.method === "DELETE" && resumeMatch) {
      try {
        const user = await authorize(request);
        const deleted = await templateRepository.deleteResume(resumeMatch[1], user?.id);
        if (!deleted) sendJson(response, 404, { error: "简历草稿不存在" });
        else {
          response.writeHead(204, {
            "Cache-Control": "no-store",
            "X-Content-Type-Options": "nosniff"
          });
          response.end();
        }
      } catch (error) {
        sendJson(response, errorStatusOf(error), { error: error?.message || "删除简历失败" });
      }
      return;
    }

    if (request.method === "GET" && pathname === "/api/ai/limits") {
      try {
        const user = await authorize(request);
        if (!user?.id) throw new AuthError("请先登录", 401);
        const config = await aiService.configRepository.get();
        const quota = await aiService.quota.check(user.id);
        sendJson(response, 200, {
          enabled: Boolean(config.enabled),
          maxInputChars: config.maxInputChars,
          model: config.model || null,
          daily: { used: quota.used, limit: quota.limit, remaining: quota.remaining }
        });
      } catch (error) {
        sendJson(response, errorStatusOf(error), { error: error?.message || "读取 AI 限制失败" });
      }
      return;
    }

    if (request.method === "POST" && pathname === "/api/ai/generate") {
      try {
        const user = await authorize(request);
        if (!user?.id) throw new AuthError("请先登录", 401);
        if (await rejectIfLimited(response, apiLimiter, clientKey(user.id, "ai"), { limit: 30, windowMs: 60 * 60 * 1000 })) return;
        if (!String(request.headers["content-type"] || "").toLowerCase().startsWith("application/json")) {
          throw new RequestValidationError("Content-Type 必须是 application/json", 415);
        }
        const payload = await readJson(request);
        const result = await aiService.generate({
          userId: user.id,
          templateSlug: payload?.templateSlug,
          description: payload?.description,
          tone: payload?.tone
        });
        await eventLog.record({ userId: user.id, event: "ai_generate" });
        sendJson(response, 200, result);
      } catch (error) {
        sendJson(response, errorStatusOf(error), { error: error?.message || "AI 生成失败" });
      }
      return;
    }

    if (request.method === "POST" && pathname === "/api/exports") {
      try {
        const user = await authorize(request);
        if (await rejectIfLimited(response, apiLimiter, clientKey(user?.id || getClientIp(request), "export"), { limit: 30, windowMs: 60 * 60 * 1000 })) return;
        if (!String(request.headers["content-type"] || "").toLowerCase().startsWith("application/json")) {
          throw new RequestValidationError("Content-Type 必须是 application/json", 415);
        }
        const requestPayload = await readJson(request);
        let payload;
        if (requestPayload.resumeId) {
          const draft = await templateRepository.getResume(requestPayload.resumeId, user?.id);
          if (!draft) throw new RequestValidationError("简历草稿不存在", 404);
          if (draft.revision !== requestPayload.revision) {
            throw new RequestValidationError("导出版本已过期，请等待保存完成后重试", 409);
          }
          payload = validateExportPayload({
            resume: draft.data,
            format: requestPayload.format,
            fileName: requestPayload.fileName,
            template: { slug: draft.templateSlug, version: draft.templateVersion }
          }, { allowedImageHosts });
        } else {
          payload = validateExportPayload(requestPayload, { allowedImageHosts });
        }
        const template = await templateRepository.get(payload.template.slug, payload.template.version);
        if (!template) throw new RequestValidationError("导出模板不存在", 404);
        if ((template.status || "ready") !== "ready") {
          throw new RequestValidationError("该模板仍在适配中，暂不能导出", 409);
        }
        const job = await service.create({ ...payload, template });
        await eventLog.record({ userId: user?.id, event: "export_created" });
        sendJson(response, 202, job);
      } catch (error) {
        sendJson(response, errorStatusOf(error), { error: error?.message || "创建导出任务失败" });
      }
      return;
    }

    if (request.method === "POST" && pathname === "/api/previews") {
      try {
        const user = await authorize(request);
        if (await rejectIfLimited(response, apiLimiter, clientKey(user?.id || getClientIp(request), "preview"), { limit: 60, windowMs: 60 * 60 * 1000 })) return;
        if (fidelityPreviewDisabled) {
          throw new RequestValidationError("开发模式已关闭高保真预览", 503);
        }
        const payload = await readJson(request);
        if (!payload.resumeId || !Number.isSafeInteger(payload.revision)) {
          throw new RequestValidationError("缺少有效的简历 ID 或版本号");
        }
        const draft = await templateRepository.getResume(payload.resumeId, user?.id);
        if (!draft) throw new RequestValidationError("简历草稿不存在", 404);
        if (draft.revision !== payload.revision) throw new RequestValidationError("预览版本已过期", 409);
        const template = await templateRepository.get(draft.templateSlug, draft.templateVersion);
        if (!template || template.status !== "ready") throw new RequestValidationError("模板尚未通过高保真验收", 409);
        if (template.engine !== "docx-native" || !template.sourcePath) {
          throw new RequestValidationError("该模板不提供高保真预览", 409);
        }
        sendJson(response, 202, await previewService.create({
          resumeId: draft.id, revision: draft.revision, resume: draft.data, template
        }));
      } catch (error) {
        sendJson(response, errorStatusOf(error), { error: error?.message || "创建预览任务失败" });
      }
      return;
    }

    const previewMatch = pathname.match(/^\/api\/previews\/([0-9a-f-]+)$/i);
    if (request.method === "GET" && previewMatch) {
      const job = await previewService.get(previewMatch[1], requestUrl.searchParams.get("token"));
      if (!job) sendJson(response, 404, { error: "预览任务不存在或已过期" });
      else sendJson(response, 200, previewService.toPublic(job));
      return;
    }

    const previewPageMatch = pathname.match(/^\/api\/previews\/([0-9a-f-]+)\/pages\/(\d+)$/i);
    if (request.method === "GET" && previewPageMatch) {
      const job = await previewService.get(previewPageMatch[1], requestUrl.searchParams.get("token"));
      const page = job?.pages[Number(previewPageMatch[2]) - 1];
      if (!job || job.status !== "completed" || !page) sendJson(response, 404, { error: "预览页面不存在" });
      else {
        response.writeHead(200, { "Content-Type": extname(page).toLowerCase() === ".webp" ? "image/webp" : "image/png", "Cache-Control": "private, max-age=1800", "X-Content-Type-Options": "nosniff" });
        if (job.objectStorage) {
          const object = await getObject(page);
          object.Body.pipe(response);
        } else {
          createReadStream(join(options.previewDir || defaultPreviewDir, job.id, page)).pipe(response);
        }
      }
      return;
    }

    const statusMatch = pathname.match(/^\/api\/exports\/([0-9a-f-]+)$/i);
    if (request.method === "GET" && statusMatch) {
      const job = await service.get(statusMatch[1], requestUrl.searchParams.get("token"));
      if (!job) sendJson(response, 404, { error: "导出任务不存在或已过期" });
      else sendJson(response, 200, service.toPublic(job));
      return;
    }

    const fileMatch = pathname.match(/^\/api\/exports\/([0-9a-f-]+)\/file$/i);
    if (request.method === "GET" && fileMatch) {
      const job = await service.get(fileMatch[1], requestUrl.searchParams.get("token"));
      if (!job || job.status !== "completed") sendJson(response, 404, { error: "导出文件尚未生成或已过期" });
      else await sendExportFile(response, job);
      return;
    }

    const printMatch = pathname.match(/^\/internal\/print\/([0-9a-f-]+)$/i);
    if (request.method === "GET" && printMatch) {
      const job = await service.get(printMatch[1], requestUrl.searchParams.get("token"));
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
      let relativePath;
      try {
        relativePath = decodeURIComponent(pathname.slice("/template-assets/".length));
      } catch {
        response.writeHead(400);
        response.end("Bad request");
        return;
      }
      const assetPath = normalize(join(templateStorageDir, relativePath));
      if (!isPathWithin(templateStorageDir, assetPath)) {
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
      const contentType = contentTypes[extname(path).toLowerCase()] || "application/octet-stream";
      const headers = {
        "Content-Type": contentType,
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff"
      };
      if (contentType.startsWith("text/html")) {
        headers["Content-Security-Policy"] = "default-src 'self'; img-src 'self' data: https:; style-src 'self' 'unsafe-inline'; script-src 'self'; connect-src 'self'; font-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'";
      }
      response.writeHead(200, headers);
      response.end(request.method === "HEAD" ? undefined : body);
    } catch {
      try {
        const body = await readFile(join(publicRoot, "index.html"));
        response.writeHead(200, {
          "Content-Type": "text/html; charset=utf-8",
          "Cache-Control": "no-store",
          "X-Content-Type-Options": "nosniff",
          "Content-Security-Policy": "default-src 'self'; img-src 'self' data: https:; style-src 'self' 'unsafe-inline'; script-src 'self'; connect-src 'self'; font-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'"
        });
        response.end(request.method === "HEAD" ? undefined : body);
      } catch {
        response.writeHead(404);
        response.end("Not found");
      }
    }
  });

  server.on("close", () => {
    clearInterval(alertTimer);
    service.dispose();
    previewService.dispose();
    loginLimiter.dispose();
    registerLimiter.dispose();
    apiLimiter.dispose();
    database?.end().catch(() => {});
  });
  return { server, service, previewService, database, templateRepository, authService, aiService, aiConfigRepository, aiAuditLog, adminAuditLog, eventLog, announcements, messages, feedbacks, metrics, configService, alertService };
}

export async function startServer(options = {}) {
  const listenPort = options.port ?? defaultPort;
  const listenHost = options.host ?? defaultHost;
  const app = createAppServer(options);

  if (options.seedTestUsers ?? process.env.SEED_TEST_USERS === "true") {
    try {
      await seedTestUsers(app.authService);
      console.log("测试账号已就绪（SEED_TEST_USERS=true）");
    } catch (error) {
      console.error("测试账号初始化失败:", error?.message);
    }
  }

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
