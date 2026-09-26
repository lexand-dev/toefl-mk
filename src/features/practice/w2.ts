import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/db";
import { attemptGroups, attemptItems, attempts, exerciseItems, exerciseRevisions, exercises, writingSelfReviews, writingTaskTimes } from "@/db/schema";
import { contentSchemas, promptSchemas } from "@/features/editorial/schemas";
import type { Checklist } from "./w2-schemas";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
type Failure = { error: string; status: 404 | 409 | 422 };
const fail = (error: string, status: Failure["status"]): Failure => ({ error, status });
export const w2Rules = { version: "W2-1", secondsPerTask: 420, navigation: "bidirectional", rubric: ["task", "organization", "register", "language"] } as const;
const emptyChecklist = (): Checklist => ({ task: false, organization: false, register: false, language: false });

async function now(tx: Tx) {
  const result = await tx.execute<{ server_time: Date }>(sql`select clock_timestamp() as server_time`);
  return new Date(result.rows[0].server_time);
}

async function candidates(tx: typeof db | Tx) {
  const revisions = await tx.select({ id: exerciseRevisions.id, exerciseId: exercises.id, revisionNumber: exerciseRevisions.revisionNumber })
    .from(exerciseRevisions).innerJoin(exercises, eq(exercises.id, exerciseRevisions.exerciseId))
    .where(and(eq(exercises.typeCode, "W2"), eq(exerciseRevisions.status, "published")))
    .orderBy(desc(exerciseRevisions.revisionNumber), asc(exercises.id));
  return [...new Map([...revisions].reverse().map((row) => [row.exerciseId, row])).values()].sort((a, b) => a.exerciseId.localeCompare(b.exerciseId));
}

export async function summary(groups: 1 | 2 | 3) {
  const available = await candidates(db);
  const selected = available.slice(0, groups);
  const counts = selected.length ? await db.select({ revisionId: exerciseItems.revisionId, count: sql<number>`count(*)::integer` }).from(exerciseItems)
    .where(inArray(exerciseItems.revisionId, selected.map((row) => row.id))).groupBy(exerciseItems.revisionId) : [];
  return { typeCode: "W2" as const, requestedGroups: groups, materialCount: selected.length, itemCount: counts.reduce((sum, row) => sum + row.count, 0), availableMaterials: available.length, shortage: groups - selected.length, rules: w2Rules };
}

export async function history(userId: string) {
  return db.select({ id: attempts.id, status: attempts.status, createdAt: attempts.createdAt, submittedAt: attempts.submittedAt, timerMode: attempts.timerMode })
    .from(attempts).where(and(eq(attempts.userId, userId), eq(attempts.typeCode, "W2"))).orderBy(desc(attempts.createdAt));
}

export async function create(userId: string, groups: 1 | 2 | 3, timerMode: "count_up" | "count_down") {
  return db.transaction(async (tx) => {
    const available = await candidates(tx);
    if (available.length < groups) return fail(`Faltan ${groups - available.length} materiales publicados`, 422);
    const selected = available.slice(0, groups);
    const locked = await tx.select({ id: exerciseRevisions.id, status: exerciseRevisions.status }).from(exerciseRevisions)
      .where(inArray(exerciseRevisions.id, selected.map((row) => row.id))).for("share");
    if (locked.length !== groups || locked.some((row) => row.status !== "published")) return fail("La disponibilidad cambió; vuelve a seleccionar", 409);
    const id = crypto.randomUUID();
    await tx.insert(attempts).values({ id, userId, typeCode: "W2", requestedGroups: groups, timerMode, rulesSnapshot: w2Rules });
    let position = 1;
    for (const [index, revision] of selected.entries()) {
      const groupId = crypto.randomUUID();
      await tx.insert(attemptGroups).values({ id: groupId, attemptId: id, revisionId: revision.id, ordinal: index + 1 });
      const items = await tx.select({ id: exerciseItems.id, pointsPossible: exerciseItems.pointsPossible }).from(exerciseItems)
        .where(eq(exerciseItems.revisionId, revision.id)).orderBy(asc(exerciseItems.ordinal));
      for (const item of items) await tx.insert(attemptItems).values({ id: crypto.randomUUID(), attemptId: id, groupId, revisionId: revision.id, itemId: item.id, globalPosition: position++, pointsPossible: item.pointsPossible });
    }
    return { id };
  });
}

async function locked(tx: Tx, id: string, userId: string) {
  const [attempt] = await tx.select().from(attempts).where(and(eq(attempts.id, id), eq(attempts.userId, userId), eq(attempts.typeCode, "W2"))).for("update");
  return attempt;
}

