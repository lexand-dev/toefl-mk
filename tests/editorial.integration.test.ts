import { afterAll, beforeAll, beforeEach, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { eq, sql } from "drizzle-orm";
import { db, pool } from "@/db";
import { answerKeys, assets, exerciseItems, exerciseRevisions, exercises, users } from "@/db/schema";
import { exampleR3 } from "@/features/editorial/example-r3";

const mail = vi.hoisted(() => [] as { subject: string; url: string }[]);
vi.mock("@/lib/email", () => ({ sendTransactionalEmail: async (message: typeof mail[number]) => { mail.push(message); } }));
const base = "http://localhost:3000";
const { POST: authPost, GET: authGet } = await import("@/app/api/auth/[...all]/route");
const { GET, POST, PUT } = await import("@/app/api/editorial/[[...route]]/route");
const request = (path: string, method = "GET", cookie?: string, data?: unknown) => new NextRequest(`${base}/api/editorial${path === "/" ? "" : path}`, { method, headers: { ...(cookie ? { cookie } : {}), ...(data ? { "content-type": "application/json" } : {}) }, ...(data ? { body: JSON.stringify(data) } : {}) });
const call = (path: string, method = "GET", cookie?: string, data?: unknown) => (method === "GET" ? GET : method === "PUT" ? PUT : POST)(request(path, method, cookie, data));

beforeAll(async () => { await migrate(db, { migrationsFolder: "./drizzle" }); });
beforeEach(async () => {
  mail.length = 0;
  await db.execute(sql`truncate table "account", "session", "verification", "users", "rate_limit", "exercises", "assets" cascade`);
});
afterAll(async () => { await pool.end(); });

async function actor(email: string, role: "learner" | "editor" | "admin") {
  const signUp = await authPost(new NextRequest(`${base}/api/auth/sign-up/email`, { method: "POST", headers: { "content-type": "application/json", origin: base, "x-forwarded-for": `192.0.2.${mail.length + 1}` }, body: JSON.stringify({ name: email, email, password: "safe-password-123" }) }));
  expect(signUp.status).toBe(200);
  const link = mail.at(-1)!.url;
  expect((await authGet(new NextRequest(link, { redirect: "manual" }))).status).toBe(302);
  await db.update(users).set({ role }).where(eq(users.email, email));
  const login = await authPost(new NextRequest(`${base}/api/auth/sign-in/email`, { method: "POST", headers: { "content-type": "application/json", origin: base, "x-forwarded-for": `192.0.2.${mail.length + 40}` }, body: JSON.stringify({ email, password: "safe-password-123" }) }));
  expect(login.status).toBe(200);
  return login.headers.getSetCookie().map((value) => value.split(";")[0]).join("; ");
}

async function create(cookie: string, revision = exampleR3, typeCode = "R3") {
  return call("/", "POST", cookie, { typeCode, topic: "Jardines de lluvia", difficulty: "intermediate", revision });
}

it("requires server roles and independent human review, publishes original R3 and withholds solutions", async () => {
  const author = await actor("author@example.test", "editor");
  const reviewer = await actor("reviewer@example.test", "editor");
  const admin = await actor("admin@example.test", "admin");
  const learner = await actor("learner@example.test", "learner");
  expect((await create(learner)).status).toBe(403);
  expect((await call("/", "GET")).status).toBe(401);
  const created = await create(author);
  expect(created.status).toBe(201);
  const { data: { id, exerciseId } } = await created.json();
  expect((await call(`/${id}`, "GET", learner)).status).toBe(403);
  expect((await call(`/published/${id}`)).status).toBe(404);
  expect((await call(`/${id}/publish`, "POST", author)).status).toBe(403);
  expect((await call(`/${id}/publish`, "POST", admin)).status).toBe(409);
  expect((await call(`/${id}/submit`, "POST", author)).status).toBe(200);
  expect((await call(`/${id}/approve`, "POST", author, { humanReviewed: true })).status).toBe(403);
  expect((await call(`/${id}/approve`, "POST", reviewer, { humanReviewed: false })).status).toBe(400);
  expect((await call(`/${id}/publish`, "POST", admin)).status).toBe(409);
  expect((await call(`/${id}/reject`, "POST", reviewer)).status).toBe(200);
  expect((await call(`/${id}`, "PUT", author, exampleR3)).status).toBe(200);
  expect((await call(`/${id}/submit`, "POST", author)).status).toBe(200);
  // This approval is test-only; the shipped example remains an unreviewed draft.
  expect((await call(`/${id}/approve`, "POST", reviewer, { humanReviewed: true })).status).toBe(200);
  expect((await call(`/${id}/reject`, "POST", reviewer)).status).toBe(409);
  const [approvedItem] = await db.select().from(exerciseItems).where(eq(exerciseItems.revisionId, id));
  await expect(db.update(exerciseItems).set({ publicPrompt: { question: "unreviewed change" } }).where(eq(exerciseItems.id, approvedItem.id))).rejects.toThrow();
  expect((await call(`/${id}/publish`, "POST", admin)).status).toBe(200);
  const publicResponse = await call(`/published/${id}`);
  expect(publicResponse.status).toBe(200);
  const visible = JSON.stringify(await publicResponse.json());
  expect(visible).toContain("Rain Gardens");
  expect(visible).not.toContain("acceptedAnswers");
  expect(visible).not.toContain("explanation");
  expect(visible).not.toContain("reviewContent");
  expect((await db.select().from(answerKeys)).length).toBe(3);
  const newRevision = await call(`/${exerciseId}/revisions`, "POST", author, { ...exampleR3, publicContent: { ...exampleR3.publicContent, title: "Revisión futura" } });
  expect(newRevision.status).toBe(201);
  expect((await call(`/published/${id}`)).status).toBe(200);
  expect((await call(`/${id}/retire`, "POST", admin)).status).toBe(200);
  expect((await call(`/published/${id}`)).status).toBe(404);
  const [old] = await db.select().from(exerciseRevisions).where(eq(exerciseRevisions.id, id));
  expect(old.publishedAt).not.toBeNull();
  expect(old.status).toBe("retired");
  expect((await call(`/${id}`, "GET", reviewer)).status).toBe(200);
});

it("rejects missing or invalid content, wrong keys and missing L2 audio before review", async () => {
  const author = await actor("writer@example.test", "editor");
  const incomplete = { ...exampleR3, items: [{ ...exampleR3.items[0], key: { ...exampleR3.items[0].key!, acceptedAnswers: ["missing-option"] } }] };
  const created = await create(author, incomplete);
  expect(created.status).toBe(201);
  const { data: { id } } = await created.json();
  const submit = await call(`/${id}/submit`, "POST", author);
  expect(submit.status).toBe(422);
  expect(JSON.stringify(await submit.json())).toContain("opción");
  expect((await call(`/${id}`, "PUT", author, exampleR3)).status).toBe(200);
  const missing = { ...exampleR3, items: [{ ...exampleR3.items[0], key: null }] };
  expect((await call(`/${id}`, "PUT", author, missing)).status).toBe(200);
  expect((await call(`/${id}/submit`, "POST", author)).status).toBe(422);
  const l2 = { ...exampleR3, publicContent: { title: "Conversación", description: "Diálogo breve" }, reviewContent: { transcript: "Texto" }, assets: [] };
  const l2Created = await create(author, l2, "L2");
  expect(l2Created.status).toBe(201);
  const { data: { id: l2Id } } = await l2Created.json();
  expect(JSON.stringify(await (await call(`/${l2Id}/submit`, "POST", author)).json())).toContain("audio L2");
  const withAudio = { ...l2, assets: [{ kind: "audio", storageKey: "https://example.test/audio/v1.mp3", mimeType: "audio/mpeg", sha256Hex: "b".repeat(64), byteSize: 1024, durationMs: 7000, rightsNote: "Original recording", role: "stimulus", sortOrder: 1 }] };
  expect((await call(`/${l2Id}`, "PUT", author, withAudio)).status).toBe(200);
  expect((await call(`/${l2Id}`, "PUT", author, withAudio)).status).toBe(200);
  expect((await db.select().from(assets))).toHaveLength(1);
  expect((await call(`/${l2Id}/submit`, "POST", author)).status).toBe(200);
});

it("blocks direct database edits to published children, metadata and revisions, while preserving old revisions", async () => {
  const author = await actor("origin@example.test", "editor");
  const reviewer = await actor("human@example.test", "editor");
  const admin = await actor("publisher@example.test", "admin");
  const { data: { id, exerciseId } } = await (await create(author)).json();
  await call(`/${id}/submit`, "POST", author);
  await call(`/${id}/approve`, "POST", reviewer, { humanReviewed: true });
  expect((await call(`/${id}/publish`, "POST", admin)).status).toBe(200);
  const [item] = await db.select().from(exerciseItems).where(eq(exerciseItems.revisionId, id));
  await expect(db.update(exerciseItems).set({ publicPrompt: { question: "changed" } }).where(eq(exerciseItems.id, item.id))).rejects.toThrow();
  await expect(db.delete(answerKeys).where(eq(answerKeys.revisionId, id))).rejects.toThrow();
  await expect(db.insert(exerciseItems).values({ id: crypto.randomUUID(), revisionId: id, ordinal: 20, responseKind: "single_choice", publicPrompt: {}, pointsPossible: "1" })).rejects.toThrow();
  await expect(db.update(exerciseRevisions).set({ publicContent: { title: "changed" } }).where(eq(exerciseRevisions.id, id))).rejects.toThrow();
  await expect(db.update(exercises).set({ typeCode: "R1" }).where(eq(exercises.id, exerciseId))).rejects.toThrow();
  expect((await db.select().from(exerciseItems).where(eq(exerciseItems.revisionId, id)))).toHaveLength(3);
  const assetId = crypto.randomUUID();
  await db.insert(assets).values({ id: assetId, kind: "audio", storageKey: "https://example.test/versioned-audio.mp3", mimeType: "audio/mpeg", sha256Hex: "a".repeat(64), byteSize: 128, durationMs: 1200, rightsNote: "Original" });
  await expect(db.update(assets).set({ storageKey: "https://example.test/rewritten.mp3" }).where(eq(assets.id, assetId))).rejects.toThrow();
  expect((await call(`/${id}`, "PUT", author, exampleR3)).status).toBe(409);
  expect((await call(`/published/${id}`)).status).toBe(200);
});
