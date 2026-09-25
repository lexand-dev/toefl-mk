import { handle } from "hono/vercel";
import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { getActor } from "@/lib/access";
import { availability, createAttempt, detail, openAttempts, startPlayback, audioEnded, reportIncident, save, next, submit, type L2Error } from "@/features/practice/l2/engine";
import { incidentSchema, positionSchema, responseSchema, selectionSchema } from "@/features/practice/l2/schemas";

export const runtime = "nodejs";
const idParam = z.object({ id: z.string().uuid() });
const itemParam = idParam.extend({ itemId: z.string().uuid() });
const summaryQuery = z.object({ groups: z.coerce.number().pipe(z.union([z.literal(2), z.literal(4)])) });
const isError = (value: object): value is L2Error => "error" in value;
const app = new Hono().basePath("/api/practice/l2");
const routes = app
  .get("/summary", zValidator("query", summaryQuery), async (c) => {
    const actor = await getActor(c.req.raw.headers);
    if (!actor) return c.json({ error: "Inicia sesión" }, 401);
    return c.json({ data: await availability(c.req.valid("query").groups) });
  })
  .get("/attempts", async (c) => {
    const actor = await getActor(c.req.raw.headers);
    if (!actor) return c.json({ error: "Inicia sesión" }, 401);
    return c.json({ data: await openAttempts(actor.id) });
  })
  .post("/attempts", zValidator("json", selectionSchema), async (c) => {
    const actor = await getActor(c.req.raw.headers);
    if (!actor) return c.json({ error: "Inicia sesión" }, 401);
    const { groups, timerMode } = c.req.valid("json");
    const result = await createAttempt(actor.id, groups, timerMode);
    return isError(result) ? c.json({ error: result.error }, result.status) : c.json({ data: result }, 201);
  })
  .get("/attempts/:id", zValidator("param", idParam), async (c) => {
    const actor = await getActor(c.req.raw.headers);
    if (!actor) return c.json({ error: "Inicia sesión" }, 401);
    const result = await detail(c.req.valid("param").id, actor.id);
    return isError(result) ? c.json({ error: result.error }, result.status) : c.json({ data: result });
  })
  .post("/attempts/:id/playback", zValidator("param", idParam), async (c) => {
    const actor = await getActor(c.req.raw.headers);
    if (!actor) return c.json({ error: "Inicia sesión" }, 401);
    const result = await startPlayback(c.req.valid("param").id, actor.id);
    return isError(result) ? c.json({ error: result.error }, result.status) : c.json({ data: result });
  })
  .post("/attempts/:id/audio-ended", zValidator("param", idParam), async (c) => {
    const actor = await getActor(c.req.raw.headers);
    if (!actor) return c.json({ error: "Inicia sesión" }, 401);
    const result = await audioEnded(c.req.valid("param").id, actor.id);
    return isError(result) ? c.json({ error: result.error }, result.status) : c.json({ data: result });
  })
  .post("/attempts/:id/incident", zValidator("param", idParam), zValidator("json", incidentSchema), async (c) => {
    const actor = await getActor(c.req.raw.headers);
    if (!actor) return c.json({ error: "Inicia sesión" }, 401);
    const result = await reportIncident(c.req.valid("param").id, actor.id, c.req.valid("json").reason);
    return isError(result) ? c.json({ error: result.error }, result.status) : c.json({ data: result });
  })
  .put("/attempts/:id/items/:itemId", zValidator("param", itemParam), zValidator("json", responseSchema), async (c) => {
    const actor = await getActor(c.req.raw.headers);
    if (!actor) return c.json({ error: "Inicia sesión" }, 401);
    const { id, itemId } = c.req.valid("param");
    const { version, response } = c.req.valid("json");
    const result = await save(id, actor.id, itemId, version, response.optionId);
    return isError(result) ? c.json({ error: result.error }, result.status) : c.json({ data: result });
  })
  .put("/attempts/:id/position", zValidator("param", idParam), zValidator("json", positionSchema), async (c) => {
    const actor = await getActor(c.req.raw.headers);
    if (!actor) return c.json({ error: "Inicia sesión" }, 401);
    const result = await next(c.req.valid("param").id, actor.id, c.req.valid("json").position);
    return isError(result) ? c.json({ error: result.error }, result.status) : c.json({ data: result });
  })
  .post("/attempts/:id/submit", zValidator("param", idParam), async (c) => {
    const actor = await getActor(c.req.raw.headers);
    if (!actor) return c.json({ error: "Inicia sesión" }, 401);
    const result = await submit(c.req.valid("param").id, actor.id);
    if (isError(result)) return c.json({ error: result.error }, result.status);
    const reviewed = await detail(result.id, actor.id);
    return isError(reviewed) ? c.json({ error: reviewed.error }, reviewed.status) : c.json({ data: reviewed });
  });

export const GET = handle(app);
export const POST = handle(app);
export const PUT = handle(app);
export type L2AppType = typeof routes;
