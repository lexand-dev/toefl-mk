import { hc } from "hono/client";
import type { R1AppType } from "@/app/api/practice/r1/[[...route]]/route";

export const r1Client = hc<R1AppType>("/");
