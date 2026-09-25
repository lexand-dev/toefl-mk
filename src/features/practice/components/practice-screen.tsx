"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { QueryClient, QueryClientProvider, useMutation, useQuery } from "@tanstack/react-query";
import { dataOrThrow, practice } from "../api";

function Selector() {
  const router = useRouter();
  const [groups, setGroups] = useState<1 | 2>(1);
  const [timerMode, setTimerMode] = useState<"count_up" | "count_down">("count_down");
  const summary = useQuery({ queryKey: ["r3-summary", groups], queryFn: async () => dataOrThrow<{
    materialCount: number; itemCount: number; shortage: number; availableMaterials: number; rules: { secondsPerGroup: number };
  }>(await practice.api.practice.r3.summary.$get({ query: { groups: String(groups) } })) });
  const open = useQuery({ queryKey: ["r3-open"], queryFn: async () => dataOrThrow<{ id: string; status: string }[]>(await practice.api.practice.attempts.$get()) });
  const create = useMutation({ mutationFn: async () => dataOrThrow<{ id: string }>(await practice.api.practice.attempts.$post({ json: { typeCode: "R3", groups, timerMode } })), onSuccess: (result) => router.push(`/app/practice/${result.id}`) });
  return <article><h1>Lectura académica R3</h1><p>Selecciona un lote de pasajes publicados.</p>
    <label>Materiales<select value={groups} onChange={(event) => setGroups(Number(event.target.value) as 1 | 2)}><option value="1">1 pasaje</option><option value="2">2 pasajes</option></select></label>
    <label>Reloj<select value={timerMode} onChange={(event) => setTimerMode(event.target.value as "count_up" | "count_down")}><option value="count_down">Cuenta regresiva</option><option value="count_up">Tiempo transcurrido</option></select></label>
    {summary.isPending ? <p>Consultando disponibilidad…</p> : summary.isError ? <p className="error">{summary.error.message}</p> : <p>{summary.data.materialCount} materiales distintos · {summary.data.itemCount} preguntas evaluables. {summary.data.shortage > 0 && `Faltan ${summary.data.shortage} materiales publicados; reduce el lote.`} {timerMode === "count_down" && `${summary.data.rules.secondsPerGroup / 60} minutos por pasaje.`}</p>}
    <button disabled={create.isPending || !summary.data || summary.data.shortage > 0} onClick={() => create.mutate()}>Preparar intento</button>
    {create.isError && <p className="error" role="alert">{create.error.message}</p>}
    {!!open.data?.length && <section><h2>Continuar intento</h2>{open.data.map((attempt) => <p key={attempt.id}><Link href={`/app/practice/${attempt.id}`}>{attempt.status === "prepared" ? "Iniciar lote preparado" : "Reanudar práctica"}</Link></p>)}</section>}
  </article>;
}

export function PracticeScreen() {
  const [queryClient] = useState(() => new QueryClient());
  return <QueryClientProvider client={queryClient}><Selector /></QueryClientProvider>;
}
