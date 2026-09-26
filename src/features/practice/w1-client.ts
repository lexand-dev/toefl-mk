import { hc } from "hono/client";
import type { W1AppType } from "@/app/api/practice/w1/[[...route]]/route";

export const w1Client = hc<W1AppType>(typeof window === "undefined" ? process.env.BETTER_AUTH_URL ?? "http://localhost:3000" : window.location.origin);
