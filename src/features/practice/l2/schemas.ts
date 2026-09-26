import { z } from "zod";

export const selectionSchema = z.object({ groups: z.union([z.literal(2), z.literal(4)]), timerMode: z.enum(["count_up", "count_down"]) }).strict();
export const responseSchema = z.object({ version: z.number().int().nonnegative(), response: z.object({ optionId: z.string().min(1) }).strict() }).strict();
export const positionSchema = z.object({ position: z.number().int().positive() }).strict();
export const incidentSchema = z.object({ reason: z.enum(["load_failed", "playback_failed", "audio_stalled"]) }).strict();

// Versioned independently of audio length: listening and answering never share a clock.
export const l2Rules = { version: "L2-1", secondsPerQuestion: 30, listeningGraceSeconds: 15, navigation: "forward_only" } as const;
