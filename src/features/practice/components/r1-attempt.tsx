"use client";

import { useEffect, useRef, useState } from "react";
import { QueryClient, QueryClientProvider, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { VisibleActivity } from "@/features/history/components/visible-activity";
import { dataOrThrow } from "../api";
import { r1Client } from "../r1-client";

type Attempt = Extract<Awaited<ReturnType<typeof import("../r1").detail>>, { groups: unknown }>;
type Item = Attempt["items"][number];

function Clock({ attempt }: { attempt: Attempt }) {
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    const anchor = performance.now();
    const interval = setInterval(() => setElapsed(performance.now() - anchor), 1000);
    return () => clearInterval(interval);
  }, [attempt.serverTime]);
  if (!attempt.startedAt) return <p>El reloj aún no ha comenzado.</p>;
  const serverNow = new Date(attempt.serverTime).getTime();
  const milliseconds = attempt.timerMode === "count_down" && attempt.deadlineAt
    ? Math.max(0, new Date(attempt.deadlineAt).getTime() - serverNow - elapsed)
    : Math.max(0, serverNow + elapsed - new Date(attempt.startedAt).getTime());
  const seconds = Math.floor(milliseconds / 1000);
  return <p role="timer">{attempt.timerMode === "count_down" ? "Restante" : "Transcurrido"}: {Math.floor(seconds / 60)}:{String(seconds % 60).padStart(2, "0")}</p>;
}

function GapField({ attemptId, item, stem, active, disabled, onSelect, onState, onRefresh }: { attemptId: string; item: Item; stem: string; active: boolean; disabled: boolean; onSelect: () => void; onState: (state: "saved" | "saving" | "error") => void; onRefresh: () => Promise<Attempt> }) {
  const [suffix, setSuffix] = useState(item.response?.suffix ?? "");
  const [state, setState] = useState<"saved" | "saving" | "error">("saved");
  const desired = useRef(suffix);
  const saved = useRef(suffix);
  const version = useRef(item.version);
  const flight = useRef<Promise<void> | null>(null);
  const [conflict, setConflict] = useState<{ suffix: string; version: number } | null>(null);

  async function persist() {
    if (flight.current) return;
    onState("saving");
    setState("saving");
    flight.current = (async () => {
      try {
        while (true) {
          while (saved.current !== desired.current) {
            const value = desired.current;
            const result = await dataOrThrow<{ version: number }>(await r1Client.api.practice.r1.attempts[":id"].items[":itemId"].$put({ param: { id: attemptId, itemId: item.id }, json: { version: version.current, response: { suffix: value } } }));
            version.current = result.version;
            saved.current = value;
          }
          await onRefresh();
          if (saved.current === desired.current) break;
        }
        setConflict(null);
        setState("saved");
        onState("saved");
      } catch {
        try {
          const latest = await onRefresh();
          const serverItem = latest.items.find((candidate) => candidate.id === item.id);
          if (serverItem) {
            const serverSuffix = serverItem.response?.suffix ?? "";
            if (latest.status === "submitted") {
              version.current = serverItem.version;
              saved.current = serverSuffix;
              desired.current = serverSuffix;
              setSuffix(serverSuffix);
              setState("saved");
              onState("saved");
              return;
            }
            if (serverItem.version !== version.current) {
              if (serverSuffix === desired.current) {
                version.current = serverItem.version;
                saved.current = serverSuffix;
                setState("saved"); onState("saved");
                return;
              }
              setConflict({ suffix: serverSuffix, version: serverItem.version });
            }
          }
        } catch { /* Keep the local edit available for a later retry. */ }
        setState("error"); onState("error");
      } finally {
        flight.current = null;
      }
    })();
    await flight.current;
  }

  return <span className="r1-gap"><label className="sr-only" htmlFor={`gap-${item.id}`}>Hueco {item.position} después de {stem}</label>
    <input id={`gap-${item.id}`} value={suffix} maxLength={100} size={Math.max(4, suffix.length + 1)} disabled={disabled} aria-current={active ? "true" : undefined} aria-label={`Completar hueco ${item.position} después de ${stem}`} onFocus={onSelect} onChange={(event) => { const value = event.target.value; desired.current = value; setSuffix(value); void persist(); }} />
    <span role="status" className={state === "error" ? "error" : "sr-only"}>{state === "saving" ? "Guardando" : state === "error" ? conflict ? "La respuesta cambió en otra sesión." : "No se pudo guardar." : "Guardado"}</span>
    {state === "error" && !disabled && (conflict ? <button type="button" onClick={() => { version.current = conflict.version; saved.current = conflict.suffix; desired.current = conflict.suffix; setSuffix(conflict.suffix); setConflict(null); setState("saved"); onState("saved"); }}>Usar respuesta guardada</button> : <button type="button" onClick={() => void persist()}>Reintentar guardado</button>)}
    {disabled && "outcome" in item && <small>{item.outcome === "correct" ? " Correcto." : item.outcome === "omitted" ? " Omitido." : " Incorrecto."} Solución: {stem}{item.acceptedSuffixes?.[0]}. {item.explanation}</small>}
  </span>;
}

