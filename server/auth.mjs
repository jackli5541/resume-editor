import {
  createHash,
  randomBytes,
  randomUUID,
  scrypt,
  timingSafeEqual
} from "node:crypto";
import { promisify } from "node:util";
import { ADMIN_ROLES, listPermissions } from "./permissions.mjs";
import { isDisposableEmail } from "./email-guard.mjs";
import { TONE_HINTS } from "./ai/extract.mjs";
import { passwordPolicyError } from "./password-policy.mjs";

const scryptAsync = promisify(scrypt);

const SCRYPT_KEY_LEN = 64;
const DEFAULT_SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 天

// 预生成的哑哈希，用于账号不存在时仍执行一次哈希比较，弱化时序侧信道。
const DUMMY_HASH = "scrypt$16384$8$1$AAAAAAAAAAAAAAAAAAAAAA$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA";

export class AuthError extends Error {
  constructor(message, statusCode = 401) {
    super(message);
    this.name = "AuthError";
    this.statusCode = statusCode;
  }
}

export function normalizeEmail(value) {
  return String(value ?? "").trim().toLowerCase();
}

export function isValidEmail(email) {
  return email.length <= 320 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export function normalizePhone(value) {
  const raw = String(value ?? "").trim();
  let out = raw.replace(/[^\d+]/g, "");
  if (out.startsWith("+")) out = `+${out.slice(1).replace(/\+/g, "")}`;
  return out;
}

export function isValidPhone(phone) {
  return /^\+?[0-9]{6,15}$/.test(phone);
}

// 根据输入判断是邮箱还是手机号；登录统一使用该入口。
export function identifierType(value) {
  return String(value ?? "").includes("@") ? "email" : "phone";
}

export function normalizeIdentifier(value) {
  const raw = String(value ?? "").trim();
  return raw.includes("@") ? normalizeEmail(raw) : normalizePhone(raw);
}

export function validatePassword(password) {
  const error = passwordPolicyError(password);
  if (error) throw new AuthError(error, 400);
}

export function hashSessionToken(token) {
  return createHash("sha256").update(String(token)).digest("base64url");
}

export async function hashPassword(password) {
  const salt = randomBytes(16);
  const hash = await scryptAsync(password, salt, SCRYPT_KEY_LEN, {
    N: 16384,
    r: 8,
    p: 1
  });
  return [
    "scrypt",
    "16384",
    "8",
    "1",
    salt.toString("base64url"),
    hash.toString("base64url")
  ].join("$");
}

export async function verifyPassword(password, stored) {
  const parts = String(stored || "").split("$");
  if (parts.length !== 6 || parts[0] !== "scrypt") return false;
  const [, n, r, p, saltB64, hashB64] = parts;
  try {
    const salt = Buffer.from(saltB64, "base64url");
    const expected = Buffer.from(hashB64, "base64url");
    const actual = await scryptAsync(password, salt, expected.length, {
      N: Number.parseInt(n, 10),
      r: Number.parseInt(r, 10),
      p: Number.parseInt(p, 10)
    });
    return actual.length === expected.length && timingSafeEqual(actual, expected);
  } catch {
    return false;
  }
}

export function parseCookies(request) {
  const header = request.headers.cookie;
  const result = {};
  if (!header) return result;
  for (const part of String(header).split(";")) {
    const index = part.indexOf("=");
    if (index < 0) continue;
    const key = part.slice(0, index).trim();
    const value = part.slice(index + 1).trim();
    if (key) result[key] = decodeURIComponent(value);
  }
  return result;
}

// 将数据库行（snake_case）或内存记录（camelCase）统一为 camelCase 内部形态。
export function mapUserRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    email: row.email ?? "",
    phone: row.phone ?? "",
    passwordHash: row.password_hash ?? row.passwordHash ?? "",
    displayName: row.display_name ?? row.displayName ?? "",
    settings: row.settings || {},
    isAdmin: Boolean(row.is_admin ?? row.isAdmin),
    disabled: Boolean(row.disabled ?? false),
    role: row.role ?? null,
    aiDailyLimit: Number(row.ai_daily_limit ?? row.aiDailyLimit) || 8,
    deletedAt: row.deleted_at ?? row.deletedAt ?? null,
    createdAt: row.created_at ?? row.createdAt ?? null,
    updatedAt: row.updated_at ?? row.updatedAt ?? null
  };
}

