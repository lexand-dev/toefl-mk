import { redirect } from "next/navigation";
import Link from "next/link";
import { getPageActor, hasRole } from "@/lib/access";
import { activity } from "@/features/history/service";
import { SignOut } from "../sign-out";

export default async function Dashboard() {
  const actor = await getPageActor();
  if (!actor) redirect("/login");
  const progress = await activity(actor.id);
  return <article><h1>Hola, {actor.name}</h1><p>Tu cuenta está verificada.</p>
    <p>Tiempo de práctica: {Math.floor(progress.practiceSeconds / 60)} min {progress.practiceSeconds % 60} s · Materiales únicos completados: {progress.completedMaterials}</p>
    <nav><Link href="/app/practice/r1">Completar palabras R1</Link><Link href="/app/practice">Practicar lectura R3</Link><Link href="/app/practice/w1">Construir oraciones W1</Link><Link href="/app/history">Historial y actividad</Link>{hasRole(actor, ["editor", "admin"]) && <Link href="/editor">Edición</Link>}
      {hasRole(actor, ["admin"]) && <Link href="/admin">Administración</Link>}</nav><SignOut />
  </article>;
}
