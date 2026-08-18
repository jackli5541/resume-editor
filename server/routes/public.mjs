import { checkDatabase } from "../database.mjs";
import { sendJson } from "../http.mjs";

export function createPublicRoutes({ database, aiConfigRepository, templateRepository }) {
  return async function handlePublicRoute({ request, response, pathname }) {
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
      return true;
    }

    if (request.method === "GET" && pathname === "/api/templates") {
      try {
        sendJson(response, 200, { templates: await templateRepository.list() });
      } catch (error) {
        sendJson(response, 503, { error: error?.message || "模板库不可用" });
      }
      return true;
    }

    return false;
  };
}
