import { beforeAll, beforeEach, afterAll, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { execFileSync } from "node:child_process";
import { sql, eq } from "drizzle-orm";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { db, pool } from "@/db";
import { users, session, rateLimit } from "@/db/schema";

const mail = vi.hoisted(() => [] as { to: string; subject: string; url: string }[]);
vi.mock("@/lib/email", () => ({ sendTransactionalEmail: async (message: typeof mail[number]) => { mail.push(message); } }));

const base = "http://localhost:3000";
const { GET: authGet, POST: authPost } = await import("@/app/api/auth/[...all]/route");
const { GET: meGet } = await import("@/app/api/me/route");
const { GET: editorGet } = await import("@/app/api/editor/route");
const { GET: adminGet } = await import("@/app/api/admin/route");

beforeAll(async () => { await migrate(db, { migrationsFolder: "./drizzle" }); });
beforeEach(async () => {
  mail.length = 0;
  await db.execute(sql`truncate table "account", "session", "verification", "users", "rate_limit" cascade`);
});
afterAll(async () => { await pool.end(); });

async function post(path: string, data: Record<string, unknown>, cookie?: string, ip = "192.0.2.1") {
  return authPost(new NextRequest(`${base}/api/auth${path}`, {
    method: "POST", headers: { "content-type": "application/json", origin: base, "x-forwarded-for": ip, ...(cookie ? { cookie } : {}) },
    body: JSON.stringify(data),
  }));
}

function cookieOf(response: Response) {
  return response.headers.getSetCookie().map((value) => value.split(";")[0]).join("; ");
}

async function get(path: string, cookie?: string) {
  return authGet(new NextRequest(`${base}/api/auth${path}`, { headers: cookie ? { cookie } : {} }));
}

async function signup(email = "student@example.test") {
  return post("/sign-up/email", { name: "Student", email, password: "a-safe-password-123", role: "admin", timezone: "Evil" });
}

async function verify() {
  const link = mail.find((message) => message.subject.includes("Verifica"))?.url;
  expect(link).toBeTruthy();
  return authGet(new NextRequest(link!, { redirect: "manual" }));
}

async function login(email = "student@example.test", password = "a-safe-password-123", ip = "192.0.2.2") {
  return post("/sign-in/email", { email, password }, undefined, ip);
}

it("creates one UUID learner, denies sign-in until email verification and gates protected routes", async () => {
  expect((await signup()).status).toBe(200);
  const [user] = await db.select().from(users);
  expect(user.id).toMatch(/^[0-9a-f-]{36}$/);
  expect(user.role).toBe("learner");
  expect(user.timezone).toBe("UTC");
  expect(user.emailVerified).toBe(false);
  expect((await login()).status).toBe(403);
  expect((await meGet(new NextRequest(`${base}/api/me`))).status).toBe(401);
  expect((await editorGet(new NextRequest(`${base}/api/editor`))).status).toBe(401);
  expect((await verify()).status).toBe(302);
  const response = await login();
  expect(response.status).toBe(200);
  const cookie = cookieOf(response);
  await post("/update-user", { role: "admin", timezone: "Evil" }, cookie, "192.0.2.10");
  const [unchanged] = await db.select({ role: users.role, timezone: users.timezone }).from(users);
  expect(unchanged).toEqual({ role: "learner", timezone: "UTC" });
  expect((await meGet(new NextRequest(`${base}/api/me`, { headers: { cookie } }))).status).toBe(200);
  expect((await editorGet(new NextRequest(`${base}/api/editor`, { headers: { cookie } }))).status).toBe(403);
  expect((await adminGet(new NextRequest(`${base}/api/admin`, { headers: { cookie } }))).status).toBe(403);
});

it("allows simultaneous 7-day sessions and revokes both after a password reset", async () => {
  await signup(); await verify();
  const first = cookieOf(await login());
  const second = cookieOf(await login("student@example.test", "a-safe-password-123", "192.0.2.3"));
  expect(first).not.toBe(second);
  const active = await db.select().from(session);
  expect(active).toHaveLength(2);
  for (const item of active) expect((item.expiresAt.getTime() - Date.now()) / 86400000).toBeGreaterThan(6.9);
  const request = await post("/request-password-reset", { email: "student@example.test", redirectTo: "/reset-password" });
  expect(request.status).toBe(200);
  const resetLink = mail.find((message) => message.subject.includes("Restablece"))?.url;
  expect(resetLink).toBeTruthy();
  const redirect = await authGet(new NextRequest(resetLink!, { redirect: "manual" }));
  const token = new URL(redirect.headers.get("location")!).searchParams.get("token");
  expect(token).toBeTruthy();
  expect((await post("/reset-password", { token, newPassword: "new-safe-password-456" })).status).toBe(200);
  expect((await get("/get-session", first)).status).toBe(200);
  expect(await (await get("/get-session", first)).json()).toBeNull();
  expect(await (await get("/get-session", second)).json()).toBeNull();
  expect(await db.select().from(session)).toHaveLength(0);
  expect((await login("student@example.test", "new-safe-password-456", "192.0.2.4")).status).toBe(200);
});

it("enforces server roles from the database and persists Better Auth rate limits", async () => {
  await signup(); await verify();
  const cookie = cookieOf(await login());
  const request = () => new NextRequest(`${base}/api/editor`, { headers: { cookie } });
  expect((await editorGet(request())).status).toBe(403);
  await db.update(users).set({ role: "editor" }).where(eq(users.email, "student@example.test"));
  expect((await editorGet(request())).status).toBe(200);
  expect((await adminGet(request())).status).toBe(403);
  await db.update(users).set({ role: "admin" }).where(eq(users.email, "student@example.test"));
  expect((await adminGet(request())).status).toBe(200);

  for (let attempt = 0; attempt < 4; attempt++) {
    const response = await login("student@example.test", "wrong-password", "192.0.2.99");
    if (attempt === 3) expect(response.status).toBe(429);
  }
  expect((await db.select().from(rateLimit)).length).toBeGreaterThan(0);
  const { createAuth } = await import("@/lib/auth");
  const newInstance = createAuth(async () => {});
  const response = await newInstance.handler(new Request(`${base}/api/auth/sign-in/email`, {
    method: "POST", headers: { "content-type": "application/json", origin: base, "x-forwarded-for": "192.0.2.99" },
    body: JSON.stringify({ email: "student@example.test", password: "wrong-password" }),
  }));
  expect(response.status).toBe(429);
});

it("renews an active DB session after the update interval and limits bootstrap to a verified first admin", async () => {
  await signup();
  const command = () => execFileSync("npm", ["run", "admin:bootstrap", "--", "student@example.test"], {
    env: process.env, stdio: "pipe",
  });
  expect(command).toThrow();
  await verify();
  command();
  expect(command).toThrow();
  const cookie = cookieOf(await login());
  expect((await adminGet(new NextRequest(`${base}/api/admin`, { headers: { cookie } }))).status).toBe(200);
  const [before] = await db.select().from(session);
  await db.update(session).set({ updatedAt: new Date(Date.now() - 2 * 86400000), expiresAt: new Date(Date.now() + 5 * 86400000) })
    .where(eq(session.id, before.id));
  expect((await meGet(new NextRequest(`${base}/api/me`, { headers: { cookie } }))).status).toBe(200);
  const [after] = await db.select().from(session);
  expect(after.expiresAt.getTime()).toBeGreaterThan(Date.now() + 6.9 * 86400000);
});
