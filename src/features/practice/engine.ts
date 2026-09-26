import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/db";
import { answerKeys, attemptGroups, attemptItems, attempts, exerciseItems, exerciseRevisions, exercises } from "@/db/schema";
import { r3Rules } from "./schemas";
import { gradeOption, publicPassage, publicQuestion, validOption } from "./r3";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
type Connection = typeof db | Tx;
export type PracticeError = { error: string; status: 404 | 409 | 422 };
const failure = (error: string, status: PracticeError["status"]): PracticeError => ({ error, status });

async function serverTime(connection: Connection) {
  const result = await connection.execute<{ server_time: Date }>(sql`select clock_timestamp() as server_time`);
  return new Date(result.rows[0].server_time);
}

async function candidates(connection: Connection) {
  const revisions = await connection.select({ id: exerciseRevisions.id, exerciseId: exercises.id, revisionNumber: exerciseRevisions.revisionNumber })
    .from(exerciseRevisions).innerJoin(exercises, eq(exercises.id, exerciseRevisions.exerciseId))
    .where(and(eq(exercises.typeCode, "R3"), eq(exerciseRevisions.status, "published")))
    .orderBy(desc(exerciseRevisions.revisionNumber), asc(exercises.id));
  const latest = [...new Map([...revisions].reverse().map((revision) => [revision.exerciseId, revision])).values()].sort((a, b) => a.exerciseId.localeCompare(b.exerciseId));
  if (!latest.length) return [];
  const counts = await connection.select({ revisionId: exerciseItems.revisionId, count: sql<number>`count(*)::integer` })
    .from(exerciseItems).where(inArray(exerciseItems.revisionId, latest.map((revision) => revision.id))).groupBy(exerciseItems.revisionId);
  return latest.map((revision) => ({ ...revision, itemCount: counts.find((row) => row.revisionId === revision.id)?.count ?? 0 }));
}

export async function availability(groups: 1 | 2) {
  const available = await candidates(db);
  return { typeCode: "R3" as const, requestedGroups: groups, materialCount: Math.min(groups, available.length), itemCount: available.slice(0, groups).reduce((sum, row) => sum + row.itemCount, 0), availableMaterials: available.length, shortage: Math.max(0, groups - available.length), rules: r3Rules };
}

export async function openAttempts(userId: string) {
  return db.select({ id: attempts.id, status: attempts.status, createdAt: attempts.createdAt, timerMode: attempts.timerMode })
    .from(attempts).where(and(eq(attempts.userId, userId), eq(attempts.typeCode, "R3"), inArray(attempts.status, ["prepared", "in_progress"]))).orderBy(desc(attempts.createdAt));
}

export async function createAttempt(userId: string, groups: 1 | 2, timerMode: "count_up" | "count_down") {
  return db.transaction(async (tx) => {
    const available = await candidates(tx);
    if (available.length < groups) return failure(`Faltan ${groups - available.length} materiales publicados`, 422);
    const selected = available.slice(0, groups);
    // Lock the selected revisions against retirement until the assignment commits.
    const locked = await tx.select({ id: exerciseRevisions.id, status: exerciseRevisions.status }).from(exerciseRevisions)
      .where(inArray(exerciseRevisions.id, selected.map((row) => row.id))).for("share");
    if (locked.length !== groups || locked.some((row) => row.status !== "published")) return failure("La disponibilidad cambió; vuelve a seleccionar", 409);
    const id = crypto.randomUUID();
    await tx.insert(attempts).values({ id, userId, typeCode: "R3", requestedGroups: groups, timerMode, rulesSnapshot: r3Rules });
    let position = 1;
    for (const [index, revision] of selected.entries()) {
      const groupId = crypto.randomUUID();
      await tx.insert(attemptGroups).values({ id: groupId, attemptId: id, revisionId: revision.id, ordinal: index + 1 });
      const items = await tx.select({ id: exerciseItems.id, pointsPossible: exerciseItems.pointsPossible })
        .from(exerciseItems).where(eq(exerciseItems.revisionId, revision.id)).orderBy(asc(exerciseItems.ordinal));
      for (const item of items) await tx.insert(attemptItems).values({ id: crypto.randomUUID(), attemptId: id, groupId, revisionId: revision.id, itemId: item.id, globalPosition: position++, pointsPossible: item.pointsPossible });
    }
    return { id };
  });
}

