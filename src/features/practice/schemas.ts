import { z } from "zod";

export const selectionSchema = z.object({ typeCode: z.literal("R3"), groups: z.union([z.literal(1), z.literal(2)]), timerMode: z.enum(["count_up", "count_down"]) }).strict();
export const responseSchema = z.object({ version: z.number().int().nonnegative(), response: z.object({ optionId: z.string().min(1) }).strict().nullable() }).strict();
export const positionSchema = z.object({ position: z.number().int().positive() }).strict();

// The preset is frozen per attempt; future types can supply their own rules.
export const r3Rules = { version: "R3-1", secondsPerGroup: 900, navigation: "bidirectional" } as const;
