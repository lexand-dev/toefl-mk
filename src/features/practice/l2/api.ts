import { hc } from "hono/client";
import type { L2AppType } from "@/app/api/practice/l2/[[...route]]/route";

export const l2 = hc<L2AppType>("/").api.practice.l2;

export async function dataOrThrow<T>(response: Response): Promise<T> {
  const body = await response.json();
  if (!response.ok) throw new Error(body.error ?? "No se pudo completar la operación");
  return body.data as T;
}
