import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { answerKeys, attemptGroups, attemptItems, attempts, exerciseItems, exerciseRevisions, exercises } from "@/db/schema";
import { contentSchemas, promptSchemas } from "@/features/editorial/schemas";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
type Connection = typeof db | Tx;
type Failure = { error: string; status: 404 | 409 | 422 };
const fail = (error: string, status: Failure["status"]): Failure => ({ error, status });

export const groupsSchema = z.union([z.literal(1), z.literal(2)]);
export const selectionSchema = z.object({ groups: groupsSchema, timerMode: z.enum(["count_up", "count_down"]) }).strict();
export const responseSchema = z.object({ version: z.number().int().nonnegative(), response: z.object({ suffix: z.string().max(100) }).strict() }).strict();
export const rules = { version: "R1-1", secondsPerGroup: 300, navigation: "bidirectional", normalization: "key_defined" } as const;

async function now(connection: Connection) {
  const result = await connection.execute<{ server_time: Date }>(sql`select clock_timestamp() as server_time`);
  return new Date(result.rows[0].server_time);
}

async function candidates(connection: Connection) {
  const rows = await connection.select({ id: exerciseRevisions.id, exerciseId: exercises.id, revisionNumber: exerciseRevisions.revisionNumber, content: exerciseRevisions.publicContent })
    .from(exerciseRevisions).innerJoin(exercises, eq(exercises.id, exerciseRevisions.exerciseId))
    .where(and(eq(exercises.typeCode, "R1"), eq(exerciseRevisions.status, "published")))
    .orderBy(desc(exerciseRevisions.revisionNumber), asc(exercises.id));
  if (!rows.length) return [];
  const itemRows = await connection.select({ revisionId: exerciseItems.revisionId, prompt: exerciseItems.publicPrompt })
    .from(exerciseItems).where(inArray(exerciseItems.revisionId, rows.map((row) => row.id)));
  const valid = rows.filter((row) => {
    const content = contentSchemas.R1.safeParse(row.content);
    const prompts = itemRows.filter((item) => item.revisionId === row.id).map((item) => promptSchemas.R1.safeParse(item.prompt));
    if (!content.success || !prompts.length || prompts.some((prompt) => !prompt.success)) return false;
    const gapIds = content.data.segments.filter((segment) => segment.kind === "gap").map((segment) => segment.gapId);
    const promptIds = prompts.map((prompt) => prompt.success ? prompt.data.gapId : "");
    return gapIds.length === promptIds.length && new Set(gapIds).size === gapIds.length && gapIds.every((gapId) => promptIds.includes(gapId));
  });
  const latest = [...new Map([...valid].reverse().map((row) => [row.exerciseId, row])).values()].sort((a, b) => a.exerciseId.localeCompare(b.exerciseId));
  return latest.map((row) => ({ ...row, itemCount: itemRows.filter((item) => item.revisionId === row.id).length }));
}

export async function availability(groups: 1 | 2) {
  const available = await candidates(db);
  return { typeCode: "R1" as const, requestedGroups: groups, materialCount: Math.min(groups, available.length), itemCount: available.slice(0, groups).reduce((sum, row) => sum + row.itemCount, 0), availableMaterials: available.length, shortage: Math.max(0, groups - available.length), rules };
}

export async function openAttempts(userId: string) {
  return db.select({ id: attempts.id, status: attempts.status, createdAt: attempts.createdAt })
    .from(attempts).where(and(eq(attempts.userId, userId), eq(attempts.typeCode, "R1"), inArray(attempts.status, ["prepared", "in_progress"]))).orderBy(desc(attempts.createdAt));
}

