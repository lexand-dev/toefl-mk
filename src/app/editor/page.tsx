import { redirect } from "next/navigation";
import { getPageActor, hasRole } from "@/lib/access";

export default async function Editor() {
  const actor = await getPageActor();
  if (!actor) redirect("/login");
  if (!hasRole(actor, ["editor", "admin"])) redirect("/app");
  return <article><h1>Acceso editorial</h1><p>Cuenta autorizada para edición.</p></article>;
}
