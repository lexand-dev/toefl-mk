import { eq } from "drizzle-orm";
import { headers } from "next/headers";
import { db } from "@/db";
import { users } from "@/db/schema";
import { auth } from "./auth";

export type Role = "learner" | "editor" | "admin";

// Read authorization from the database, not a client-provided role or a stale session claim.
export async function getActor(requestHeaders: Headers) {
  const current = await auth.api.getSession({ headers: requestHeaders });
  if (!current?.user.emailVerified) return null;
  const [user] = await db.select({ id: users.id, name: users.name, role: users.role })
    .from(users).where(eq(users.id, current.user.id)).limit(1);
  return user ?? null;
}

export async function getPageActor() {
  return getActor(await headers());
}

export function hasRole(actor: Awaited<ReturnType<typeof getActor>>, allowed: Role[]) {
  return actor !== null && allowed.includes(actor.role as Role);
}
