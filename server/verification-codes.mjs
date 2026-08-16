// 验证码签发与校验（短信/邮箱共用）。只存哈希、恒时比较、5 分钟过期、最多 5 次尝试、用后即焚。

import { createHash, randomInt, randomUUID, timingSafeEqual } from "node:crypto";

const DEFAULT_TTL_MS = 5 * 60 * 1000;
const DEFAULT_MAX_ATTEMPTS = 5;
const CODE_DIGITS = 6;

function hashCode(code) {
  return createHash("sha256").update(String(code ?? "")).digest("base64url");
}

export class VerificationCodeService {
  constructor({ database, ttlMs = DEFAULT_TTL_MS, maxAttempts = DEFAULT_MAX_ATTEMPTS } = {}) {
    this.database = database;
    this.ttlMs = ttlMs;
    this.maxAttempts = maxAttempts;
    this.memory = new Map(); // `${purpose}:${identifier}` -> record
  }

  key(identifier, purpose) {
    return `${purpose}:${identifier}`;
  }

  async issue(identifier, purpose) {
    const id = randomUUID();
    const code = String(randomInt(0, 10 ** CODE_DIGITS)).padStart(CODE_DIGITS, "0");
    const codeHash = hashCode(code);
    const expiresAt = new Date(Date.now() + this.ttlMs);

    if (this.database) {
      await this.database.query(
        `INSERT INTO verification_codes (id, identifier, code_hash, purpose, expires_at)
         VALUES ($1, $2, $3, $4, $5)`,
        [id, identifier, codeHash, purpose, expiresAt]
      );
    } else {
      this.memory.set(this.key(identifier, purpose), { codeHash, expiresAt: expiresAt.getTime(), attempts: 0, consumed: false });
    }
    return { code, expiresAt };
  }

  async verify(identifier, purpose, code) {
    const providedHash = hashCode(code);
    const key = this.key(identifier, purpose);

    if (this.database) {
      const result = await this.database.query(
        `SELECT id, code_hash, attempts, consumed FROM verification_codes
         WHERE identifier = $1 AND purpose = $2 AND consumed = false AND expires_at > now()
         ORDER BY created_at DESC
         LIMIT 1`,
        [identifier, purpose]
      );
      const row = result.rows[0];
      if (!row) return false;
      if (row.attempts >= this.maxAttempts) {
        await this.database.query("UPDATE verification_codes SET consumed = true WHERE id = $1", [row.id]);
        return false;
      }
      const valid = timingSafeEqual(Buffer.from(row.code_hash), Buffer.from(providedHash));
      await this.database.query(
        "UPDATE verification_codes SET attempts = attempts + 1, consumed = $2 WHERE id = $1",
        [row.id, valid]
      );
      return valid;
    }

    const record = this.memory.get(key);
    if (!record || record.consumed || record.expiresAt <= Date.now()) return false;
    if (record.attempts >= this.maxAttempts) {
      record.consumed = true;
      return false;
    }
    const valid = timingSafeEqual(Buffer.from(record.codeHash), Buffer.from(providedHash));
    record.attempts += 1;
    if (valid) record.consumed = true;
    return valid;
  }
}
