import { hc } from "hono/client";
import type { HistoryAppType } from "@/app/api/history/[[...route]]/route";

export const historyApi = hc<HistoryAppType>(typeof window === "undefined" ? process.env.BETTER_AUTH_URL ?? "http://localhost:3000" : window.location.origin);
