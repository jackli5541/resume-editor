import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { createDatabase } from "../server/database.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));
const migrationDir = join(root, "infra", "postgres", "init");
const pool = createDatabase();
if (!pool) throw new Error("DATABASE_URL is required for migrations");

try {
  const files = (await readdir(migrationDir)).filter((file) => file.endsWith(".sql")).sort();
  for (const file of files) {
    const exists = await pool.query(
      "SELECT to_regclass('public.schema_migrations') IS NOT NULL AS exists"
    );
    if (exists.rows[0].exists) {
      const applied = await pool.query("SELECT 1 FROM schema_migrations WHERE version = $1", [file]);
      if (applied.rowCount) continue;
    }
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query(await readFile(join(migrationDir, file), "utf8"));
      await client.query(
        "INSERT INTO schema_migrations (version) VALUES ($1) ON CONFLICT DO NOTHING",
        [file]
      );
      await client.query("COMMIT");
      console.log(`Applied ${file}`);
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }
} finally {
  await pool.end();
}
