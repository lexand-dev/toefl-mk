import { handle } from "hono/vercel";
import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { getActor } from "@/lib/access";
import { activity, heartbeat, history, repeatAttempt, type HistoryError } from "@/features/history/service";

export const runtime = "nodejs";
const idParam = z.object({ id: z.string().uuid() });
const filters = z.object({ section: z.enum(["reading", "listening", "writing"]).optional(), status: z.enum(["prepared", "in_progress", "submitted"]).optional() });
const visibleSchema = z.object({ visible: z.boolean() }).strict();
const isError = (value: object): value is HistoryError => "error" in value;
const app = new Hono().basePath("/api/history");
const routes = app
  .get("/attempts", zValidator("query", filters), async (c) => {
    const actor = await getActor(c.req.raw.headers);
    if (!actor) return c.json({ error: "Inicia sesión" }, 401);
    const { section, status } = c.req.valid("query");
    return c.json({ data: await history(actor.id, section, status) });
  })
  .get("/activity", async (c) => {
    const actor = await getActor(c.req.raw.headers);
    if (!actor) return c.json({ error: "Inicia sesión" }, 401);
    return c.json({ data: await activity(actor.id) });
  })
  .post("/attempts/:id/repeat", zValidator("param", idParam), async (c) => {
    const actor = await getActor(c.req.raw.headers);
    if (!actor) return c.json({ error: "Inicia sesión" }, 401);
    const result = await repeatAttempt(c.req.valid("param").id, actor.id);
    return isError(result) ? c.json({ error: result.error }, result.status) : c.json({ data: result }, 201);
  })
  .post("/attempts/:id/heartbeat", zValidator("param", idParam), zValidator("json", visibleSchema), async (c) => {
    const actor = await getActor(c.req.raw.headers);
    if (!actor) return c.json({ error: "Inicia sesión" }, 401);
    const result = await heartbeat(c.req.valid("param").id, actor.id, c.req.valid("json").visible);
    return isError(result) ? c.json({ error: result.error }, result.status) : c.json({ data: result });
  });

export const GET = handle(app);
export const POST = handle(app);
export type HistoryAppType = typeof routes;
