import { redirect } from "next/navigation";
import { getPageActor, hasRole } from "@/lib/access";

export default async function Admin() {
  const actor = await getPageActor();
  if (!actor) redirect("/login");
  if (!hasRole(actor, ["admin"])) redirect("/app");
  return <article><h1>Acceso administrador</h1><p>Cuenta autorizada para administración.</p></article>;
}
