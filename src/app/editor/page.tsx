import { redirect } from "next/navigation";
import { getPageActor, hasRole } from "@/lib/access";
import { Workbench } from "@/features/editorial/components/workbench";

export default async function Editor() {
  const actor = await getPageActor();
  if (!actor) redirect("/login");
  if (!hasRole(actor, ["editor", "admin"])) redirect("/app");
  return <article><h1>Banco editorial</h1><Workbench actorId={actor.id} admin={actor.role === "admin"} /></article>;
}
