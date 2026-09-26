import { eq, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { users } from "../src/db/schema";

const email = process.argv[2]?.toLowerCase();
if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) || !process.env.DATABASE_URL) {
  throw new Error("Usage: DATABASE_URL=... npm run admin:bootstrap -- verified@example.com");
}

async function main() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  try {
    const db = drizzle(pool);
    await db.transaction(async (tx) => {
      // Serialize competing bootstrap processes; this command only establishes the first admin.
      await tx.execute(sql`select pg_advisory_xact_lock(105311)`);
      const [existing] = await tx.select({ id: users.id }).from(users).where(eq(users.role, "admin")).limit(1);
      if (existing) throw new Error("An administrator already exists");
      const [candidate] = await tx.select({ id: users.id, emailVerified: users.emailVerified })
        .from(users).where(eq(users.email, email)).limit(1);
      if (!candidate?.emailVerified) throw new Error("A verified account with that email is required");
      await tx.update(users).set({ role: "admin" }).where(eq(users.id, candidate.id));
    });
    console.log(`Administrator bootstrapped: ${email}`);
  } finally {
    await pool.end();
  }
}

main().catch((error: unknown) => { console.error(error); process.exitCode = 1; });