export class AuthService {
  constructor({
    database,
    sessionTtlMs = DEFAULT_SESSION_TTL_MS,
    cookieName = "session",
    adminEmails = []
  }) {
    this.database = database;
    this.sessionTtlMs = sessionTtlMs;
    this.cookieName = cookieName;
    // 超级管理员仅一个，由配置的第一个邮箱唯一指定；不再支持手机号作为超级管理员来源。
    this.superAdminEmail = [...(adminEmails || [])]
      .map((value) => normalizeEmail(value))
      .filter(Boolean)[0] || null;
    this.localUsersById = new Map(); // id -> 内存用户记录
    this.localUsersByEmail = new Map(); // email -> id
    this.localUsersByPhone = new Map(); // phone -> id
    this.localSessions = new Map(); // tokenHash -> session record
  }

  // 超级管理员由配置邮箱唯一确定；仅该邮箱返回 true。
  isSuperAdminUser(user) {
    if (!user?.isAdmin) return false;
    return Boolean(this.superAdminEmail) && normalizeEmail(user?.email) === this.superAdminEmail;
  }

  // 归一化角色：非管理员 -> null；超级管理员邮箱 -> super_admin；其余管理员 -> 显式角色或默认「运营」。
  normalizeRole(user) {
    if (!user?.isAdmin) return null;
    if (this.isSuperAdminUser(user)) return "super_admin";
    const role = user?.role;
    return role === "operator" || role === "auditor" ? role : "operator";
  }

  async createUser({ email = "", phone = "", password, displayName = "", isAdmin, role }) {
    const normalizedEmail = normalizeEmail(email);
    const normalizedPhone = normalizePhone(phone);
    if (!normalizedEmail && !normalizedPhone) {
      throw new AuthError("邮箱或手机号至少填写一个", 400);
    }
    if (normalizedEmail && !isValidEmail(normalizedEmail)) throw new AuthError("邮箱格式不正确", 400);
    if (normalizedEmail && isDisposableEmail(normalizedEmail)) throw new AuthError("不支持使用一次性邮箱注册", 400);
    if (normalizedPhone && !isValidPhone(normalizedPhone)) throw new AuthError("手机号格式不正确", 400);
    validatePassword(password);

    const passwordHash = await hashPassword(password);
    const id = randomUUID();
    const name = sanitizeDisplayName(displayName);
    const isSuper = Boolean(this.superAdminEmail) && normalizedEmail === this.superAdminEmail;
    const admin = isSuper || (isAdmin === undefined ? false : Boolean(isAdmin));
    // 超级管理员仅由配置邮箱唯一确定；其余管理员（显式指定/种子）一律为普通管理员，默认「运营」。
    const assignedRole = isSuper
      ? "super_admin"
      : (admin ? (ADMIN_ROLES.includes(role) ? role : "operator") : null);
    const now = new Date().toISOString();

    if (this.database) {
      try {
        await this.database.query(
          `INSERT INTO users (id, email, phone, password_hash, display_name, is_admin, role)
           VALUES ($1, $2, $3, $4, $5, $6, $7)`,
          [id, normalizedEmail || null, normalizedPhone || null, passwordHash, name, admin, assignedRole]
        );
      } catch (error) {
        if (String(error?.code) === "23505") throw new AuthError("该邮箱或手机号已注册", 409);
        throw error;
      }
    } else {
      if ((normalizedEmail && this.localUsersByEmail.has(normalizedEmail))
        || (normalizedPhone && this.localUsersByPhone.has(normalizedPhone))) {
        throw new AuthError("该邮箱或手机号已注册", 409);
      }
      const user = {
        id,
        email: normalizedEmail,
        phone: normalizedPhone,
        passwordHash,
        displayName: name,
        settings: {},
        isAdmin: admin,
        disabled: false,
        role: assignedRole,
        deletedAt: null,
        createdAt: now,
        updatedAt: now
      };
      this.localUsersById.set(id, user);
      if (normalizedEmail) this.localUsersByEmail.set(normalizedEmail, id);
      if (normalizedPhone) this.localUsersByPhone.set(normalizedPhone, id);
    }
    return this.toPublicUser({
      id, email: normalizedEmail, phone: normalizedPhone, displayName: name,
      settings: {}, isAdmin: admin, disabled: false, role: assignedRole, createdAt: now, updatedAt: now
    });
  }

