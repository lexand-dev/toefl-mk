import { handle } from "hono/vercel";
import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { and, asc, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { answerKeys, assets, exerciseItems, exerciseRevisions, exercises, reviewMaterials, revisionAssets } from "@/db/schema";
import { getActor, hasRole } from "@/lib/access";
import { createSchema, revisionSchema, validatePublication, type RevisionInput, type TypeCode } from "@/features/editorial/schemas";

export const runtime = "nodejs";
const idParam = z.object({ id: z.string().uuid() });
type EditorialTx = Parameters<Parameters<typeof db.transaction>[0]>[0];

async function storeRevision(tx: EditorialTx, revisionId: string, input: RevisionInput) {
  await tx.delete(answerKeys).where(eq(answerKeys.revisionId, revisionId));
  await tx.delete(exerciseItems).where(eq(exerciseItems.revisionId, revisionId));
  await tx.delete(revisionAssets).where(eq(revisionAssets.revisionId, revisionId));
  await tx.delete(reviewMaterials).where(eq(reviewMaterials.revisionId, revisionId));
  for (const item of input.items) {
    const itemId = crypto.randomUUID();
    await tx.insert(exerciseItems).values({ id: itemId, revisionId, ordinal: item.ordinal, responseKind: item.responseKind, publicPrompt: item.publicPrompt, pointsPossible: String(item.pointsPossible) });
    if (item.key) await tx.insert(answerKeys).values({ revisionId, itemId, ...item.key });
  }
  for (const asset of input.assets) {
    const { role, sortOrder, ...metadata } = asset;
    const [existing] = await tx.select().from(assets).where(eq(assets.storageKey, asset.storageKey)).limit(1);
    if (existing && (existing.kind !== metadata.kind || existing.mimeType !== metadata.mimeType || existing.sha256Hex !== metadata.sha256Hex || existing.byteSize !== metadata.byteSize || existing.durationMs !== metadata.durationMs || existing.rightsNote !== metadata.rightsNote)) {
      throw new Error("Los metadatos de un recurso versionado no se pueden cambiar");
    }
    const assetId = existing?.id ?? crypto.randomUUID();
    if (!existing) await tx.insert(assets).values({ id: assetId, ...metadata });
    await tx.insert(revisionAssets).values({ revisionId, assetId, role, sortOrder });
  }
  if (input.reviewContent) await tx.insert(reviewMaterials).values({ revisionId, reviewContent: input.reviewContent });
}

async function detail(id: string, connection: typeof db | EditorialTx = db) {
  const [revision] = await connection.select().from(exerciseRevisions).where(eq(exerciseRevisions.id, id));
  if (!revision) return null;
  const [exercise] = await connection.select().from(exercises).where(eq(exercises.id, revision.exerciseId));
  const items = await connection.select().from(exerciseItems).where(eq(exerciseItems.revisionId, id)).orderBy(asc(exerciseItems.ordinal));
  const linkedAssets = await connection.select({ id: assets.id, kind: assets.kind, storageKey: assets.storageKey, mimeType: assets.mimeType, sha256Hex: assets.sha256Hex, byteSize: assets.byteSize, durationMs: assets.durationMs, rightsNote: assets.rightsNote, role: revisionAssets.role, sortOrder: revisionAssets.sortOrder })
    .from(revisionAssets).innerJoin(assets, eq(assets.id, revisionAssets.assetId)).where(eq(revisionAssets.revisionId, id));
  const keys = await connection.select().from(answerKeys).where(eq(answerKeys.revisionId, id));
  const [review] = await connection.select().from(reviewMaterials).where(eq(reviewMaterials.revisionId, id));
  return { revision, exercise, items: items.map((item) => ({ ...item, pointsPossible: Number(item.pointsPossible), key: keys.find((key) => key.itemId === item.id) ?? null })), assets: linkedAssets, reviewContent: review?.reviewContent ?? null };
}

function inputFromDetail(value: NonNullable<Awaited<ReturnType<typeof detail>>>) {
  return revisionSchema.parse({
    publicContent: value.revision.publicContent, provenanceNote: value.revision.provenanceNote, rightsNote: value.revision.rightsNote,
    items: value.items.map((item) => ({ ordinal: item.ordinal, responseKind: item.responseKind, publicPrompt: item.publicPrompt, pointsPossible: item.pointsPossible, key: item.key ? { acceptedAnswers: item.key.acceptedAnswers, scoringRule: item.key.scoringRule, explanation: item.key.explanation } : null })),
    assets: value.assets.map((asset) => ({ kind: asset.kind, storageKey: asset.storageKey, mimeType: asset.mimeType, sha256Hex: asset.sha256Hex, byteSize: asset.byteSize, durationMs: asset.durationMs, rightsNote: asset.rightsNote, role: asset.role, sortOrder: asset.sortOrder })),
    reviewContent: value.reviewContent,
  });
}

const app = new Hono().basePath("/api/editorial");

const routes = app
  .get("/published/:id", zValidator("param", idParam), async (c) => {
    const id = c.req.valid("param").id;
    const [published] = await db.select({ id: exerciseRevisions.id, exerciseId: exerciseRevisions.exerciseId, revisionNumber: exerciseRevisions.revisionNumber, publicContent: exerciseRevisions.publicContent, typeCode: exercises.typeCode, topic: exercises.topic })
      .from(exerciseRevisions).innerJoin(exercises, eq(exercises.id, exerciseRevisions.exerciseId))
      .where(and(eq(exerciseRevisions.id, id), eq(exerciseRevisions.status, "published")));
    if (!published) return c.json({ error: "No encontrado" }, 404);
    const items = await db.select({ id: exerciseItems.id, ordinal: exerciseItems.ordinal, responseKind: exerciseItems.responseKind, publicPrompt: exerciseItems.publicPrompt })
      .from(exerciseItems).where(eq(exerciseItems.revisionId, id)).orderBy(asc(exerciseItems.ordinal));
    const publicAssets = await db.select({ kind: assets.kind, storageKey: assets.storageKey, mimeType: assets.mimeType, role: revisionAssets.role, sortOrder: revisionAssets.sortOrder })
      .from(revisionAssets).innerJoin(assets, eq(assets.id, revisionAssets.assetId)).where(eq(revisionAssets.revisionId, id));
    return c.json({ data: {
      revision: { id: published.id, exerciseId: published.exerciseId, revisionNumber: published.revisionNumber, publicContent: published.publicContent },
      exercise: { typeCode: published.typeCode, topic: published.topic }, items, assets: publicAssets,
    } });
  })
  .get("/", async (c) => {
    const actor = await getActor(c.req.raw.headers);
    if (!actor) return c.json({ error: "Inicia sesión" }, 401);
    if (!hasRole(actor, ["editor", "admin"])) return c.json({ error: "Sin permiso" }, 403);
    return c.json({ data: await db.select({ id: exerciseRevisions.id, exerciseId: exercises.id, typeCode: exercises.typeCode, topic: exercises.topic, revisionNumber: exerciseRevisions.revisionNumber, status: exerciseRevisions.status, authorId: exerciseRevisions.authorId, reviewedBy: exerciseRevisions.reviewedBy }).from(exerciseRevisions).innerJoin(exercises, eq(exercises.id, exerciseRevisions.exerciseId)).orderBy(asc(exerciseRevisions.createdAt)) });
  })
  .get("/:id", zValidator("param", idParam), async (c) => {
    const actor = await getActor(c.req.raw.headers);
    if (!actor) return c.json({ error: "Inicia sesión" }, 401);
    if (!hasRole(actor, ["editor", "admin"])) return c.json({ error: "Sin permiso" }, 403);
    const data = await detail(c.req.valid("param").id);
    return data ? c.json({ data }) : c.json({ error: "No encontrado" }, 404);
  })
  .post("/", zValidator("json", createSchema), async (c) => {
    const actor = await getActor(c.req.raw.headers);
    if (!actor) return c.json({ error: "Inicia sesión" }, 401);
    if (!hasRole(actor, ["editor", "admin"])) return c.json({ error: "Sin permiso" }, 403);
    const { typeCode, topic, difficulty, revision } = c.req.valid("json");
    const id = crypto.randomUUID();
    const exerciseId = crypto.randomUUID();
    await db.transaction(async (tx) => {
      await tx.insert(exercises).values({ id: exerciseId, typeCode, section: typeCode[0] === "R" ? "reading" : typeCode[0] === "L" ? "listening" : "writing", topic, difficulty });
      await tx.insert(exerciseRevisions).values({ id, exerciseId, revisionNumber: 1, authorId: actor.id, publicContent: revision.publicContent, provenanceNote: revision.provenanceNote, rightsNote: revision.rightsNote });
      await storeRevision(tx, id, revision);
    });
    return c.json({ data: { id, exerciseId } }, 201);
  })
  .post("/:id/revisions", zValidator("param", idParam), zValidator("json", revisionSchema), async (c) => {
    const actor = await getActor(c.req.raw.headers);
    if (!actor) return c.json({ error: "Inicia sesión" }, 401);
    if (!hasRole(actor, ["editor", "admin"])) return c.json({ error: "Sin permiso" }, 403);
    const id = crypto.randomUUID();
    const created = await db.transaction(async (tx) => {
      const [exercise] = await tx.select().from(exercises).where(eq(exercises.id, c.req.valid("param").id)).for("update");
      if (!exercise) return false;
      const [last] = await tx.select({ revisionNumber: exerciseRevisions.revisionNumber }).from(exerciseRevisions).where(eq(exerciseRevisions.exerciseId, exercise.id)).orderBy(sql`${exerciseRevisions.revisionNumber} DESC`).limit(1);
      const input = c.req.valid("json");
      await tx.insert(exerciseRevisions).values({ id, exerciseId: exercise.id, revisionNumber: (last?.revisionNumber ?? 0) + 1, authorId: actor.id, publicContent: input.publicContent, provenanceNote: input.provenanceNote, rightsNote: input.rightsNote });
      await storeRevision(tx, id, input);
      return true;
    });
    return created ? c.json({ data: { id } }, 201) : c.json({ error: "No encontrado" }, 404);
  })
  .put("/:id", zValidator("param", idParam), zValidator("json", revisionSchema), async (c) => {
    const actor = await getActor(c.req.raw.headers);
    if (!actor) return c.json({ error: "Inicia sesión" }, 401);
    if (!hasRole(actor, ["editor", "admin"])) return c.json({ error: "Sin permiso" }, 403);
    const result = await db.transaction(async (tx) => {
      const [current] = await tx.select().from(exerciseRevisions).where(eq(exerciseRevisions.id, c.req.valid("param").id)).for("update");
      if (!current) return "missing";
      if (current.status !== "draft" || (actor.role !== "admin" && current.authorId !== actor.id)) return "forbidden";
      const input = c.req.valid("json");
      await tx.update(exerciseRevisions).set({ publicContent: input.publicContent, provenanceNote: input.provenanceNote, rightsNote: input.rightsNote }).where(eq(exerciseRevisions.id, current.id));
      await storeRevision(tx, current.id, input);
      return "ok";
    });
    return result === "ok" ? c.json({ data: { id: c.req.valid("param").id } }) : c.json({ error: result === "missing" ? "No encontrado" : "Borrador no editable" }, result === "missing" ? 404 : 409);
  })
  .post("/:id/submit", zValidator("param", idParam), async (c) => {
    const actor = await getActor(c.req.raw.headers);
    if (!actor) return c.json({ error: "Inicia sesión" }, 401);
    if (!hasRole(actor, ["editor", "admin"])) return c.json({ error: "Sin permiso" }, 403);
    const result = await db.transaction(async (tx) => {
      const [revision] = await tx.select().from(exerciseRevisions).where(eq(exerciseRevisions.id, c.req.valid("param").id)).for("update");
      if (!revision) return { error: "No encontrado", status: 404 } as const;
      if (revision.status !== "draft" || (actor.role !== "admin" && revision.authorId !== actor.id)) return { error: "Borrador no disponible", status: 409 } as const;
      const current = (await detail(revision.id, tx))!;
      const errors = validatePublication(current.exercise.typeCode as TypeCode, inputFromDetail(current));
      if (errors.length) return { error: "Material incompleto", details: errors, status: 422 } as const;
      await tx.update(exerciseRevisions).set({ status: "in_review" }).where(eq(exerciseRevisions.id, revision.id));
      return null;
    });
    return result ? c.json(result, result.status) : c.json({ data: { status: "in_review" } });
  })
  .post("/:id/approve", zValidator("param", idParam), zValidator("json", z.object({ humanReviewed: z.literal(true) })), async (c) => {
    const actor = await getActor(c.req.raw.headers);
    if (!actor) return c.json({ error: "Inicia sesión" }, 401);
    if (!hasRole(actor, ["editor", "admin"])) return c.json({ error: "Sin permiso" }, 403);
    const result = await db.transaction(async (tx) => {
      const [revision] = await tx.select().from(exerciseRevisions).where(eq(exerciseRevisions.id, c.req.valid("param").id)).for("update");
      if (!revision) return { error: "No encontrado", status: 404 } as const;
      if (revision.status !== "in_review" || revision.authorId === actor.id) return { error: "Se requiere revisión independiente", status: 403 } as const;
      if (revision.reviewedBy) return { error: "Ya revisado", status: 409 } as const;
      const current = (await detail(revision.id, tx))!;
      const errors = validatePublication(current.exercise.typeCode as TypeCode, inputFromDetail(current));
      if (errors.length) return { error: "Material incompleto", details: errors, status: 422 } as const;
      await tx.update(exerciseRevisions).set({ reviewedBy: actor.id }).where(eq(exerciseRevisions.id, revision.id));
      return null;
    });
    return result ? c.json(result, result.status) : c.json({ data: { reviewedBy: actor.id } });
  })
  .post("/:id/reject", zValidator("param", idParam), async (c) => {
    const actor = await getActor(c.req.raw.headers);
    if (!actor) return c.json({ error: "Inicia sesión" }, 401);
    if (!hasRole(actor, ["editor", "admin"])) return c.json({ error: "Sin permiso" }, 403);
    const changed = await db.update(exerciseRevisions).set({ status: "draft" }).where(and(eq(exerciseRevisions.id, c.req.valid("param").id), eq(exerciseRevisions.status, "in_review"), sql`${exerciseRevisions.reviewedBy} IS NULL`, sql`${exerciseRevisions.authorId} <> ${actor.id}`)).returning({ id: exerciseRevisions.id });
    return changed.length ? c.json({ data: { status: "draft" } }) : c.json({ error: "No disponible para corrección" }, 409);
  })
  .post("/:id/publish", zValidator("param", idParam), async (c) => {
    const actor = await getActor(c.req.raw.headers);
    if (!actor) return c.json({ error: "Inicia sesión" }, 401);
    if (!hasRole(actor, ["admin"])) return c.json({ error: "Sin permiso" }, 403);
    const result = await db.transaction(async (tx) => {
      const [current] = await tx.select().from(exerciseRevisions).where(eq(exerciseRevisions.id, c.req.valid("param").id)).for("update");
      if (!current) return { error: "No encontrado", status: 404 } as const;
      if (current.status !== "in_review" || !current.reviewedBy) return { error: "Falta aprobación humana", status: 409 } as const;
      const data = await detail(current.id, tx);
      const errors = validatePublication(data!.exercise.typeCode as TypeCode, inputFromDetail(data!));
      if (errors.length) return { error: "Material incompleto", status: 422, details: errors } as const;
      await tx.update(exerciseRevisions).set({ status: "published", publishedAt: new Date() }).where(eq(exerciseRevisions.id, current.id));
      return null;
    });
    if (result) return c.json(result, result.status);
    return c.json({ data: { status: "published" } });
  })
  .post("/:id/retire", zValidator("param", idParam), async (c) => {
    const actor = await getActor(c.req.raw.headers);
    if (!actor) return c.json({ error: "Inicia sesión" }, 401);
    if (!hasRole(actor, ["admin"])) return c.json({ error: "Sin permiso" }, 403);
    const changed = await db.update(exerciseRevisions).set({ status: "retired" }).where(and(eq(exerciseRevisions.id, c.req.valid("param").id), eq(exerciseRevisions.status, "published"))).returning({ id: exerciseRevisions.id });
    return changed.length ? c.json({ data: { status: "retired" } }) : c.json({ error: "No publicada" }, 409);
  });

export const GET = handle(app);
export const POST = handle(app);
export const PUT = handle(app);
export type EditorialAppType = typeof routes;
