import { redirect } from "next/navigation";
import { getPageActor, hasRole } from "@/lib/access";
import { Workbench } from "@/features/editorial/components/workbench";

export default async function Admin() {
  const actor = await getPageActor();
  if (!actor) redirect("/login");
  if (!hasRole(actor, ["admin"])) redirect("/app");
  return <article><h1>Publicación editorial</h1><Workbench actorId={actor.id} admin /></article>;
}
