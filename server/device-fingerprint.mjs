// 设备指纹与同人多账号检测（L1 + L2）。
//
// L1 服务端软指纹：由 IP + User-Agent + Accept-Language + Accept-Encoding 计算 SHA-256，
//   用于捕获「同网络、同环境、直接换邮箱/手机号重复注册」。
// L2 客户端设备指纹：前端 canvas/WebGL/字体等生成的 deviceId，经 X-Device-Id 头回传，
//   用于捕获「清 Cookie、换 IP，但仍用同一浏览器/设备」的情况。
//
// 判定结果只做「疑似标记」，供管理端人工复核，绝不自动封禁。
import { createHash } from "node:crypto";

export const FINGERPRINT_CONFIDENCE = Object.freeze({
  client: Object.freeze({ rank: 0, label: "高", title: "同设备指纹（浏览器指纹一致）" }),
  soft: Object.freeze({ rank: 1, label: "中", title: "同网络同环境软指纹（IP + UA + 语言 + 编码一致）" }),
  ip: Object.freeze({ rank: 2, label: "低", title: "同来源 IP" })
});

function sha256(value) {
  return createHash("sha256").update(String(value ?? "")).digest("hex");
}

export function normalizeIp(value) {
  return String(value ?? "").trim().toLowerCase();
}

export function normalizeUserAgent(value) {
  return String(value ?? "").trim().toLowerCase();
}

// 客户端 deviceId 只接受 8–64 位十六进制（或带连字符）形态，避免写入任意长字符串。
export function normalizeClientDeviceId(value) {
  const raw = String(value ?? "").trim();
  return /^[0-9a-f-]{8,64}$/i.test(raw) ? raw.toLowerCase() : "";
}

// 服务端软指纹：IP + UA + Accept-Language + Accept-Encoding。
export function computeSoftSignature({
  ip = "",
  userAgent = "",
  acceptLanguage = "",
  acceptEncoding = ""
} = {}) {
  return sha256([
    normalizeIp(ip),
    normalizeUserAgent(userAgent),
    String(acceptLanguage ?? "").trim().toLowerCase(),
    String(acceptEncoding ?? "").trim().toLowerCase()
  ].join("\n"));
}

export class DeviceFingerprintService {
  constructor({ database } = {}) {
    this.database = database;
    // 内存降级：`${type}:${hash}` -> { userIds:Set, ip, firstSeenAt, lastSeenAt }
    this.memory = new Map();
  }

  // 记录一次注册/登录的设备信号，返回本次形成的疑似重复组（≥2 个不同账号）。
  async record({
    userId,
    ip = "",
    userAgent = "",
    acceptLanguage = "",
    acceptEncoding = "",
    clientDeviceId = ""
  } = {}) {
    if (!userId) return { newDuplicates: [] };
    const now = new Date().toISOString();
    const cleanIp = normalizeIp(ip);
    const clientId = normalizeClientDeviceId(clientDeviceId);
    const softSignature = computeSoftSignature({
      ip: cleanIp,
      userAgent,
      acceptLanguage,
      acceptEncoding
    });

    const keys = [];
    if (clientId) keys.push({ type: "client", hash: sha256(clientId) });
    keys.push({ type: "soft", hash: softSignature });
    if (cleanIp && cleanIp !== "unknown") keys.push({ type: "ip", hash: sha256(cleanIp) });

    const newDuplicates = [];
    for (const key of keys) {
      await this.#upsert(key.type, key.hash, userId, cleanIp, now);
      const userIds = await this.#userIdsFor(key.type, key.hash);
      if (userIds.size >= 2) {
        newDuplicates.push({ type: key.type, count: userIds.size, userIds: [...userIds] });
      }
    }
    return { newDuplicates };
  }

  async #upsert(type, hash, userId, ip, now) {
    if (this.database) {
      await this.database.query(
        `INSERT INTO user_device_fingerprints
           (fingerprint_type, fingerprint_hash, user_id, ip, first_seen_at, last_seen_at)
         VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT (fingerprint_type, fingerprint_hash, user_id)
         DO UPDATE SET ip = EXCLUDED.ip, last_seen_at = EXCLUDED.last_seen_at`,
        [type, hash, userId, ip || null, now, now]
      );
      return;
    }
    const key = `${type}:${hash}`;
    let entry = this.memory.get(key);
    if (!entry) {
      entry = { userIds: new Set(), ip: ip || "", firstSeenAt: now, lastSeenAt: now };
      this.memory.set(key, entry);
    }
    entry.userIds.add(userId);
    entry.ip = ip || entry.ip;
    entry.lastSeenAt = now;
  }

  async #userIdsFor(type, hash) {
    if (this.database) {
      const result = await this.database.query(
        `SELECT user_id FROM user_device_fingerprints WHERE fingerprint_type = $1 AND fingerprint_hash = $2`,
        [type, hash]
      );
      return new Set(result.rows.map((row) => row.user_id));
    }
    return new Set(this.memory.get(`${type}:${hash}`)?.userIds || []);
  }

  // 疑似同人多账号分组：同一种指纹关联了 ≥2 个不同账号即视为一组。
  // 返回按置信度（高→低）、账号数（多→少）、最近出现时间（新→旧）排序的分组。
  async listSuspected({ limit = 50, offset = 0 } = {}) {
    const safeLimit = Math.min(Math.max(Number(limit) || 50, 1), 200);
    const safeOffset = Math.max(Number(offset) || 0, 0);
    let groups;

    if (this.database) {
      const result = await this.database.query(
        `SELECT fingerprint_type, fingerprint_hash,
                min(ip) AS ip,
                min(first_seen_at) AS first_seen_at,
                max(last_seen_at) AS last_seen_at,
                count(DISTINCT user_id)::int AS n,
                array_agg(DISTINCT user_id) AS user_ids
         FROM user_device_fingerprints
         GROUP BY fingerprint_type, fingerprint_hash
         HAVING count(DISTINCT user_id) >= 2`
      );
      groups = result.rows.map(toGroup);
    } else {
      groups = [];
      for (const [key, entry] of this.memory) {
        if (entry.userIds.size < 2) continue;
        const [type, hash] = key.split(":");
        groups.push({
          type,
          fingerprintHash: hash,
          ip: entry.ip || "",
          firstSeenAt: entry.firstSeenAt,
          lastSeenAt: entry.lastSeenAt,
          count: entry.userIds.size,
          userIds: [...entry.userIds]
        });
      }
    }

    const order = (type) => FINGERPRINT_CONFIDENCE[type]?.rank ?? 99;
    groups.sort((a, b) =>
      order(a.type) - order(b.type)
      || (b.count - a.count)
      || String(b.lastSeenAt || "").localeCompare(String(a.lastSeenAt || ""))
    );

    const total = groups.length;
    return {
      total,
      groups: groups.slice(safeOffset, safeOffset + safeLimit).map((group) => ({
        ...group,
        confidence: FINGERPRINT_CONFIDENCE[group.type] || { rank: 99, label: "未知", title: "未知" }
      }))
    };
  }
}

function toGroup(row) {
  return {
    type: row.fingerprint_type,
    fingerprintHash: row.fingerprint_hash,
    ip: row.ip || "",
    firstSeenAt: row.first_seen_at,
    lastSeenAt: row.last_seen_at,
    count: row.n,
    userIds: row.user_ids || []
  };
}
