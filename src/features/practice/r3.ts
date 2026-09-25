import { contentSchemas, promptSchemas } from "@/features/editorial/schemas";

export const publicPassage = (value: unknown) => contentSchemas.R3.parse(value);
export const publicQuestion = (value: unknown) => promptSchemas.R3.parse(value);

export function validOption(prompt: unknown, optionId: string) {
  return publicQuestion(prompt).options.some((option) => option.id === optionId);
}

export function gradeOption(optionId: string | undefined, accepted: string[], scoringRule: string) {
  return !!optionId && accepted.some((value) => scoringRule === "case_insensitive" ? value.toLowerCase() === optionId.toLowerCase() : value === optionId);
}
