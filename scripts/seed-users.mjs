import { createDatabase } from "../server/database.mjs";
import { AuthService } from "../server/auth.mjs";
import { seedTestUsers } from "../server/seed-users.mjs";

const database = createDatabase();
if (!database) {
  console.error("DATABASE_URL is required for seeding");
  process.exitCode = 1;
} else {
  try {
    const auth = new AuthService({ database });
    const seeded = await seedTestUsers(auth);
    console.log(`Seeded admin: ${seeded.admin.email} (isAdmin=${seeded.admin.isAdmin})`);
    console.log(`Seeded user:  ${seeded.user.email} (isAdmin=${seeded.user.isAdmin})`);
  } finally {
    await database.end().catch(() => {});
  }
}
