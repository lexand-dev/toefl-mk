import { z } from "zod";

const nonempty = z.string().trim().min(1);
const visibleText = z.string().min(1).refine((value) => value.trim().length > 0);
const r1GapId = z.string().regex(/^gap-[1-9]\d*$/, "El identificador del hueco debe ser opaco (gap-N)");
const option = z.object({ id: nonempty, text: nonempty }).strict();
const r1Segment = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("text"), text: visibleText }).strict(),
  z.object({ kind: z.literal("gap"), gapId: r1GapId, stem: nonempty }).strict(),
]);
const choice = z.object({ question: nonempty, options: z.array(option).min(2) }).strict().refine(
  (value) => new Set(value.options.map((item) => item.id)).size === value.options.length,
  "Los identificadores de opciones deben ser únicos",
);

export const typeCode = z.enum(["R1", "R3", "L2", "W1", "W2"]);
export const contentSchemas = {
  R1: z.object({ title: nonempty, segments: z.array(r1Segment).min(2) }).strict(),
  R3: z.object({ title: nonempty, passage: nonempty }).strict(),
  L2: z.object({ title: nonempty, description: nonempty }).strict(),
  W1: z.object({ context: nonempty }).strict(),
  W2: z.object({ situation: nonempty, recipient: nonempty, task: nonempty }).strict(),
};
export const promptSchemas = {
  R1: z.object({ gapId: r1GapId }).strict(),
  R3: choice,
  L2: choice,
  W1: z.object({ instruction: nonempty, tokens: z.array(option).min(2) }).strict().refine(
    (value) => new Set(value.tokens.map((item) => item.id)).size === value.tokens.length,
    "Los identificadores de fichas deben ser únicos",
  ),
  W2: z.object({ instruction: nonempty }).strict(),
};

export const assetSchema = z.object({
  kind: z.enum(["audio", "image"]), storageKey: nonempty, mimeType: nonempty,
  sha256Hex: z.string().regex(/^[0-9a-f]{64}$/), byteSize: z.number().int().positive(),
  durationMs: z.number().int().positive().nullable(), rightsNote: nonempty,
  role: z.enum(["stimulus", "illustration"]), sortOrder: z.number().int().positive(),
}).strict().refine((asset) => asset.kind !== "audio" || asset.durationMs !== null, "El audio requiere duración");

export const itemSchema = z.object({
  ordinal: z.number().int().positive(), responseKind: z.enum(["fill_word", "single_choice", "token_order", "free_text"]),
  publicPrompt: z.record(z.string(), z.unknown()), pointsPossible: z.number().nonnegative(),
  key: z.object({ acceptedAnswers: z.array(z.unknown()).min(1), scoringRule: z.enum(["exact", "case_insensitive", "approved_variants"]), explanation: nonempty }).strict().nullable(),
}).strict();

export const revisionSchema = z.object({
  publicContent: z.record(z.string(), z.unknown()), provenanceNote: nonempty, rightsNote: nonempty,
  items: z.array(itemSchema).min(1), assets: z.array(assetSchema),
  reviewContent: z.record(z.string(), z.unknown()).nullable(),
}).strict();

export const createSchema = z.object({
  typeCode, topic: nonempty, difficulty: z.enum(["intro", "intermediate", "advanced"]),
  revision: revisionSchema,
}).strict();

export type RevisionInput = z.infer<typeof revisionSchema>;
export type TypeCode = z.infer<typeof typeCode>;

export function validatePublication(type: TypeCode, input: RevisionInput) {
  const errors: string[] = [];
  if (!contentSchemas[type].safeParse(input.publicContent).success) errors.push(`Contenido ${type} incompleto`);
  if (new Set(input.items.map((item) => item.ordinal)).size !== input.items.length) errors.push("Ordinales duplicados");
  const expected = { R1: "fill_word", R3: "single_choice", L2: "single_choice", W1: "token_order", W2: "free_text" }[type];
  for (const item of input.items) {
    const parsed = promptSchemas[type].safeParse(item.publicPrompt);
    if (!parsed.success) errors.push(`Consigna ${item.ordinal} inválida`);
    if (item.responseKind !== expected || (type === "W2" ? item.pointsPossible !== 0 || item.key !== null : item.pointsPossible <= 0 || item.key === null) || (type === "R1" && item.pointsPossible !== 1)) {
      errors.push(`Ítem ${item.ordinal}: tipo, puntos o clave inválidos`);
    }
    const answers = item.key?.acceptedAnswers;
    if (answers) {
      if (type !== "W1" && !answers.every((answer) => typeof answer === "string" && answer.trim().length > 0)) errors.push(`Clave ${item.ordinal} inválida`);
      if ((type === "R3" || type === "L2") && choice.safeParse(item.publicPrompt).success) {
        const options = choice.parse(item.publicPrompt).options;
        if (answers.length !== 1 || !answers.every((answer) => options.some((option) => option.id === answer))) errors.push(`Clave ${item.ordinal} debe identificar una sola opción`);
      }
      if (type === "W1" && promptSchemas.W1.safeParse(item.publicPrompt).success) {
        const tokens = promptSchemas.W1.parse(item.publicPrompt).tokens;
        const sequences = answers.every((answer) => typeof answer === "string") ? [answers] : answers;
        if (!sequences.length || !sequences.every((sequence) => Array.isArray(sequence) && sequence.length === tokens.length && new Set(sequence).size === tokens.length && sequence.every((id) => typeof id === "string" && tokens.some((token) => token.id === id)))) errors.push(`Clave ${item.ordinal} no es una secuencia completa de fichas`);
      }
    }
  }
  if (type === "R1") {
    const content = contentSchemas.R1.safeParse(input.publicContent);
    const prompts = input.items.map((item) => promptSchemas.R1.safeParse(item.publicPrompt));
    if (content.success && prompts.every((prompt) => prompt.success)) {
      const gapIds = content.data.segments.filter((segment) => segment.kind === "gap").map((segment) => segment.gapId);
      const itemGapIds = prompts.map((prompt) => prompt.success ? prompt.data.gapId : "");
      if (!gapIds.length || new Set(gapIds).size !== gapIds.length || gapIds.length !== itemGapIds.length || gapIds.some((gapId) => !itemGapIds.includes(gapId))) {
        errors.push("Los huecos R1 deben ser únicos y corresponder exactamente a sus ítems");
      }
    }
  }
  if (type === "L2" && (input.assets.filter((asset) => asset.role === "stimulus").length !== 1 || !input.assets.some((asset) => asset.kind === "audio" && asset.role === "stimulus" && (asset.mimeType === "audio/mpeg" || asset.mimeType === "audio/mp4") && new RegExp(`^https://[a-z0-9-]+\\.public\\.blob\\.vercel-storage\\.com/l2/[a-f0-9-]{36}/${asset.sha256Hex}\\.${asset.mimeType === "audio/mpeg" ? "mp3" : "mp4"}$`).test(asset.storageKey)))) errors.push("Falta audio L2: se requiere exactamente un audio público versionado de Vercel Blob por conversación");
  if (type === "L2" && (typeof input.reviewContent?.transcript !== "string" || !input.reviewContent.transcript.trim())) errors.push("Falta transcripción L2");
  return errors;
}
