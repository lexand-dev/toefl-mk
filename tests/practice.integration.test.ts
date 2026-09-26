import { afterAll, beforeAll, beforeEach, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { eq, sql } from "drizzle-orm";
import { db, pool } from "@/db";
import { attempts, attemptItems, deadlineJobs, exerciseRevisions, users } from "@/db/schema";
import { exampleR3 } from "@/features/editorial/example-r3";
import { dispatchPendingDeadlines, recoverDeadlineSchedules, type DeadlineSchedule, type DeadlineScheduler } from "@/features/practice/deadlines";
import { runDeadlineJob } from "@/features/practice/deadline-runner";

const mail = vi.hoisted(() => [] as { subject: string; url: string }[]);
vi.mock("@/lib/email", () => ({ sendTransactionalEmail: async (message: typeof mail[number]) => { mail.push(message); } }));
const base = "http://localhost:3000";
const { POST: authPost, GET: authGet } = await import("@/app/api/auth/[...all]/route");
const editorial = await import("@/app/api/editorial/[[...route]]/route");
const practice = await import("@/app/api/practice/[[...route]]/route");
const call = (route: typeof practice | typeof editorial, prefix: string, path: string, method = "GET", cookie?: string, data?: unknown) => {
  const request = new NextRequest(`${base}/api/${prefix}${path === "/" ? "" : path}`, { method, headers: { ...(cookie ? { cookie } : {}), ...(data ? { "content-type": "application/json" } : {}) }, ...(data ? { body: JSON.stringify(data) } : {}) });
  return (method === "GET" ? route.GET : method === "PUT" ? route.PUT : route.POST)(request);
};
const ed = (path: string, method = "GET", cookie?: string, data?: unknown) => call(editorial, "editorial", path, method, cookie, data);
const api = (path: string, method = "GET", cookie?: string, data?: unknown) => call(practice, "practice", path, method, cookie, data);

class TestScheduler implements DeadlineScheduler {
  calls: DeadlineSchedule[] = [];
  runs = new Map<string, string>();
  fail = false;

  async schedule(input: DeadlineSchedule) {
    this.calls.push(input);
    if (this.fail) throw new Error("Trigger API unavailable");
    const runId = this.runs.get(input.idempotencyKey) ?? `run-${this.runs.size + 1}`;
    this.runs.set(input.idempotencyKey, runId);
    return { runId };
  }
}

beforeAll(async () => { await migrate(db, { migrationsFolder: "./drizzle" }); });
beforeEach(async () => {
  mail.length = 0;
  await db.execute(sql`truncate table "account", "session", "verification", "users", "rate_limit", "exercises", "assets" cascade`);
});
afterAll(async () => { await pool.end(); });

async function actor(email: string, role: "learner" | "editor" | "admin") {
  const signUp = await authPost(new NextRequest(`${base}/api/auth/sign-up/email`, { method: "POST", headers: { "content-type": "application/json", origin: base, "x-forwarded-for": `198.51.100.${mail.length + 1}` }, body: JSON.stringify({ name: email, email, password: "safe-password-123" }) }));
  expect(signUp.status).toBe(200);
  expect((await authGet(new NextRequest(mail.at(-1)!.url))).status).toBe(302);
  await db.update(users).set({ role }).where(eq(users.email, email));
  const login = await authPost(new NextRequest(`${base}/api/auth/sign-in/email`, { method: "POST", headers: { "content-type": "application/json", origin: base, "x-forwarded-for": `198.51.100.${mail.length + 40}` }, body: JSON.stringify({ email, password: "safe-password-123" }) }));
  expect(login.status).toBe(200);
  return login.headers.getSetCookie().map((value) => value.split(";")[0]).join("; ");
}

async function published(author: string, reviewer: string, admin: string, revision = exampleR3) {
  const created = await ed("/", "POST", author, { typeCode: "R3", topic: "Ciencia", difficulty: "intro", revision });
  expect(created.status).toBe(201);
  const { data: { id } } = await created.json();
  expect((await ed(`/${id}/submit`, "POST", author)).status).toBe(200);
  // Approval represents a human editorial decision in this test fixture only.
  expect((await ed(`/${id}/approve`, "POST", reviewer, { humanReviewed: true })).status).toBe(200);
  expect((await ed(`/${id}/publish`, "POST", admin)).status).toBe(200);
  return id as string;
}

it("selects distinct published materials, pins revisions and gives shortage without duplicating", async () => {
  const author = await actor("author@practice.test", "editor");
  const reviewer = await actor("reviewer@practice.test", "editor");
  const admin = await actor("admin@practice.test", "admin");
  const learner = await actor("learner@practice.test", "learner");
  expect((await api("/r3/summary?groups=1", "GET", learner)).status).toBe(200);
  expect((await api("/attempts", "POST", learner, { typeCode: "R3", groups: 1, timerMode: "count_down" })).status).toBe(422);
  const revision = await published(author, reviewer, admin);
  const summary = (await (await api("/r3/summary?groups=2", "GET", learner)).json()).data;
  expect(summary).toMatchObject({ materialCount: 1, itemCount: 3, availableMaterials: 1, shortage: 1 });
  expect((await api("/attempts", "POST", learner, { typeCode: "R3", groups: 2, timerMode: "count_down" })).status).toBe(422);
  expect((await api("/attempts", "POST", learner, { typeCode: "R3", groups: 3, timerMode: "count_down" })).status).toBe(400);
  const second = await published(author, reviewer, admin, { ...exampleR3, publicContent: { ...exampleR3.publicContent, title: "Segundo pasaje" }, items: [exampleR3.items[0]] });
  const created = await api("/attempts", "POST", learner, { typeCode: "R3", groups: 2, timerMode: "count_down" });
  expect(created.status).toBe(201);
  const { data: { id } } = await created.json();
  const before = (await (await api(`/attempts/${id}`, "GET", learner)).json()).data;
  expect(before).toMatchObject({ status: "prepared", materialCount: 2, itemCount: 4, startedAt: null });
  expect(new Set(before.groups.map((group: { revisionId: string }) => group.revisionId))).toEqual(new Set([revision, second]));
  expect(JSON.stringify(before)).not.toMatch(/acceptedAnswers|correctOptionId|explanation/);
  const [original] = await db.select().from(exerciseRevisions).where(eq(exerciseRevisions.id, revision));
  const nextDraft = await ed(`/${original.exerciseId}/revisions`, "POST", author, { ...exampleR3, publicContent: { ...exampleR3.publicContent, title: "Nueva revisión" } });
  const { data: { id: nextRevision } } = await nextDraft.json();
  await ed(`/${nextRevision}/submit`, "POST", author);
  await ed(`/${nextRevision}/approve`, "POST", reviewer, { humanReviewed: true });
  await ed(`/${nextRevision}/publish`, "POST", admin);
  const latest = (await (await api("/attempts", "POST", learner, { typeCode: "R3", groups: 2, timerMode: "count_up" })).json()).data;
  const latestGroups = (await (await api(`/attempts/${latest.id}`, "GET", learner)).json()).data.groups;
  expect(latestGroups.map((group: { revisionId: string }) => group.revisionId)).toContain(nextRevision);
  expect(latestGroups.map((group: { revisionId: string }) => group.revisionId)).not.toContain(revision);
  expect((await ed(`/${revision}/retire`, "POST", admin)).status).toBe(200);
  expect((await (await api(`/attempts/${id}`, "GET", learner)).json()).data.groups).toEqual(before.groups);
  expect((await api("/attempts", "POST", learner, { typeCode: "R3", groups: 2, timerMode: "count_down" })).status).toBe(201);
  expect((await db.select().from(exerciseRevisions).where(eq(exerciseRevisions.id, revision)))[0].status).toBe("retired");
});

it("starts after preparation, persists position and responses, grades omissions once under concurrent submissions", async () => {
  const author = await actor("author@practice.test", "editor");
  const reviewer = await actor("reviewer@practice.test", "editor");
  const admin = await actor("admin@practice.test", "admin");
  const learner = await actor("learner@practice.test", "learner");
  const stranger = await actor("stranger@practice.test", "learner");
  await published(author, reviewer, admin);
  const { data: { id } } = await (await api("/attempts", "POST", learner, { typeCode: "R3", groups: 1, timerMode: "count_down" })).json();
  expect((await (await api("/attempts", "GET", learner)).json()).data.map((value: { id: string }) => value.id)).toContain(id);
  expect((await (await api("/attempts", "GET", stranger)).json()).data).toEqual([]);
  expect((await api(`/attempts/${id}`, "GET", stranger)).status).toBe(404);
  expect((await api(`/attempts/${id}/start`, "POST", stranger)).status).toBe(404);
  expect((await api(`/attempts/${id}/submit`, "POST", learner)).status).toBe(409);
  const firstStart = await api(`/attempts/${id}/start`, "POST", learner);
  expect(firstStart.status).toBe(200);
  const ready = (await (await api(`/attempts/${id}`, "GET", learner)).json()).data;
  expect(ready.deadlineAt).toBeTruthy();
  await api(`/attempts/${id}/start`, "POST", learner);
  expect((await (await api(`/attempts/${id}`, "GET", learner)).json()).data.startedAt).toBe(ready.startedAt);
  const item = ready.items[0];
  expect((await api(`/attempts/${id}/items/${item.id}`, "PUT", stranger, { version: 0, response: { optionId: "a" } })).status).toBe(404);
  expect((await api(`/attempts/${id}/items/${item.id}`, "PUT", learner, { version: 0, response: { optionId: "unknown" } })).status).toBe(422);
  const saved = await api(`/attempts/${id}/items/${item.id}`, "PUT", learner, { version: 0, response: { optionId: "a" } });
  expect((await saved.json()).data.version).toBe(1);
  expect((await api(`/attempts/${id}/items/${item.id}`, "PUT", learner, { version: 0, response: { optionId: "b" } })).status).toBe(409);
  expect((await api(`/attempts/${id}/position`, "PUT", learner, { position: 2 })).status).toBe(200);
  expect((await api(`/attempts/${id}/position`, "PUT", learner, { position: 99 })).status).toBe(422);
  const resumed = (await (await api(`/attempts/${id}`, "GET", learner)).json()).data;
  expect(resumed).toMatchObject({ currentPosition: 2, status: "in_progress" });
  expect(resumed.items[0]).toMatchObject({ version: 1, response: { optionId: "a" } });
  expect(JSON.stringify(resumed)).not.toMatch(/acceptedAnswers|correctOptionId|explanation/);
  const results = await Promise.all([api(`/attempts/${id}/submit`, "POST", learner), api(`/attempts/${id}/submit`, "POST", learner)]);
  expect(results.map((result) => result.status)).toEqual([200, 200]);
  const [first, second] = await Promise.all(results.map((result) => result.json()));
  expect({ ...first.data, serverTime: null }).toEqual({ ...second.data, serverTime: null });
  expect(first.data).toMatchObject({ status: "submitted", pointsAwarded: 1, pointsPossible: 3 });
  expect(first.data.items.map((value: { outcome: string }) => value.outcome)).toEqual(["correct", "omitted", "omitted"]);
  expect(first.data.items[0]).toMatchObject({ correctOptionId: "a", explanation: expect.any(String) });
  expect((await api(`/attempts/${id}/items/${item.id}`, "PUT", learner, { version: 1, response: { optionId: "b" } })).status).toBe(409);
  expect((await api(`/attempts/${id}/submit`, "POST", stranger)).status).toBe(404);
  expect((await (await api("/attempts", "GET", learner)).json()).data).toEqual([]);
  expect((await api(`/attempts/${id}/position`, "PUT", learner, { position: 3 })).status).toBe(200);
  expect((await (await api(`/attempts/${id}`, "GET", learner)).json()).data.items[2].outcome).toBe("omitted");
  expect((await db.select().from(attemptItems).where(eq(attemptItems.attemptId, id))).filter((value) => value.outcome === "correct")).toHaveLength(1);
});

it("uses database time for expiry and keeps saved answers while blocking late writes", async () => {
  const author = await actor("author@practice.test", "editor");
  const reviewer = await actor("reviewer@practice.test", "editor");
  const admin = await actor("admin@practice.test", "admin");
  const learner = await actor("learner@practice.test", "learner");
  await published(author, reviewer, admin);
  const { data: { id } } = await (await api("/attempts", "POST", learner, { typeCode: "R3", groups: 1, timerMode: "count_down" })).json();
  await api(`/attempts/${id}/start`, "POST", learner);
  const before = (await (await api(`/attempts/${id}`, "GET", learner)).json()).data;
  await api(`/attempts/${id}/items/${before.items[0].id}`, "PUT", learner, { version: 0, response: { optionId: "a" } });
  await db.update(attempts).set({ deadlineAt: new Date(Date.now() - 1000) }).where(eq(attempts.id, id));
  expect((await api(`/attempts/${id}/items/${before.items[1].id}`, "PUT", learner, { version: 0, response: { optionId: "b" } })).status).toBe(409);
  const after = (await (await api(`/attempts/${id}`, "GET", learner)).json()).data;
  expect(after).toMatchObject({ status: "submitted", pointsAwarded: 1, pointsPossible: 3 });
  expect(after.items[0].response).toEqual({ optionId: "a" });
  expect((await api(`/attempts/${id}/submit`, "POST", learner)).status).toBe(200);
  const { data: { id: untimed } } = await (await api("/attempts", "POST", learner, { typeCode: "R3", groups: 1, timerMode: "count_up" })).json();
  await api(`/attempts/${untimed}/start`, "POST", learner);
  expect((await (await api(`/attempts/${untimed}`, "GET", learner)).json()).data.deadlineAt).toBeNull();
});

it("closes through the delayed service without a browser and recovers failed scheduling idempotently", async () => {
  const author = await actor("deadline-author@practice.test", "editor");
  const reviewer = await actor("deadline-reviewer@practice.test", "editor");
  const admin = await actor("deadline-admin@practice.test", "admin");
  const learner = await actor("deadline-learner@practice.test", "learner");
  await published(author, reviewer, admin);
  const { data: { id } } = await (await api("/attempts", "POST", learner, { typeCode: "R3", groups: 1, timerMode: "count_down" })).json();
  expect((await api(`/attempts/${id}/start`, "POST", learner)).status).toBe(200);

  let [failed] = await db.select().from(deadlineJobs).where(eq(deadlineJobs.attemptId, id));
  expect(failed).toMatchObject({ kind: "attempt", status: "failed", scheduleAttempts: 1 });
  expect(failed.lastError).toContain("inject a deadline scheduler");

  const scheduler = new TestScheduler();
  scheduler.fail = true;
  await db.delete(deadlineJobs).where(eq(deadlineJobs.id, failed.id));
  await recoverDeadlineSchedules(scheduler);
  [failed] = await db.select().from(deadlineJobs).where(eq(deadlineJobs.attemptId, id));
  expect(failed).toMatchObject({ status: "failed", scheduleAttempts: 1 });
  await dispatchPendingDeadlines(id, scheduler);
  scheduler.fail = false;
  await dispatchPendingDeadlines(id, scheduler);
  await dispatchPendingDeadlines(id, scheduler);
  const [scheduled] = await db.select().from(deadlineJobs).where(eq(deadlineJobs.id, failed.id));
  expect(scheduled).toMatchObject({ status: "scheduled", triggerRunId: "run-1", scheduleAttempts: 3, lastError: null });
  expect(scheduler.calls.map((call) => call.idempotencyKey)).toEqual([failed.deadlineKey, failed.deadlineKey, failed.deadlineKey]);
  expect(scheduler.runs.size).toBe(1);

  const expired = new Date(Date.now() - 1000);
  await db.update(attempts).set({ deadlineAt: expired }).where(eq(attempts.id, id));
  await db.update(deadlineJobs).set({ deadlineAt: expired }).where(eq(deadlineJobs.id, failed.id));
  await runDeadlineJob(failed.id, scheduler);
  expect((await db.select().from(attempts).where(eq(attempts.id, id)))[0]).toMatchObject({ status: "submitted", pointsAwarded: "0.00", pointsPossible: "3.00" });
  expect((await db.select().from(deadlineJobs).where(eq(deadlineJobs.id, failed.id)))[0].status).toBe("completed");
});

it("serializes a delayed job, save and manual submit on the attempt lock", async () => {
  const author = await actor("race-author@practice.test", "editor");
  const reviewer = await actor("race-reviewer@practice.test", "editor");
  const admin = await actor("race-admin@practice.test", "admin");
  const learner = await actor("race-learner@practice.test", "learner");
  await published(author, reviewer, admin);
  const { data: { id } } = await (await api("/attempts", "POST", learner, { typeCode: "R3", groups: 1, timerMode: "count_down" })).json();
  await api(`/attempts/${id}/start`, "POST", learner);
  const active = (await (await api(`/attempts/${id}`, "GET", learner)).json()).data;
  const [job] = await db.select().from(deadlineJobs).where(eq(deadlineJobs.attemptId, id));
  const expired = new Date(Date.now() - 1000);
  await db.update(attempts).set({ deadlineAt: expired }).where(eq(attempts.id, id));
  await db.update(deadlineJobs).set({ deadlineAt: expired, status: "scheduled" }).where(eq(deadlineJobs.id, job.id));

  const scheduler = new TestScheduler();
  const [jobResult, saveResult, submitResult] = await Promise.allSettled([
    runDeadlineJob(job.id, scheduler),
    api(`/attempts/${id}/items/${active.items[0].id}`, "PUT", learner, { version: 0, response: { optionId: "a" } }),
    api(`/attempts/${id}/submit`, "POST", learner),
  ]);
  expect(jobResult.status).toBe("fulfilled");
  expect(saveResult.status).toBe("fulfilled");
  expect(submitResult.status).toBe("fulfilled");
  if (saveResult.status === "fulfilled") expect([200, 409]).toContain(saveResult.value.status);
  if (submitResult.status === "fulfilled") expect(submitResult.value.status).toBe(200);
  const [closed] = await db.select().from(attempts).where(eq(attempts.id, id));
  expect(closed.status).toBe("submitted");
  expect(closed.submittedAt).not.toBeNull();
  expect((await db.select().from(attemptItems).where(eq(attemptItems.attemptId, id))).every((item) => item.outcome !== null)).toBe(true);
});
