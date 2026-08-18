import { sendJson } from "../http.mjs";
import { RequestValidationError, validateExportPayload } from "../validation.mjs";

export function createResumeRoutes({ templateRepository, eventLog, authorize, errorStatusOf, readJson }) {
  return async function handleResumeRoute({ request, response, requestUrl, pathname }) {
    const templateMatch = pathname.match(/^\/api\/templates\/([a-z0-9-]+)$/i);
    if (request.method === "GET" && templateMatch) {
      const template = await templateRepository.get(templateMatch[1], Number(requestUrl.searchParams.get("version")) || null);
      if (!template) sendJson(response, 404, { error: "模板不存在" });
      else sendJson(response, 200, { template });
      return true;
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
      return true;
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
      return true;
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
      return true;
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
      return true;
    }

    if (request.method === "DELETE" && resumeMatch) {
      try {
        const user = await authorize(request);
        const deleted = await templateRepository.deleteResume(resumeMatch[1], user?.id);
        if (!deleted) sendJson(response, 404, { error: "简历草稿不存在" });
        else {
          response.writeHead(204, { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" });
          response.end();
        }
      } catch (error) {
        sendJson(response, errorStatusOf(error), { error: error?.message || "删除简历失败" });
      }
      return true;
    }

    return false;
  };
}
