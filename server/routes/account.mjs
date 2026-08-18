import { AuthError, parseCookies } from "../auth.mjs";
import { sendJson } from "../http.mjs";
import { clientKey } from "../rate-limit.mjs";

export function createAccountRoutes({
  authService,
  eventLog,
  currentUser,
  clearSessionCookie,
  rejectIfLimited,
  apiLimiter,
  errorStatusOf,
  readJson
}) {
  return async function handleAccountRoute({ request, response, pathname, secure }) {
    if (request.method === "POST" && pathname === "/api/auth/logout") {
      try {
        const cookies = parseCookies(request);
        await authService.destroySession(cookies[authService.cookieName]);
        clearSessionCookie(response, secure);
        sendJson(response, 200, { ok: true });
      } catch (error) {
        sendJson(response, errorStatusOf(error), { error: error?.message || "退出失败" });
      }
      return true;
    }

    if (request.method === "GET" && pathname === "/api/auth/session") {
      try {
        const user = await currentUser(request);
        sendJson(response, 200, { user: user || null });
      } catch (error) {
        sendJson(response, 500, { error: error?.message || "读取会话失败" });
      }
      return true;
    }

    if (request.method === "POST" && pathname === "/api/auth/change-password") {
      try {
        const user = await currentUser(request);
        if (!user) throw new AuthError("请先登录", 401);
        if (await rejectIfLimited(response, apiLimiter, clientKey(user.id, "change-password"), { limit: 5, windowMs: 60 * 60 * 1000 })) return true;
        if (!String(request.headers["content-type"] || "").toLowerCase().startsWith("application/json")) {
          throw new AuthError("Content-Type 必须是 application/json", 415);
        }
        const payload = await readJson(request);
        if (String(payload?.newPassword || "") !== String(payload?.confirmPassword || "")) throw new AuthError("两次输入的新密码不一致", 400);
        const cookies = parseCookies(request);
        const updated = await authService.changePassword(user.id, {
          currentPassword: payload?.currentPassword,
          newPassword: payload?.newPassword,
          currentToken: cookies[authService.cookieName]
        });
        await eventLog.record({ userId: user.id, event: "password_change" });
        sendJson(response, 200, { user: updated });
      } catch (error) {
        sendJson(response, errorStatusOf(error), { error: error?.message || "修改密码失败" });
      }
      return true;
    }

    if (request.method === "PATCH" && pathname === "/api/me") {
      try {
        const user = await currentUser(request);
        if (!user) throw new AuthError("请先登录", 401);
        if (!String(request.headers["content-type"] || "").toLowerCase().startsWith("application/json")) {
          throw new AuthError("Content-Type 必须是 application/json", 415);
        }
        const payload = await readJson(request);
        const updated = await authService.updateUser(user.id, { displayName: payload?.displayName, settings: payload?.settings });
        sendJson(response, 200, { user: updated });
      } catch (error) {
        sendJson(response, errorStatusOf(error), { error: error?.message || "更新设置失败" });
      }
      return true;
    }

    return false;
  };
}