async function items(tx: Tx, id: string) {
  return tx.select({ id: attemptItems.id, groupId: attemptItems.groupId, position: attemptItems.globalPosition, prompt: exerciseItems.publicPrompt, response: attemptItems.responseJson, version: attemptItems.responseVersion, savedAt: attemptItems.savedAt, outcome: attemptItems.outcome })
    .from(attemptItems).innerJoin(exerciseItems, and(eq(exerciseItems.id, attemptItems.itemId), eq(exerciseItems.revisionId, attemptItems.revisionId)))
    .where(eq(attemptItems.attemptId, id)).orderBy(asc(attemptItems.globalPosition));
}

async function activate(tx: Tx, attempt: typeof attempts.$inferSelect, itemId: string, time: Date, position: number) {
  const rules = attempt.rulesSnapshot as typeof w2Rules;
  await tx.insert(writingTaskTimes).values({ itemId, startedAt: time, deadlineAt: attempt.timerMode === "count_down" ? new Date(time.getTime() + rules.secondsPerTask * 1000) : null }).onConflictDoNothing();
  const [task] = await tx.select().from(writingTaskTimes).where(eq(writingTaskTimes.itemId, itemId));
  await tx.update(attempts).set({ currentPosition: position, deadlineAt: task.deadlineAt }).where(eq(attempts.id, attempt.id));
}

async function close(tx: Tx, attempt: typeof attempts.$inferSelect, time: Date) {
  if (attempt.status === "submitted") return;
  await tx.update(attemptItems).set({ outcome: "ungraded" }).where(eq(attemptItems.attemptId, attempt.id));
  // No objective total or score exists for free text, even when the draft is empty.
  await tx.update(attempts).set({ status: "submitted", submittedAt: time, deadlineAt: null }).where(eq(attempts.id, attempt.id));
  await tx.insert(writingSelfReviews).values({ attemptId: attempt.id, checklist: emptyChecklist() }).onConflictDoNothing();
}

async function reconcile(tx: Tx, attempt: typeof attempts.$inferSelect, time: Date) {
  if (attempt.status !== "in_progress" || !attempt.deadlineAt || time < attempt.deadlineAt) return attempt.status;
  const rows = await items(tx, attempt.id);
  // On a delayed request, expire every task whose server deadline has passed; never restart a task's clock.
  for (let index = attempt.currentPosition; index <= rows.length; index++) {
    const next = rows[index];
    if (!next) { await close(tx, attempt, time); return "submitted"; }
    await activate(tx, attempt, next.id, time, index + 1);
    return "in_progress";
  }
  await close(tx, attempt, time);
  return "submitted";
}

export async function detail(id: string, userId: string) {
  return db.transaction(async (tx) => {
    const attempt = await locked(tx, id, userId);
    if (!attempt) return fail("No encontrado", 404);
    const time = await now(tx);
    const status = await reconcile(tx, attempt, time);
    const [fresh] = await tx.select().from(attempts).where(eq(attempts.id, id));
    const groups = await tx.select({ id: attemptGroups.id, ordinal: attemptGroups.ordinal, revisionId: attemptGroups.revisionId, content: exerciseRevisions.publicContent })
      .from(attemptGroups).innerJoin(exerciseRevisions, eq(exerciseRevisions.id, attemptGroups.revisionId))
      .where(eq(attemptGroups.attemptId, id)).orderBy(asc(attemptGroups.ordinal));
    const rows = await items(tx, id);
    const times = await tx.select().from(writingTaskTimes).where(inArray(writingTaskTimes.itemId, rows.map((row) => row.id)));
    const [review] = status === "submitted" ? await tx.select().from(writingSelfReviews).where(eq(writingSelfReviews.attemptId, id)) : [];
    return { id, typeCode: "W2" as const, status, timerMode: attempt.timerMode, rules: attempt.rulesSnapshot as typeof w2Rules, currentPosition: fresh.currentPosition,
      serverTime: time.toISOString(), startedAt: fresh.startedAt?.toISOString() ?? null, submittedAt: fresh.submittedAt?.toISOString() ?? null,
      materialCount: groups.length, itemCount: rows.length, pointsAwarded: null, pointsPossible: null,
      groups: groups.map((group) => ({ ...group, content: contentSchemas.W2.parse(group.content) })),
      items: rows.map((row) => ({ id: row.id, groupId: row.groupId, position: row.position, prompt: promptSchemas.W2.parse(row.prompt), response: row.response as { text: string } | null, version: row.version, savedAt: row.savedAt?.toISOString() ?? null,
        taskStartedAt: times.find((entry) => entry.itemId === row.id)?.startedAt.toISOString() ?? null,
        deadlineAt: times.find((entry) => entry.itemId === row.id)?.deadlineAt?.toISOString() ?? null,
        ...(status === "submitted" ? { outcome: row.outcome } : {}) })),
      ...(status === "submitted" ? { selfReview: { checklist: (review?.checklist ?? emptyChecklist()) as Checklist, version: review?.version ?? 0 } } : {}),
    };
  });
}

