"use client";

import { useEffect, useState } from "react";
import { QueryClient, QueryClientProvider, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { dataOrThrow, practice } from "../api";

type Attempt = Extract<Awaited<ReturnType<typeof import("@/features/practice/engine").detail>>, { groups: unknown }>;
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
  const attempt = useQuery({ queryKey: ["attempt", id], queryFn: async () => dataOrThrow<Attempt>(await practice.api.practice.attempts[":id"].$get({ param: { id } })), refetchInterval: 10000 });
  const refresh = () => cache.invalidateQueries({ queryKey: ["attempt", id] });
  const start = useMutation({ mutationFn: async () => dataOrThrow(await practice.api.practice.attempts[":id"].start.$post({ param: { id } })), onSuccess: refresh });
  const save = useMutation({ mutationFn: async (input: { itemId: string; version: number; optionId: string | null }) => dataOrThrow(await practice.api.practice.attempts[":id"].items[":itemId"].$put({ param: { id, itemId: input.itemId }, json: { version: input.version, response: input.optionId ? { optionId: input.optionId } : null } })), onSuccess: refresh });
  const move = useMutation({ mutationFn: async (position: number) => dataOrThrow(await practice.api.practice.attempts[":id"].position.$put({ param: { id }, json: { position } })), onSuccess: refresh });
  const submit = useMutation({ mutationFn: async () => dataOrThrow(await practice.api.practice.attempts[":id"].submit.$post({ param: { id } })), onSuccess: refresh });
  if (attempt.isPending) return <p>Cargando intento…</p>;
  if (attempt.isError) return <p className="error" role="alert">{attempt.error.message}</p>;
  const current = attempt.data;
  const item = current.items[current.currentPosition - 1];
  const group = current.groups.find((value) => value.id === item.groupId)!;
  const omissions = current.items.filter((value) => !value.response).length;
  const busy = save.isPending || move.isPending || submit.isPending;
  return <article><h1>{group.content.title}</h1><Clock attempt={current} />
    {current.status === "prepared" ? <><p>{current.materialCount} materiales · {current.itemCount} preguntas. Revisa que el contenido esté listo antes de iniciar el reloj.</p><button disabled={start.isPending} onClick={() => start.mutate()}>Iniciar práctica</button></> : <>
      <section aria-label="Pasaje"><h2>Pasaje</h2><p style={{ whiteSpace: "pre-wrap" }}>{group.content.passage}</p></section>
      <section aria-label="Pregunta"><h2>Pregunta {current.currentPosition} de {current.itemCount}</h2><p>{item.prompt.question}</p>
        {item.prompt.options.map((option) => <label key={option.id} className="practice-option"><input type="radio" name={`answer-${item.id}`} checked={item.response?.optionId === option.id} disabled={busy || current.status === "submitted"} onChange={() => save.mutate({ itemId: item.id, version: item.version, optionId: option.id })} />{option.text}</label>)}
        {current.status === "in_progress" && <button disabled={busy || !item.response} onClick={() => save.mutate({ itemId: item.id, version: item.version, optionId: null })}>Borrar respuesta</button>}
        <p aria-live="polite">{save.isPending ? "Guardando…" : item.savedAt ? `Guardado · versión ${item.version}` : "Sin respuesta guardada"}</p>
        {current.status === "submitted" && <p>{item.outcome === "correct" ? "Correcto" : item.outcome === "omitted" ? "Omitido" : "Incorrecto"}. Respuesta: {item.prompt.options.find((value) => value.id === item.correctOptionId)?.text}. {item.explanation}</p>}
      </section>
      <nav><button disabled={busy || current.currentPosition === 1} onClick={() => move.mutate(current.currentPosition - 1)}>Anterior</button><button disabled={busy || current.currentPosition === current.itemCount} onClick={() => move.mutate(current.currentPosition + 1)}>Siguiente</button></nav>
      {current.status === "in_progress" && <><p>{omissions} respuestas vacías de {current.itemCount}.</p><button disabled={busy} onClick={() => { if (window.confirm(`Hay ${omissions} respuestas vacías. ¿Entregar ahora?`)) submit.mutate(); }}>Entregar</button></>}
      {current.status === "submitted" && <p>Entregado · {current.pointsAwarded} / {current.pointsPossible} puntos (omisiones incluidas).</p>}
    </>}
    {[start.error, save.error, move.error, submit.error].filter(Boolean).map((error, index) => <p key={index} className="error" role="alert">{error!.message} Recarga para recuperar la última versión guardada.</p>)}
  </article>;
}

export function AttemptScreen({ id }: { id: string }) {
  const [queryClient] = useState(() => new QueryClient());
  return <QueryClientProvider client={queryClient}><Activity id={id} /></QueryClientProvider>;
}
