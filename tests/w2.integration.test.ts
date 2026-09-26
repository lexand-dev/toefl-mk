import { afterAll, beforeAll, beforeEach, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { eq, sql } from "drizzle-orm";
import { db, pool } from "@/db";
import { attempts, attemptItems, deadlineJobs, users, writingTaskTimes } from "@/db/schema";
import { dispatchPendingDeadlines, type DeadlineSchedule, type DeadlineScheduler } from "@/features/practice/deadlines";
import { runDeadlineJob } from "@/features/practice/deadline-runner";

const mail = vi.hoisted(() => [] as { url: string }[]);
vi.mock("@/lib/email", () => ({ sendTransactionalEmail: async (message: typeof mail[number]) => { mail.push(message); } }));
const base = "http://localhost:3000";
const { POST: authPost, GET: authGet } = await import("@/app/api/auth/[...all]/route");
const editorial = await import("@/app/api/editorial/[[...route]]/route");
const practice = await import("@/app/api/practice/[[...route]]/route");
const call = (route: typeof practice | typeof editorial, prefix: string, path: string, method = "GET", cookie?: string, data?: unknown) => {
  const request = new NextRequest(`${base}/api/${prefix}${path}`, { method, headers: { ...(cookie ? { cookie } : {}), ...(data ? { "content-type": "application/json" } : {}) }, ...(data ? { body: JSON.stringify(data) } : {}) });
  return (method === "GET" ? route.GET : method === "PUT" ? route.PUT : route.POST)(request);
};
const ed = (path: string, method = "GET", cookie?: string, data?: unknown) => call(editorial, "editorial", path, method, cookie, data);
const api = (path: string, method = "GET", cookie?: string, data?: unknown) => call(practice, "practice", `/w2${path}`, method, cookie, data);
const fixture = (suffix: string) => ({ publicContent: { situation: `Situación ${suffix}`, recipient: "Profesora Rivera", task: "Solicita una reunión por correo" }, provenanceNote: "Original de prueba", rightsNote: "Autor original", items: [{ ordinal: 1, responseKind: "free_text", publicPrompt: { instruction: "Explica cuándo estás disponible" }, pointsPossible: 0, key: null }], assets: [], reviewContent: null });

class TestScheduler implements DeadlineScheduler {
  calls: DeadlineSchedule[] = [];
  async schedule(input: DeadlineSchedule) {
    this.calls.push(input);
    return { runId: `run-${input.deadlineJobId}` };
  }
}

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

async function publish(author: string, reviewer: string, admin: string, suffix: string) {
  const created = await ed("", "POST", author, { typeCode: "W2", topic: suffix, difficulty: "intro", revision: fixture(suffix) });
  expect(created.status).toBe(201);
  const { data: { id } } = await created.json();
  expect((await ed(`/${id}/submit`, "POST", author)).status).toBe(200);
  expect((await ed(`/${id}/approve`, "POST", reviewer, { humanReviewed: true })).status).toBe(200);
  expect((await ed(`/${id}/publish`, "POST", admin)).status).toBe(200);
  return id as string;
}

it("selects 1/2/3 published email prompts, isolates drafts, rejects stale saves and persists per-task clocks", async () => {
  const author = await actor("author@w2.test", "editor");
  const reviewer = await actor("reviewer@w2.test", "editor");
  const admin = await actor("admin@w2.test", "admin");
  const learner = await actor("learner@w2.test", "learner");
  const other = await actor("other@w2.test", "learner");
  expect((await api("/summary?groups=1")).status).toBe(401);
  expect((await api("/attempts", "POST", learner, { groups: 4, timerMode: "count_down" })).status).toBe(400);
  expect((await api("/attempts", "POST", learner, { groups: 1, timerMode: "count_down" })).status).toBe(422);
  await publish(author, reviewer, admin, "A");
  expect((await (await api("/summary?groups=3", "GET", learner)).json()).data).toMatchObject({ materialCount: 1, itemCount: 1, shortage: 2 });
  await publish(author, reviewer, admin, "B");
  await publish(author, reviewer, admin, "C");
  const { data: { id } } = await (await api("/attempts", "POST", learner, { groups: 3, timerMode: "count_down" })).json();
  const initial = (await (await api(`/attempts/${id}`, "GET", learner)).json()).data;
  expect(initial).toMatchObject({ status: "prepared", materialCount: 3, itemCount: 3, pointsAwarded: null, pointsPossible: null });
  expect(new Set(initial.groups.map((group: { revisionId: string }) => group.revisionId)).size).toBe(3);
  expect(JSON.stringify(initial)).not.toMatch(/answerKeys|acceptedAnswers|explanation|reviewContent|selfReview/);
  expect((await api(`/attempts/${id}`, "GET", other)).status).toBe(404);
  expect((await call(practice, "practice", `/attempts/${id}`, "GET", learner)).status).toBe(404);
  expect((await api(`/attempts/${id}/start`, "POST", other)).status).toBe(404);
  expect((await api(`/attempts/${id}/submit`, "POST", learner)).status).toBe(409);
  expect((await api(`/attempts/${id}/start`, "POST", learner)).status).toBe(200);
  const active = (await (await api(`/attempts/${id}`, "GET", learner)).json()).data;
  expect(active.items[0].deadlineAt).toBeTruthy();
  expect(active.items[1].taskStartedAt).toBeNull();
  await api(`/attempts/${id}/start`, "POST", learner);
  expect((await (await api(`/attempts/${id}`, "GET", learner)).json()).data.items[0].deadlineAt).toBe(active.items[0].deadlineAt);
  const item = active.items[0];
  expect((await api(`/attempts/${id}/items/${item.id}`, "PUT", other, { version: 0, response: { text: "Robado" } })).status).toBe(404);
  expect((await api(`/attempts/${id}/items/${item.id}`, "PUT", learner, { version: 0, response: { optionId: "a" } })).status).toBe(400);
  const saved = await api(`/attempts/${id}/items/${item.id}`, "PUT", learner, { version: 0, response: { text: "Estimada profesora, solicito una reunión." } });
  expect((await saved.json()).data.version).toBe(1);
  const second = await api(`/attempts/${id}/items/${item.id}`, "PUT", learner, { version: 1, response: { text: "Estimada profesora, ¿podemos reunirnos el martes?" } });
  expect(second.status).toBe(200);
  expect((await api(`/attempts/${id}/items/${item.id}`, "PUT", learner, { version: 1, response: { text: "Texto obsoleto" } })).status).toBe(409);
  expect((await api(`/attempts/${id}/position`, "PUT", learner, { position: 2 })).status).toBe(200);
  const secondTask = (await (await api(`/attempts/${id}`, "GET", learner)).json()).data;
  expect(secondTask.currentPosition).toBe(2);
  expect(secondTask.items[1].taskStartedAt).toBeTruthy();
  expect((await api(`/attempts/${id}/position`, "PUT", learner, { position: 1 })).status).toBe(200);
  const resumed = (await (await api(`/attempts/${id}`, "GET", learner)).json()).data;
  expect(resumed.items[0]).toMatchObject({ response: { text: "Estimada profesora, ¿podemos reunirnos el martes?" }, version: 2, deadlineAt: active.items[0].deadlineAt });
  expect((await api(`/attempts/${id}/position`, "PUT", learner, { position: 99 })).status).toBe(422);
  expect((await api(`/attempts/${id}/self-review`, "PUT", learner, { version: 0, checklist: { task: true, organization: true, register: true, language: true } })).status).toBe(409);
  const result = await Promise.all([api(`/attempts/${id}/submit`, "POST", learner), api(`/attempts/${id}/submit`, "POST", learner)]);
  expect(result.map((value) => value.status)).toEqual([200, 200]);
  const [first, retry] = await Promise.all(result.map((value) => value.json()));
  expect(first.data).toMatchObject({ status: "submitted", pointsAwarded: null, pointsPossible: null });
  expect(first.data.items.map((value: { outcome: string }) => value.outcome)).toEqual(["ungraded", "ungraded", "ungraded"]);
  expect(first.data.submittedAt).toBe(retry.data.submittedAt);
  expect((await api(`/attempts/${id}/items/${item.id}`, "PUT", learner, { version: 2, response: { text: "Tardío" } })).status).toBe(409);
  expect((await api(`/attempts/${id}/submit`, "POST", other)).status).toBe(404);
  const checklist = { task: true, organization: false, register: true, language: false };
  expect((await api(`/attempts/${id}/self-review`, "PUT", other, { version: 0, checklist })).status).toBe(404);
  expect((await api(`/attempts/${id}/self-review`, "PUT", learner, { version: 0, checklist })).status).toBe(200);
  expect((await api(`/attempts/${id}/self-review`, "PUT", learner, { version: 0, checklist: { ...checklist, task: false } })).status).toBe(409);
  expect((await (await api(`/attempts/${id}`, "GET", learner)).json()).data.selfReview).toEqual({ checklist, version: 1 });
  expect((await (await api("/attempts", "GET", learner)).json()).data[0]).toMatchObject({ id, status: "submitted" });
  expect((await (await api("/attempts", "GET", other)).json()).data).toEqual([]);
  expect((await db.select().from(attempts).where(eq(attempts.id, id)))[0].pointsPossible).toBeNull();
  expect((await db.select().from(attemptItems).where(eq(attemptItems.attemptId, id))).every((value) => value.pointsAwarded === null)).toBe(true);
});

it("closes a timed-out task using PostgreSQL time and keeps an empty delivery ungraded", async () => {
  const author = await actor("a@w2.test", "editor");
  const reviewer = await actor("r@w2.test", "editor");
  const admin = await actor("p@w2.test", "admin");
  const learner = await actor("l@w2.test", "learner");
  await publish(author, reviewer, admin, "única");
  const { data: { id } } = await (await api("/attempts", "POST", learner, { groups: 1, timerMode: "count_down" })).json();
  await api(`/attempts/${id}/start`, "POST", learner);
  const before = (await (await api(`/attempts/${id}`, "GET", learner)).json()).data;
  await db.update(attempts).set({ deadlineAt: new Date(Date.now() - 1000) }).where(eq(attempts.id, id));
  expect((await api(`/attempts/${id}/items/${before.items[0].id}`, "PUT", learner, { version: 0, response: { text: "Tardío" } })).status).toBe(409);
  const after = (await (await api(`/attempts/${id}`, "GET", learner)).json()).data;
  expect(after).toMatchObject({ status: "submitted", pointsPossible: null, pointsAwarded: null });
  expect(after.items[0]).toMatchObject({ response: null, outcome: "ungraded" });
  expect(after.selfReview.checklist).toEqual({ task: false, organization: false, register: false, language: false });
  expect((await api(`/attempts/${id}/submit`, "POST", learner)).status).toBe(200);
});

it("schedules each W2 task and closes through chained delayed jobs without a browser", async () => {
  const author = await actor("deadline-a@w2.test", "editor");
  const reviewer = await actor("deadline-r@w2.test", "editor");
  const admin = await actor("deadline-p@w2.test", "admin");
  const learner = await actor("deadline-l@w2.test", "learner");
  await publish(author, reviewer, admin, "primera");
  await publish(author, reviewer, admin, "segunda");
  const { data: { id } } = await (await api("/attempts", "POST", learner, { groups: 2, timerMode: "count_down" })).json();
  await api(`/attempts/${id}/start`, "POST", learner);
  const scheduler = new TestScheduler();
  await dispatchPendingDeadlines(id, scheduler);
  const [first] = await db.select().from(deadlineJobs).where(eq(deadlineJobs.attemptId, id));
  expect(first).toMatchObject({ kind: "w2_task", status: "scheduled" });

  const expired = new Date(Date.now() - 1000);
  await db.update(attempts).set({ deadlineAt: expired }).where(eq(attempts.id, id));
  await db.update(writingTaskTimes).set({ deadlineAt: expired }).where(eq(writingTaskTimes.itemId, first.targetId!));
  await db.update(deadlineJobs).set({ deadlineAt: expired }).where(eq(deadlineJobs.id, first.id));
  await runDeadlineJob(first.id, scheduler);
  const [advanced] = await db.select().from(attempts).where(eq(attempts.id, id));
  expect(advanced).toMatchObject({ status: "in_progress", currentPosition: 2 });
  const jobs = await db.select().from(deadlineJobs).where(eq(deadlineJobs.attemptId, id));
  expect(jobs).toHaveLength(2);
  const second = jobs.find((job) => job.id !== first.id)!;
  expect(second).toMatchObject({ kind: "w2_task", status: "scheduled" });

  await db.update(attempts).set({ deadlineAt: expired }).where(eq(attempts.id, id));
  await db.update(writingTaskTimes).set({ deadlineAt: expired }).where(eq(writingTaskTimes.itemId, second.targetId!));
  await db.update(deadlineJobs).set({ deadlineAt: expired }).where(eq(deadlineJobs.id, second.id));
  await runDeadlineJob(second.id, scheduler);
  const [closed] = await db.select().from(attempts).where(eq(attempts.id, id));
  expect(closed).toMatchObject({ status: "submitted", pointsAwarded: null, pointsPossible: null });
  expect((await db.select().from(attemptItems).where(eq(attemptItems.attemptId, id))).map((item) => item.outcome)).toEqual(["ungraded", "ungraded"]);
});
