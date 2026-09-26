import { redirect } from "next/navigation";
import { getPageActor } from "@/lib/access";
import { AttemptScreen } from "@/features/practice/components/attempt-screen";
import { W2Screen } from "@/features/practice/components/w2-screen";
import { db } from "@/db";
import { attempts } from "@/db/schema";
import { and, eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import { z } from "zod";

export default async function AttemptPage({ params }: { params: Promise<{ id: string }> }) {
  const actor = await getPageActor();
  if (!actor) redirect("/login");
  const { id } = await params;
  if (!z.string().uuid().safeParse(id).success) notFound();
  const [attempt] = await db.select({ typeCode: attempts.typeCode }).from(attempts).where(and(eq(attempts.id, id), eq(attempts.userId, actor.id)));
  if (!attempt) notFound();
  return attempt.typeCode === "W2" ? <W2Screen id={id} /> : <AttemptScreen id={id} />;
}
