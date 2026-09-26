import { pool } from "../src/db";
import { importBetaDrafts } from "../src/features/editorial/beta-seed";

const email = process.argv[2];
if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
  throw new Error("Usage: DATABASE_URL=... npm run beta:import -- verified-editor@example.com");
}

importBetaDrafts(email)
  .then(({ created, existing }) => console.log(`Imported ${created.length} drafts; ${existing.length} already existed. All remain unreviewed.`))
  .catch((error: unknown) => { console.error(error); process.exitCode = 1; })
  .finally(() => pool.end());
