import { z } from "zod";

export const reviewLabels = { task: "Respondí a todos los requisitos de la consigna", organization: "Organicé el correo con claridad", register: "Utilicé un registro adecuado para el destinatario", language: "Revisé el uso de la lengua" } as const;
export type Checklist = Record<keyof typeof reviewLabels, boolean>;

export const selection = z.object({ groups: z.union([z.literal(1), z.literal(2), z.literal(3)]), timerMode: z.enum(["count_up", "count_down"]) }).strict();
export const response = z.object({ version: z.number().int().nonnegative(), response: z.object({ text: z.string().max(50000) }).strict() }).strict();
export const position = z.object({ position: z.number().int().positive() }).strict();
export const review = z.object({ version: z.number().int().nonnegative(), checklist: z.object({ task: z.boolean(), organization: z.boolean(), register: z.boolean(), language: z.boolean() }).strict() }).strict();