  // 免密账号：邮箱/手机号验证码登录自动注册（无密码，password_hash 为 NULL）。
  async createOtpUser({ email = "", phone = "", displayName = "" }) {
    const normalizedEmail = normalizeEmail(email);
    const normalizedPhone = normalizePhone(phone);
    if (!normalizedEmail && !normalizedPhone) throw new AuthError("邮箱或手机号至少填写一个", 400);
    if (normalizedEmail && !isValidEmail(normalizedEmail)) throw new AuthError("邮箱格式不正确", 400);
    if (normalizedEmail && isDisposableEmail(normalizedEmail)) throw new AuthError("不支持使用一次性邮箱注册", 400);
    if (normalizedPhone && !isValidPhone(normalizedPhone)) throw new AuthError("手机号格式不正确", 400);

    const id = randomUUID();
    const name = sanitizeDisplayName(displayName);
    const isSuper = Boolean(this.superAdminEmail) && normalizedEmail === this.superAdminEmail;
    const admin = isSuper;
    const assignedRole = isSuper ? "super_admin" : null;
    const now = new Date().toISOString();

    if (this.database) {
      try {
        await this.database.query(
          `INSERT INTO users (id, email, phone, password_hash, display_name, is_admin, role)
           VALUES ($1, $2, $3, NULL, $4, $5, $6)`,
          [id, normalizedEmail || null, normalizedPhone || null, name, admin, assignedRole]
        );
      } catch (error) {
        if (String(error?.code) === "23505") throw new AuthError("该邮箱或手机号已注册", 409);
        throw error;
      }
    } else {
      if ((normalizedEmail && this.localUsersByEmail.has(normalizedEmail))
        || (normalizedPhone && this.localUsersByPhone.has(normalizedPhone))) {
        throw new AuthError("该邮箱或手机号已注册", 409);
      }
      const user = {
        id,
        email: normalizedEmail,
        phone: normalizedPhone,
        passwordHash: "",
        displayName: name,
        settings: {},
        isAdmin: admin,
        disabled: false,
        role: assignedRole,
        deletedAt: null,
        createdAt: now,
        updatedAt: now
      };
      this.localUsersById.set(id, user);
      if (normalizedEmail) this.localUsersByEmail.set(normalizedEmail, id);
      if (normalizedPhone) this.localUsersByPhone.set(normalizedPhone, id);
    }

    return this.toPublicUser({
      id, email: normalizedEmail, phone: normalizedPhone, displayName: name,
      settings: {}, isAdmin: admin, disabled: false, role: assignedRole, createdAt: now, updatedAt: now
    });
  }

  async verifyCredentials(identifier, password) {
    const normalized = normalizeIdentifier(identifier);
    const user = await this.findUserByIdentifier(normalized);
    const hash = user?.passwordHash || DUMMY_HASH;
    const ok = await verifyPassword(password, hash);
    if (!user || !ok) throw new AuthError("账号或密码不正确", 401);
    if (user.deletedAt) throw new AuthError("账号或密码不正确", 401);
    if (user.disabled) throw new AuthError("账户已被禁用，请联系管理员", 403);

    const shouldPromote = Boolean(this.superAdminEmail)
      && identifierType(normalized) === "email"
      && normalizeEmail(normalized) === this.superAdminEmail;
    if (shouldPromote && (!user.isAdmin || user.role !== "super_admin")) {
      await this.promoteToAdmin(user.id);
      user.isAdmin = true;
      user.role = "super_admin";
    }
    return this.toPublicUser(user);
  }

