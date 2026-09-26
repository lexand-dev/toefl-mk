"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { QueryClient, QueryClientProvider, useMutation, useQuery } from "@tanstack/react-query";
import { dataOrThrow } from "../api";
import { r1Client } from "../r1-client";

function Selector() {
  const router = useRouter();
  const [groups, setGroups] = useState<1 | 2>(1);
  const [timerMode, setTimerMode] = useState<"count_up" | "count_down">("count_down");
  const summary = useQuery({ queryKey: ["r1-summary", groups], queryFn: async () => dataOrThrow<{ materialCount: number; itemCount: number; shortage: number; rules: { secondsPerGroup: number } }>(await r1Client.api.practice.r1.summary.$get({ query: { groups: String(groups) } })) });
  const open = useQuery({ queryKey: ["r1-open"], queryFn: async () => dataOrThrow<{ id: string; status: string }[]>(await r1Client.api.practice.r1.attempts.$get()) });
  const create = useMutation({ mutationFn: async () => dataOrThrow<{ id: string }>(await r1Client.api.practice.r1.attempts.$post({ json: { groups, timerMode } })), onSuccess: ({ id }) => router.push(`/app/practice/r1/${id}`) });
  return <article><h1>Completar palabras R1</h1><p>Selecciona uno o dos textos publicados. Cada hueco cuenta como un ítem evaluable.</p>
    <label>Materiales<select value={groups} onChange={(event) => setGroups(Number(event.target.value) as 1 | 2)}><option value="1">1 texto</option><option value="2">2 textos</option></select></label>
    <label>Reloj<select value={timerMode} onChange={(event) => setTimerMode(event.target.value as "count_up" | "count_down")}><option value="count_down">Cuenta regresiva</option><option value="count_up">Tiempo transcurrido</option></select></label>
    {summary.isPending ? <p>Consultando disponibilidad…</p> : summary.isError ? <p className="error">{summary.error.message}</p> : <p>{summary.data.materialCount} materiales distintos · {summary.data.itemCount} huecos evaluables. {summary.data.shortage > 0 && `Faltan ${summary.data.shortage} materiales publicados.`} {timerMode === "count_down" && `${summary.data.rules.secondsPerGroup / 60} minutos por texto.`}</p>}
    <button disabled={create.isPending || !summary.data || summary.data.shortage > 0} onClick={() => create.mutate()}>Preparar intento</button>
    {create.isError && <p className="error" role="alert">{create.error.message}</p>}
    {!!open.data?.length && <section><h2>Continuar intento</h2>{open.data.map((attempt) => <p key={attempt.id}><Link href={`/app/practice/r1/${attempt.id}`}>{attempt.status === "prepared" ? "Iniciar lote preparado" : "Reanudar práctica"}</Link></p>)}</section>}
  </article>;
}

export function R1Selector() {
  const [client] = useState(() => new QueryClient());
  return <QueryClientProvider client={client}><Selector /></QueryClientProvider>;
}
