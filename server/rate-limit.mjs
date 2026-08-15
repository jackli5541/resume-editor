// 单实例内存限流器（固定窗口）。多实例部署应替换为 Redis 计数。
export class RateLimiter {
  constructor() {
    this.windows = new Map();
    this.timer = setInterval(() => this.prune(), 60_000);
    this.timer.unref();
  }

  // 返回 { allowed, retryAfterSeconds, limit, remaining }
  check(key, { limit, windowMs }) {
    const now = Date.now();
    let entry = this.windows.get(key);
    if (!entry || entry.resetAt <= now) {
      entry = { count: 0, resetAt: now + windowMs };
      this.windows.set(key, entry);
    }
    entry.count += 1;
    if (entry.count > limit) {
      return {
        allowed: false,
        retryAfterSeconds: Math.max(1, Math.ceil((entry.resetAt - now) / 1000)),
        limit,
        remaining: 0
      };
    }
    return { allowed: true, retryAfterSeconds: 0, limit, remaining: limit - entry.count };
  }

  prune() {
    const now = Date.now();
    for (const [key, entry] of this.windows) {
      if (entry.resetAt <= now) this.windows.delete(key);
    }
  }

  dispose() {
    clearInterval(this.timer);
  }
}

export function clientKey(ip, scope) {
  return `${ip}|${scope}`;
}

// 多实例共享限流器：基于 Redis INCR + PEXPIRE 的固定窗口实现。
export class RedisRateLimiter {
  constructor(connection) {
    this.connection = connection;
  }

  async check(key, { limit, windowMs }) {
    const now = Date.now();
    const redisKey = `rl:${key}`;
    const script = `
      local current = redis.call('INCR', KEYS[1])
      if current == 1 then
        redis.call('PEXPIRE', KEYS[1], ARGV[1])
      end
      local ttl = redis.call('PTTL', KEYS[1])
      if ttl < 0 then ttl = tonumber(ARGV[1]) end
      return {current, ttl}
    `;
    const result = await this.connection.eval(script, 1, redisKey, String(windowMs));
    const count = Number(result[0]);
    const ttlMs = Number(result[1]);
    if (count > limit) {
      return {
        allowed: false,
        retryAfterSeconds: Math.max(1, Math.ceil(ttlMs / 1000)),
        limit,
        remaining: 0
      };
    }
    return { allowed: true, retryAfterSeconds: 0, limit, remaining: Math.max(0, limit - count) };
  }

  dispose() {}
}
