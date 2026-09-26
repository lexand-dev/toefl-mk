import { afterAll, beforeAll, beforeEach, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { eq, sql } from "drizzle-orm";
import { db, pool } from "@/db";
import { attempts, deadlineJobs, exerciseRevisions, users } from "@/db/schema";
import { runDeadlineJob } from "@/features/practice/deadline-runner";
import type { RevisionInput } from "@/features/editorial/schemas";

const mail = vi.hoisted(() => [] as { url: string }[]);
vi.mock("@/lib/email", () => ({ sendTransactionalEmail: async (message: { url: string }) => { mail.push(message); } }));
const base = "http://localhost:3000";
const { POST: authPost, GET: authGet } = await import("@/app/api/auth/[...all]/route");
const editorial = await import("@/app/api/editorial/[[...route]]/route");
const w1 = await import("@/app/api/practice/w1/[[...route]]/route");
const r3 = await import("@/app/api/practice/[[...route]]/route");
const call = (route: typeof editorial | typeof w1 | typeof r3, prefix: string, path: string, method = "GET", cookie?: string, data?: unknown) => {
  const request = new NextRequest(`${base}/api/${prefix}${path === "/" ? "" : path}`, { method, headers: { ...(cookie ? { cookie } : {}), ...(data ? { "content-type": "application/json" } : {}) }, ...(data ? { body: JSON.stringify(data) } : {}) });
  return (method === "GET" ? route.GET : method === "PUT" ? route.PUT : route.POST)(request);
};
const ed = (path: string, method = "GET", cookie?: string, data?: unknown) => call(editorial, "editorial", path, method, cookie, data);
const api = (path: string, method = "GET", cookie?: string, data?: unknown) => call(w1, "practice/w1", path, method, cookie, data);
const fixture: RevisionInput = {
  publicContent: { context: "Arrange the fragments into a sentence." }, provenanceNote: "Original test sentence", rightsNote: "Original test content",
  items: [{ ordinal: 1, responseKind: "token_order", publicPrompt: { instruction: "Build the sentence", tokens: [{ id: "a", text: "The" }, { id: "b", text: "cat" }, { id: "c", text: "cat" }] }, pointsPossible: 1,
    key: { acceptedAnswers: [["a", "b", "c"], ["a", "c", "b"]], scoringRule: "approved_variants", explanation: "Both repeated pieces are accepted in either position." } }], assets: [], reviewContent: null,
};

beforeAll(async () => { await migrate(db, { migrationsFolder: "./drizzle" }); });
beforeEach(async () => { mail.length = 0; await db.execute(sql`truncate table "account", "session", "verification", "users", "rate_limit", "exercises", "assets" cascade`); });
afterAll(async () => { await pool.end(); });

async function actor(email: string, role: "learner" | "editor" | "admin") {
  expect((await authPost(new NextRequest(`${base}/api/auth/sign-up/email`, { method: "POST", headers: { "content-type": "application/json", origin: base, "x-forwarded-for": `203.0.113.${mail.length + 1}` }, body: JSON.stringify({ name: email, email, password: "safe-password-123" }) }))).status).toBe(200);
  expect((await authGet(new NextRequest(mail.at(-1)!.url))).status).toBe(302);
  await db.update(users).set({ role }).where(eq(users.email, email));
  const login = await authPost(new NextRequest(`${base}/api/auth/sign-in/email`, { method: "POST", headers: { "content-type": "application/json", origin: base, "x-forwarded-for": `203.0.113.${mail.length + 40}` }, body: JSON.stringify({ email, password: "safe-password-123" }) }));
  expect(login.status).toBe(200);
  return login.headers.getSetCookie().map((value) => value.split(";")[0]).join("; ");
}

async function publish(author: string, reviewer: string, admin: string, revision = fixture) {
  const created = await ed("/", "POST", author, { typeCode: "W1", topic: "Grammar", difficulty: "intro", revision });
  expect(created.status).toBe(201);
  const { data: { id } } = await created.json();
  expect((await ed(`/${id}/submit`, "POST", author)).status).toBe(200);
  expect((await ed(`/${id}/approve`, "POST", reviewer, { humanReviewed: true })).status).toBe(200);
  expect((await ed(`/${id}/publish`, "POST", admin)).status).toBe(200);
  return id as string;
}

it("validates approved full sequences and distinct token IDs before editorial publication", async () => {
  const author = await actor("writer@w1.test", "editor");
  const bad = { ...fixture, items: [{ ...fixture.items[0], key: { ...fixture.items[0].key!, acceptedAnswers: [["a", "b", "b"]] } }] };
  const created = await ed("/", "POST", author, { typeCode: "W1", topic: "Grammar", difficulty: "intro", revision: bad });
  const { data: { id } } = await created.json();
  expect((await ed(`/${id}/submit`, "POST", author)).status).toBe(422);
  expect((await ed(`/${id}`, "PUT", author, fixture)).status).toBe(200);
  expect((await ed(`/${id}/submit`, "POST", author)).status).toBe(200);
});

it("offers only 10 or 20 distinct published groups, pins revisions and reports scarcity", async () => {
  const author = await actor("writer@w1.test", "editor");
  const reviewer = await actor("reviewer@w1.test", "editor");
  const admin = await actor("admin@w1.test", "admin");
  const learner = await actor("learner@w1.test", "learner");
  expect((await api("/summary?groups=10", "GET", learner)).status).toBe(200);
  expect((await api("/summary?groups=2", "GET", learner)).status).toBe(400);
  expect((await api("/attempts", "POST", learner, { groups: 2, timerMode: "count_up" })).status).toBe(400);
  const first = await publish(author, reviewer, admin);
  const scarcity = (await (await api("/summary?groups=10", "GET", learner)).json()).data;
  expect(scarcity).toMatchObject({ materialCount: 1, itemCount: 1, availableMaterials: 1, shortage: 9 });
  expect((await api("/attempts", "POST", learner, { groups: 10, timerMode: "count_up" })).status).toBe(422);
  for (let n = 1; n < 10; n++) await publish(author, reviewer, admin);
  const ten = (await (await api("/attempts", "POST", learner, { groups: 10, timerMode: "count_down" })).json()).data.id;
  const prepared = (await (await api(`/attempts/${ten}`, "GET", learner)).json()).data;
  expect(prepared).toMatchObject({ status: "prepared", materialCount: 10, itemCount: 10, startedAt: null });
  expect(new Set(prepared.groups.map((value: { revisionId: string }) => value.revisionId)).size).toBe(10);
  expect(prepared.groups.map((value: { revisionId: string }) => value.revisionId)).toContain(first);
  expect(JSON.stringify(prepared)).not.toMatch(/acceptedSequences|explanation|approved_variants/);
  expect((await api("/attempts", "POST", learner, { groups: 20, timerMode: "count_up" })).status).toBe(422);
  expect((await call(r3, "practice", `/attempts/${ten}`, "GET", learner)).status).toBe(404);
  const original = (await db.select().from(exerciseRevisions).where(eq(exerciseRevisions.id, first)))[0];
  const next = await ed(`/${original.exerciseId}/revisions`, "POST", author, { ...fixture, publicContent: { context: "New version" } });
  const nextId = (await next.json()).data.id;
  await ed(`/${nextId}/submit`, "POST", author);
  await ed(`/${nextId}/approve`, "POST", reviewer, { humanReviewed: true });
  await ed(`/${nextId}/publish`, "POST", admin);
  expect((await (await api(`/attempts/${ten}`, "GET", learner)).json()).data.groups).toEqual(prepared.groups);
  const newAttempt = (await (await api("/attempts", "POST", learner, { groups: 10, timerMode: "count_up" })).json()).data.id;
  const newDetail = (await (await api(`/attempts/${newAttempt}`, "GET", learner)).json()).data;
  expect(newDetail.groups.map((value: { revisionId: string }) => value.revisionId)).toContain(nextId);
  for (let n = 10; n < 20; n++) await publish(author, reviewer, admin);
  const twenty = await api("/attempts", "POST", learner, { groups: 20, timerMode: "count_up" });
  expect(twenty.status).toBe(201);
  const twentyId = (await twenty.json()).data.id;
  expect((await (await api(`/attempts/${twentyId}`, "GET", learner)).json()).data).toMatchObject({ materialCount: 20, itemCount: 20 });
});

it("saves partial ordering with duplicate text, resumes, grades approved variants and omissions once", async () => {
  const author = await actor("writer@w1.test", "editor");
  const reviewer = await actor("reviewer@w1.test", "editor");
  const admin = await actor("admin@w1.test", "admin");
  const learner = await actor("learner@w1.test", "learner");
  const stranger = await actor("stranger@w1.test", "learner");
  for (let n = 0; n < 10; n++) await publish(author, reviewer, admin);
  const { data: { id } } = await (await api("/attempts", "POST", learner, { groups: 10, timerMode: "count_down" })).json();
  expect((await api(`/attempts/${id}/start`, "POST", stranger)).status).toBe(404);
  expect((await api(`/attempts/${id}/submit`, "POST", learner)).status).toBe(409);
  expect((await api(`/attempts/${id}/start`, "POST", learner)).status).toBe(200);
  expect((await db.select().from(deadlineJobs).where(eq(deadlineJobs.attemptId, id)))[0]).toMatchObject({ kind: "attempt", status: "failed" });
  const ready = (await (await api(`/attempts/${id}`, "GET", learner)).json()).data;
  expect(ready.deadlineAt).toBeTruthy();
  expect((await api(`/attempts/${id}/start`, "POST", learner)).status).toBe(200);
  const item = ready.items[0];
  const put = (itemId: string, version: number, tokenIds: string[]) => api(`/attempts/${id}/items/${itemId}`, "PUT", learner, { version, response: { tokenIds } });
  expect((await put(item.id, 0, ["a", "a"])).status).toBe(422);
  expect((await put(item.id, 0, ["a", "other"])).status).toBe(422);
  expect((await put(item.id, 0, ["a", "b"])).status).toBe(200);
  expect((await put(item.id, 0, ["c"])).status).toBe(409);
  expect((await put(item.id, 1, ["a", "c", "b"])).status).toBe(200);
  expect((await api(`/attempts/${id}/position`, "PUT", learner, { position: 2 })).status).toBe(200);
  const resumed = (await (await api(`/attempts/${id}`, "GET", learner)).json()).data;
  expect(resumed).toMatchObject({ status: "in_progress", currentPosition: 2, itemCount: 10 });
  expect(resumed.items[0]).toMatchObject({ version: 2, response: { tokenIds: ["a", "c", "b"] } });
  expect(JSON.stringify(resumed)).not.toMatch(/acceptedSequences|explanation/);
  expect((await put(resumed.items[1].id, 0, ["a", "b"])).status).toBe(200);
  expect((await put(resumed.items[2].id, 0, ["b", "a", "c"])).status).toBe(200);
  const results = await Promise.all([api(`/attempts/${id}/submit`, "POST", learner), api(`/attempts/${id}/submit`, "POST", learner)]);
  expect(results.map((value) => value.status)).toEqual([200, 200]);
  const [first, second] = await Promise.all(results.map((value) => value.json()));
  expect({ ...first.data, serverTime: null }).toEqual({ ...second.data, serverTime: null });
  expect(first.data).toMatchObject({ status: "submitted", pointsAwarded: 1, pointsPossible: 10 });
  expect(first.data.items.slice(0, 3).map((value: { outcome: string }) => value.outcome)).toEqual(["correct", "omitted", "incorrect"]);
  expect(first.data.items[0]).toMatchObject({ acceptedSequences: [["a", "b", "c"], ["a", "c", "b"]], explanation: expect.any(String) });
  expect((await put(item.id, 2, ["a", "b", "c"])).status).toBe(409);
  expect((await api(`/attempts/${id}`, "GET", stranger)).status).toBe(404);
});

it("closes at database deadline preserving responses and rejecting late saves", async () => {
  const author = await actor("writer@w1.test", "editor");
  const reviewer = await actor("reviewer@w1.test", "editor");
  const admin = await actor("admin@w1.test", "admin");
  const learner = await actor("learner@w1.test", "learner");
  for (let n = 0; n < 10; n++) await publish(author, reviewer, admin);
  const id = (await (await api("/attempts", "POST", learner, { groups: 10, timerMode: "count_down" })).json()).data.id;
  await api(`/attempts/${id}/start`, "POST", learner);
  const before = (await (await api(`/attempts/${id}`, "GET", learner)).json()).data;
  await api(`/attempts/${id}/items/${before.items[0].id}`, "PUT", learner, { version: 0, response: { tokenIds: ["a", "b", "c"] } });
  await db.update(attempts).set({ deadlineAt: new Date(Date.now() - 1000) }).where(eq(attempts.id, id));
  const [job] = await db.select().from(deadlineJobs).where(eq(deadlineJobs.attemptId, id));
  await db.update(deadlineJobs).set({ deadlineAt: new Date(Date.now() - 1000) }).where(eq(deadlineJobs.id, job.id));
  await runDeadlineJob(job.id);
  await runDeadlineJob(job.id);
  expect((await db.select().from(attempts).where(eq(attempts.id, id)))[0].status).toBe("submitted");
  expect((await api(`/attempts/${id}/items/${before.items[1].id}`, "PUT", learner, { version: 0, response: { tokenIds: ["a"] } })).status).toBe(409);
  expect((await (await api(`/attempts/${id}`, "GET", learner)).json()).data).toMatchObject({ status: "submitted", pointsAwarded: 1, pointsPossible: 10 });
});
