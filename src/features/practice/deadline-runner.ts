import { eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { deadlineJobs, attempts } from "@/db/schema";
import type { DeadlineScheduler } from "./deadlines";
import { triggerDeadlineScheduler } from "./deadlines";
import { reconcileDeadline as reconcileR1 } from "./r1";
import { reconcileDeadline as reconcileR3 } from "./engine";
import { reconcileDeadline as reconcileW1 } from "./w1";
import { reconcileDeadline as reconcileW2 } from "./w2";
import { reconcileDeadline as reconcileL2 } from "./l2/engine";

export async function runDeadlineJob(deadlineJobId: string, scheduler: DeadlineScheduler = triggerDeadlineScheduler) {
  const [job] = await db.select().from(deadlineJobs).where(eq(deadlineJobs.id, deadlineJobId));
  if (!job) throw new Error(`Deadline job ${deadlineJobId} does not exist`);
  if (job.status === "completed") return { status: "completed" as const };
  const serverTime = new Date((await db.execute<{ now: Date }>(sql`select clock_timestamp() as now`)).rows[0].now);
  if (serverTime < job.deadlineAt) throw new Error(`Deadline job ${deadlineJobId} ran before its database deadline`);
  const [attempt] = await db.select({ typeCode: attempts.typeCode }).from(attempts).where(eq(attempts.id, job.attemptId));
  if (!attempt) throw new Error(`Attempt ${job.attemptId} does not exist`);

  if (attempt.typeCode === "R1") await reconcileR1(job.attemptId, scheduler);
  else if (attempt.typeCode === "R3") await reconcileR3(job.attemptId, scheduler);
  else if (attempt.typeCode === "W1") await reconcileW1(job.attemptId, scheduler);
  else if (attempt.typeCode === "W2") await reconcileW2(job.attemptId, scheduler);
  else if (attempt.typeCode === "L2") await reconcileL2(job.attemptId, scheduler);
  else throw new Error(`Unsupported attempt type ${attempt.typeCode}`);

  await db.update(deadlineJobs).set({ status: "completed", completedAt: new Date(), lastError: null, updatedAt: new Date() }).where(eq(deadlineJobs.id, job.id));
  return { status: "completed" as const };
}
