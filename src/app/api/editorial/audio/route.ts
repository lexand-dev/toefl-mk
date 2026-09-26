import { handle } from "hono/vercel";
import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { getActor, hasRole } from "@/lib/access";
import { uploadAudio, vercelBlobAudioStorage } from "@/lib/audio-storage";

export const runtime = "nodejs";
const maxBytes = 20 * 1024 * 1024;
const audioSchema = z.object({
  audio: z.instanceof(File),
  durationMs: z.coerce.number<string>().int().positive(),
  rightsNote: z.string().trim().min(1),
});
const app = new Hono().basePath("/api/editorial/audio");
const routes = app.post("/", zValidator("form", audioSchema), async (c) => {
  const actor = await getActor(c.req.raw.headers);
  if (!actor) return c.json({ error: "Inicia sesión" }, 401);
  if (!hasRole(actor, ["editor", "admin"])) return c.json({ error: "Sin permiso" }, 403);
  const { audio, durationMs, rightsNote } = c.req.valid("form");
  if (!["audio/mpeg", "audio/mp4"].includes(audio.type) || audio.size < 1 || audio.size > maxBytes) {
    return c.json({ error: "Audio inválido (máximo 20 MB)" }, 422);
  }
  try {
    const data = await uploadAudio(vercelBlobAudioStorage, new Uint8Array(await audio.arrayBuffer()), audio.type as "audio/mpeg" | "audio/mp4", durationMs, rightsNote);
    return c.json({ data }, 201);
  } catch {
    return c.json({ error: "No se pudo almacenar el audio; inténtalo de nuevo" }, 503);
  }
});

export const POST = handle(app);
export type EditorialAudioAppType = typeof routes;
