import { handle } from "hono/vercel";
import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { getActor } from "@/lib/access";
import { availability, createAttempt, detail, move, openAttempts, save, start, submit, type PracticeError } from "@/features/practice/engine";
import { positionSchema, responseSchema, selectionSchema } from "@/features/practice/schemas";
import * as w2 from "@/features/practice/w2";
import * as w2Schema from "@/features/practice/w2-schemas";

export const runtime = "nodejs";
const idParam = z.object({ id: z.string().uuid() });
const itemParam = idParam.extend({ itemId: z.string().uuid() });
const summaryQuery = z.object({ groups: z.coerce.number().pipe(z.union([z.literal(1), z.literal(2)])) });
const w2SummaryQuery = z.object({ groups: z.coerce.number().pipe(z.union([z.literal(1), z.literal(2), z.literal(3)])) });
const isError = (value: object): value is PracticeError => "error" in value;
const app = new Hono().basePath("/api/practice");
const routes = app
  .get("/w2/summary", zValidator("query", w2SummaryQuery), async (c) => {
    const actor = await getActor(c.req.raw.headers);
    if (!actor) return c.json({ error: "Inicia sesión" }, 401);
    return c.json({ data: await w2.summary(c.req.valid("query").groups) });
  })
  .get("/w2/attempts", async (c) => {
    const actor = await getActor(c.req.raw.headers);
    if (!actor) return c.json({ error: "Inicia sesión" }, 401);
    return c.json({ data: await w2.history(actor.id) });
  })
  .post("/w2/attempts", zValidator("json", w2Schema.selection), async (c) => {
    const actor = await getActor(c.req.raw.headers);
    if (!actor) return c.json({ error: "Inicia sesión" }, 401);
    const result = await w2.create(actor.id, c.req.valid("json").groups, c.req.valid("json").timerMode);
    return isError(result) ? c.json({ error: result.error }, result.status) : c.json({ data: result }, 201);
  })
  .get("/w2/attempts/:id", zValidator("param", idParam), async (c) => {
    const actor = await getActor(c.req.raw.headers);
    if (!actor) return c.json({ error: "Inicia sesión" }, 401);
    const result = await w2.detail(c.req.valid("param").id, actor.id);
    return isError(result) ? c.json({ error: result.error }, result.status) : c.json({ data: result });
  })
  .post("/w2/attempts/:id/start", zValidator("param", idParam), async (c) => {
    const actor = await getActor(c.req.raw.headers);
    if (!actor) return c.json({ error: "Inicia sesión" }, 401);
    const result = await w2.start(c.req.valid("param").id, actor.id);
    return isError(result) ? c.json({ error: result.error }, result.status) : c.json({ data: result });
  })
  .put("/w2/attempts/:id/items/:itemId", zValidator("param", itemParam), zValidator("json", w2Schema.response), async (c) => {
    const actor = await getActor(c.req.raw.headers);
    if (!actor) return c.json({ error: "Inicia sesión" }, 401);
    const { id, itemId } = c.req.valid("param");
    const { version, response } = c.req.valid("json");
    const result = await w2.save(id, actor.id, itemId, version, response.text);
    return isError(result) ? c.json({ error: result.error }, result.status) : c.json({ data: result });
  })
  .put("/w2/attempts/:id/position", zValidator("param", idParam), zValidator("json", w2Schema.position), async (c) => {
    const actor = await getActor(c.req.raw.headers);
    if (!actor) return c.json({ error: "Inicia sesión" }, 401);
    const result = await w2.move(c.req.valid("param").id, actor.id, c.req.valid("json").position);
    return isError(result) ? c.json({ error: result.error }, result.status) : c.json({ data: result });
  })
  .post("/w2/attempts/:id/submit", zValidator("param", idParam), async (c) => {
    const actor = await getActor(c.req.raw.headers);
    if (!actor) return c.json({ error: "Inicia sesión" }, 401);
    const result = await w2.submit(c.req.valid("param").id, actor.id);
    if (isError(result)) return c.json({ error: result.error }, result.status);
    const reviewed = await w2.detail(result.id, actor.id);
    return isError(reviewed) ? c.json({ error: reviewed.error }, reviewed.status) : c.json({ data: reviewed });
  })
  .put("/w2/attempts/:id/self-review", zValidator("param", idParam), zValidator("json", w2Schema.review), async (c) => {
    const actor = await getActor(c.req.raw.headers);
    if (!actor) return c.json({ error: "Inicia sesión" }, 401);
    const { version, checklist } = c.req.valid("json");
    const result = await w2.selfReview(c.req.valid("param").id, actor.id, version, checklist);
    return isError(result) ? c.json({ error: result.error }, result.status) : c.json({ data: result });
  })
  .get("/r3/summary", zValidator("query", summaryQuery), async (c) => {
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
  .post("/attempts/:id/start", zValidator("param", idParam), async (c) => {
    const actor = await getActor(c.req.raw.headers);
    if (!actor) return c.json({ error: "Inicia sesión" }, 401);
    const result = await start(c.req.valid("param").id, actor.id);
    return isError(result) ? c.json({ error: result.error }, result.status) : c.json({ data: result });
  })
  .put("/attempts/:id/items/:itemId", zValidator("param", itemParam), zValidator("json", responseSchema), async (c) => {
    const actor = await getActor(c.req.raw.headers);
    if (!actor) return c.json({ error: "Inicia sesión" }, 401);
    const { id, itemId } = c.req.valid("param");
    const { version, response } = c.req.valid("json");
    const result = await save(id, actor.id, itemId, version, response);
    return isError(result) ? c.json({ error: result.error }, result.status) : c.json({ data: result });
  })
  .put("/attempts/:id/position", zValidator("param", idParam), zValidator("json", positionSchema), async (c) => {
    const actor = await getActor(c.req.raw.headers);
    if (!actor) return c.json({ error: "Inicia sesión" }, 401);
    const result = await move(c.req.valid("param").id, actor.id, c.req.valid("json").position);
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
export type PracticeAppType = typeof routes;