async function lockedAttempt(tx: Tx, id: string, userId: string) {
  const [attempt] = await tx.select().from(attempts).where(and(eq(attempts.id, id), eq(attempts.userId, userId), eq(attempts.typeCode, "R3"))).for("update");
  return attempt;
}

async function close(tx: Tx, attempt: typeof attempts.$inferSelect, now: Date) {
  if (attempt.status === "submitted") return;
  const rows = await tx.select({ id: attemptItems.id, responseJson: attemptItems.responseJson, revisionId: attemptItems.revisionId, itemId: attemptItems.itemId, pointsPossible: attemptItems.pointsPossible })
    .from(attemptItems).where(eq(attemptItems.attemptId, attempt.id));
  const keys = await tx.select().from(answerKeys).where(inArray(answerKeys.itemId, rows.map((row) => row.itemId)));
  let awarded = 0;
  let possible = 0;
  for (const row of rows) {
    const key = keys.find((value) => value.itemId === row.itemId && value.revisionId === row.revisionId);
    if (!key) throw new Error("Falta clave para un ítem publicado");
    const response = row.responseJson as { optionId?: string } | null;
    const answer = response?.optionId;
    const accepted = key.acceptedAnswers as string[];
    const correct = gradeOption(answer, accepted, key.scoringRule);
    const points = Number(row.pointsPossible);
    possible += points;
    if (correct) awarded += points;
    await tx.update(attemptItems).set({ outcome: !answer ? "omitted" : correct ? "correct" : "incorrect", pointsAwarded: correct ? row.pointsPossible : "0" }).where(eq(attemptItems.id, row.id));
  }
  await tx.update(attempts).set({ status: "submitted", submittedAt: now, pointsAwarded: String(awarded), pointsPossible: String(possible) }).where(eq(attempts.id, attempt.id));
}

async function reconcile(tx: Tx, attempt: typeof attempts.$inferSelect, now: Date) {
  if (attempt.status === "in_progress" && attempt.deadlineAt && now >= attempt.deadlineAt) {
    await close(tx, attempt, now);
    return "submitted";
  }
  return attempt.status;
}

export async function detail(id: string, userId: string) {
  return db.transaction(async (tx) => {
    const attempt = await lockedAttempt(tx, id, userId);
    if (!attempt) return failure("No encontrado", 404);
    const now = await serverTime(tx);
    const status = await reconcile(tx, attempt, now);
    const groups = await tx.select({ id: attemptGroups.id, ordinal: attemptGroups.ordinal, revisionId: attemptGroups.revisionId, content: exerciseRevisions.publicContent })
      .from(attemptGroups).innerJoin(exerciseRevisions, eq(attemptGroups.revisionId, exerciseRevisions.id))
      .where(eq(attemptGroups.attemptId, id)).orderBy(asc(attemptGroups.ordinal));
    const items = await tx.select({ id: attemptItems.id, groupId: attemptItems.groupId, position: attemptItems.globalPosition, prompt: exerciseItems.publicPrompt, response: attemptItems.responseJson, version: attemptItems.responseVersion, savedAt: attemptItems.savedAt, outcome: attemptItems.outcome, pointsPossible: attemptItems.pointsPossible, pointsAwarded: attemptItems.pointsAwarded, revisionId: attemptItems.revisionId, itemId: attemptItems.itemId })
      .from(attemptItems).innerJoin(exerciseItems, and(eq(exerciseItems.id, attemptItems.itemId), eq(exerciseItems.revisionId, attemptItems.revisionId)))
      .where(eq(attemptItems.attemptId, id)).orderBy(asc(attemptItems.globalPosition));
    const keys = status === "submitted" ? await tx.select().from(answerKeys).where(inArray(answerKeys.itemId, items.map((row) => row.itemId))) : [];
    return { id, typeCode: attempt.typeCode, status, timerMode: attempt.timerMode, rules: attempt.rulesSnapshot, currentPosition: attempt.currentPosition, serverTime: now.toISOString(), startedAt: attempt.startedAt?.toISOString() ?? null, deadlineAt: attempt.deadlineAt?.toISOString() ?? null, submittedAt: status === "submitted" ? (attempt.submittedAt ?? now).toISOString() : null,
      materialCount: groups.length, itemCount: items.length,
      pointsAwarded: status === "submitted" ? Number(attempt.pointsAwarded ?? items.reduce((sum, row) => sum + Number(row.pointsAwarded), 0)) : null,
      pointsPossible: status === "submitted" ? Number(attempt.pointsPossible ?? items.reduce((sum, row) => sum + Number(row.pointsPossible), 0)) : null,
      groups: groups.map((group) => ({ id: group.id, ordinal: group.ordinal, revisionId: group.revisionId, content: publicPassage(group.content) })),
      items: items.map((item) => ({ id: item.id, groupId: item.groupId, position: item.position, prompt: publicQuestion(item.prompt), response: item.response as { optionId: string } | null, version: item.version, savedAt: item.savedAt?.toISOString() ?? null, ...(status === "submitted" ? { outcome: item.outcome, pointsPossible: Number(item.pointsPossible), pointsAwarded: Number(item.pointsAwarded), correctOptionId: (keys.find((key) => key.itemId === item.itemId && key.revisionId === item.revisionId)?.acceptedAnswers as string[])[0], explanation: keys.find((key) => key.itemId === item.itemId && key.revisionId === item.revisionId)?.explanation } : {}) })),
    };
  });
}

