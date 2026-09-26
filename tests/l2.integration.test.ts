import { afterAll, beforeAll, beforeEach, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { and, eq, sql } from "drizzle-orm";
import { db, pool } from "@/db";
import { attemptItems, attempts, deadlineJobs, l2Sessions, users } from "@/db/schema";
import { exampleR3 } from "@/features/editorial/example-r3";
import { dispatchPendingDeadlines, type DeadlineSchedule, type DeadlineScheduler } from "@/features/practice/deadlines";
import { runDeadlineJob } from "@/features/practice/deadline-runner";
import { startPlayback as startPlaybackService } from "@/features/practice/l2/engine";

const mail = vi.hoisted(() => [] as { url: string }[]);
const blobs = vi.hoisted(() => [] as { path: string; options: unknown }[]);
vi.mock("@/lib/email", () => ({ sendTransactionalEmail: async (message: { url: string }) => { mail.push(message); } }));
vi.mock("@vercel/blob", () => ({ put: async (path: string, _bytes: unknown, options: unknown) => { blobs.push({ path, options }); return { url: `https://store.public.blob.vercel-storage.com/${path}` }; } }));

const base = "http://localhost:3000";
const auth = await import("@/app/api/auth/[...all]/route");
const editorial = await import("@/app/api/editorial/[[...route]]/route");
const practice = await import("@/app/api/practice/l2/[[...route]]/route");
const upload = await import("@/app/api/editorial/audio/route");
const { uploadAudio, vercelBlobAudioStorage } = await import("@/lib/audio-storage");

function call(route: typeof practice | typeof editorial, prefix: string, path: string, method = "GET", cookie?: string, data?: unknown) {
  const request = new NextRequest(`${base}/api/${prefix}${path}`, { method, headers: { ...(cookie ? { cookie } : {}), ...(data ? { "content-type": "application/json" } : {}) }, ...(data ? { body: JSON.stringify(data) } : {}) });
  return (method === "GET" ? route.GET : method === "PUT" ? route.PUT : route.POST)(request);
}
const api = (path: string, method = "GET", cookie?: string, data?: unknown) => call(practice, "practice/l2", path, method, cookie, data);
const ed = (path: string, method = "GET", cookie?: string, data?: unknown) => call(editorial, "editorial", path, method, cookie, data);
const read = async (path: string, cookie: string) => (await (await api(path, "GET", cookie)).json()).data;

class TestScheduler implements DeadlineScheduler {
  calls: DeadlineSchedule[] = [];
  async schedule(input: DeadlineSchedule) {
    this.calls.push(input);
    return { runId: `run-${input.deadlineJobId}` };
  }
}

beforeAll(async () => { await migrate(db, { migrationsFolder: "./drizzle" }); });
beforeEach(async () => {
  mail.length = 0; blobs.length = 0;
  await db.execute(sql`truncate table "account", "session", "verification", "users", "rate_limit", "exercises", "assets" cascade`);
});
afterAll(async () => { await pool.end(); });

async function actor(email: string, role: "learner" | "editor" | "admin") {
  const signed = await auth.POST(new NextRequest(`${base}/api/auth/sign-up/email`, { method: "POST", headers: { "content-type": "application/json", origin: base, "x-forwarded-for": `192.0.2.${mail.length + 1}` }, body: JSON.stringify({ name: email, email, password: "safe-password-123" }) }));
  expect(signed.status).toBe(200);
  expect((await auth.GET(new NextRequest(mail.at(-1)!.url))).status).toBe(302);
  await db.update(users).set({ role }).where(eq(users.email, email));
  const login = await auth.POST(new NextRequest(`${base}/api/auth/sign-in/email`, { method: "POST", headers: { "content-type": "application/json", origin: base, "x-forwarded-for": `192.0.2.${mail.length + 40}` }, body: JSON.stringify({ email, password: "safe-password-123" }) }));
  expect(login.status).toBe(200);
  return login.headers.getSetCookie().map((value) => value.split(";")[0]).join("; ");
}

async function publish(author: string, reviewer: string, admin: string, title: string) {
  const bytes = new Uint8Array([1, 2, 3, 4]);
  const asset = await uploadAudio(vercelBlobAudioStorage, bytes, "audio/mpeg", 2000, "Grabación original con derechos propios");
  const revision = { ...exampleR3, publicContent: { title, description: "Diálogo breve original" }, assets: [asset], reviewContent: { transcript: `Transcripción privada de ${title}` }, items: exampleR3.items.slice(0, 2) };
  const created = await ed("", "POST", author, { typeCode: "L2", topic: title, difficulty: "intro", revision });
  expect(created.status).toBe(201);
  const { data: { id } } = await created.json();
  expect((await ed(`/${id}/submit`, "POST", author)).status).toBe(200);
  expect((await ed(`/${id}/approve`, "POST", reviewer, { humanReviewed: true })).status).toBe(200);
  expect((await ed(`/${id}/publish`, "POST", admin)).status).toBe(200);
  return id as string;
}

async function fixture() {
  const author = await actor("author@l2.test", "editor");
  const reviewer = await actor("reviewer@l2.test", "editor");
  const admin = await actor("admin@l2.test", "admin");
  const learner = await actor("learner@l2.test", "learner");
  await publish(author, reviewer, admin, "Conversación uno");
  return { author, reviewer, admin, learner };
}

async function prepared(cookie: string) {
  const result = await api("/attempts", "POST", cookie, { groups: 2, timerMode: "count_down" });
  expect(result.status).toBe(201);
  return (await result.json()).data.id as string;
}

async function finishAudio(id: string, cookie: string) {
  expect((await api(`/attempts/${id}/playback`, "POST", cookie)).status).toBe(200);
  await db.update(l2Sessions).set({ playbackStartedAt: new Date(Date.now() - 2100) }).where(eq(l2Sessions.attemptId, id));
  expect((await api(`/attempts/${id}/audio-ended`, "POST", cookie)).status).toBe(200);
}

it("uploads immutable public Blob paths and enforces 2/4 distinct published conversations", async () => {
  const { author, reviewer, admin, learner } = await fixture();
  expect(blobs[0].path).toMatch(/^l2\/[a-f0-9-]{36}\/[0-9a-f]{64}\.mp3$/);
  expect(blobs[0].options).toMatchObject({ access: "public", allowOverwrite: false, addRandomSuffix: false, contentType: "audio/mpeg" });
  const second = await publish(author, reviewer, admin, "Conversación dos");
  expect(blobs[1].path).not.toBe(blobs[0].path);
  const summary = (await (await api("/summary?groups=4", "GET", learner)).json()).data;
  expect(summary).toMatchObject({ materialCount: 2, itemCount: 4, shortage: 2 });
  expect((await api("/attempts", "POST", learner, { groups: 4, timerMode: "count_up" })).status).toBe(422);
  expect((await api("/attempts", "POST", learner, { groups: 3, timerMode: "count_up" })).status).toBe(400);
  const id = await prepared(learner);
  const state = await read(`/attempts/${id}`, learner);
  expect(state).toMatchObject({ status: "prepared", phase: "ready", materialCount: 2, itemCount: 4, startedAt: null });
  expect(state.groups.map((group: { revisionId: string }) => group.revisionId)).toContain(second);
  expect(JSON.stringify(state)).not.toMatch(/transcript|acceptedAnswers|explanation|correctOptionId/);
  expect((await api(`/attempts/${id}`, "GET")).status).toBe(401);
  const stranger = await actor("stranger@l2.test", "learner");
  expect((await api(`/attempts/${id}`, "GET", stranger)).status).toBe(404);
  expect((await api(`/attempts/${id}/playback`, "POST", stranger)).status).toBe(404);
});

it("separates listening and response clocks, blocks skips, saves versions and reveals transcript after submission", async () => {
  const { author, reviewer, admin, learner } = await fixture();
  await publish(author, reviewer, admin, "Conversación dos");
  const id = await prepared(learner);
  const before = await read(`/attempts/${id}`, learner);
  expect((await api(`/attempts/${id}/items/${before.items[0].id}`, "PUT", learner, { version: 0, response: { optionId: "a" } })).status).toBe(409);
  expect((await api(`/attempts/${id}/position`, "PUT", learner, { position: 2 })).status).toBe(409);
  expect((await api(`/attempts/${id}/playback`, "POST", learner)).status).toBe(200);
  const listening = await read(`/attempts/${id}`, learner);
  expect(listening).toMatchObject({ phase: "listening", responseStartedAt: null, questionDeadlineAt: null });
  expect((await api(`/attempts/${id}/audio-ended`, "POST", learner)).status).toBe(409);
  await db.update(l2Sessions).set({ playbackStartedAt: new Date(Date.now() - 2100) }).where(eq(l2Sessions.attemptId, id));
  expect((await api(`/attempts/${id}/audio-ended`, "POST", learner)).status).toBe(200);
  const response = await read(`/attempts/${id}`, learner);
  expect(response).toMatchObject({ phase: "response", currentPosition: 1 });
  expect(response.responseStartedAt).not.toBe(listening.playbackStartedAt);
  expect((await api(`/attempts/${id}/position`, "PUT", learner, { position: 2 })).status).toBe(409);
  expect((await api(`/attempts/${id}/items/${response.items[0].id}`, "PUT", learner, { version: 0, response: { optionId: "a" } })).status).toBe(200);
  expect((await api(`/attempts/${id}/items/${response.items[0].id}`, "PUT", learner, { version: 0, response: { optionId: "b" } })).status).toBe(409);
  expect((await api(`/attempts/${id}/position`, "PUT", learner, { position: 3 })).status).toBe(409);
  expect((await api(`/attempts/${id}/position`, "PUT", learner, { position: 2 })).status).toBe(200);
  const resumed = await read(`/attempts/${id}`, learner);
  expect(resumed.items[0]).toMatchObject({ version: 1, response: { optionId: "a" } });
  expect(resumed.questionDeadlineAt).toBeTruthy();
  expect((await api(`/attempts/${id}/position`, "PUT", learner, { position: 1 })).status).toBe(409);
  await db.update(l2Sessions).set({ questionDeadlineAt: new Date(Date.now() - 1000) }).where(eq(l2Sessions.attemptId, id));
  const expired = await read(`/attempts/${id}`, learner);
  expect(expired).toMatchObject({ currentPosition: 3, phase: "ready" });
  expect((await api(`/attempts/${id}/items/${resumed.items[1].id}`, "PUT", learner, { version: 0, response: { optionId: "a" } })).status).toBe(409);
  await finishAudio(id, learner);
  const results = await Promise.all([api(`/attempts/${id}/submit`, "POST", learner), api(`/attempts/${id}/submit`, "POST", learner)]);
  expect(results.map((result) => result.status)).toEqual([200, 200]);
  const [first, second] = await Promise.all(results.map((result) => result.json()));
  expect({ ...first.data, serverTime: null }).toEqual({ ...second.data, serverTime: null });
  expect(first.data).toMatchObject({ status: "submitted", pointsAwarded: 1, pointsPossible: 4 });
  expect(first.data.items.map((item: { outcome: string }) => item.outcome)).toEqual(["correct", "omitted", "omitted", "omitted"]);
  expect(first.data.groups[0].transcript).toContain("Transcripción privada");
  expect((await db.select().from(attemptItems).where(eq(attemptItems.attemptId, id))).filter((item) => item.outcome === "omitted")).toHaveLength(3);
});

it("keeps an audio failure recoverable without extending an existing deadline or awarding errors", async () => {
  const { author, reviewer, admin, learner } = await fixture();
  await publish(author, reviewer, admin, "Conversación dos");
  const id = await prepared(learner);
  expect((await api(`/attempts/${id}/incident`, "POST", learner, { reason: "load_failed" })).status).toBe(200);
  const failed = await read(`/attempts/${id}`, learner);
  expect(failed).toMatchObject({ phase: "incident", incident: { reason: "load_failed", count: 1 }, startedAt: null, pointsAwarded: null });
  expect((await api(`/attempts/${id}/incident`, "POST", learner, { reason: "load_failed" })).status).toBe(200);
  expect((await read(`/attempts/${id}`, learner)).incident.count).toBe(1);
  await api(`/attempts/${id}/playback`, "POST", learner);
  const listening = await read(`/attempts/${id}`, learner);
  await api(`/attempts/${id}/playback`, "POST", learner);
  expect((await read(`/attempts/${id}`, learner)).listeningDeadlineAt).toBe(listening.listeningDeadlineAt);
  await db.update(l2Sessions).set({ listeningDeadlineAt: new Date(Date.now() - 1000) }).where(eq(l2Sessions.attemptId, id));
  const stalled = await read(`/attempts/${id}`, learner);
  expect(stalled).toMatchObject({ phase: "incident", incident: { reason: "audio_stalled", count: 2 }, currentPosition: 1 });
  expect((await api(`/attempts/${id}/submit`, "POST", learner)).status).toBe(409);
  expect((await db.select().from(attempts).where(eq(attempts.id, id)))[0].status).toBe("in_progress");
  await finishAudio(id, learner);
  expect((await read(`/attempts/${id}`, learner)).phase).toBe("response");
  await db.update(l2Sessions).set({ questionDeadlineAt: new Date(Date.now() - 100000) }).where(eq(l2Sessions.attemptId, id));
  const advanced = await read(`/attempts/${id}`, learner);
  expect(advanced).toMatchObject({ phase: "ready", currentPosition: 3 });
  expect(advanced.items[0].response).toBeNull();
});

it("closes on the final server deadline without a manual submission and never grants time on reload", async () => {
  const { author, reviewer, admin, learner } = await fixture();
  await publish(author, reviewer, admin, "Conversación dos");
  const id = await prepared(learner);
  await finishAudio(id, learner);
  const first = await read(`/attempts/${id}`, learner);
  expect((await read(`/attempts/${id}`, learner)).questionDeadlineAt).toBe(first.questionDeadlineAt);
  await db.update(l2Sessions).set({ questionDeadlineAt: new Date(Date.now() - 65000) }).where(eq(l2Sessions.attemptId, id));
  expect((await read(`/attempts/${id}`, learner)).currentPosition).toBe(3);
  await finishAudio(id, learner);
  await db.update(l2Sessions).set({ questionDeadlineAt: new Date(Date.now() - 65000) }).where(eq(l2Sessions.attemptId, id));
  const closed = await read(`/attempts/${id}`, learner);
  expect(closed).toMatchObject({ status: "submitted", phase: "review", pointsAwarded: 0, pointsPossible: 4 });
  expect(closed.items.every((item: { outcome: string }) => item.outcome === "omitted")).toBe(true);
  expect((await api(`/attempts/${id}/items/${closed.items[3].id}`, "PUT", learner, { version: 0, response: { optionId: "a" } })).status).toBe(409);
  expect((await api(`/attempts/${id}/submit`, "POST", learner)).status).toBe(200);
});

it("runs listening and question phase boundaries durably and schedules reconciled follow-ups", async () => {
  const { author, reviewer, admin, learner } = await fixture();
  await publish(author, reviewer, admin, "Conversación dos");
  const id = await prepared(learner);
  await finishAudio(id, learner);
  const scheduler = new TestScheduler();
  await dispatchPendingDeadlines(id, scheduler);

  const [firstQuestion] = await db.select().from(deadlineJobs).where(and(eq(deadlineJobs.attemptId, id), eq(deadlineJobs.kind, "l2_question")));
  const justExpired = new Date(Date.now() - 1000);
  await db.update(l2Sessions).set({ questionDeadlineAt: justExpired }).where(eq(l2Sessions.attemptId, id));
  await db.update(deadlineJobs).set({ deadlineAt: justExpired }).where(eq(deadlineJobs.id, firstQuestion.id));
  await runDeadlineJob(firstQuestion.id, scheduler);

  const [afterQuestion] = await db.select().from(attempts).where(eq(attempts.id, id));
  const [responseSession] = await db.select().from(l2Sessions).where(eq(l2Sessions.attemptId, id));
  expect(afterQuestion).toMatchObject({ status: "in_progress", currentPosition: 2 });
  expect(responseSession.questionDeadlineAt!.getTime()).toBeGreaterThan(Date.now());
  const questionJobs = await db.select().from(deadlineJobs).where(and(eq(deadlineJobs.attemptId, id), eq(deadlineJobs.kind, "l2_question")));
  expect(questionJobs).toHaveLength(2);
  const followUp = questionJobs.find((job) => job.id !== firstQuestion.id)!;
  expect(followUp).toMatchObject({ status: "scheduled", targetId: expect.any(String) });

  const overdue = new Date(Date.now() - 65000);
  await db.update(l2Sessions).set({ questionDeadlineAt: overdue }).where(eq(l2Sessions.attemptId, id));
  await db.update(deadlineJobs).set({ deadlineAt: overdue }).where(eq(deadlineJobs.id, followUp.id));
  await runDeadlineJob(followUp.id, scheduler);
  const [readyAttempt] = await db.select().from(attempts).where(eq(attempts.id, id));
  const [readySession] = await db.select().from(l2Sessions).where(eq(l2Sessions.attemptId, id));
  expect(readyAttempt.currentPosition).toBe(3);
  expect(readySession.questionDeadlineAt).toBeNull();

  const started = await startPlaybackService(id, readyAttempt.userId, scheduler);
  expect(started).toEqual({ id });
  const latestListeningId = scheduler.calls.at(-1)!.deadlineJobId;
  const [listeningJob] = await db.select().from(deadlineJobs).where(eq(deadlineJobs.id, latestListeningId));
  await db.update(l2Sessions).set({ listeningDeadlineAt: justExpired }).where(eq(l2Sessions.attemptId, id));
  await db.update(deadlineJobs).set({ deadlineAt: justExpired }).where(eq(deadlineJobs.id, listeningJob.id));
  await runDeadlineJob(listeningJob.id, scheduler);
  const [incident] = await db.select().from(l2Sessions).where(eq(l2Sessions.attemptId, id));
  expect(incident).toMatchObject({ incidentReason: "audio_stalled", questionDeadlineAt: null });
});

it("authorizes Blob uploads and validates rights and type without touching Blob on failures", async () => {
  const learner = await actor("learner@upload.test", "learner");
  const editor = await actor("editor@upload.test", "editor");
  const form = new FormData();
  form.set("audio", new File([new Uint8Array([1, 2, 3])], "sample.mp3", { type: "audio/mpeg" }));
  form.set("durationMs", "2000"); form.set("rightsNote", "Original");
  const request = (cookie?: string) => new NextRequest(`${base}/api/editorial/audio`, { method: "POST", headers: cookie ? { cookie } : {}, body: form });
  expect((await upload.POST(request())).status).toBe(401);
  expect((await upload.POST(request(learner))).status).toBe(403);
  expect(blobs).toHaveLength(0);
  const result = await upload.POST(request(editor));
  expect(result.status).toBe(201);
  expect((await result.json()).data).toMatchObject({ kind: "audio", byteSize: 3, durationMs: 2000, rightsNote: "Original" });
  expect(blobs).toHaveLength(1);
});