export async function start(id: string, userId: string) {
  return db.transaction(async (tx) => {
    const attempt = await locked(tx, id, userId);
    if (!attempt) return fail("No encontrado", 404);
    const time = await now(tx);
    if (await reconcile(tx, attempt, time) === "submitted") return fail("Intento entregado", 409);
    if (attempt.status === "prepared") {
      const [first] = await items(tx, id);
      await tx.update(attempts).set({ status: "in_progress", startedAt: time }).where(eq(attempts.id, id));
      await activate(tx, attempt, first.id, time, 1);
    }
    return { id };
  });
}

export async function save(id: string, userId: string, itemId: string, version: number, text: string) {
  return db.transaction(async (tx) => {
    const attempt = await locked(tx, id, userId);
    if (!attempt) return fail("No encontrado", 404);
    const time = await now(tx);
    if (await reconcile(tx, attempt, time) !== "in_progress") return fail("El intento no admite respuestas", 409);
    const [item] = await tx.select({ id: attemptItems.id, version: attemptItems.responseVersion, position: attemptItems.globalPosition })
      .from(attemptItems).where(and(eq(attemptItems.id, itemId), eq(attemptItems.attemptId, id)));
    if (!item) return fail("Ítem no encontrado", 404);
    const [task] = await tx.select().from(writingTaskTimes).where(eq(writingTaskTimes.itemId, itemId));
    if (!task || (task.deadlineAt && time >= task.deadlineAt)) return fail("La tarea ya no admite respuestas", 409);
    if (item.version !== version) return fail("Respuesta desactualizada", 409);
    await tx.update(attemptItems).set({ responseJson: { text }, responseVersion: version + 1, savedAt: time }).where(eq(attemptItems.id, itemId));
    return { version: version + 1, savedAt: time.toISOString() };
  });
}

export async function move(id: string, userId: string, position: number) {
  return db.transaction(async (tx) => {
    const attempt = await locked(tx, id, userId);
    if (!attempt) return fail("No encontrado", 404);
    const time = await now(tx);
    const status = await reconcile(tx, attempt, time);
    if (status === "prepared") return fail("Intento no activo", 409);
    const [item] = await tx.select({ id: attemptItems.id }).from(attemptItems).where(and(eq(attemptItems.attemptId, id), eq(attemptItems.globalPosition, position)));
    if (!item) return fail("Posición inválida", 422);
    if (status === "in_progress") {
      const [task] = await tx.select().from(writingTaskTimes).where(eq(writingTaskTimes.itemId, item.id));
      if (task?.deadlineAt && time >= task.deadlineAt) return fail("La tarea ya ha vencido", 409);
      await activate(tx, attempt, item.id, time, position);
    }
    else await tx.update(attempts).set({ currentPosition: position }).where(eq(attempts.id, id));
    return { currentPosition: position };
  });
}

export async function submit(id: string, userId: string) {
  return db.transaction(async (tx) => {
    const attempt = await locked(tx, id, userId);
    if (!attempt) return fail("No encontrado", 404);
    if (attempt.status === "prepared") return fail("Inicia el intento antes de entregar", 409);
    await close(tx, attempt, await now(tx));
    return { id };
  });
}

export async function selfReview(id: string, userId: string, version: number, checklist: Checklist) {
  return db.transaction(async (tx) => {
    const attempt = await locked(tx, id, userId);
    if (!attempt) return fail("No encontrado", 404);
    if (await reconcile(tx, attempt, await now(tx)) !== "submitted") return fail("Entrega antes de autoevaluarte", 409);
    const [review] = await tx.select().from(writingSelfReviews).where(eq(writingSelfReviews.attemptId, id));
    if (!review || review.version !== version) return fail("Autoevaluación desactualizada", 409);
    await tx.update(writingSelfReviews).set({ checklist, version: version + 1 }).where(eq(writingSelfReviews.attemptId, id));
    return { checklist, version: version + 1 };
  });
}
