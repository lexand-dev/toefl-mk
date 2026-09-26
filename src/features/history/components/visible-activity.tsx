"use client";

import { useEffect } from "react";
import { historyApi } from "../api";

export function VisibleActivity({ id }: { id: string }) {
  useEffect(() => {
    const ping = (visible: boolean) => { void historyApi.api.history.attempts[":id"].heartbeat.$post({ param: { id }, json: { visible } }); };
    const onVisibility = () => ping(document.visibilityState === "visible" && document.hasFocus());
    onVisibility();
    const interval = window.setInterval(() => { if (document.visibilityState === "visible" && document.hasFocus()) ping(true); }, 10000);
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("focus", onVisibility);
    window.addEventListener("blur", onVisibility);
    return () => { window.clearInterval(interval); document.removeEventListener("visibilitychange", onVisibility); window.removeEventListener("focus", onVisibility); window.removeEventListener("blur", onVisibility); ping(false); };
  }, [id]);
  return null;
}