  async createSession(userId, ttlMs) {
    const ttl = Number.isFinite(ttlMs) && ttlMs > 0 ? ttlMs : this.sessionTtlMs;
    const token = randomBytes(32).toString("base64url");
    const tokenHash = hashSessionToken(token);
    const now = Date.now();
    const expiresAt = now + ttl;

    if (this.database) {
      await this.database.query(
        `INSERT INTO sessions (token_hash, user_id, expires_at)
         VALUES ($1, $2, $3)
         ON CONFLICT (token_hash) DO NOTHING`,
        [tokenHash, userId, new Date(expiresAt)]
      );
    } else {
      this.localSessions.set(tokenHash, { userId, expiresAt });
    }
    return { token, expiresAt };
  }

  async getUserBySession(token) {
    if (!token) return null;
    const tokenHash = hashSessionToken(token);
    let userId = null;

    if (this.database) {
      const result = await this.database.query(
        `SELECT user_id FROM sessions
         WHERE token_hash = $1 AND expires_at > now()`,
        [tokenHash]
      );
      if (result.rows[0]) userId = result.rows[0].user_id;
    } else {
      const session = this.localSessions.get(tokenHash);
      if (session) {
        if (session.expiresAt > Date.now()) userId = session.userId;
        else this.localSessions.delete(tokenHash);
      }
    }

    if (!userId) return null;
    const user = await this.getUserById(userId);
    if (!user) return null;
    if (user.disabled || user.deletedAt) {
      await this.destroySession(token);
      return null;
    }
    this.touchSession(tokenHash);
    return this.toPublicUser(user);
  }

  async destroySession(token) {
    if (!token) return;
    const tokenHash = hashSessionToken(token);
    if (this.database) {
      await this.database.query("DELETE FROM sessions WHERE token_hash = $1", [tokenHash]);
    } else {
      this.localSessions.delete(tokenHash);
    }
  }

  async destroyUserSessions(userId) {
    if (this.database) {
      await this.database.query("DELETE FROM sessions WHERE user_id = $1", [userId]);
    } else {
      for (const [tokenHash, session] of this.localSessions) {
        if (session.userId === userId) this.localSessions.delete(tokenHash);
      }
    }
  }

  async destroyOtherSessions(userId, currentToken) {
    const currentHash = currentToken ? hashSessionToken(currentToken) : "";
    if (this.database) {
      await this.database.query("DELETE FROM sessions WHERE user_id = $1 AND token_hash <> $2", [userId, currentHash]);
    } else {
      for (const [tokenHash, session] of this.localSessions) {
        if (session.userId === userId && tokenHash !== currentHash) this.localSessions.delete(tokenHash);
      }
    }
  }

  async getUserById(id) {
    if (this.database) {
      const result = await this.database.query(
        `SELECT id, email, phone, password_hash, display_name, settings, is_admin, role, disabled, created_at, updated_at, deleted_at
         FROM users WHERE id = $1`,
        [id]
      );
      return mapUserRow(result.rows[0]);
    }
    return mapUserRow(this.localUsersById.get(id));
  }

  async findUserByEmail(email) {
    const normalized = normalizeEmail(email);
    if (!normalized) return null;
    if (this.database) {
      const result = await this.database.query(
        `SELECT id, email, phone, password_hash, display_name, settings, is_admin, role, disabled, created_at, updated_at, deleted_at
         FROM users WHERE lower(email) = lower($1) AND deleted_at IS NULL`,
        [normalized]
      );
      return mapUserRow(result.rows[0]);
    }
    const id = this.localUsersByEmail.get(normalized);
    const stored = id ? this.localUsersById.get(id) : null;
    return stored?.deletedAt ? null : mapUserRow(stored);
  }

  async findUserByPhone(phone) {
    const normalized = normalizePhone(phone);
    if (!normalized) return null;
    if (this.database) {
      const result = await this.database.query(
        `SELECT id, email, phone, password_hash, display_name, settings, is_admin, role, disabled, created_at, updated_at, deleted_at
         FROM users WHERE phone = $1 AND deleted_at IS NULL`,
        [normalized]
      );
      return mapUserRow(result.rows[0]);
    }
    const id = this.localUsersByPhone.get(normalized);
    const stored = id ? this.localUsersById.get(id) : null;
    return stored?.deletedAt ? null : mapUserRow(stored);
  }

