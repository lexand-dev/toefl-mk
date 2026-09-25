"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { QueryClient, QueryClientProvider, useMutation, useQuery } from "@tanstack/react-query";
import { dataOrThrow } from "../api";
import { w1Client } from "../w1-client";

function Selector() {
  const router = useRouter();
  const [groups, setGroups] = useState<10 | 20>(10);
  const [timerMode, setTimerMode] = useState<"count_up" | "count_down">("count_down");
  const summary = useQuery({ queryKey: ["w1-summary", groups], queryFn: async () => dataOrThrow<{
    materialCount: number; itemCount: number; shortage: number; availableMaterials: number; rules: { secondsPerGroup: number };
  }>(await w1Client.api.practice.w1.summary.$get({ query: { groups: String(groups) } })) });
  const open = useQuery({ queryKey: ["w1-open"], queryFn: async () => dataOrThrow<{ id: string; status: string }[]>(await w1Client.api.practice.w1.attempts.$get()) });
  const create = useMutation({ mutationFn: async () => dataOrThrow<{ id: string }>(await w1Client.api.practice.w1.attempts.$post({ json: { groups, timerMode } })), onSuccess: (result) => router.push(`/app/practice/w1/${result.id}`) });
  return <article><h1>Construir oraciones W1</h1><p>Selecciona un lote de oraciones publicadas.</p>
    <label>Materiales<select value={groups} onChange={(event) => setGroups(Number(event.target.value) as 10 | 20)}><option value="10">10 oraciones</option><option value="20">20 oraciones</option></select></label>
    <label>Reloj<select value={timerMode} onChange={(event) => setTimerMode(event.target.value as "count_up" | "count_down")}><option value="count_down">Cuenta regresiva</option><option value="count_up">Tiempo transcurrido</option></select></label>
    {summary.isPending ? <p>Consultando disponibilidad…</p> : summary.isError ? <p className="error" role="alert">{summary.error.message}</p> : <p>{summary.data.materialCount} materiales distintos · {summary.data.itemCount} oraciones evaluables. {summary.data.shortage > 0 && `Faltan ${summary.data.shortage} materiales publicados; reduce el lote.`} {timerMode === "count_down" && `${summary.data.rules.secondsPerGroup * groups / 60} minutos para el lote.`}</p>}
    <button disabled={create.isPending || !summary.data || summary.data.shortage > 0} onClick={() => create.mutate()}>Preparar intento</button>
    {create.isError && <p className="error" role="alert">{create.error.message}</p>}
    {!!open.data?.length && <section><h2>Continuar intento W1</h2>{open.data.map((attempt) => <p key={attempt.id}><Link href={`/app/practice/w1/${attempt.id}`}>{attempt.status === "prepared" ? "Iniciar lote preparado" : "Reanudar práctica"}</Link></p>)}</section>}
  </article>;
}

export function W1Selector() {
  const [client] = useState(() => new QueryClient());
  return <QueryClientProvider client={client}><Selector /></QueryClientProvider>;
}
