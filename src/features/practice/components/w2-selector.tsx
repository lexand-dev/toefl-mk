"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { QueryClient, QueryClientProvider, useMutation, useQuery } from "@tanstack/react-query";
import { dataOrThrow, practice } from "../api";

function Selector() {
  const router = useRouter();
  const [groups, setGroups] = useState<1 | 2 | 3>(1);
  const [timerMode, setTimerMode] = useState<"count_up" | "count_down">("count_down");
  const summary = useQuery({ queryKey: ["w2-summary", groups], queryFn: async () => dataOrThrow<Awaited<ReturnType<typeof import("../w2").summary>>>(await practice.api.practice.w2.summary.$get({ query: { groups: String(groups) } })) });
  const history = useQuery({ queryKey: ["w2-history"], queryFn: async () => dataOrThrow<Awaited<ReturnType<typeof import("../w2").history>>>(await practice.api.practice.w2.attempts.$get()) });
  const create = useMutation({ mutationFn: async () => dataOrThrow<{ id: string }>(await practice.api.practice.w2.attempts.$post({ json: { groups, timerMode } })), onSuccess: (result) => router.push(`/app/practice/${result.id}`) });
  return <article><h1>Redactar un correo W2</h1><p>Selecciona consignas publicadas para redactar tus correos. No hay calificación automática.</p>
    <label>Materiales <select value={groups} onChange={(event) => setGroups(Number(event.target.value) as 1 | 2 | 3)}><option value="1">1 correo</option><option value="2">2 correos</option><option value="3">3 correos</option></select></label>
    <label>Reloj <select value={timerMode} onChange={(event) => setTimerMode(event.target.value as "count_up" | "count_down")}><option value="count_down">Cuenta regresiva</option><option value="count_up">Tiempo transcurrido</option></select></label>
    {summary.isPending ? <p>Consultando disponibilidad…</p> : summary.isError ? <p className="error">{summary.error.message}</p> : <p>{summary.data.materialCount} materiales distintos · {summary.data.itemCount} tareas de escritura (0 ítems de puntuación objetiva). {summary.data.shortage > 0 && `Faltan ${summary.data.shortage} materiales publicados; reduce el lote.`} {timerMode === "count_down" && `${summary.data.rules.secondsPerTask / 60} minutos por tarea.`}</p>}
    <button disabled={create.isPending || !summary.data || summary.data.shortage > 0} onClick={() => create.mutate()}>Preparar intento W2</button>
    {create.isError && <p role="alert" className="error">{create.error.message}</p>}
    {!!history.data?.length && <section><h2>Historial W2</h2><ul>{history.data.map((attempt) => <li key={attempt.id}><Link href={`/app/practice/${attempt.id}`}>{attempt.status === "submitted" ? "Revisar entrega" : attempt.status === "prepared" ? "Iniciar lote preparado" : "Reanudar borrador"} · {new Date(attempt.createdAt).toLocaleDateString()}</Link></li>)}</ul></section>}
  </article>;
}

export function W2Selector() {
  const [client] = useState(() => new QueryClient());
  return <QueryClientProvider client={client}><Selector /></QueryClientProvider>;
}