  async findUserByIdentifier(identifier) {
    const normalized = normalizeIdentifier(identifier);
    if (!normalized) return null;
    return identifierType(normalized) === "email"
      ? this.findUserByEmail(normalized)
      : this.findUserByPhone(normalized);
  }

  async updateUser(id, { displayName, settings }) {
    const existing = await this.getUserById(id);
    if (!existing) throw new AuthError("用户不存在", 404);
    const nextName = displayName === undefined ? existing.displayName : sanitizeDisplayName(displayName);
    const nextSettings = settings === undefined ? existing.settings : sanitizeSettings(settings, existing.settings);

    if (this.database) {
      await this.database.query(
        `UPDATE users SET display_name = $2, settings = $3::jsonb, updated_at = now()
         WHERE id = $1`,
        [id, nextName, JSON.stringify(nextSettings)]
      );
    } else {
      const stored = this.localUsersById.get(id);
      stored.displayName = nextName;
      stored.settings = nextSettings;
      stored.updatedAt = new Date().toISOString();
    }
    return this.toPublicUser({ ...existing, displayName: nextName, settings: nextSettings });
  }

  async changePassword(id, { currentPassword = "", newPassword, currentToken = "" } = {}) {
    const existing = await this.getUserById(id);
    if (!existing || existing.deletedAt) throw new AuthError("用户不存在", 404);
    if (existing.passwordHash && !(await verifyPassword(currentPassword, existing.passwordHash))) {
      throw new AuthError("当前密码不正确", 401);
    }
    validatePassword(newPassword);
    if (existing.passwordHash && await verifyPassword(newPassword, existing.passwordHash)) {
      throw new AuthError("新密码不能与当前密码相同", 400);
    }
    const passwordHash = await hashPassword(newPassword);
    if (this.database) {
      await this.database.query("UPDATE users SET password_hash = $2, updated_at = now() WHERE id = $1", [id, passwordHash]);
    } else {
      const stored = this.localUsersById.get(id);
      stored.passwordHash = passwordHash;
      stored.updatedAt = new Date().toISOString();
    }
    await this.destroyOtherSessions(id, currentToken);
    return this.toPublicUser({ ...existing, passwordHash });
  }

  async promoteToAdmin(id) {
    if (this.database) {
      await this.database.query(
        "UPDATE users SET is_admin = true, role = 'super_admin', updated_at = now() WHERE id = $1",
        [id]
      );
    } else {
      const stored = this.localUsersById.get(id);
      if (stored) {
        stored.isAdmin = true;
        stored.role = "super_admin";
        stored.updatedAt = new Date().toISOString();
      }
    }
  }

  // 幂等种子用户：不存在则创建，存在则按需校正角色（不覆盖密码）。
  async seedUser({ email = "", phone = "", password, displayName = "", isAdmin = false }) {
    const existing = email
      ? await this.findUserByEmail(email)
      : await this.findUserByPhone(phone);
    if (existing) {
      if (Boolean(existing.isAdmin) !== Boolean(isAdmin)) {
        await this.setUserAdmin(existing.id, isAdmin);
        existing.isAdmin = Boolean(isAdmin);
      }
      return this.toPublicUser(existing);
    }
    return this.createUser({ email, phone, password, displayName, isAdmin });
  }

  // —— 管理员：用户管理 ——