function Activity({ id }: { id: string }) {
  const cache = useQueryClient();
  const [pendingItems, setPendingItems] = useState<Set<string>>(() => new Set());
  const requestedPosition = useRef<number | null>(null);
  const selectingPosition = useRef(false);
  const attempt = useQuery({ queryKey: ["r1-attempt", id], queryFn: async () => dataOrThrow<Attempt>(await r1Client.api.practice.r1.attempts[":id"].$get({ param: { id } })), refetchInterval: 10000 });
  const refresh = () => cache.invalidateQueries({ queryKey: ["r1-attempt", id] });
  const refreshAttempt = async () => dataOrThrow<Attempt>(await r1Client.api.practice.r1.attempts[":id"].$get({ param: { id } }));
  const start = useMutation({ mutationFn: async () => dataOrThrow(await r1Client.api.practice.r1.attempts[":id"].start.$post({ param: { id } })), onSuccess: refresh });
  const move = useMutation({ mutationFn: async (position: number) => dataOrThrow(await r1Client.api.practice.r1.attempts[":id"].position.$put({ param: { id }, json: { position } })), onSuccess: refresh });
  const submit = useMutation({ mutationFn: async () => dataOrThrow(await r1Client.api.practice.r1.attempts[":id"].submit.$post({ param: { id } })), onSuccess: refresh });
  useEffect(() => { if (attempt.data?.status === "submitted") setPendingItems(new Set()); }, [attempt.data?.status]);
  if (attempt.isPending) return <p>Cargando intento…</p>;
  if (attempt.isError) return <p className="error" role="alert">{attempt.error.message}</p>;
  const current = attempt.data;
  const currentItem = current.items[current.currentPosition - 1];
  const group = current.groups.find((value) => value.id === currentItem.groupId)!;
  const groupItems = current.items.filter((item) => item.groupId === group.id);
  const omissions = current.items.filter((item) => !item.response?.suffix.trim()).length;
  const busy = start.isPending || move.isPending || submit.isPending || pendingItems.size > 0;
  const setItemState = (itemId: string, state: "saved" | "saving" | "error") => setPendingItems((previous) => { const next = new Set(previous); if (state === "saved") next.delete(itemId); else next.add(itemId); return next; });
  async function selectPosition(position: number) {
    requestedPosition.current = position;
    if (selectingPosition.current) return;
    selectingPosition.current = true;
    try {
      while (requestedPosition.current !== null) {
        const next = requestedPosition.current;
        requestedPosition.current = null;
        await move.mutateAsync(next);
      }
    } finally {
      selectingPosition.current = false;
    }
  }
  return <article>{current.status === "in_progress" && <VisibleActivity id={id} />}<h1>Completar palabras R1</h1><Clock attempt={current} />
    {current.status === "prepared" ? <><p>{current.materialCount} materiales · {current.itemCount} huecos. Revisa el lote antes de iniciar el reloj.</p><button disabled={start.isPending} onClick={() => start.mutate()}>Iniciar práctica</button></> : <>
      <h2>{group.content.title}</h2><p>Texto {group.ordinal} de {current.materialCount} · hueco {current.currentPosition} de {current.itemCount}</p>
      <section aria-label={`Texto ${group.ordinal}`} className="r1-text">{group.content.segments.map((segment, index) => {
        if (segment.kind === "text") return <span key={`text-${index}`}>{segment.text}</span>;
        const item = groupItems.find((candidate) => candidate.prompt.gapId === segment.gapId)!;
        return <span key={segment.gapId}>{segment.stem}<GapField attemptId={id} item={item} stem={segment.stem} active={item.position === current.currentPosition} disabled={current.status === "submitted"} onSelect={() => { void selectPosition(item.position).catch(() => undefined); }} onState={(state) => setItemState(item.id, state)} onRefresh={async () => { const latest = await refreshAttempt(); cache.setQueryData(["r1-attempt", id], latest); return latest; }} /></span>;
      })}</section>
      {current.status === "submitted" && group.result && <p>Resultado del texto: {group.result.pointsAwarded} / {group.result.pointsPossible}; {group.result.omissions} omisiones.</p>}
      <nav><button disabled={busy || current.currentPosition === 1} onClick={() => move.mutate(current.currentPosition - 1)}>Anterior</button><button disabled={busy || current.currentPosition === current.itemCount} onClick={() => move.mutate(current.currentPosition + 1)}>Siguiente</button></nav>
      {current.status === "in_progress" && <><p>{omissions} huecos vacíos de {current.itemCount}. {pendingItems.size > 0 ? "Hay cambios pendientes o con error; corrígelos antes de entregar." : "Todos los cambios están guardados."}</p><button disabled={busy} onClick={() => { if (window.confirm(`Hay ${omissions} huecos vacíos. ¿Entregar ahora?`)) submit.mutate(); }}>Entregar</button></>}
      {current.status === "submitted" && <p>Entregado · {current.pointsAwarded} / {current.pointsPossible} puntos (omisiones incluidas).</p>}
    </>}
    {[start.error, move.error, submit.error].filter(Boolean).map((error, index) => <p key={index} className="error" role="alert">{error!.message} Recarga para recuperar la última versión guardada.</p>)}
  </article>;
}

export function R1Attempt({ id }: { id: string }) {
  const [client] = useState(() => new QueryClient());
  return <QueryClientProvider client={client}><Activity id={id} /></QueryClientProvider>;
}
