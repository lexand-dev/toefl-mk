import { z } from "zod";

const nonempty = z.string().trim().min(1);
const option = z.object({ id: nonempty, text: nonempty }).strict();
const choice = z.object({ question: nonempty, options: z.array(option).min(2) }).strict().refine(
  (value) => new Set(value.options.map((item) => item.id)).size === value.options.length,
  "Los identificadores de opciones deben ser únicos",
);

export const typeCode = z.enum(["R1", "R3", "L2", "W1", "W2"]);
export const contentSchemas = {
  R1: z.object({ text: nonempty }).strict(),
  R3: z.object({ title: nonempty, passage: nonempty }).strict(),
  L2: z.object({ title: nonempty, description: nonempty }).strict(),
  W1: z.object({ context: nonempty }).strict(),
  W2: z.object({ situation: nonempty, recipient: nonempty, task: nonempty }).strict(),
};
export const promptSchemas = {
  R1: z.object({ sentence: nonempty, stem: nonempty }).strict(),
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
    if (item.responseKind !== expected || (type === "W2" ? item.pointsPossible !== 0 || item.key !== null : item.pointsPossible <= 0 || item.key === null)) {
      errors.push(`Ítem ${item.ordinal}: tipo, puntos o clave inválidos`);
    }
    const answers = item.key?.acceptedAnswers;
    if (answers) {
      if (!answers.every((answer) => typeof answer === "string" && answer.trim().length > 0)) errors.push(`Clave ${item.ordinal} inválida`);
      if ((type === "R3" || type === "L2") && choice.safeParse(item.publicPrompt).success) {
        const options = choice.parse(item.publicPrompt).options;
        if (answers.length !== 1 || !answers.every((answer) => options.some((option) => option.id === answer))) errors.push(`Clave ${item.ordinal} debe identificar una sola opción`);
      }
      if (type === "W1" && promptSchemas.W1.safeParse(item.publicPrompt).success) {
        const tokens = promptSchemas.W1.parse(item.publicPrompt).tokens;
        if (answers.length !== tokens.length || new Set(answers).size !== tokens.length || !answers.every((answer) => tokens.some((token) => token.id === answer))) errors.push(`Clave ${item.ordinal} no es una secuencia completa de fichas`);
      }
    }
  }
  if (type === "L2" && !input.assets.some((asset) => asset.kind === "audio" && asset.role === "stimulus")) errors.push("Falta audio L2");
  if (type === "L2" && (typeof input.reviewContent?.transcript !== "string" || !input.reviewContent.transcript.trim())) errors.push("Falta transcripción L2");
  return errors;
}
