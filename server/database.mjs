import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

export function createDatabase(connectionString = process.env.DATABASE_URL) {
  if (!connectionString) return null;
  const { Pool } = require("pg");
  return new Pool({
    connectionString,
    max: Number.parseInt(process.env.DATABASE_POOL_SIZE || "10", 10),
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 5_000
  });
}

export async function checkDatabase(pool) {
  if (!pool) return { configured: false, ok: false };
  try {
    await pool.query("SELECT 1");
    return { configured: true, ok: true };
  } catch (error) {
    return { configured: true, ok: false, error: error?.message || "database unavailable" };
  }
}
