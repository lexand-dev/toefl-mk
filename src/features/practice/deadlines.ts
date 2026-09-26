import { and, asc, eq, inArray, isNotNull, sql } from "drizzle-orm";
import { idempotencyKeys, tasks } from "@trigger.dev/sdk";
import { db } from "@/db";
import { attemptItems, attempts, deadlineJobs, l2Sessions, writingTaskTimes } from "@/db/schema";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
export type DeadlineKind = "attempt" | "w2_task" | "l2_listening" | "l2_question";

export interface DeadlineSchedule {
  deadlineJobId: string;
  deadlineAt: Date;
  idempotencyKey: string;
}

export interface DeadlineScheduler {
  schedule(input: DeadlineSchedule): Promise<{ runId: string }>;
}

export const triggerDeadlineScheduler: DeadlineScheduler = {
  async schedule(input) {
    if (process.env.NODE_ENV === "test") throw new Error("Trigger.dev scheduling is disabled in tests; inject a deadline scheduler");
    if (!process.env.TRIGGER_SECRET_KEY) throw new Error("TRIGGER_SECRET_KEY is not configured");
    const idempotencyKey = await idempotencyKeys.create(input.idempotencyKey, { scope: "global" });
    const handle = await tasks.trigger(
      "practice-deadline",
      { deadlineJobId: input.deadlineJobId },
      { delay: input.deadlineAt, idempotencyKey, idempotencyKeyTTL: "30d" },
    );
    return { runId: handle.id };
  },
};

function key(attemptId: string, kind: DeadlineKind, targetId: string | null, deadlineAt: Date) {
  return ["practice-deadline", attemptId, kind, targetId ?? "attempt", deadlineAt.toISOString()].join(":");
}

export async function enqueueDeadline(tx: Tx, input: { attemptId: string; kind: DeadlineKind; targetId?: string | null; deadlineAt: Date }) {
  const deadlineKey = key(input.attemptId, input.kind, input.targetId ?? null, input.deadlineAt);
  const id = crypto.randomUUID();
  await tx.insert(deadlineJobs).values({
    id,
    attemptId: input.attemptId,
    kind: input.kind,
    targetId: input.targetId ?? null,
    deadlineAt: input.deadlineAt,
    deadlineKey,
  }).onConflictDoNothing({ target: deadlineJobs.deadlineKey });
  const [row] = await tx.select({ id: deadlineJobs.id }).from(deadlineJobs).where(eq(deadlineJobs.deadlineKey, deadlineKey));
  return row.id;
}

function errorMessage(error: unknown) {
  const message = error instanceof Error ? error.message : "Unknown Trigger.dev scheduling error";
  return message.slice(0, 2000);
}

export async function dispatchPendingDeadlines(attemptId?: string, scheduler: DeadlineScheduler = triggerDeadlineScheduler) {
  const conditions = [inArray(deadlineJobs.status, ["pending", "failed"]), eq(attempts.status, "in_progress")];
  if (attemptId) conditions.push(eq(deadlineJobs.attemptId, attemptId));
  const rows = await db.select({
    id: deadlineJobs.id,
    deadlineAt: deadlineJobs.deadlineAt,
    deadlineKey: deadlineJobs.deadlineKey,
  }).from(deadlineJobs).innerJoin(attempts, eq(attempts.id, deadlineJobs.attemptId))
    .where(and(...conditions)).orderBy(asc(deadlineJobs.deadlineAt));

  const results: { id: string; status: "scheduled" | "failed" }[] = [];
  for (const row of rows) {
    try {
      const handle = await scheduler.schedule({ deadlineJobId: row.id, deadlineAt: row.deadlineAt, idempotencyKey: row.deadlineKey });
      await db.update(deadlineJobs).set({
        status: "scheduled",
        triggerRunId: handle.runId,
        lastError: null,
        scheduledAt: new Date(),
        updatedAt: new Date(),
        scheduleAttempts: sql`${deadlineJobs.scheduleAttempts} + 1`,
      }).where(and(eq(deadlineJobs.id, row.id), inArray(deadlineJobs.status, ["pending", "failed"])));
      results.push({ id: row.id, status: "scheduled" });
    } catch (error) {
      await db.update(deadlineJobs).set({
        status: "failed",
        lastError: errorMessage(error),
        updatedAt: new Date(),
        scheduleAttempts: sql`${deadlineJobs.scheduleAttempts} + 1`,
      }).where(and(eq(deadlineJobs.id, row.id), inArray(deadlineJobs.status, ["pending", "failed"])));
      results.push({ id: row.id, status: "failed" });
    }
  }
  return results;
}

export async function ensureActiveDeadlineJobs() {
  const active = await db.select().from(attempts).where(eq(attempts.status, "in_progress"));
  await db.transaction(async (tx) => {
    for (const attempt of active) {
      if (attempt.timerMode === "count_down" && ["R1", "R3", "W1"].includes(attempt.typeCode) && attempt.deadlineAt) {
        await enqueueDeadline(tx, { attemptId: attempt.id, kind: "attempt", deadlineAt: attempt.deadlineAt });
      }
      if (attempt.typeCode === "W2") {
        const tasks = await tx.select({ itemId: writingTaskTimes.itemId, deadlineAt: writingTaskTimes.deadlineAt })
          .from(writingTaskTimes).innerJoin(attemptItems, eq(attemptItems.id, writingTaskTimes.itemId))
          .where(and(eq(attemptItems.attemptId, attempt.id), isNotNull(writingTaskTimes.deadlineAt)));
        for (const task of tasks) if (task.deadlineAt) await enqueueDeadline(tx, { attemptId: attempt.id, kind: "w2_task", targetId: task.itemId, deadlineAt: task.deadlineAt });
      }
      if (attempt.typeCode === "L2") {
        const [session] = await tx.select().from(l2Sessions).where(eq(l2Sessions.attemptId, attempt.id));
        const [item] = await tx.select({ id: attemptItems.id }).from(attemptItems)
          .where(and(eq(attemptItems.attemptId, attempt.id), eq(attemptItems.globalPosition, attempt.currentPosition)));
        if (session?.listeningDeadlineAt) await enqueueDeadline(tx, { attemptId: attempt.id, kind: "l2_listening", targetId: item?.id, deadlineAt: session.listeningDeadlineAt });
        if (session?.questionDeadlineAt) await enqueueDeadline(tx, { attemptId: attempt.id, kind: "l2_question", targetId: item?.id, deadlineAt: session.questionDeadlineAt });
      }
    }
  });
  return active.map((attempt) => attempt.id);
}

export async function recoverDeadlineSchedules(scheduler: DeadlineScheduler = triggerDeadlineScheduler) {
  await ensureActiveDeadlineJobs();
  return dispatchPendingDeadlines(undefined, scheduler);
}
