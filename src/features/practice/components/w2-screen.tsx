"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { QueryClient, QueryClientProvider, useQuery } from "@tanstack/react-query";
import { dataOrThrow, practice } from "../api";
import { reviewLabels, type Checklist } from "../w2-schemas";
import { VisibleActivity } from "@/features/history/components/visible-activity";

type Attempt = Extract<Awaited<ReturnType<typeof import("../w2").detail>>, { groups: unknown }>;
type Item = Attempt["items"][number];
const endpoint = (id: string) => practice.api.practice.w2.attempts[":id"];
const wordCount = (text: string) => text.trim() ? text.trim().split(/\s+/u).length : 0;

function Clock({ attempt, item }: { attempt: Attempt; item: Item }) {
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    const anchor = performance.now();
    const timer = setInterval(() => setElapsed(performance.now() - anchor), 1000);
    return () => clearInterval(timer);
  }, [attempt.serverTime, item.id]);
  if (!item.taskStartedAt) return <p>El reloj de esta tarea aún no ha comenzado.</p>;
  const serverNow = new Date(attempt.serverTime).getTime();
  const milliseconds = attempt.timerMode === "count_down" && item.deadlineAt
    ? Math.max(0, new Date(item.deadlineAt).getTime() - serverNow - elapsed)
    : Math.max(0, serverNow + elapsed - new Date(item.taskStartedAt).getTime());
  const seconds = Math.floor(milliseconds / 1000);
  return <p role="timer">{attempt.timerMode === "count_down" ? "Restante en esta tarea" : "Transcurrido en esta tarea"}: {Math.floor(seconds / 60)}:{String(seconds % 60).padStart(2, "0")}</p>;
}

function Editor({ id, item, itemCount, onSaved, onMove, onSubmit }: { id: string; item: Item; itemCount: number; onSaved: () => Promise<void>; onMove: (position: number) => Promise<void>; onSubmit: (text: string) => Promise<void> }) {
  const router = useRouter();
  const [text, setText] = useState(item.response?.text ?? "");
  const [state, setState] = useState<"saved" | "pending" | "saving" | "error">("saved");
  const [error, setError] = useState("");
  const textRef = useRef(text);
  const savedRef = useRef(text);
  const versionRef = useRef(item.version);
  const flight = useRef<Promise<boolean> | null>(null);
  const [moving, setMoving] = useState(false);

  const flush = useCallback(async (): Promise<boolean> => {
    if (flight.current) {
      if (!await flight.current) return false;
      return flush();
    }
    if (textRef.current === savedRef.current) { setState("saved"); return true; }
    const value = textRef.current;
    setState("saving");
    const request = (async () => {
      try {
        const saved = await dataOrThrow<{ version: number }>(await endpoint(id).items[":itemId"].$put({ param: { id, itemId: item.id }, json: { version: versionRef.current, response: { text: value } } }));
        versionRef.current = saved.version;
        savedRef.current = value;
        if (textRef.current === value) setState("saved");
        else setState("pending");
        await onSaved();
        return true;
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : "No se pudo guardar");
        setState("error");
        return false;
      }
    })();
    flight.current = request;
    try { return await request; } finally { flight.current = null; }
  }, [id, item.id, onSaved]);

  useEffect(() => {
    if (state !== "pending") return;
    const timer = setTimeout(() => void flush(), 500);
    return () => clearTimeout(timer);
  }, [state, text, flush]);
  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => {
      if (textRef.current !== savedRef.current || flight.current) { event.preventDefault(); event.returnValue = ""; }
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, []);

  async function proceed(action: () => Promise<void>) {
    setMoving(true);
    try { if (await flush()) await action(); } catch (cause) {
      setError(cause instanceof Error ? cause.message : "No se pudo completar la operación");
      setState("error");
    } finally { setMoving(false); }
  }
  return <section aria-label="Editor de correo" className="w2-editor">
    <label htmlFor={`email-${item.id}`}>Tu correo</label>
    <textarea id={`email-${item.id}`} rows={14} maxLength={50000} value={text} disabled={moving} onChange={(event) => { textRef.current = event.target.value; setText(event.target.value); setError(""); setState("pending"); }} />
    <p>Palabras: {wordCount(text)}</p>
    <p role="status" aria-live="polite">{state === "saved" ? `Guardado · versión ${versionRef.current}` : state === "saving" ? "Guardando…" : state === "pending" ? "Cambios pendientes de guardar" : "No guardado"}</p>
    {error && <p role="alert" className="error">{error}. El borrador sigue en el editor; comprueba la versión antes de reintentar.</p>}
    <button disabled={moving || state === "saved"} onClick={() => void flush()}>Guardar ahora</button>
    <nav><button disabled={moving || item.position === 1} onClick={() => void proceed(() => onMove(item.position - 1))}>Anterior</button> <button disabled={moving || item.position === itemCount} onClick={() => void proceed(() => onMove(item.position + 1))}>Siguiente</button></nav>
    <button disabled={moving} onClick={() => void proceed(() => onSubmit(textRef.current))}>Entregar lote</button>
    <button disabled={moving} onClick={() => void proceed(async () => { router.push("/app/practice?type=W2"); })}>Volver al historial</button>
  </section>;
}