export async function create(userId: string, groups: 1 | 2, timerMode: "count_up" | "count_down") {
  return db.transaction(async (tx) => {
    const available = await candidates(tx);
    if (available.length < groups) return fail(`Faltan ${groups - available.length} materiales publicados`, 422);
    const selected = available.slice(0, groups);
    const locked = await tx.select({ id: exerciseRevisions.id, status: exerciseRevisions.status }).from(exerciseRevisions)
      .where(inArray(exerciseRevisions.id, selected.map((row) => row.id))).for("share");
    if (locked.length !== groups || locked.some((row) => row.status !== "published")) return fail("La disponibilidad cambió; vuelve a seleccionar", 409);
    const id = crypto.randomUUID();
    await tx.insert(attempts).values({ id, userId, typeCode: "R1", requestedGroups: groups, timerMode, rulesSnapshot: rules });
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
  const [attempt] = await tx.select().from(attempts).where(and(eq(attempts.id, id), eq(attempts.userId, userId), eq(attempts.typeCode, "R1"))).for("update");
  return attempt;
}

function acceptedAnswers(value: unknown): string[] {
  if (!Array.isArray(value) || !value.length || !value.every((answer) => typeof answer === "string")) throw new Error("Clave R1 inválida");
  return value;
}

function isCorrect(response: string, accepted: string[], scoringRule: string) {
  if (scoringRule === "case_insensitive") return accepted.some((answer) => answer.toLocaleLowerCase("en-US") === response.toLocaleLowerCase("en-US"));
  return accepted.includes(response);
}

async function close(tx: Tx, attempt: typeof attempts.$inferSelect, time: Date) {
  if (attempt.status === "submitted") return;
  const rows = await tx.select({ id: attemptItems.id, response: attemptItems.responseJson, revisionId: attemptItems.revisionId, itemId: attemptItems.itemId, pointsPossible: attemptItems.pointsPossible })
    .from(attemptItems).where(eq(attemptItems.attemptId, attempt.id));
  const keys = await tx.select().from(answerKeys).where(inArray(answerKeys.itemId, rows.map((row) => row.itemId)));
  let awarded = 0;
  let possible = 0;
  for (const row of rows) {
    const key = keys.find((value) => value.itemId === row.itemId && value.revisionId === row.revisionId);
    if (!key) throw new Error("Falta clave para un hueco publicado");
    const suffix = (row.response as { suffix?: string } | null)?.suffix ?? "";
    const correct = suffix.length > 0 && isCorrect(suffix, acceptedAnswers(key.acceptedAnswers), key.scoringRule);
    possible += Number(row.pointsPossible);
    if (correct) awarded += Number(row.pointsPossible);
    await tx.update(attemptItems).set({ outcome: !suffix ? "omitted" : correct ? "correct" : "incorrect", pointsAwarded: correct ? row.pointsPossible : "0" }).where(eq(attemptItems.id, row.id));
  }
  await tx.update(attempts).set({ status: "submitted", submittedAt: time, pointsAwarded: String(awarded), pointsPossible: String(possible) }).where(eq(attempts.id, attempt.id));
}

async function reconcile(tx: Tx, attempt: typeof attempts.$inferSelect, time: Date) {
  if (attempt.status === "in_progress" && attempt.deadlineAt && time >= attempt.deadlineAt) {
    await close(tx, attempt, time);
    return "submitted" as const;
  }
  return attempt.status;
}

export async function detail(id: string, userId: string) {
  return db.transaction(async (tx) => {
    const attempt = await locked(tx, id, userId);
    if (!attempt) return fail("No encontrado", 404);
    const time = await now(tx);
    const status = await reconcile(tx, attempt, time);
    const [fresh] = await tx.select().from(attempts).where(eq(attempts.id, id));
    const groups = await tx.select({ id: attemptGroups.id, ordinal: attemptGroups.ordinal, revisionId: attemptGroups.revisionId, content: exerciseRevisions.publicContent })
      .from(attemptGroups).innerJoin(exerciseRevisions, eq(attemptGroups.revisionId, exerciseRevisions.id))
      .where(eq(attemptGroups.attemptId, id)).orderBy(asc(attemptGroups.ordinal));
    const items = await tx.select({ id: attemptItems.id, groupId: attemptItems.groupId, position: attemptItems.globalPosition, prompt: exerciseItems.publicPrompt, response: attemptItems.responseJson, version: attemptItems.responseVersion, savedAt: attemptItems.savedAt, outcome: attemptItems.outcome, pointsPossible: attemptItems.pointsPossible, pointsAwarded: attemptItems.pointsAwarded, revisionId: attemptItems.revisionId, itemId: attemptItems.itemId })
      .from(attemptItems).innerJoin(exerciseItems, and(eq(exerciseItems.id, attemptItems.itemId), eq(exerciseItems.revisionId, attemptItems.revisionId)))
      .where(eq(attemptItems.attemptId, id)).orderBy(asc(attemptItems.globalPosition));
    const keys = status === "submitted" ? await tx.select().from(answerKeys).where(inArray(answerKeys.itemId, items.map((row) => row.itemId))) : [];
    return { id, typeCode: "R1" as const, status, timerMode: attempt.timerMode, rules: attempt.rulesSnapshot as typeof rules, currentPosition: fresh.currentPosition,
      serverTime: time.toISOString(), startedAt: fresh.startedAt?.toISOString() ?? null, deadlineAt: fresh.deadlineAt?.toISOString() ?? null, submittedAt: fresh.submittedAt?.toISOString() ?? null,
      materialCount: groups.length, itemCount: items.length,
      pointsAwarded: status === "submitted" ? Number(fresh.pointsAwarded) : null, pointsPossible: status === "submitted" ? Number(fresh.pointsPossible) : null,
      groups: groups.map((group) => { const groupItems = items.filter((item) => item.groupId === group.id); return { ...group, content: contentSchemas.R1.parse(group.content), ...(status === "submitted" ? { result: { pointsAwarded: groupItems.reduce((sum, item) => sum + Number(item.pointsAwarded), 0), pointsPossible: groupItems.reduce((sum, item) => sum + Number(item.pointsPossible), 0), omissions: groupItems.filter((item) => item.outcome === "omitted").length } } : {}) }; }),
      items: items.map((item) => { const key = keys.find((value) => value.itemId === item.itemId && value.revisionId === item.revisionId); return { id: item.id, groupId: item.groupId, position: item.position, prompt: promptSchemas.R1.parse(item.prompt), response: item.response as { suffix: string } | null, version: item.version, savedAt: item.savedAt?.toISOString() ?? null,
        ...(status === "submitted" ? { outcome: item.outcome, pointsPossible: Number(item.pointsPossible), pointsAwarded: Number(item.pointsAwarded), acceptedSuffixes: acceptedAnswers(key?.acceptedAnswers), explanation: key?.explanation } : {}) }; }),
    };
  });
}

export async function start(id: string, userId: string) {
  return db.transaction(async (tx) => {
    const attempt = await locked(tx, id, userId);
    if (!attempt) return fail("No encontrado", 404);
    const time = await now(tx);
    const status = await reconcile(tx, attempt, time);
    if (status === "submitted") return fail("Intento entregado", 409);
    if (status === "prepared") {
      const preset = attempt.rulesSnapshot as typeof rules;
      await tx.update(attempts).set({ status: "in_progress", startedAt: time, deadlineAt: attempt.timerMode === "count_down" ? new Date(time.getTime() + preset.secondsPerGroup * attempt.requestedGroups * 1000) : null }).where(eq(attempts.id, id));
    }
    return { id };
  });
}

export async function save(id: string, userId: string, itemId: string, version: number, suffix: string) {
  return db.transaction(async (tx) => {
    const attempt = await locked(tx, id, userId);
    if (!attempt) return fail("No encontrado", 404);
    const time = await now(tx);
    if (await reconcile(tx, attempt, time) !== "in_progress") return fail("El intento no admite respuestas", 409);
    const [item] = await tx.select({ version: attemptItems.responseVersion }).from(attemptItems).where(and(eq(attemptItems.id, itemId), eq(attemptItems.attemptId, id)));
    if (!item) return fail("Hueco no encontrado", 404);
    if (item.version !== version) return fail("Respuesta desactualizada", 409);
    await tx.update(attemptItems).set({ responseJson: { suffix }, responseVersion: version + 1, savedAt: time }).where(eq(attemptItems.id, itemId));
    return { version: version + 1, savedAt: time.toISOString() };
  });
}

export async function move(id: string, userId: string, position: number) {
  return db.transaction(async (tx) => {
    const attempt = await locked(tx, id, userId);
    if (!attempt) return fail("No encontrado", 404);
    if (await reconcile(tx, attempt, await now(tx)) === "prepared") return fail("Intento no activo", 409);
    const [item] = await tx.select({ id: attemptItems.id }).from(attemptItems).where(and(eq(attemptItems.attemptId, id), eq(attemptItems.globalPosition, position)));
    if (!item) return fail("Posición inválida", 422);
    await tx.update(attempts).set({ currentPosition: position }).where(eq(attempts.id, id));
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
