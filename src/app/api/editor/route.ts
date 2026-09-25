import { getActor, hasRole } from "@/lib/access";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const actor = await getActor(request.headers);
  if (!actor) return Response.json({ error: "Inicia sesión" }, { status: 401 });
  if (!hasRole(actor, ["editor", "admin"])) return Response.json({ error: "Sin permiso" }, { status: 403 });
  return Response.json({ role: actor.role });
}
