import { pool } from "../src/db";
import { recoverDeadlineSchedules } from "../src/features/practice/deadlines";

async function main() {
  const results = await recoverDeadlineSchedules();
  const failed = results.filter((result) => result.status === "failed");
  console.log(`Processed ${results.length} deadline schedules; ${failed.length} failed.`);
  if (failed.length) process.exitCode = 1;
}

main().finally(() => pool.end());