  async listUsers({ limit = 200, offset = 0, search = "", role = "", status = "", from = "", to = "" } = {}) {
    const safeLimit = Math.min(Math.max(Number(limit) || 200, 1), 500);
    const safeOffset = Math.max(Number(offset) || 0, 0);
    const term = String(search || "").trim();

    if (this.database) {
      const conditions = ["u.deleted_at IS NULL"];
      const params = [];
      if (term) {
        params.push(`%${term}%`);
        conditions.push(`(u.email ILIKE $${params.length} OR u.phone ILIKE $${params.length} OR u.display_name ILIKE $${params.length})`);
      }
      if (role) {
        if (role === "user") {
          conditions.push("u.is_admin = false");
        } else {
          params.push(role);
          conditions.push(`u.is_admin = true AND u.role = $${params.length}`);
        }
      }
      if (status === "active") conditions.push("u.disabled = false");
      else if (status === "disabled") conditions.push("u.disabled = true");
      if (from) {
        params.push(from);
        conditions.push(`u.created_at >= $${params.length}::date`);
      }
      if (to) {
        params.push(to);
        conditions.push(`u.created_at < ($${params.length}::date + interval '1 day')`);
      }
      const where = `WHERE ${conditions.join(" AND ")}`;
      const countResult = await this.database.query(
        `SELECT count(*)::int AS total FROM users u ${where}`,
        params
      );
      const listParams = [...params, safeLimit, safeOffset];
      const result = await this.database.query(
        `SELECT u.id, u.email, u.phone, u.display_name, u.is_admin, u.role, u.disabled, u.created_at, u.updated_at,
                (SELECT count(*)::int FROM resumes r WHERE r.owner_id = u.id AND r.deleted_at IS NULL) AS draft_count
         FROM users u
         ${where}
         ORDER BY u.created_at DESC
         LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
        listParams
      );
      return {
        total: countResult.rows[0]?.total ?? 0,
        users: result.rows.map((row) => {
          const user = mapUserRow(row);
          return { ...user, role: this.normalizeRole(user), draftCount: row.draft_count ?? 0 };
        })
      };
    }

    let users = [...this.localUsersById.values()]
      .filter((user) => !user.deletedAt)
      .map((user) => {
        const mapped = mapUserRow(user);
        return { ...mapped, role: this.normalizeRole(mapped), draftCount: 0 };
      });
    if (term) {
      const needle = term.toLowerCase();
      users = users.filter((user) =>
        (user.email || "").toLowerCase().includes(needle)
        || (user.phone || "").includes(needle)
        || (user.displayName || "").toLowerCase().includes(needle)
      );
    }
    if (role) {
      if (role === "user") users = users.filter((user) => !user.isAdmin);
      else users = users.filter((user) => user.isAdmin && user.role === role);
    }
    if (status === "active") users = users.filter((user) => !user.disabled);
    else if (status === "disabled") users = users.filter((user) => user.disabled);
    if (from) {
      const fromDate = new Date(from);
      users = users.filter((user) => new Date(user.createdAt) >= fromDate);
    }
    if (to) {
      const toDate = new Date(to);
      toDate.setDate(toDate.getDate() + 1);
      users = users.filter((user) => new Date(user.createdAt) < toDate);
    }
    users.sort((left, right) => new Date(right.createdAt) - new Date(left.createdAt));
    return { total: users.length, users: users.slice(safeOffset, safeOffset + safeLimit) };
  }

  async setUserAdmin(id, isAdmin) {
    const existing = await this.getUserById(id);
    if (!existing) throw new AuthError("用户不存在", 404);
    const value = Boolean(isAdmin);
    // 提升为管理员时默认给最小权限角色「运营」；已有角色则保留。
    const role = value ? (existing.role || "operator") : null;
    if (this.database) {
      await this.database.query(
        "UPDATE users SET is_admin = $2, role = $3, updated_at = now() WHERE id = $1",
        [id, value, role]
      );
    } else {
      const stored = this.localUsersById.get(id);
      stored.isAdmin = value;
      stored.role = role;
      stored.updatedAt = new Date().toISOString();
    }
    return this.toPublicUser({ ...existing, isAdmin: value, role });
  }

  async setUserRole(id, role) {
    const existing = await this.getUserById(id);
    if (!existing) throw new AuthError("用户不存在", 404);
    if (!existing.isAdmin) throw new AuthError("仅管理员可设置角色", 400);
    if (!ADMIN_ROLES.includes(role)) throw new AuthError("无效的角色", 400);
    if (role === "super_admin" && !this.isSuperAdminUser(existing)) {
      throw new AuthError("仅配置的邮箱可成为超级管理员", 403);
    }
    if (this.database) {
      await this.database.query(
        "UPDATE users SET role = $2, updated_at = now() WHERE id = $1",
        [id, role]
      );
    } else {
      const stored = this.localUsersById.get(id);
      stored.role = role;
      stored.updatedAt = new Date().toISOString();
    }
    return this.toPublicUser({ ...existing, role });
  }

  async setUserDisabled(id, disabled) {
    const existing = await this.getUserById(id);
    if (!existing) throw new AuthError("用户不存在", 404);
    const value = Boolean(disabled);
    if (this.database) {
      await this.database.query(
        "UPDATE users SET disabled = $2, updated_at = now() WHERE id = $1",
        [id, value]
      );
    } else {
      const stored = this.localUsersById.get(id);
      stored.disabled = value;
      stored.updatedAt = new Date().toISOString();
    }
    if (value) await this.destroyUserSessions(id);
    return this.toPublicUser({ ...existing, disabled: value });
  }

  async setUserAiDailyLimit(id, limit) {
    const existing = await this.getUserById(id);
    if (!existing) throw new AuthError("用户不存在", 404);
    const value = Number.isSafeInteger(Number(limit)) && Number(limit) > 0 ? Number(limit) : 8;
    if (this.database) {
      await this.database.query(
        "UPDATE users SET ai_daily_limit = $2, updated_at = now() WHERE id = $1",
        [id, value]
      );
    } else {
      const stored = this.localUsersById.get(id);
      stored.aiDailyLimit = value;
      stored.updatedAt = new Date().toISOString();
    }
    return this.toPublicUser({ ...existing, aiDailyLimit: value });
  }

  async deleteUser(id) {
    const existing = await this.getUserById(id);
    if (!existing) throw new AuthError("用户不存在", 404);
    if (this.database) {
      await this.database.query(
        "UPDATE users SET deleted_at = now(), updated_at = now() WHERE id = $1 AND deleted_at IS NULL",
        [id]
      );
    } else {
      const stored = this.localUsersById.get(id);
      const now = new Date().toISOString();
      stored.deletedAt = now;
      stored.updatedAt = now;
    }
    await this.destroyUserSessions(id);
    return true;
  }

  // —— 回收站：软删除用户列表 / 恢复 / 彻底删除 ——

  async listDeletedUsers({ limit = 200, offset = 0, search = "", from = "", to = "" } = {}) {
    const safeLimit = Math.min(Math.max(Number(limit) || 200, 1), 500);
    const safeOffset = Math.max(Number(offset) || 0, 0);
    const term = String(search || "").trim();

    if (this.database) {
      const conditions = ["deleted_at IS NOT NULL"];
      const params = [];
      if (term) {
        params.push(`%${term}%`);
        conditions.push(`(email ILIKE $${params.length} OR phone ILIKE $${params.length} OR display_name ILIKE $${params.length})`);
      }
      if (from) {
        params.push(from);
        conditions.push(`deleted_at >= $${params.length}::date`);
      }
      if (to) {
        params.push(to);
        conditions.push(`deleted_at < ($${params.length}::date + interval '1 day')`);
      }
      const where = `WHERE ${conditions.join(" AND ")}`;
      const countResult = await this.database.query(
        `SELECT count(*)::int AS total FROM users ${where}`,
        params
      );
      const listParams = [...params, safeLimit, safeOffset];
      const result = await this.database.query(
        `SELECT id, email, phone, display_name, is_admin, role, disabled, created_at, updated_at, deleted_at
         FROM users ${where}
         ORDER BY deleted_at DESC
         LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
        listParams
      );
      return { total: countResult.rows[0]?.total ?? 0, users: result.rows.map(mapUserRow) };
    }

    let users = [...this.localUsersById.values()].filter((user) => user.deletedAt);
    if (term) {
      const needle = term.toLowerCase();
      users = users.filter((user) =>
        (user.email || "").toLowerCase().includes(needle)
        || (user.phone || "").includes(needle)
        || (user.displayName || "").toLowerCase().includes(needle)
      );
    }
    if (from) {
      const fromDate = new Date(from);
      users = users.filter((user) => new Date(user.deletedAt) >= fromDate);
    }
    if (to) {
      const toDate = new Date(to);
      toDate.setDate(toDate.getDate() + 1);
      users = users.filter((user) => new Date(user.deletedAt) < toDate);
    }
    users.sort((left, right) => new Date(right.deletedAt) - new Date(left.deletedAt));
    return { total: users.length, users: users.slice(safeOffset, safeOffset + safeLimit).map(mapUserRow) };
  }