function Activity({ id }: { id: string }) {
  const attempt = useQuery({ queryKey: ["w2-attempt", id], queryFn: async () => dataOrThrow<Attempt>(await endpoint(id).$get({ param: { id } })), refetchInterval: 10000 });
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const refresh = useCallback(async () => { await attempt.refetch(); }, [attempt.refetch]);
  async function act(action: () => Promise<unknown>) {
    setBusy(true); setError("");
    try { await action(); await refresh(); } catch (cause) { setError(cause instanceof Error ? cause.message : "Error"); throw cause; } finally { setBusy(false); }
  }
  if (attempt.isPending) return <p>Cargando intento…</p>;
  if (attempt.isError) return <p role="alert" className="error">{attempt.error.message}</p>;
  const current = attempt.data;
  const item = current.items[current.currentPosition - 1];
  const group = current.groups.find((value) => value.id === item.groupId)!;
  const submitted = current.status === "submitted";
  async function move(position: number) {
    if (position > current.itemCount) return;
    await act(async () => dataOrThrow(await endpoint(id).position.$put({ param: { id }, json: { position } })));
  }
  async function submit(text: string) {
    const empty = current.items.filter((value) => value.id === item.id ? !text.trim() : !value.response?.text.trim()).length;
    if (!window.confirm(`Hay ${empty} tareas vacías. ¿Entregar ahora?`)) return;
    await act(async () => dataOrThrow(await endpoint(id).submit.$post({ param: { id } })));
  }
  async function check(key: keyof Checklist, checked: boolean) {
    if (!current.selfReview) return;
    await act(async () => dataOrThrow(await endpoint(id)["self-review"].$put({ param: { id }, json: { version: current.selfReview!.version, checklist: { ...current.selfReview!.checklist, [key]: checked } } })));
  }
  return <article>{current.status === "in_progress" && <VisibleActivity id={id} />}{current.status !== "in_progress" && <Link href="/app/practice?type=W2">Volver a W2 e historial</Link>}
    <h1>Correo {current.currentPosition} de {current.itemCount}</h1>
    <p>{current.materialCount} materiales · {current.itemCount} tareas · sin puntuación objetiva</p>
    <Clock attempt={current} item={item} />
    <section aria-label="Consigna"><h2>Consigna</h2><p>{group.content.situation}</p><p>Destinatario: {group.content.recipient}</p><p>{group.content.task}</p><p>{item.prompt.instruction}</p></section>
    {current.status === "prepared" ? <button disabled={busy} onClick={() => void act(async () => dataOrThrow(await endpoint(id).start.$post({ param: { id } })))}>Iniciar práctica</button>
      : submitted ? <><section aria-label="Correo entregado"><h2>Entregado · sin calificación automática</h2><p style={{ whiteSpace: "pre-wrap" }}>{item.response?.text ?? ""}</p><p>{item.response?.text.trim() ? `${wordCount(item.response.text)} palabras entregadas` : "Entrega vacía · omitida, sin nota"}</p></section>
        <nav><button disabled={busy || current.currentPosition === 1} onClick={() => void move(current.currentPosition - 1)}>Anterior</button> <button disabled={busy || current.currentPosition === current.itemCount} onClick={() => void move(current.currentPosition + 1)}>Siguiente</button></nav>
        <section aria-label="Autoevaluación"><h2>Lista de autoevaluación</h2><p>Revisa tu texto; estas casillas no son una nota de calidad.</p>{(Object.keys(reviewLabels) as (keyof Checklist)[]).map((key) => <label key={key} className="practice-option"><input type="checkbox" checked={current.selfReview?.checklist[key] ?? false} disabled={busy} onChange={(event) => void check(key, event.target.checked)} />{reviewLabels[key]}</label>)}</section></>
      : <Editor key={item.id} id={id} item={item} itemCount={current.itemCount} onSaved={refresh} onMove={move} onSubmit={submit} />}
    {error && <p className="error" role="alert">{error}</p>}
  </article>;
}

export function W2Screen({ id }: { id: string }) {
  const [client] = useState(() => new QueryClient());
  return <QueryClientProvider client={client}><Activity id={id} /></QueryClientProvider>;
}
