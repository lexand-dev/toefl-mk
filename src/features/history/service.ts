import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/db";
import { attemptActivity, attemptGroups, attemptItems, attempts, exerciseRevisions, exercises, l2Sessions } from "@/db/schema";

export type Section = "reading" | "listening" | "writing";
export type AttemptStatus = "prepared" | "in_progress" | "submitted";
export type HistoryError = { error: string; status: 404 | 409 };
const sectionOf = (type: string): Section => type.startsWith("R") ? "reading" : type.startsWith("L") ? "listening" : "writing";

export async function history(userId: string, section?: Section, status?: AttemptStatus) {
  const rows = await db.select({ id: attempts.id, typeCode: attempts.typeCode, status: attempts.status, createdAt: attempts.createdAt,
    startedAt: attempts.startedAt, submittedAt: attempts.submittedAt, timerMode: attempts.timerMode,
    requestedGroups: attempts.requestedGroups, pointsAwarded: attempts.pointsAwarded, pointsPossible: attempts.pointsPossible,
  }).from(attempts).where(and(eq(attempts.userId, userId), ...(status ? [eq(attempts.status, status)] : []),
    ...(section ? [inArray(attempts.typeCode, section === "reading" ? ["R1", "R3"] : section === "listening" ? ["L2"] : ["W1", "W2"])] : [])))
    .orderBy(desc(attempts.createdAt), desc(attempts.id));
  return rows.map((row) => ({ id: row.id, typeCode: row.typeCode, section: sectionOf(row.typeCode), status: row.status,
    createdAt: row.createdAt.toISOString(), startedAt: row.startedAt?.toISOString() ?? null, submittedAt: row.submittedAt?.toISOString() ?? null,
    timerMode: row.timerMode, materialCount: row.requestedGroups,
    // Free-text work is delivered, not graded; never represent W2 as 0%.
    pointsAwarded: row.status === "submitted" && row.typeCode !== "W2" && row.pointsPossible !== null ? Number(row.pointsAwarded) : null,
    pointsPossible: row.status === "submitted" && row.typeCode !== "W2" && row.pointsPossible !== null ? Number(row.pointsPossible) : null,
  }));
}

export async function activity(userId: string) {
  const [time] = await db.select({ milliseconds: sql<number>`coalesce(sum(${attemptActivity.activeMilliseconds}), 0)::bigint` })
    .from(attemptActivity).innerJoin(attempts, eq(attempts.id, attemptActivity.attemptId)).where(eq(attempts.userId, userId));
  const [coverage] = await db.select({ count: sql<number>`count(distinct ${exercises.id})::integer` })
    .from(attemptGroups).innerJoin(attempts, eq(attempts.id, attemptGroups.attemptId))
    .innerJoin(exerciseRevisions, eq(exerciseRevisions.id, attemptGroups.revisionId))
    .innerJoin(exercises, eq(exercises.id, exerciseRevisions.exerciseId))
    .where(and(eq(attempts.userId, userId), eq(attempts.status, "submitted")));
  return { practiceSeconds: Math.floor(Number(time.milliseconds) / 1000), completedMaterials: coverage.count };
}

export async function repeatAttempt(id: string, userId: string) {
  return db.transaction(async (tx) => {
    const [source] = await tx.select().from(attempts).where(and(eq(attempts.id, id), eq(attempts.userId, userId))).for("share");
    if (!source) return { error: "No encontrado", status: 404 } as HistoryError;
    if (source.status !== "submitted") return { error: "Entrega el intento antes de repetirlo", status: 409 } as HistoryError;
    const groups = await tx.select().from(attemptGroups).where(eq(attemptGroups.attemptId, id)).orderBy(asc(attemptGroups.ordinal));
    const items = await tx.select().from(attemptItems).where(eq(attemptItems.attemptId, id)).orderBy(asc(attemptItems.globalPosition));
    const newId = crypto.randomUUID();
    await tx.insert(attempts).values({ id: newId, userId, typeCode: source.typeCode, requestedGroups: source.requestedGroups,
      timerMode: source.timerMode, rulesSnapshot: source.rulesSnapshot });
    if (source.typeCode === "L2") await tx.insert(l2Sessions).values({ attemptId: newId });
    for (const group of groups) {
      const groupId = crypto.randomUUID();
      await tx.insert(attemptGroups).values({ id: groupId, attemptId: newId, revisionId: group.revisionId, ordinal: group.ordinal });
      const assigned = items.filter((item) => item.groupId === group.id);
      if (assigned.length) await tx.insert(attemptItems).values(assigned.map((item) => ({ id: crypto.randomUUID(), attemptId: newId, groupId,
        revisionId: group.revisionId, itemId: item.itemId, globalPosition: item.globalPosition, pointsPossible: item.pointsPossible })));
    }
    return { id: newId, typeCode: source.typeCode };
  });
}

// A first visible ping establishes an anchor. Only continuous, reasonably spaced pings
// count; a suspended or hidden tab cannot claim the whole gap when it wakes up.
export async function heartbeat(id: string, userId: string, visible: boolean) {
  return db.transaction(async (tx) => {
    const [attempt] = await tx.select({ id: attempts.id, status: attempts.status, deadlineAt: attempts.deadlineAt })
      .from(attempts).where(and(eq(attempts.id, id), eq(attempts.userId, userId))).for("update");
    if (!attempt) return { error: "No encontrado", status: 404 } as HistoryError;
    const result = await tx.execute<{ now: Date }>(sql`select clock_timestamp() as now`);
    const now = new Date(result.rows[0].now);
    const [previous] = await tx.select().from(attemptActivity).where(eq(attemptActivity.attemptId, id));
    const active = attempt.status === "in_progress" && (!attempt.deadlineAt || now < attempt.deadlineAt);
    const elapsed = previous?.lastVisibleAt ? now.getTime() - previous.lastVisibleAt.getTime() : 0;
    const credit = active && visible && elapsed > 0 && elapsed <= 15000 ? elapsed : 0;
    const milliseconds = (previous?.activeMilliseconds ?? 0) + credit;
    if (previous) await tx.update(attemptActivity).set({ lastVisibleAt: active && visible ? now : null, activeMilliseconds: milliseconds })
      .where(eq(attemptActivity.attemptId, id));
    else await tx.insert(attemptActivity).values({ attemptId: id, lastVisibleAt: active && visible ? now : null, activeMilliseconds: milliseconds });
    return { practiceSeconds: Math.floor(milliseconds / 1000) };
  });
}