  async restoreUser(id) {
    if (this.database) {
      const result = await this.database.query(
        "UPDATE users SET deleted_at = NULL, updated_at = now() WHERE id = $1 AND deleted_at IS NOT NULL",
        [id]
      );
      return result.rowCount === 1;
    }
    const stored = this.localUsersById.get(id);
    if (!stored || !stored.deletedAt) return false;
    stored.deletedAt = null;
    stored.updatedAt = new Date().toISOString();
    return true;
  }

  async purgeUser(id) {
    if (this.database) {
      // resumes/sessions/ai_generation_log 通过外键 ON DELETE CASCADE 一并删除。
      const result = await this.database.query(
        "DELETE FROM users WHERE id = $1 AND deleted_at IS NOT NULL",
        [id]
      );
      return result.rowCount === 1;
    }
    const stored = this.localUsersById.get(id);
    if (!stored || !stored.deletedAt) return false;
    this.localUsersById.delete(id);
    if (stored.email) this.localUsersByEmail.delete(stored.email);
    if (stored.phone) this.localUsersByPhone.delete(stored.phone);
    return true;
  }

  toPublicUser(user) {
    const role = this.normalizeRole(user);
    const normalized = { ...user, role };
    return {
      id: user.id,
      email: user.email || "",
      phone: user.phone || "",
      displayName: user.displayName || "",
      settings: user.settings || {},
      isAdmin: Boolean(user.isAdmin),
      disabled: Boolean(user.disabled),
      role,
      aiDailyLimit: Number(user.aiDailyLimit) || 8,
      hasPassword: Boolean(user.passwordHash),
      permissions: listPermissions(normalized),
      createdAt: user.createdAt,
      updatedAt: user.updatedAt
    };
  }

