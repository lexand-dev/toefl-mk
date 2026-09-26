import { handle } from "hono/vercel";
import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { getActor } from "@/lib/access";
import * as r1 from "@/features/practice/r1";

export const runtime = "nodejs";
const idParam = z.object({ id: z.string().uuid() });
const itemParam = idParam.extend({ itemId: z.string().uuid() });
const summaryQuery = z.object({ groups: z.coerce.number().pipe(r1.groupsSchema) });
const positionSchema = z.object({ position: z.number().int().positive() }).strict();
const isError = (value: object): value is { error: string; status: 404 | 409 | 422 } => "error" in value;
const app = new Hono().basePath("/api/practice/r1");
const routes = app
  .get("/summary", zValidator("query", summaryQuery), async (c) => {
    const actor = await getActor(c.req.raw.headers);
    if (!actor) return c.json({ error: "Inicia sesión" }, 401);
    return c.json({ data: await r1.availability(c.req.valid("query").groups) });
  })
  .get("/attempts", async (c) => {
    const actor = await getActor(c.req.raw.headers);
    if (!actor) return c.json({ error: "Inicia sesión" }, 401);
    return c.json({ data: await r1.openAttempts(actor.id) });
  })
  .post("/attempts", zValidator("json", r1.selectionSchema), async (c) => {
    const actor = await getActor(c.req.raw.headers);
    if (!actor) return c.json({ error: "Inicia sesión" }, 401);
    const { groups, timerMode } = c.req.valid("json");
    const result = await r1.create(actor.id, groups, timerMode);
    return isError(result) ? c.json({ error: result.error }, result.status) : c.json({ data: result }, 201);
  })
  .get("/attempts/:id", zValidator("param", idParam), async (c) => {
    const actor = await getActor(c.req.raw.headers);
    if (!actor) return c.json({ error: "Inicia sesión" }, 401);
    const result = await r1.detail(c.req.valid("param").id, actor.id);
    return isError(result) ? c.json({ error: result.error }, result.status) : c.json({ data: result });
  })
  .post("/attempts/:id/start", zValidator("param", idParam), async (c) => {
    const actor = await getActor(c.req.raw.headers);
    if (!actor) return c.json({ error: "Inicia sesión" }, 401);
    const result = await r1.start(c.req.valid("param").id, actor.id);
    return isError(result) ? c.json({ error: result.error }, result.status) : c.json({ data: result });
  })
  .put("/attempts/:id/items/:itemId", zValidator("param", itemParam), zValidator("json", r1.responseSchema), async (c) => {
    const actor = await getActor(c.req.raw.headers);
    if (!actor) return c.json({ error: "Inicia sesión" }, 401);
    const { id, itemId } = c.req.valid("param");
    const { version, response } = c.req.valid("json");
    const result = await r1.save(id, actor.id, itemId, version, response.suffix);
    return isError(result) ? c.json({ error: result.error }, result.status) : c.json({ data: result });
  })
  .put("/attempts/:id/position", zValidator("param", idParam), zValidator("json", positionSchema), async (c) => {
    const actor = await getActor(c.req.raw.headers);
    if (!actor) return c.json({ error: "Inicia sesión" }, 401);
    const result = await r1.move(c.req.valid("param").id, actor.id, c.req.valid("json").position);
    return isError(result) ? c.json({ error: result.error }, result.status) : c.json({ data: result });
  })
  .post("/attempts/:id/submit", zValidator("param", idParam), async (c) => {
    const actor = await getActor(c.req.raw.headers);
    if (!actor) return c.json({ error: "Inicia sesión" }, 401);
    const result = await r1.submit(c.req.valid("param").id, actor.id);
    if (isError(result)) return c.json({ error: result.error }, result.status);
    const reviewed = await r1.detail(result.id, actor.id);
    return isError(reviewed) ? c.json({ error: reviewed.error }, reviewed.status) : c.json({ data: reviewed });
  });

export const GET = handle(app);
export const POST = handle(app);
export const PUT = handle(app);
export type R1AppType = typeof routes;
