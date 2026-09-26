import { getActor } from "@/lib/access";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const actor = await getActor(request.headers);
  if (!actor) return Response.json({ error: "Una sesión verificada es necesaria" }, { status: 401 });
  return Response.json(actor);
}