  async touchSession(tokenHash) {
    if (!this.database) return;
    await this.database.query(
      `UPDATE sessions SET last_seen_at = now() WHERE token_hash = $1`,
      [tokenHash]
    ).catch(() => {});
  }
}

export function sanitizeDisplayName(value) {
  return String(value ?? "").replace(/[\u0000-\u001f<>]/g, "").slice(0, 60).trim();
}

// 只保留白名单内的设置键，避免写入任意大对象或注入未来键。
const ALLOWED_SETTING_KEYS = new Set([
  "displayName",
  "theme",
  "locale",
  "ai"
]);

const ALLOWED_AI_KEYS = new Set(["enabled", "targetRole", "tone", "provider"]);

const ALLOWED_TONES = Object.keys(TONE_HINTS);

function sanitizeSettings(next, existing) {
  const base = existing && typeof existing === "object" ? { ...existing } : {};
  if (!next || typeof next !== "object" || Array.isArray(next)) return base;
  for (const [key, value] of Object.entries(next)) {
    if (!ALLOWED_SETTING_KEYS.has(key)) continue;
    if (key === "ai") base.ai = sanitizeAi(value, base.ai);
    else if (key === "displayName") base.displayName = sanitizeDisplayName(value);
    else if (key === "theme") base.theme = ["light", "dark", "system"].includes(value) ? value : base.theme;
    else if (key === "locale") base.locale = String(value || "").slice(0, 20);
  }
  return base;
}

function sanitizeAi(next, existing) {
  const base = existing && typeof existing === "object" ? { ...existing } : {};
  if (!next || typeof next !== "object" || Array.isArray(next)) return base;
  for (const [key, value] of Object.entries(next)) {
    if (!ALLOWED_AI_KEYS.has(key)) continue;
    if (key === "enabled") base.enabled = Boolean(value);
    else if (key === "targetRole") base.targetRole = String(value ?? "").slice(0, 120);
    else if (key === "tone") base.tone = ALLOWED_TONES.includes(value) ? value : (base.tone || "professional");
    else if (key === "provider") base.provider = String(value ?? "").slice(0, 40);
  }
  return base;
}
