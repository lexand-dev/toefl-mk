"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { QueryClient, QueryClientProvider, useMutation, useQuery } from "@tanstack/react-query";
import { dataOrThrow, l2 } from "../api";

function Selection() {
  const router = useRouter();
  const [groups, setGroups] = useState<2 | 4>(2);
  const [timerMode, setTimerMode] = useState<"count_up" | "count_down">("count_down");
  const summary = useQuery({ queryKey: ["l2-summary", groups], queryFn: async () => dataOrThrow<{ materialCount: number; itemCount: number; shortage: number; rules: { secondsPerQuestion: number } }>(await l2.summary.$get({ query: { groups: String(groups) } })) });
  const open = useQuery({ queryKey: ["l2-open"], queryFn: async () => dataOrThrow<{ id: string; status: string }[]>(await l2.attempts.$get()) });
  const create = useMutation({ mutationFn: async () => dataOrThrow<{ id: string }>(await l2.attempts.$post({ json: { groups, timerMode } })), onSuccess: ({ id }) => router.push(`/app/practice/l2/${id}`) });
  return <article><h1>Conversaciones breves L2</h1><p><Link href="/app/practice">Volver a Reading R3</Link></p>
    <label>Conversaciones<select value={groups} onChange={(event) => setGroups(Number(event.target.value) as 2 | 4)}><option value="2">2 conversaciones</option><option value="4">4 conversaciones</option></select></label>
    <label>Reloj<select value={timerMode} onChange={(event) => setTimerMode(event.target.value as "count_up" | "count_down")}><option value="count_down">Cuenta regresiva</option><option value="count_up">Tiempo transcurrido</option></select></label>
    {summary.isPending ? <p>Consultando disponibilidad…</p> : summary.isError ? <p role="alert">{summary.error.message}</p> : <p>{summary.data.materialCount} materiales distintos · {summary.data.itemCount} preguntas evaluables. {summary.data.shortage > 0 && `Faltan ${summary.data.shortage} conversaciones publicadas; reduce el lote.`} {summary.data.rules.secondsPerQuestion} segundos de respuesta por pregunta, independientes del audio.</p>}
    <button disabled={create.isPending || !summary.data || summary.data.shortage > 0} onClick={() => create.mutate()}>Preparar intento</button>
    {create.error && <p role="alert">{create.error.message}</p>}
    {!!open.data?.length && <section><h2>Continuar</h2>{open.data.map((attempt) => <p key={attempt.id}><Link href={`/app/practice/l2/${attempt.id}`}>{attempt.status === "prepared" ? "Iniciar lote preparado" : "Reanudar práctica"}</Link></p>)}</section>}
  </article>;
}

export function L2Selector() {
  const [client] = useState(() => new QueryClient());
  return <QueryClientProvider client={client}><Selection /></QueryClientProvider>;
}