export async function start(id: string, userId: string) {
  return db.transaction(async (tx) => {
    const attempt = await lockedAttempt(tx, id, userId);
    if (!attempt) return failure("No encontrado", 404);
    const now = await serverTime(tx);
    const status = await reconcile(tx, attempt, now);
    if (status === "submitted") return failure("Intento entregado", 409);
    if (status === "prepared") {
      const rules = attempt.rulesSnapshot as typeof r3Rules;
      await tx.update(attempts).set({ status: "in_progress", startedAt: now, deadlineAt: attempt.timerMode === "count_down" ? new Date(now.getTime() + rules.secondsPerGroup * attempt.requestedGroups * 1000) : null }).where(eq(attempts.id, id));
    }
    return { id };
  });
}

export async function save(id: string, userId: string, itemId: string, version: number, response: { optionId: string } | null) {
  return db.transaction(async (tx) => {
    const attempt = await lockedAttempt(tx, id, userId);
    if (!attempt) return failure("No encontrado", 404);
    const now = await serverTime(tx);
    if (await reconcile(tx, attempt, now) !== "in_progress") return failure("El intento no admite respuestas", 409);
    const [item] = await tx.select({ id: attemptItems.id, version: attemptItems.responseVersion, prompt: exerciseItems.publicPrompt })
      .from(attemptItems).innerJoin(exerciseItems, eq(exerciseItems.id, attemptItems.itemId))
      .where(and(eq(attemptItems.id, itemId), eq(attemptItems.attemptId, id)));
    if (!item) return failure("Ítem no encontrado", 404);
    if (item.version !== version) return failure("Respuesta desactualizada", 409);
    if (response && !validOption(item.prompt, response.optionId)) return failure("Opción inválida", 422);
    await tx.update(attemptItems).set({ responseJson: response, responseVersion: version + 1, savedAt: now }).where(eq(attemptItems.id, itemId));
    return { version: version + 1, savedAt: now.toISOString() };
  });
}

export async function move(id: string, userId: string, position: number) {
  return db.transaction(async (tx) => {
    const attempt = await lockedAttempt(tx, id, userId);
    if (!attempt) return failure("No encontrado", 404);
    if (await reconcile(tx, attempt, await serverTime(tx)) === "prepared") return failure("Intento no activo", 409);
    const [item] = await tx.select({ id: attemptItems.id }).from(attemptItems).where(and(eq(attemptItems.attemptId, id), eq(attemptItems.globalPosition, position)));
    if (!item) return failure("Posición inválida", 422);
    await tx.update(attempts).set({ currentPosition: position }).where(eq(attempts.id, id));
    return { currentPosition: position };
  });
}

export async function submit(id: string, userId: string) {
  return db.transaction(async (tx) => {
    const attempt = await lockedAttempt(tx, id, userId);
    if (!attempt) return failure("No encontrado", 404);
    if (attempt.status === "prepared") return failure("Inicia el intento antes de entregar", 409);
    await close(tx, attempt, await serverTime(tx));
    return { id };
  });
}
