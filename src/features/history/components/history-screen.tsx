"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { QueryClient, QueryClientProvider, useMutation, useQuery } from "@tanstack/react-query";
import { dataOrThrow } from "@/features/practice/api";
import { historyApi } from "../api";

type Section = "reading" | "listening" | "writing";
type Status = "prepared" | "in_progress" | "submitted";
type History = Awaited<ReturnType<typeof import("../service").history>>;
type Activity = Awaited<ReturnType<typeof import("../service").activity>>;
const practicePath = (typeCode: string, id: string) => typeCode === "W1" ? `/app/practice/w1/${id}` : typeCode === "L2" ? `/app/practice/l2/${id}` : typeCode === "R1" ? `/app/practice/r1/${id}` : `/app/practice/${id}`;

function HistoryList() {
  const router = useRouter();
  const [section, setSection] = useState<Section | "">("");
  const [status, setStatus] = useState<Status | "">("");
  const attempts = useQuery({ queryKey: ["history", section, status], queryFn: async () => dataOrThrow<History>(await historyApi.api.history.attempts.$get({ query: { ...(section ? { section } : {}), ...(status ? { status } : {}) } })) });
  const activity = useQuery({ queryKey: ["activity"], queryFn: async () => dataOrThrow<Activity>(await historyApi.api.history.activity.$get()) });
  const repeat = useMutation({ mutationFn: async (id: string) => dataOrThrow<{ id: string; typeCode: string }>(await historyApi.api.history.attempts[":id"].repeat.$post({ param: { id } })), onSuccess: ({ id, typeCode }) => router.push(practicePath(typeCode, id)) });
  return <article><h1>Historial y actividad</h1>
    {activity.isPending ? <p>Cargando actividad…</p> : activity.isError ? <p className="error" role="alert">{activity.error.message}</p> :
      <p>Tiempo de práctica: {Math.floor(activity.data.practiceSeconds / 60)} min {activity.data.practiceSeconds % 60} s · Materiales únicos completados: {activity.data.completedMaterials}</p>}
    <label>Sección<select value={section} onChange={(event) => setSection(event.target.value as Section | "")}><option value="">Todas</option><option value="reading">Reading</option><option value="listening">Listening</option><option value="writing">Writing</option></select></label>
    <label>Estado<select value={status} onChange={(event) => setStatus(event.target.value as Status | "")}><option value="">Todos</option><option value="prepared">Preparado</option><option value="in_progress">En curso</option><option value="submitted">Entregado</option></select></label>
    {attempts.isPending ? <p>Cargando intentos…</p> : attempts.isError ? <p className="error" role="alert">{attempts.error.message}</p> : !attempts.data.length ? <p>No hay intentos para estos filtros.</p> :
      <ul>{attempts.data.map((attempt) => <li key={attempt.id}>
        {attempt.typeCode} · {attempt.materialCount} materiales · {new Date(attempt.createdAt).toLocaleDateString()} · {attempt.status === "submitted" ? "Entregado" : attempt.status === "prepared" ? "Preparado" : "En curso"}
        {attempt.status === "submitted" && <span> · {attempt.typeCode === "W2" ? "Sin calificación automática" : attempt.pointsPossible !== null ? `${attempt.pointsAwarded} / ${attempt.pointsPossible} puntos` : "Resultado pendiente"}</span>}
        <nav><Link href={practicePath(attempt.typeCode, attempt.id)}>{attempt.status === "submitted" ? "Revisar" : "Continuar"}</Link>
          {attempt.status === "submitted" && <button disabled={repeat.isPending} onClick={() => repeat.mutate(attempt.id)}>Repetir lote</button>}</nav>
      </li>)}</ul>}
    {repeat.isError && <p className="error" role="alert">{repeat.error.message}</p>}
    <Link href="/app/practice">Elegir práctica</Link>
  </article>;
}

export function HistoryScreen() {
  const [client] = useState(() => new QueryClient());
  return <QueryClientProvider client={client}><HistoryList /></QueryClientProvider>;
}
