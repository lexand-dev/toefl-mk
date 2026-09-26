import { afterAll, beforeAll, beforeEach, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { eq, sql } from "drizzle-orm";
import { db, pool } from "@/db";
import { attempts, users } from "@/db/schema";
import type { RevisionInput } from "@/features/editorial/schemas";

const mail = vi.hoisted(() => [] as { url: string }[]);
vi.mock("@/lib/email", () => ({ sendTransactionalEmail: async (message: { url: string }) => { mail.push(message); } }));
const base = "http://localhost:3000";
const { POST: authPost, GET: authGet } = await import("@/app/api/auth/[...all]/route");
const editorial = await import("@/app/api/editorial/[[...route]]/route");
const r1 = await import("@/app/api/practice/r1/[[...route]]/route");
const call = (route: typeof editorial | typeof r1, prefix: string, path: string, method = "GET", cookie?: string, data?: unknown) => {
  const request = new NextRequest(`${base}/api/${prefix}${path === "/" ? "" : path}`, { method, headers: { ...(cookie ? { cookie } : {}), ...(data ? { "content-type": "application/json" } : {}) }, ...(data ? { body: JSON.stringify(data) } : {}) });
  return (method === "GET" ? route.GET : method === "PUT" ? route.PUT : route.POST)(request);
};
const ed = (path: string, method = "GET", cookie?: string, data?: unknown) => call(editorial, "editorial", path, method, cookie, data);
const api = (path: string, method = "GET", cookie?: string, data?: unknown) => call(r1, "practice/r1", path, method, cookie, data);
const fixture: RevisionInput = {
  publicContent: { title: "Signals in migration", segments: [
    { kind: "text", text: "Migratory birds " }, { kind: "gap", gapId: "navigation", stem: "nav" },
    { kind: "text", text: " by combining visual " }, { kind: "gap", gapId: "signals", stem: "sig" }, { kind: "text", text: "." },
  ] },
  provenanceNote: "Original test paragraph", rightsNote: "Original test content", assets: [], reviewContent: null,
  items: [
    { ordinal: 1, responseKind: "fill_word", publicPrompt: { gapId: "navigation", context: "navigation" }, pointsPossible: 1, key: { acceptedAnswers: ["igation"], scoringRule: "exact", explanation: "The noun completes the idea of finding a route." } },
    { ordinal: 2, responseKind: "fill_word", publicPrompt: { gapId: "signals", context: "signals" }, pointsPossible: 1, key: { acceptedAnswers: ["nals"], scoringRule: "case_insensitive", explanation: "The plural noun follows visual." } },
  ],
};

beforeAll(async () => { await migrate(db, { migrationsFolder: "./drizzle" }); });
beforeEach(async () => { mail.length = 0; await db.execute(sql`truncate table "account", "session", "verification", "users", "rate_limit", "exercises" cascade`); });
afterAll(async () => { await pool.end(); });

async function actor(email: string, role: "learner" | "editor" | "admin") {
  expect((await authPost(new NextRequest(`${base}/api/auth/sign-up/email`, { method: "POST", headers: { "content-type": "application/json", origin: base, "x-forwarded-for": `192.0.2.${mail.length + 1}` }, body: JSON.stringify({ name: email, email, password: "safe-password-123" }) }))).status).toBe(200);
  expect((await authGet(new NextRequest(mail.at(-1)!.url))).status).toBe(302);
  await db.update(users).set({ role }).where(eq(users.email, email));
  const login = await authPost(new NextRequest(`${base}/api/auth/sign-in/email`, { method: "POST", headers: { "content-type": "application/json", origin: base, "x-forwarded-for": `192.0.2.${mail.length + 40}` }, body: JSON.stringify({ email, password: "safe-password-123" }) }));
  return login.headers.getSetCookie().map((value) => value.split(";")[0]).join("; ");
}

async function publish(author: string, reviewer: string, admin: string, revision = fixture) {
  const created = await ed("/", "POST", author, { typeCode: "R1", topic: "Migration", difficulty: "intro", revision });
  expect(created.status).toBe(201);
  const id = (await created.json()).data.id as string;
  expect((await ed(`/${id}/submit`, "POST", author)).status).toBe(200);
  expect((await ed(`/${id}/approve`, "POST", reviewer, { humanReviewed: true })).status).toBe(200);
  expect((await ed(`/${id}/publish`, "POST", admin)).status).toBe(200);
  return id;
}

it("requires unique public gap segments that correspond exactly to private-key items", async () => {
  const author = await actor("writer@r1.test", "editor");
  const bad = { ...fixture, publicContent: { ...fixture.publicContent, segments: [{ kind: "text", text: "Only text" }, { kind: "gap", gapId: "other", stem: "oth" }] } };
  const created = await ed("/", "POST", author, { typeCode: "R1", topic: "Migration", difficulty: "intro", revision: bad });
  const id = (await created.json()).data.id;
  expect((await ed(`/${id}/submit`, "POST", author)).status).toBe(422);
  expect((await ed(`/${id}`, "PUT", author, fixture)).status).toBe(200);
  expect((await ed(`/${id}/submit`, "POST", author)).status).toBe(200);
});

it("selects one or two distinct texts, reports real gap counts and withholds solutions", async () => {
  const author = await actor("writer@r1.test", "editor");
  const reviewer = await actor("reviewer@r1.test", "editor");
  const admin = await actor("admin@r1.test", "admin");
  const learner = await actor("learner@r1.test", "learner");
  await publish(author, reviewer, admin);
  expect((await api("/summary?groups=3", "GET", learner)).status).toBe(400);
  expect((await (await api("/summary?groups=2", "GET", learner)).json()).data).toMatchObject({ materialCount: 1, itemCount: 2, shortage: 1 });
  expect((await api("/attempts", "POST", learner, { groups: 2, timerMode: "count_up" })).status).toBe(422);
  await publish(author, reviewer, admin);
  const created = await api("/attempts", "POST", learner, { groups: 2, timerMode: "count_down" });
  expect(created.status).toBe(201);
  const id = (await created.json()).data.id;
  const detail = (await (await api(`/attempts/${id}`, "GET", learner)).json()).data;
  expect(detail).toMatchObject({ status: "prepared", materialCount: 2, itemCount: 4 });
  expect(JSON.stringify(detail)).not.toMatch(/acceptedSuffixes|The noun completes|The plural noun follows/);
});

it("versions each gap, resumes navigation and grades variants and omissions once", async () => {
  const author = await actor("writer@r1.test", "editor");
  const reviewer = await actor("reviewer@r1.test", "editor");
  const admin = await actor("admin@r1.test", "admin");
  const learner = await actor("learner@r1.test", "learner");
  const stranger = await actor("stranger@r1.test", "learner");
  await publish(author, reviewer, admin);
  const id = (await (await api("/attempts", "POST", learner, { groups: 1, timerMode: "count_down" })).json()).data.id;
  expect((await api(`/attempts/${id}/start`, "POST", stranger)).status).toBe(404);
  expect((await api(`/attempts/${id}/start`, "POST", learner)).status).toBe(200);
  const ready = (await (await api(`/attempts/${id}`, "GET", learner)).json()).data;
  const first = ready.items[0];
  const second = ready.items[1];
  expect((await api(`/attempts/${id}/items/${first.id}`, "PUT", learner, { version: 0, response: { suffix: "igation" } })).status).toBe(200);
  expect((await api(`/attempts/${id}/items/${first.id}`, "PUT", learner, { version: 0, response: { suffix: "wrong" } })).status).toBe(409);
  expect((await api(`/attempts/${id}/items/${second.id}`, "PUT", learner, { version: 0, response: { suffix: "NALS" } })).status).toBe(200);
  expect((await api(`/attempts/${id}/position`, "PUT", learner, { position: 2 })).status).toBe(200);
  const resumed = (await (await api(`/attempts/${id}`, "GET", learner)).json()).data;
  expect(resumed).toMatchObject({ status: "in_progress", currentPosition: 2 });
  expect(resumed.items.map((item: { response: unknown; version: number }) => ({ response: item.response, version: item.version }))).toEqual([
    { response: { suffix: "igation" }, version: 1 }, { response: { suffix: "NALS" }, version: 1 },
  ]);
  const results = await Promise.all([api(`/attempts/${id}/submit`, "POST", learner), api(`/attempts/${id}/submit`, "POST", learner)]);
  expect(results.map((response) => response.status)).toEqual([200, 200]);
  const review = (await results[0].json()).data;
  expect(review).toMatchObject({ status: "submitted", pointsAwarded: 2, pointsPossible: 2 });
  expect(review.groups[0].result).toEqual({ pointsAwarded: 2, pointsPossible: 2, omissions: 0 });
  expect(review.items[0]).toMatchObject({ outcome: "correct", acceptedSuffixes: ["igation"], explanation: expect.any(String) });
  expect((await api(`/attempts/${id}`, "GET", stranger)).status).toBe(404);
});

it("includes empty gaps in the denominator and blocks writes after the database deadline", async () => {
  const author = await actor("writer@r1.test", "editor");
  const reviewer = await actor("reviewer@r1.test", "editor");
  const admin = await actor("admin@r1.test", "admin");
  const learner = await actor("learner@r1.test", "learner");
  await publish(author, reviewer, admin);
  const id = (await (await api("/attempts", "POST", learner, { groups: 1, timerMode: "count_down" })).json()).data.id;
  await api(`/attempts/${id}/start`, "POST", learner);
  const ready = (await (await api(`/attempts/${id}`, "GET", learner)).json()).data;
  await api(`/attempts/${id}/items/${ready.items[0].id}`, "PUT", learner, { version: 0, response: { suffix: "igation" } });
  await db.update(attempts).set({ deadlineAt: new Date(Date.now() - 1000) }).where(eq(attempts.id, id));
  expect((await api(`/attempts/${id}/items/${ready.items[1].id}`, "PUT", learner, { version: 0, response: { suffix: "nals" } })).status).toBe(409);
  const review = (await (await api(`/attempts/${id}`, "GET", learner)).json()).data;
  expect(review).toMatchObject({ status: "submitted", pointsAwarded: 1, pointsPossible: 2 });
  expect(review.groups[0].result).toEqual({ pointsAwarded: 1, pointsPossible: 2, omissions: 1 });
  expect(review.items.map((item: { outcome: string }) => item.outcome)).toEqual(["correct", "omitted"]);
});
