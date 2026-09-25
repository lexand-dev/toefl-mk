import { hc } from "hono/client";
import type { PracticeAppType } from "@/app/api/practice/[[...route]]/route";

export const practice = hc<PracticeAppType>(typeof window === "undefined" ? process.env.BETTER_AUTH_URL ?? "http://localhost:3000" : window.location.origin);

export async function dataOrThrow<T>(response: Response): Promise<T> {
  const body = await response.json();
  if (!response.ok) throw new Error(body.error ?? "No se pudo completar la operación");
  return body.data as T;
}
