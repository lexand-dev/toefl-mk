import { redirect } from "next/navigation";
import Link from "next/link";
import { getPageActor, hasRole } from "@/lib/access";
import { SignOut } from "../sign-out";

export default async function Dashboard() {
  const actor = await getPageActor();
  if (!actor) redirect("/login");
  return <article><h1>Hola, {actor.name}</h1><p>Tu cuenta está verificada.</p>
    <nav><Link href="/app/practice">Practicar lectura R3</Link>{hasRole(actor, ["editor", "admin"]) && <Link href="/editor">Edición</Link>}
      {hasRole(actor, ["admin"]) && <Link href="/admin">Administración</Link>}</nav><SignOut />
  </article>;
}
