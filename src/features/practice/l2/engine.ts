import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/db";
import { answerKeys, assets, attemptGroups, attemptItems, attempts, exerciseItems, exerciseRevisions, exercises, l2Sessions, reviewMaterials, revisionAssets } from "@/db/schema";
import { publicQuestion, gradeOption } from "../r3";
import { contentSchemas } from "@/features/editorial/schemas";
import { l2Rules } from "./schemas";
import { dispatchPendingDeadlines, enqueueDeadline, triggerDeadlineScheduler, type DeadlineScheduler } from "../deadlines";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
type Connection = typeof db | Tx;
type Attempt = typeof attempts.$inferSelect;
type Session = typeof l2Sessions.$inferSelect;
export type L2Error = { error: string; status: 404 | 409 | 422 };
const failure = (error: string, status: L2Error["status"]): L2Error => ({ error, status });
const mayDispatch = (result: object) => !("error" in result) || (result as L2Error).status !== 404;
const time = async (tx: Connection) => new Date((await tx.execute<{ now: Date }>(sql`select clock_timestamp() as now`)).rows[0].now);
const after = (date: Date, seconds: number) => new Date(date.getTime() + seconds * 1000);

async function candidates(tx: Connection) {
  const revisions = await tx.select({ id: exerciseRevisions.id, exerciseId: exercises.id, revisionNumber: exerciseRevisions.revisionNumber })
    .from(exerciseRevisions).innerJoin(exercises, eq(exercises.id, exerciseRevisions.exerciseId))
    .where(and(eq(exercises.typeCode, "L2"), eq(exerciseRevisions.status, "published")))
    .orderBy(desc(exerciseRevisions.revisionNumber), asc(exercises.id));
  const latest = [...new Map([...revisions].reverse().map((r) => [r.exerciseId, r])).values()].sort((a, b) => a.exerciseId.localeCompare(b.exerciseId));
  if (!latest.length) return [];
  const counts = await tx.select({ revisionId: exerciseItems.revisionId, count: sql<number>`count(*)::integer` })
    .from(exerciseItems).where(inArray(exerciseItems.revisionId, latest.map((r) => r.id))).groupBy(exerciseItems.revisionId);
  return latest.map((r) => ({ ...r, itemCount: counts.find((v) => v.revisionId === r.id)?.count ?? 0 }));
}

export async function availability(groups: 2 | 4) {
  const available = await candidates(db);
  return { typeCode: "L2" as const, requestedGroups: groups, materialCount: Math.min(groups, available.length), itemCount: available.slice(0, groups).reduce((n, r) => n + r.itemCount, 0), availableMaterials: available.length, shortage: Math.max(0, groups - available.length), rules: l2Rules };
}

export async function openAttempts(userId: string) {
  return db.select({ id: attempts.id, status: attempts.status, createdAt: attempts.createdAt })
    .from(attempts).where(and(eq(attempts.userId, userId), eq(attempts.typeCode, "L2"), inArray(attempts.status, ["prepared", "in_progress"]))).orderBy(desc(attempts.createdAt));
}

