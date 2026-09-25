import { afterAll, beforeAll, beforeEach, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { eq, sql } from "drizzle-orm";
import { db, pool } from "@/db";
import { attemptActivity, attemptGroups, attemptItems, attempts, exerciseItems, exerciseRevisions, exercises, users } from "@/db/schema";

const mail = vi.hoisted(() => [] as { url: string }[]);
vi.mock("@/lib/email", () => ({ sendTransactionalEmail: async (message: { url: string }) => { mail.push(message); } }));
const base = "http://localhost:3000";
const { POST: authPost, GET: authGet } = await import("@/app/api/auth/[...all]/route");
const { GET, POST } = await import("@/app/api/history/[[...route]]/route");
const api = (path: string, method = "GET", cookie?: string, data?: unknown) => {
  const request = new NextRequest(`${base}/api/history${path}`, { method, headers: { ...(cookie ? { cookie } : {}), ...(data ? { "content-type": "application/json" } : {}) }, ...(data ? { body: JSON.stringify(data) } : {}) });
  return method === "GET" ? GET(request) : POST(request);
};

beforeAll(async () => { await migrate(db, { migrationsFolder: "./drizzle" }); });
beforeEach(async () => {
  mail.length = 0;
  await db.execute(sql`truncate table "account", "session", "verification", "users", "rate_limit", "exercises" cascade`);
});
afterAll(async () => { await pool.end(); });

async function learner(email: string) {
  const signUp = await authPost(new NextRequest(`${base}/api/auth/sign-up/email`, { method: "POST", headers: { "content-type": "application/json", origin: base, "x-forwarded-for": `198.51.100.${mail.length + 1}` }, body: JSON.stringify({ name: email, email, password: "safe-password-123" }) }));
  expect(signUp.status).toBe(200);
  expect((await authGet(new NextRequest(mail.at(-1)!.url))).status).toBe(302);
  const login = await authPost(new NextRequest(`${base}/api/auth/sign-in/email`, { method: "POST", headers: { "content-type": "application/json", origin: base, "x-forwarded-for": `198.51.100.${mail.length + 40}` }, body: JSON.stringify({ email, password: "safe-password-123" }) }));
  expect(login.status).toBe(200);
  return { cookie: login.headers.getSetCookie().map((value) => value.split(";")[0]).join("; "), id: (await db.select({ id: users.id }).from(users).where(eq(users.email, email)))[0].id };
}

async function fixture(userId: string, typeCode: "R1" | "R3" | "L2" | "W1" | "W2", status: "prepared" | "in_progress" | "submitted" = "submitted", revisionId?: string) {
  const section = typeCode.startsWith("R") ? "reading" : typeCode === "L2" ? "listening" : "writing";
  let revision = revisionId;
  if (!revision) {
    const exerciseId = crypto.randomUUID();
    revision = crypto.randomUUID();
    await db.insert(exercises).values({ id: exerciseId, section, typeCode });
    await db.insert(exerciseRevisions).values({ id: revision, exerciseId, revisionNumber: 1, authorId: userId, provenanceNote: "test", rightsNote: "test", publicContent: {} });
    await db.insert(exerciseItems).values({ id: crypto.randomUUID(), revisionId: revision, ordinal: 1,
      responseKind: typeCode === "W2" ? "free_text" : typeCode === "R1" ? "fill_word" : typeCode === "W1" ? "token_order" : "single_choice",
      publicPrompt: {}, pointsPossible: typeCode === "W2" ? "0" : "1" });
  }
  const id = crypto.randomUUID();
  const groupId = crypto.randomUUID();
  await db.insert(attempts).values({ id, userId, typeCode, requestedGroups: 1, timerMode: "count_up", rulesSnapshot: { version: "fixture" }, status,
    startedAt: status === "prepared" ? null : new Date(), submittedAt: status === "submitted" ? new Date() : null,
    pointsAwarded: status === "submitted" && typeCode !== "W2" ? "1" : null,
    pointsPossible: status === "submitted" && typeCode !== "W2" ? "1" : null });
  await db.insert(attemptGroups).values({ id: groupId, attemptId: id, revisionId: revision, ordinal: 1 });
  const [item] = await db.select().from(exerciseItems).where(eq(exerciseItems.revisionId, revision));
  await db.insert(attemptItems).values({ id: crypto.randomUUID(), attemptId: id, groupId, revisionId: revision, itemId: item.id,
    globalPosition: 1, pointsPossible: item.pointsPossible, ...(status === "submitted" ? { responseJson: { text: "Original" }, responseVersion: 2, outcome: typeCode === "W2" ? "ungraded" : "correct", pointsAwarded: typeCode === "W2" ? "0" : "1" } : {}) });
  return { id, revisionId: revision };
}

it("filters owner, section and state; reports all five types without grading W2", async () => {
  const a = await learner("a@history.test");
  const b = await learner("b@history.test");
  const ids = [];
  for (const type of ["R1", "R3", "L2", "W1", "W2"] as const) ids.push((await fixture(a.id, type)).id);
  const open = await fixture(a.id, "R3", "in_progress");
  await fixture(b.id, "R3");
  expect((await api("/attempts")).status).toBe(401);
  expect((await api("/activity")).status).toBe(401);
  expect((await api("/attempts?section=unknown", "GET", a.cookie)).status).toBe(400);
  const all = (await (await api("/attempts", "GET", a.cookie)).json()).data;
  expect(all).toHaveLength(6);
  expect(all.find((row: { typeCode: string }) => row.typeCode === "W2")).toMatchObject({ pointsAwarded: null, pointsPossible: null });
  expect((await (await api("/attempts?section=reading&status=submitted", "GET", a.cookie)).json()).data.map((row: { id: string }) => row.id).sort()).toEqual(ids.slice(0, 2).sort());
  expect((await (await api("/attempts?status=in_progress", "GET", a.cookie)).json()).data.map((row: { id: string }) => row.id)).toEqual([open.id]);
  expect((await (await api("/activity", "GET", a.cookie)).json()).data).toEqual({ practiceSeconds: 0, completedMaterials: 5 });
  expect((await (await api("/activity", "GET", b.cookie)).json()).data.completedMaterials).toBe(1);
});

it("repeats a frozen batch as a fresh attempt without modifying answers or unique coverage", async () => {
  const a = await learner("a@history.test");
  const b = await learner("b@history.test");
  for (const type of ["R1", "R3", "L2", "W1", "W2"] as const) {
    const source = await fixture(a.id, type);
    expect((await api(`/attempts/${source.id}/repeat`, "POST", b.cookie)).status).toBe(404);
    const repeated = await api(`/attempts/${source.id}/repeat`, "POST", a.cookie);
    expect(repeated.status).toBe(201);
    const { data: { id } } = await repeated.json();
    expect(id).not.toBe(source.id);
    const [newAttempt] = await db.select().from(attempts).where(eq(attempts.id, id));
    const [newGroup] = await db.select().from(attemptGroups).where(eq(attemptGroups.attemptId, id));
    const [newItem] = await db.select().from(attemptItems).where(eq(attemptItems.attemptId, id));
    const [originalItem] = await db.select().from(attemptItems).where(eq(attemptItems.attemptId, source.id));
    expect(newAttempt).toMatchObject({ status: "prepared", typeCode: type, rulesSnapshot: { version: "fixture" } });
    expect(newGroup.revisionId).toBe(source.revisionId);
    expect(newItem).toMatchObject({ itemId: originalItem.itemId, responseJson: null, responseVersion: 0, outcome: null });
    expect(originalItem).toMatchObject({ responseJson: { text: "Original" }, responseVersion: 2 });
  }
  expect((await (await api("/activity", "GET", a.cookie)).json()).data.completedMaterials).toBe(5);
  const [first] = await db.select().from(attempts).where(eq(attempts.userId, a.id));
  const duplicate = await fixture(a.id, first.typeCode as "R1", "submitted", (await db.select().from(attemptGroups).where(eq(attemptGroups.attemptId, first.id)))[0].revisionId);
  expect(duplicate.id).not.toBe(first.id);
  expect((await (await api("/activity", "GET", a.cookie)).json()).data.completedMaterials).toBe(5);
  expect((await api(`/attempts/${duplicate.id}/heartbeat`, "POST", b.cookie, { visible: true })).status).toBe(404);
  const prepared = await fixture(a.id, "R3", "prepared");
  expect((await api(`/attempts/${prepared.id}/repeat`, "POST", a.cookie)).status).toBe(409);
});

it("counts continuous visible reading, but not first ping, hidden gaps, long idle gaps or time after delivery/expiry", async () => {
  const a = await learner("a@history.test");
  const b = await learner("b@history.test");
  const { id } = await fixture(a.id, "R3", "in_progress");
  const ping = (visible: boolean, cookie = a.cookie) => api(`/attempts/${id}/heartbeat`, "POST", cookie, { visible });
  expect((await ping(true)).status).toBe(200);
  expect((await (await api("/activity", "GET", a.cookie)).json()).data.practiceSeconds).toBe(0);
  await db.update(attemptActivity).set({ lastVisibleAt: new Date(Date.now() - 10000) }).where(eq(attemptActivity.attemptId, id));
  expect((await (await ping(true)).json()).data.practiceSeconds).toBeGreaterThanOrEqual(9);
  const counted = (await (await api("/activity", "GET", a.cookie)).json()).data.practiceSeconds;
  await db.update(attemptActivity).set({ lastVisibleAt: new Date(Date.now() - 10000) }).where(eq(attemptActivity.attemptId, id));
  const concurrent = await Promise.all([ping(true), ping(true)]);
  expect(concurrent.map((response) => response.status)).toEqual([200, 200]);
  const serialized = (await (await api("/activity", "GET", a.cookie)).json()).data.practiceSeconds;
  expect(serialized - counted).toBeGreaterThanOrEqual(9);
  expect(serialized - counted).toBeLessThanOrEqual(11);
  await db.update(attemptActivity).set({ lastVisibleAt: new Date(Date.now() - 60000) }).where(eq(attemptActivity.attemptId, id));
  expect((await (await ping(true)).json()).data.practiceSeconds).toBe(serialized);
  await db.update(attemptActivity).set({ lastVisibleAt: new Date(Date.now() - 10000) }).where(eq(attemptActivity.attemptId, id));
  expect((await ping(false)).status).toBe(200);
  expect((await (await ping(true)).json()).data.practiceSeconds).toBe(serialized);
  expect((await ping(true, b.cookie)).status).toBe(404);
  expect((await api(`/attempts/${id}/heartbeat`, "POST", a.cookie, { visible: "yes" })).status).toBe(400);
  await db.update(attempts).set({ deadlineAt: new Date(Date.now() - 1000) }).where(eq(attempts.id, id));
  await db.update(attemptActivity).set({ lastVisibleAt: new Date(Date.now() - 10000) }).where(eq(attemptActivity.attemptId, id));
  expect((await (await ping(true)).json()).data.practiceSeconds).toBe(serialized);
  await db.update(attempts).set({ status: "submitted", submittedAt: new Date() }).where(eq(attempts.id, id));
  expect((await (await ping(true)).json()).data.practiceSeconds).toBe(serialized);
  expect((await (await api("/activity", "GET", b.cookie)).json()).data.practiceSeconds).toBe(0);
});
