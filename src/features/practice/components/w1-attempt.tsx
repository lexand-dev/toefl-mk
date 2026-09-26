"use client";

import { useEffect, useRef, useState } from "react";
import { QueryClient, QueryClientProvider, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { dataOrThrow } from "../api";
import { w1Client } from "../w1-client";
import { VisibleActivity } from "@/features/history/components/visible-activity";

type Attempt = Extract<Awaited<ReturnType<typeof import("@/features/practice/w1").detail>>, { groups: unknown }>;

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

function Activity({ id }: { id: string }) {
  const cache = useQueryClient();
  const focusTarget = useRef<string | null>(null);
  const attempt = useQuery({ queryKey: ["w1-attempt", id], queryFn: async () => dataOrThrow<Attempt>(await w1Client.api.practice.w1.attempts[":id"].$get({ param: { id } })), refetchInterval: 10000 });
  useEffect(() => {
    if (focusTarget.current && !attempt.isFetching) {
      document.getElementById(focusTarget.current)?.focus();
      focusTarget.current = null;
    }
  }, [attempt.data, attempt.isFetching]);
  const refresh = () => cache.invalidateQueries({ queryKey: ["w1-attempt", id] });
  const start = useMutation({ mutationFn: async () => dataOrThrow(await w1Client.api.practice.w1.attempts[":id"].start.$post({ param: { id } })), onSuccess: refresh });
  const save = useMutation({ mutationFn: async (input: { itemId: string; version: number; tokenIds: string[] }) => dataOrThrow(await w1Client.api.practice.w1.attempts[":id"].items[":itemId"].$put({ param: { id, itemId: input.itemId }, json: { version: input.version, response: { tokenIds: input.tokenIds } } })), onSuccess: refresh });
  const move = useMutation({ mutationFn: async (position: number) => dataOrThrow(await w1Client.api.practice.w1.attempts[":id"].position.$put({ param: { id }, json: { position } })), onSuccess: refresh });
  const submit = useMutation({ mutationFn: async () => dataOrThrow(await w1Client.api.practice.w1.attempts[":id"].submit.$post({ param: { id } })), onSuccess: refresh });
  if (attempt.isPending) return <p>Cargando intento…</p>;
  if (attempt.isError) return <p className="error" role="alert">{attempt.error.message}</p>;
  const current = attempt.data;
  const item = current.items[current.currentPosition - 1];
  const group = current.groups.find((value) => value.id === item.groupId)!;
  const ids = item.response?.tokenIds ?? [];
  const omissions = current.items.filter((value) => (value.response?.tokenIds.length ?? 0) !== value.prompt.tokens.length).length;
  const busy = save.isPending || move.isPending || submit.isPending || attempt.isFetching;
  const change = (tokenIds: string[], target: string) => {
    focusTarget.current = target;
    save.mutate({ itemId: item.id, version: item.version, tokenIds });
  };
  return <article>{current.status === "in_progress" && <VisibleActivity id={id} />}<h1>Construir oraciones W1</h1><Clock attempt={current} />
    {current.status === "prepared" ? <><p>{current.materialCount} materiales · {current.itemCount} oraciones. Revisa el contenido antes de iniciar el reloj.</p><button disabled={start.isPending} onClick={() => start.mutate()}>Iniciar práctica</button></> : <>
      <p>{group.content.context}</p>
      <section aria-label="Oración"><h2>Oración {current.currentPosition} de {current.itemCount}</h2><p>{item.prompt.instruction}</p>
        <p>Activa una ficha disponible para colocarla. En la respuesta, usa «Mover» o «Retirar» con teclado o puntero.</p>
        <h3>Fichas disponibles</h3><div className="w1-tokens" role="group" aria-label="Fichas disponibles">
          {item.prompt.tokens.filter((token) => !ids.includes(token.id)).map((token) => <button id={`bank-${token.id}`} key={token.id} type="button" disabled={busy || current.status === "submitted"} aria-label={`Colocar ${token.text}, ficha ${item.prompt.tokens.indexOf(token) + 1}`} onClick={() => change([...ids, token.id], `placed-${token.id}`)}>{token.text}</button>)}
        </div>
        <h3>Tu oración ({ids.length} de {item.prompt.tokens.length})</h3><ol aria-label="Fragmentos colocados" className="w1-placed">
          {ids.map((tokenId, index) => {
            const token = item.prompt.tokens.find((value) => value.id === tokenId)!;
            const number = item.prompt.tokens.indexOf(token) + 1;
            return <li key={tokenId}><span>{token.text}</span>{current.status === "in_progress" && <>
              <button id={`placed-${tokenId}`} type="button" disabled={busy} aria-label={`Retirar ${token.text}, ficha ${number}, posición ${index + 1}`} onClick={() => change(ids.filter((id) => id !== tokenId), `bank-${tokenId}`)}>Retirar</button>
              <button type="button" disabled={busy || index === 0} aria-label={`Mover ${token.text}, ficha ${number}, a la izquierda desde posición ${index + 1}`} onClick={() => { const next = [...ids]; [next[index - 1], next[index]] = [next[index], next[index - 1]]; change(next, `placed-${tokenId}`); }}>←</button>
              <button type="button" disabled={busy || index === ids.length - 1} aria-label={`Mover ${token.text}, ficha ${number}, a la derecha desde posición ${index + 1}`} onClick={() => { const next = [...ids]; [next[index], next[index + 1]] = [next[index + 1], next[index]]; change(next, `placed-${tokenId}`); }}>→</button>
            </>}</li>;
          })}
        </ol>
        <p aria-live="polite">{save.isPending || attempt.isFetching ? "Guardando…" : item.savedAt ? `Guardado · versión ${item.version}` : "Sin respuesta guardada"}</p>
        {current.status === "submitted" && <section aria-label="Corrección"><p>{item.outcome === "correct" ? "Correcto" : item.outcome === "omitted" ? "Omitido" : "Incorrecto"}. Tu secuencia: {ids.map((tokenId) => { const token = item.prompt.tokens.find((value) => value.id === tokenId)!; return `${token.text} (ficha ${item.prompt.tokens.indexOf(token) + 1})`; }).join(" ") || "(vacía)"}.</p>
          <p>Secuencia aceptada: {item.acceptedSequences?.map((sequence) => sequence.map((tokenId) => { const token = item.prompt.tokens.find((value) => value.id === tokenId)!; return `${token.text} (ficha ${item.prompt.tokens.indexOf(token) + 1})`; }).join(" ")).join(" / ")}. {item.explanation}</p></section>}
      </section>
      <nav><button disabled={busy || current.currentPosition === 1} onClick={() => move.mutate(current.currentPosition - 1)}>Anterior</button><button disabled={busy || current.currentPosition === current.itemCount} onClick={() => move.mutate(current.currentPosition + 1)}>Siguiente</button></nav>
      {current.status === "in_progress" && <><p>{omissions} respuestas incompletas de {current.itemCount}.</p><button disabled={busy} onClick={() => { if (window.confirm(`Hay ${omissions} respuestas incompletas. ¿Entregar ahora?`)) submit.mutate(); }}>Entregar</button></>}
      {current.status === "submitted" && <p>Entregado · {current.pointsAwarded} / {current.pointsPossible} puntos (omisiones incluidas).</p>}
    </>}
    {[start.error, save.error, move.error, submit.error].filter(Boolean).map((error, index) => <p key={index} className="error" role="alert">{error!.message} Recarga para recuperar la última versión guardada.</p>)}
  </article>;
}

export function W1Attempt({ id }: { id: string }) {
  const [client] = useState(() => new QueryClient());
  return <QueryClientProvider client={client}><Activity id={id} /></QueryClientProvider>;
}
