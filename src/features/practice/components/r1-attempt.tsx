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

function GapField({ attemptId, item, stem, active, disabled, onSelect, onBusy }: { attemptId: string; item: Item; stem: string; active: boolean; disabled: boolean; onSelect: () => void; onBusy: (busy: boolean) => void }) {
  const [suffix, setSuffix] = useState(item.response?.suffix ?? "");
  const [state, setState] = useState<"saved" | "saving" | "error">("saved");
  const desired = useRef(suffix);
  const saved = useRef(suffix);
  const version = useRef(item.version);
  const flight = useRef<Promise<void> | null>(null);

  async function persist() {
    if (flight.current) return;
    onBusy(true);
    setState("saving");
    flight.current = (async () => {
      try {
        while (saved.current !== desired.current) {
          const value = desired.current;
          const result = await dataOrThrow<{ version: number }>(await r1Client.api.practice.r1.attempts[":id"].items[":itemId"].$put({ param: { id: attemptId, itemId: item.id }, json: { version: version.current, response: { suffix: value } } }));
          version.current = result.version;
          saved.current = value;
        }
        setState("saved");
      } catch {
        setState("error");
      } finally {
        flight.current = null;
        onBusy(false);
      }
    })();
    await flight.current;
  }

  return <span className="r1-gap"><label className="sr-only" htmlFor={`gap-${item.id}`}>Hueco {item.position}: {item.prompt.context}</label>
    <input id={`gap-${item.id}`} value={suffix} maxLength={100} size={Math.max(4, suffix.length + 1)} disabled={disabled} aria-current={active ? "true" : undefined} aria-label={`Completar hueco ${item.position} después de ${stem}`} onFocus={onSelect} onChange={(event) => { const value = event.target.value; desired.current = value; setSuffix(value); void persist(); }} />
    <span role="status" className="sr-only">{state === "saving" ? "Guardando" : state === "error" ? "No guardado" : "Guardado"}</span>
    {disabled && "outcome" in item && <small>{item.outcome === "correct" ? " Correcto." : item.outcome === "omitted" ? " Omitido." : " Incorrecto."} Solución: {stem}{item.acceptedSuffixes?.[0]}. {item.explanation}</small>}
  </span>;
}

function Activity({ id }: { id: string }) {
  const cache = useQueryClient();
  const [busyItems, setBusyItems] = useState<Set<string>>(() => new Set());
  const attempt = useQuery({ queryKey: ["r1-attempt", id], queryFn: async () => dataOrThrow<Attempt>(await r1Client.api.practice.r1.attempts[":id"].$get({ param: { id } })), refetchInterval: 10000 });
  const refresh = () => cache.invalidateQueries({ queryKey: ["r1-attempt", id] });
  const start = useMutation({ mutationFn: async () => dataOrThrow(await r1Client.api.practice.r1.attempts[":id"].start.$post({ param: { id } })), onSuccess: refresh });
  const move = useMutation({ mutationFn: async (position: number) => dataOrThrow(await r1Client.api.practice.r1.attempts[":id"].position.$put({ param: { id }, json: { position } })), onSuccess: refresh });
  const submit = useMutation({ mutationFn: async () => dataOrThrow(await r1Client.api.practice.r1.attempts[":id"].submit.$post({ param: { id } })), onSuccess: refresh });
  if (attempt.isPending) return <p>Cargando intento…</p>;
  if (attempt.isError) return <p className="error" role="alert">{attempt.error.message}</p>;
  const current = attempt.data;
  const currentItem = current.items[current.currentPosition - 1];
  const group = current.groups.find((value) => value.id === currentItem.groupId)!;
  const groupItems = current.items.filter((item) => item.groupId === group.id);
  const omissions = current.items.filter((item) => !item.response?.suffix).length;
  const busy = start.isPending || move.isPending || submit.isPending || busyItems.size > 0;
  const setItemBusy = (itemId: string, value: boolean) => setBusyItems((previous) => { const next = new Set(previous); if (value) next.add(itemId); else next.delete(itemId); return next; });
  return <article>{current.status === "in_progress" && <VisibleActivity id={id} />}<h1>Completar palabras R1</h1><Clock attempt={current} />
    {current.status === "prepared" ? <><p>{current.materialCount} materiales · {current.itemCount} huecos. Revisa el lote antes de iniciar el reloj.</p><button disabled={start.isPending} onClick={() => start.mutate()}>Iniciar práctica</button></> : <>
      <h2>{group.content.title}</h2><p>Texto {group.ordinal} de {current.materialCount} · hueco {current.currentPosition} de {current.itemCount}</p>
      <section aria-label={`Texto ${group.ordinal}`} className="r1-text">{group.content.segments.map((segment, index) => {
        if (segment.kind === "text") return <span key={`text-${index}`}>{segment.text}</span>;
        const item = groupItems.find((candidate) => candidate.prompt.gapId === segment.gapId)!;
        return <span key={segment.gapId}>{segment.stem}<GapField attemptId={id} item={item} stem={segment.stem} active={item.position === current.currentPosition} disabled={current.status === "submitted"} onSelect={() => { if (item.position !== current.currentPosition && !move.isPending) move.mutate(item.position); }} onBusy={(value) => setItemBusy(item.id, value)} /></span>;
      })}</section>
      {current.status === "submitted" && group.result && <p>Resultado del texto: {group.result.pointsAwarded} / {group.result.pointsPossible}; {group.result.omissions} omisiones.</p>}
      <nav><button disabled={busy || current.currentPosition === 1} onClick={() => move.mutate(current.currentPosition - 1)}>Anterior</button><button disabled={busy || current.currentPosition === current.itemCount} onClick={() => move.mutate(current.currentPosition + 1)}>Siguiente</button></nav>
      {current.status === "in_progress" && <><p>{omissions} huecos vacíos de {current.itemCount}. {busyItems.size > 0 ? "Guardando cambios…" : "Todos los cambios están guardados."}</p><button disabled={busy} onClick={() => { if (window.confirm(`Hay ${omissions} huecos vacíos. ¿Entregar ahora?`)) submit.mutate(); }}>Entregar</button></>}
      {current.status === "submitted" && <p>Entregado · {current.pointsAwarded} / {current.pointsPossible} puntos (omisiones incluidas).</p>}
    </>}
    {[start.error, move.error, submit.error].filter(Boolean).map((error, index) => <p key={index} className="error" role="alert">{error!.message} Recarga para recuperar la última versión guardada.</p>)}
  </article>;
}

export function R1Attempt({ id }: { id: string }) {
  const [client] = useState(() => new QueryClient());
  return <QueryClientProvider client={client}><Activity id={id} /></QueryClientProvider>;
}
