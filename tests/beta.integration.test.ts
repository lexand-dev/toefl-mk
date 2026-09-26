import { afterAll, beforeAll, beforeEach, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { sql } from "drizzle-orm";
import { db, pool } from "@/db";
import { answerKeys, exerciseItems, exerciseRevisions, exercises, users } from "@/db/schema";
import { betaDrafts } from "@/features/editorial/beta-drafts";
import { importBetaDrafts } from "@/features/editorial/beta-seed";
import { revisionSchema, validatePublication } from "@/features/editorial/schemas";
import { availability as r1Availability } from "@/features/practice/r1";
import { availability as r3Availability } from "@/features/practice/engine";
import { availability as l2Availability } from "@/features/practice/l2/engine";
import { availability as w1Availability } from "@/features/practice/w1";
import { summary as w2Availability } from "@/features/practice/w2";
import { GET as publicRead } from "@/app/api/editorial/[[...route]]/route";

beforeAll(async () => { await migrate(db, { migrationsFolder: "./drizzle" }); });
beforeEach(async () => { await db.execute(sql`truncate table "account", "session", "verification", "users", "rate_limit", "exercises", "assets" cascade`); });
afterAll(async () => { await pool.end(); });

async function user(email: string, role: "learner" | "editor", emailVerified = true) {
  const id = crypto.randomUUID();
  await db.insert(users).values({ id, email, name: email, role, emailVerified });
  return id;
}

it("imports original, typed, unreviewed drafts for all five types, without announcing availability", async () => {
  await user("author@beta.test", "editor");
  expect(new Set(betaDrafts.map((draft) => draft.slug)).size).toBe(betaDrafts.length);
  expect(betaDrafts.reduce((counts, draft) => ({ ...counts, [draft.typeCode]: (counts[draft.typeCode] ?? 0) + 1 }), {} as Record<string, number>))
    .toEqual({ R1: 2, R3: 2, L2: 2, W1: 10, W2: 3 });
  for (const draft of betaDrafts) {
    const input = revisionSchema.parse(draft.revision);
    const errors = validatePublication(draft.typeCode, input);
    expect(errors).toEqual(draft.typeCode === "L2" ? [expect.stringContaining("Falta audio L2:")] : []);
    expect(input.provenanceNote.length).toBeGreaterThan(30);
    expect(input.rightsNote.length).toBeGreaterThan(30);
  }
  const repeated = betaDrafts.find((draft) => draft.slug === "w1-repeated-that")!;
  const tokens = repeated.revision.items[0].publicPrompt.tokens as { id: string; text: string }[];
  expect(tokens.filter((token) => token.text === "that")).toHaveLength(2);
  expect(new Set(tokens.map((token) => token.id)).size).toBe(tokens.length);

  const first = await importBetaDrafts("AUTHOR@beta.test");
  expect(first.created).toHaveLength(betaDrafts.length);
  expect(first.existing).toHaveLength(0);
  const secondImport = await importBetaDrafts("author@beta.test");
  expect(secondImport.created).toHaveLength(0);
  expect(secondImport.existing).toHaveLength(betaDrafts.length);

  const materials = await db.select().from(exercises);
  const revisions = await db.select().from(exerciseRevisions);
  const items = await db.select().from(exerciseItems);
  const keys = await db.select().from(answerKeys);
  expect(materials).toHaveLength(betaDrafts.length);
  expect(revisions.every((row) => row.status === "draft" && row.reviewedBy === null && row.publishedAt === null)).toBe(true);
  expect(items).toHaveLength(2 * 4 + 3 + 2 + 2 * 2 + 10 + 3);
  expect(keys).toHaveLength(items.length - 3);
  const firstRevision = revisions[0];
  const publicResponse = await publicRead(new NextRequest(`http://localhost:3000/api/editorial/published/${firstRevision.id}`));
  expect(publicResponse.status).toBe(404);
  expect((await r1Availability(2)).availableMaterials).toBe(0);
  expect((await r3Availability(2)).availableMaterials).toBe(0);
  expect((await l2Availability(2)).availableMaterials).toBe(0);
  expect((await w1Availability(10)).availableMaterials).toBe(0);
  expect((await w2Availability(3)).availableMaterials).toBe(0);
});

it("refuses an unverified author and a learner without leaving partial imports", async () => {
  await user("student@beta.test", "learner");
  await user("unverified@beta.test", "editor", false);
  await expect(importBetaDrafts("student@beta.test")).rejects.toThrow("verified editor");
  await expect(importBetaDrafts("unverified@beta.test")).rejects.toThrow("verified editor");
  expect(await db.select().from(exercises)).toHaveLength(0);
});