export async function createAttempt(userId: string, groups: 2 | 4, timerMode: "count_up" | "count_down") {
  return db.transaction(async (tx) => {
    const available = await candidates(tx);
    if (available.length < groups) return failure(`Faltan ${groups - available.length} conversaciones publicadas`, 422);
    const selected = available.slice(0, groups);
    const locked = await tx.select({ id: exerciseRevisions.id, status: exerciseRevisions.status }).from(exerciseRevisions)
      .where(inArray(exerciseRevisions.id, selected.map((r) => r.id))).for("share");
    if (locked.length !== groups || locked.some((r) => r.status !== "published")) return failure("La disponibilidad cambió; vuelve a seleccionar", 409);
    const id = crypto.randomUUID();
    await tx.insert(attempts).values({ id, userId, typeCode: "L2", requestedGroups: groups, timerMode, rulesSnapshot: l2Rules });
    await tx.insert(l2Sessions).values({ attemptId: id });
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
  const [attempt] = await tx.select().from(attempts).where(and(eq(attempts.id, id), eq(attempts.userId, userId), eq(attempts.typeCode, "L2"))).for("update");
  if (!attempt) return null;
  const [session] = await tx.select().from(l2Sessions).where(eq(l2Sessions.attemptId, id));
  return { attempt, session };
}

async function close(tx: Tx, attempt: Attempt, now: Date) {
  if (attempt.status === "submitted") return;
  const rows = await tx.select().from(attemptItems).where(eq(attemptItems.attemptId, attempt.id));
  const keys = await tx.select().from(answerKeys).where(inArray(answerKeys.itemId, rows.map((r) => r.itemId)));
  let awarded = 0;
  let possible = 0;
  for (const row of rows) {
    const key = keys.find((k) => k.itemId === row.itemId && k.revisionId === row.revisionId);
    if (!key) throw new Error("Falta clave para un ítem publicado");
    const optionId = (row.responseJson as { optionId?: string } | null)?.optionId;
    const correct = gradeOption(optionId, key.acceptedAnswers as string[], key.scoringRule);
    possible += Number(row.pointsPossible);
    if (correct) awarded += Number(row.pointsPossible);
    await tx.update(attemptItems).set({ outcome: !optionId ? "omitted" : correct ? "correct" : "incorrect", pointsAwarded: correct ? row.pointsPossible : "0" }).where(eq(attemptItems.id, row.id));
  }
  await tx.update(attempts).set({ status: "submitted", submittedAt: now, pointsAwarded: String(awarded), pointsPossible: String(possible) }).where(eq(attempts.id, attempt.id));
}

async function reconcile(tx: Tx, attempt: Attempt, session: Session, now: Date) {
  if (attempt.status !== "in_progress" || session.incidentAt) return;
  if (session.listeningDeadlineAt && now >= session.listeningDeadlineAt) {
    // A stalled audio is a technical incident, not an academic omission.
    await tx.update(l2Sessions).set({ incidentAt: now, incidentReason: "audio_stalled", incidentCount: session.incidentCount + 1, listeningDeadlineAt: null, playbackStartedAt: null }).where(eq(l2Sessions.attemptId, attempt.id));
    return;
  }
  let deadline = session.questionDeadlineAt;
  if (!deadline) return;
  const positions = await tx.select({ id: attemptItems.id, position: attemptItems.globalPosition, groupId: attemptItems.groupId }).from(attemptItems).where(eq(attemptItems.attemptId, attempt.id)).orderBy(asc(attemptItems.globalPosition));
  let position = attempt.currentPosition;
  while (deadline && now >= deadline) {
    const current = positions[position - 1];
    const next = positions[position];
    if (!next) {
      await close(tx, attempt, now);
      await tx.update(l2Sessions).set({ questionDeadlineAt: null }).where(eq(l2Sessions.attemptId, attempt.id));
      return;
    }
    position = next.position;
    if (next.groupId !== current.groupId) {
      await tx.update(l2Sessions).set({ questionDeadlineAt: null, responseStartedAt: null, playbackStartedAt: null }).where(eq(l2Sessions.attemptId, attempt.id));
      await tx.update(attempts).set({ currentPosition: position }).where(eq(attempts.id, attempt.id));
      return;
    }
    const start = deadline;
    deadline = after(start, l2Rules.secondsPerQuestion);
    await tx.update(l2Sessions).set({ responseStartedAt: start, questionDeadlineAt: deadline }).where(eq(l2Sessions.attemptId, attempt.id));
    await tx.update(attempts).set({ currentPosition: position }).where(eq(attempts.id, attempt.id));
  }
  if (deadline) {
    const current = positions[position - 1];
    await enqueueDeadline(tx, { attemptId: attempt.id, kind: "l2_question", targetId: current.id, deadlineAt: deadline });
  }
}

export async function detail(id: string, userId: string, scheduler: DeadlineScheduler = triggerDeadlineScheduler) {
  const result = await db.transaction(async (tx) => {
    const state = await locked(tx, id, userId);
    if (!state) return failure("No encontrado", 404);
    const now = await time(tx);
    await reconcile(tx, state.attempt, state.session, now);
    const [attempt] = await tx.select().from(attempts).where(eq(attempts.id, id));
    const [session] = await tx.select().from(l2Sessions).where(eq(l2Sessions.attemptId, id));
    const groups = await tx.select({ id: attemptGroups.id, revisionId: attemptGroups.revisionId, ordinal: attemptGroups.ordinal, content: exerciseRevisions.publicContent, storageKey: assets.storageKey, mimeType: assets.mimeType, durationMs: assets.durationMs, sha256Hex: assets.sha256Hex, rightsNote: assets.rightsNote })
      .from(attemptGroups).innerJoin(exerciseRevisions, eq(exerciseRevisions.id, attemptGroups.revisionId))
      .innerJoin(revisionAssets, and(eq(revisionAssets.revisionId, attemptGroups.revisionId), eq(revisionAssets.role, "stimulus")))
      .innerJoin(assets, eq(assets.id, revisionAssets.assetId))
      .where(eq(attemptGroups.attemptId, id)).orderBy(asc(attemptGroups.ordinal));
    const items = await tx.select({ id: attemptItems.id, groupId: attemptItems.groupId, position: attemptItems.globalPosition, prompt: exerciseItems.publicPrompt, response: attemptItems.responseJson, version: attemptItems.responseVersion, savedAt: attemptItems.savedAt, outcome: attemptItems.outcome, pointsPossible: attemptItems.pointsPossible, pointsAwarded: attemptItems.pointsAwarded, itemId: attemptItems.itemId, revisionId: attemptItems.revisionId })
      .from(attemptItems).innerJoin(exerciseItems, and(eq(exerciseItems.id, attemptItems.itemId), eq(exerciseItems.revisionId, attemptItems.revisionId)))
      .where(eq(attemptItems.attemptId, id)).orderBy(asc(attemptItems.globalPosition));
    const submitted = attempt.status === "submitted";
    const keys = submitted ? await tx.select().from(answerKeys).where(inArray(answerKeys.itemId, items.map((i) => i.itemId))) : [];
    const transcripts = submitted ? await tx.select().from(reviewMaterials).where(inArray(reviewMaterials.revisionId, groups.map((g) => g.revisionId))) : [];
    return { id, typeCode: "L2" as const, status: attempt.status, timerMode: attempt.timerMode, rules: l2Rules, currentPosition: attempt.currentPosition,
      serverTime: now.toISOString(), startedAt: attempt.startedAt?.toISOString() ?? null, submittedAt: attempt.submittedAt?.toISOString() ?? null,
      playbackStartedAt: session.playbackStartedAt?.toISOString() ?? null, listeningDeadlineAt: session.listeningDeadlineAt?.toISOString() ?? null,
      responseStartedAt: session.responseStartedAt?.toISOString() ?? null, questionDeadlineAt: session.questionDeadlineAt?.toISOString() ?? null,
      incident: session.incidentAt ? { at: session.incidentAt.toISOString(), reason: session.incidentReason, count: session.incidentCount } : null,
      phase: submitted ? "review" as const : session.incidentAt ? "incident" as const : session.questionDeadlineAt ? "response" as const : session.playbackStartedAt ? "listening" as const : "ready" as const,
      materialCount: groups.length, itemCount: items.length, pointsAwarded: submitted ? Number(attempt.pointsAwarded) : null, pointsPossible: submitted ? Number(attempt.pointsPossible) : null,
      groups: groups.map((g) => ({ id: g.id, revisionId: g.revisionId, ordinal: g.ordinal, content: contentSchemas.L2.parse(g.content), audio: { url: g.storageKey, mimeType: g.mimeType, durationMs: g.durationMs, sha256Hex: g.sha256Hex, rightsNote: g.rightsNote }, ...(submitted ? { transcript: (transcripts.find((r) => r.revisionId === g.revisionId)?.reviewContent as { transcript: string }).transcript } : {}) })),
      items: items.map((i) => ({ id: i.id, groupId: i.groupId, position: i.position, prompt: publicQuestion(i.prompt), response: i.response as { optionId: string } | null, version: i.version, savedAt: i.savedAt?.toISOString() ?? null,
        ...(submitted ? { outcome: i.outcome, pointsPossible: Number(i.pointsPossible), pointsAwarded: Number(i.pointsAwarded), correctOptionId: (keys.find((k) => k.itemId === i.itemId && k.revisionId === i.revisionId)?.acceptedAnswers as string[])[0], explanation: keys.find((k) => k.itemId === i.itemId && k.revisionId === i.revisionId)?.explanation } : {}) })),
    };
  });
  if (mayDispatch(result)) await dispatchPendingDeadlines(id, scheduler);
  return result;
}

export async function startPlayback(id: string, userId: string, scheduler: DeadlineScheduler = triggerDeadlineScheduler) {
  const result = await db.transaction(async (tx) => {
    const state = await locked(tx, id, userId);
    if (!state) return failure("No encontrado", 404);
    const now = await time(tx);
    await reconcile(tx, state.attempt, state.session, now);
    const [session] = await tx.select().from(l2Sessions).where(eq(l2Sessions.attemptId, id));
    const [attempt] = await tx.select().from(attempts).where(eq(attempts.id, id));
    if (attempt.status === "submitted" || session.questionDeadlineAt) return failure("Reproducción no disponible", 409);
    if (session.playbackStartedAt && !session.incidentAt) return { id };
    const [item] = await tx.select({ id: attemptItems.id, revisionId: attemptItems.revisionId }).from(attemptItems).where(and(eq(attemptItems.attemptId, id), eq(attemptItems.globalPosition, attempt.currentPosition)));
    const [audio] = await tx.select({ durationMs: assets.durationMs }).from(revisionAssets).innerJoin(assets, eq(assets.id, revisionAssets.assetId))
      .where(and(eq(revisionAssets.revisionId, item.revisionId), eq(revisionAssets.role, "stimulus")));
    if (!audio?.durationMs) throw new Error("Falta audio de una revisión publicada");
    await tx.update(attempts).set({ status: "in_progress", startedAt: attempt.startedAt ?? now }).where(eq(attempts.id, id));
    const listeningDeadlineAt = after(now, Math.ceil(audio.durationMs / 1000) + l2Rules.listeningGraceSeconds);
    await tx.update(l2Sessions).set({ playbackStartedAt: now, listeningDeadlineAt, incidentAt: null, incidentReason: null }).where(eq(l2Sessions.attemptId, id));
    await enqueueDeadline(tx, { attemptId: id, kind: "l2_listening", targetId: item.id, deadlineAt: listeningDeadlineAt });
    return { id };
  });
  if (mayDispatch(result)) await dispatchPendingDeadlines(id, scheduler);
  return result;
}

export async function audioEnded(id: string, userId: string, scheduler: DeadlineScheduler = triggerDeadlineScheduler) {
  const result = await db.transaction(async (tx) => {
    const state = await locked(tx, id, userId);
    if (!state) return failure("No encontrado", 404);
    const now = await time(tx);
    await reconcile(tx, state.attempt, state.session, now);
    const [session] = await tx.select().from(l2Sessions).where(eq(l2Sessions.attemptId, id));
    if (session.incidentAt || !session.playbackStartedAt || state.attempt.status !== "in_progress") return failure("Audio no disponible", 409);
    if (!session.questionDeadlineAt) {
      const [item] = await tx.select({ id: attemptItems.id, revisionId: attemptItems.revisionId }).from(attemptItems).where(and(eq(attemptItems.attemptId, id), eq(attemptItems.globalPosition, state.attempt.currentPosition)));
      const [audio] = await tx.select({ durationMs: assets.durationMs }).from(revisionAssets).innerJoin(assets, eq(assets.id, revisionAssets.assetId)).where(and(eq(revisionAssets.revisionId, item.revisionId), eq(revisionAssets.role, "stimulus")));
      if (!audio?.durationMs || now.getTime() - session.playbackStartedAt.getTime() < Math.max(0, audio.durationMs - 1000)) return failure("El audio aún no ha terminado", 409);
      const questionDeadlineAt = after(now, l2Rules.secondsPerQuestion);
      await tx.update(l2Sessions).set({ listeningDeadlineAt: null, responseStartedAt: now, questionDeadlineAt }).where(eq(l2Sessions.attemptId, id));
      await enqueueDeadline(tx, { attemptId: id, kind: "l2_question", targetId: item.id, deadlineAt: questionDeadlineAt });
    }
    return { id };
  });
  if (mayDispatch(result)) await dispatchPendingDeadlines(id, scheduler);
  return result;
}

export async function reportIncident(id: string, userId: string, reason: "load_failed" | "playback_failed" | "audio_stalled", scheduler: DeadlineScheduler = triggerDeadlineScheduler) {
  const result = await db.transaction(async (tx) => {
    const state = await locked(tx, id, userId);
    if (!state) return failure("No encontrado", 404);
    const now = await time(tx);
    await reconcile(tx, state.attempt, state.session, now);
    const [session] = await tx.select().from(l2Sessions).where(eq(l2Sessions.attemptId, id));
    if (state.attempt.status === "submitted" || session.questionDeadlineAt) return failure("Incidencia de audio no disponible", 409);
    if (!session.incidentAt) await tx.update(l2Sessions).set({ incidentAt: now, incidentReason: reason, incidentCount: session.incidentCount + 1, playbackStartedAt: null, listeningDeadlineAt: null }).where(eq(l2Sessions.attemptId, id));
    return { id };
  });
  if (mayDispatch(result)) await dispatchPendingDeadlines(id, scheduler);
  return result;
}

export async function save(id: string, userId: string, itemId: string, version: number, optionId: string, scheduler: DeadlineScheduler = triggerDeadlineScheduler) {
  const result = await db.transaction(async (tx) => {
    const state = await locked(tx, id, userId);
    if (!state) return failure("No encontrado", 404);
    const now = await time(tx);
    await reconcile(tx, state.attempt, state.session, now);
    const [session] = await tx.select().from(l2Sessions).where(eq(l2Sessions.attemptId, id));
    const [attempt] = await tx.select().from(attempts).where(eq(attempts.id, id));
    if (attempt.status !== "in_progress" || !session.questionDeadlineAt || now >= session.questionDeadlineAt) return failure("Pregunta fuera de plazo", 409);
    const [item] = await tx.select({ id: attemptItems.id, position: attemptItems.globalPosition, version: attemptItems.responseVersion, prompt: exerciseItems.publicPrompt })
      .from(attemptItems).innerJoin(exerciseItems, eq(exerciseItems.id, attemptItems.itemId)).where(and(eq(attemptItems.attemptId, id), eq(attemptItems.id, itemId)));
    if (!item || item.position !== attempt.currentPosition) return failure("Ítem no disponible", 404);
    if (item.version !== version) return failure("Respuesta desactualizada", 409);
    if (!publicQuestion(item.prompt).options.some((o) => o.id === optionId)) return failure("Opción inválida", 422);
    await tx.update(attemptItems).set({ responseJson: { optionId }, responseVersion: version + 1, savedAt: now }).where(eq(attemptItems.id, itemId));
    return { version: version + 1, savedAt: now.toISOString() };
  });
  if (mayDispatch(result)) await dispatchPendingDeadlines(id, scheduler);
  return result;
}

export async function next(id: string, userId: string, position: number, scheduler: DeadlineScheduler = triggerDeadlineScheduler) {
  const result = await db.transaction(async (tx) => {
    const state = await locked(tx, id, userId);
    if (!state) return failure("No encontrado", 404);
    const now = await time(tx);
    await reconcile(tx, state.attempt, state.session, now);
    const [attempt] = await tx.select().from(attempts).where(eq(attempts.id, id));
    const [session] = await tx.select().from(l2Sessions).where(eq(l2Sessions.attemptId, id));
    if (attempt.status !== "in_progress" || !session.questionDeadlineAt || position !== attempt.currentPosition + 1) return failure("Solo se permite avanzar a la siguiente pregunta", 409);
    const [current] = await tx.select({ response: attemptItems.responseJson, groupId: attemptItems.groupId }).from(attemptItems).where(and(eq(attemptItems.attemptId, id), eq(attemptItems.globalPosition, attempt.currentPosition)));
    if (!current.response) return failure("Responde antes de avanzar", 409);
    const [target] = await tx.select({ groupId: attemptItems.groupId }).from(attemptItems).where(and(eq(attemptItems.attemptId, id), eq(attemptItems.globalPosition, position)));
    if (!target) return failure("Posición inválida", 422);
    const questionDeadlineAt = target.groupId === current.groupId ? after(now, l2Rules.secondsPerQuestion) : null;
    await tx.update(attempts).set({ currentPosition: position }).where(eq(attempts.id, id));
    await tx.update(l2Sessions).set({ responseStartedAt: questionDeadlineAt ? now : null, questionDeadlineAt, playbackStartedAt: null, listeningDeadlineAt: null }).where(eq(l2Sessions.attemptId, id));
    if (questionDeadlineAt) {
      const [targetItem] = await tx.select({ id: attemptItems.id }).from(attemptItems).where(and(eq(attemptItems.attemptId, id), eq(attemptItems.globalPosition, position)));
      await enqueueDeadline(tx, { attemptId: id, kind: "l2_question", targetId: targetItem.id, deadlineAt: questionDeadlineAt });
    }
    return { currentPosition: position };
  });
  if (mayDispatch(result)) await dispatchPendingDeadlines(id, scheduler);
  return result;
}

export async function submit(id: string, userId: string, scheduler: DeadlineScheduler = triggerDeadlineScheduler) {
  const result = await db.transaction(async (tx) => {
    const state = await locked(tx, id, userId);
    if (!state) return failure("No encontrado", 404);
    const now = await time(tx);
    await reconcile(tx, state.attempt, state.session, now);
    const [attempt] = await tx.select().from(attempts).where(eq(attempts.id, id));
    const [session] = await tx.select().from(l2Sessions).where(eq(l2Sessions.attemptId, id));
    if (attempt.status === "prepared" || (attempt.status === "in_progress" && !session.questionDeadlineAt)) return failure("Termina el audio antes de entregar", 409);
    await close(tx, attempt, now);
    return { id };
  });
  if (mayDispatch(result)) await dispatchPendingDeadlines(id, scheduler);
  return result;
}

export async function reconcileDeadline(id: string, scheduler: DeadlineScheduler = triggerDeadlineScheduler) {
  await db.transaction(async (tx) => {
    const [attempt] = await tx.select().from(attempts).where(and(eq(attempts.id, id), eq(attempts.typeCode, "L2"))).for("update");
    if (!attempt) throw new Error(`L2 attempt ${id} does not exist`);
    const [session] = await tx.select().from(l2Sessions).where(eq(l2Sessions.attemptId, id));
    await reconcile(tx, attempt, session, await time(tx));
  });
  await dispatchPendingDeadlines(id, scheduler);
}
