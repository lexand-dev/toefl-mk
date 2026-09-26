"use client";

import { useEffect, useRef, useState } from "react";
import { QueryClient, QueryClientProvider, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { dataOrThrow, l2 } from "../api";
import { VisibleActivity } from "@/features/history/components/visible-activity";

type Attempt = Extract<Awaited<ReturnType<typeof import("../engine").detail>>, { groups: unknown }>;

function PhaseClock({ attempt }: { attempt: Attempt }) {
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    const anchor = performance.now();
    const interval = setInterval(() => setElapsed(performance.now() - anchor), 1000);
    return () => clearInterval(interval);
  }, [attempt.serverTime]);
  const deadline = attempt.phase === "listening" ? attempt.listeningDeadlineAt : attempt.phase === "response" ? attempt.questionDeadlineAt : null;
  const sessionSeconds = attempt.startedAt ? Math.max(0, Math.floor(((attempt.submittedAt ? new Date(attempt.submittedAt).getTime() : new Date(attempt.serverTime).getTime() + elapsed) - new Date(attempt.startedAt).getTime()) / 1000)) : null;
  if (!deadline) return <p>{sessionSeconds === null ? "La sesión aún no ha comenzado." : `Duración de la sesión: ${sessionSeconds} s. El reloj de respuesta no ha comenzado.`}</p>;
  const seconds = Math.max(0, Math.ceil((new Date(deadline).getTime() - new Date(attempt.serverTime).getTime() - elapsed) / 1000));
  const responseElapsed = attempt.responseStartedAt ? Math.max(0, Math.floor((new Date(attempt.serverTime).getTime() + elapsed - new Date(attempt.responseStartedAt).getTime()) / 1000)) : 0;
  return <p role="timer">Duración de la sesión: {sessionSeconds} s · {attempt.phase === "listening" ? `Margen de reproducción del audio: ${seconds} s` : attempt.timerMode === "count_up" ? `Respuesta: ${responseElapsed} s transcurridos · plazo en ${seconds} s` : `Tiempo restante para responder esta pregunta: ${seconds} s`}</p>;
}

function Activity({ id }: { id: string }) {
  const cache = useQueryClient();
  const audio = useRef<HTMLAudioElement>(null);
  const [soundChecked, setSoundChecked] = useState(false);
  const [ready, setReady] = useState(false);
  const [localError, setLocalError] = useState("");
  const [reviewPosition, setReviewPosition] = useState(1);
  const refresh = () => cache.invalidateQueries({ queryKey: ["l2-attempt", id] });
  const attempt = useQuery({ queryKey: ["l2-attempt", id], queryFn: async () => dataOrThrow<Attempt>(await l2.attempts[":id"].$get({ param: { id } })), refetchInterval: 3000 });
  const playback = useMutation({ mutationFn: async () => dataOrThrow(await l2.attempts[":id"].playback.$post({ param: { id } })), onSuccess: refresh });
  const ended = useMutation({ mutationFn: async () => dataOrThrow(await l2.attempts[":id"]["audio-ended"].$post({ param: { id } })), onSuccess: refresh });
  const incident = useMutation({ mutationFn: async (reason: "load_failed" | "playback_failed" | "audio_stalled") => dataOrThrow(await l2.attempts[":id"].incident.$post({ param: { id }, json: { reason } })), onSuccess: refresh });
  const save = useMutation({ mutationFn: async (input: { itemId: string; version: number; optionId: string }) => dataOrThrow(await l2.attempts[":id"].items[":itemId"].$put({ param: { id, itemId: input.itemId }, json: { version: input.version, response: { optionId: input.optionId } } })), onSuccess: refresh });
  const next = useMutation({ mutationFn: async (position: number) => dataOrThrow(await l2.attempts[":id"].position.$put({ param: { id }, json: { position } })), onSuccess: () => { setReady(false); refresh(); } });
  const submit = useMutation({ mutationFn: async () => dataOrThrow(await l2.attempts[":id"].submit.$post({ param: { id } })), onSuccess: refresh });

  async function soundCheck() {
    try {
      const context = new AudioContext();
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      gain.gain.value = 0.1;
      oscillator.connect(gain).connect(context.destination);
      oscillator.start(); oscillator.stop(context.currentTime + 0.3);
      oscillator.onended = () => { void context.close(); };
      setSoundChecked(true); setLocalError("");
    } catch { setLocalError("No se pudo comprobar el sonido. Revisa el dispositivo."); }
  }

  async function play() {
    if (!audio.current) return;
    try { await playback.mutateAsync(); } catch { return; }
    try {
      // Reloading never grants another listening window. Resume at the server-recorded offset.
      const started = attempt.data?.playbackStartedAt;
      if (!started) audio.current.currentTime = 0;
      else if (audio.current.duration && Number.isFinite(audio.current.duration)) {
        audio.current.currentTime = Math.min(audio.current.duration, Math.max(0, (new Date(attempt.data!.serverTime).getTime() - new Date(started).getTime()) / 1000));
      }
      if (audio.current.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) throw new Error("Audio no disponible");
      await audio.current.play();
      setLocalError("");
    } catch {
      incident.mutate("playback_failed");
      setLocalError("El audio falló. Se ha registrado una incidencia; puedes volver a cargarlo sin perder respuestas.");
    }
  }

  if (attempt.isPending) return <p>Cargando intento…</p>;
  if (attempt.isError) return <p role="alert">{attempt.error.message}</p>;
  const current = attempt.data;
  const item = current.items[(current.phase === "review" ? reviewPosition : current.currentPosition) - 1];
  const group = current.groups.find((g) => g.id === item.groupId)!;
  const busy = playback.isPending || ended.isPending || save.isPending || next.isPending || submit.isPending;
  const omissions = current.items.filter((i) => !i.response).length;
  return <article>{current.status === "in_progress" && <VisibleActivity id={id} />}<h1>{group.content.title}</h1><p>{group.content.description}</p>
    <p>Conversación {group.ordinal} de {current.materialCount} · pregunta {current.currentPosition} de {current.itemCount}.</p>
    <p>Audio: {Math.ceil(group.audio.durationMs! / 1000)} s · Respuesta: {current.rules.secondsPerQuestion} s por pregunta · Sesión desde: {current.startedAt ? new Date(current.startedAt).toLocaleTimeString() : "pendiente"}.</p>
    <PhaseClock attempt={current} />
    {current.phase === "incident" && <p role="alert">Incidencia de audio registrada ({current.incident?.reason}). No se ha calificado ninguna pregunta por este fallo. Comprueba la conexión y vuelve a cargar el audio.</p>}
    {(current.phase === "ready" || current.phase === "incident" || current.phase === "listening") && <section aria-label="Escucha">
      <h2>Escucha la conversación</h2>
      <button type="button" onClick={() => void soundCheck()}>Comprobar sonido (tono breve)</button>
      <p>{soundChecked ? "Sonido comprobado" : "Comprueba el sonido antes de escuchar."} · {ready ? "Audio cargado" : "Cargando audio…"}</p>
      <audio ref={audio} key={group.id} preload="auto" src={group.audio.url} onCanPlay={() => setReady(true)} onError={() => { setReady(false); if (current.phase !== "incident") incident.mutate("load_failed"); }} onEnded={() => ended.mutate()} />
      {current.phase === "incident" && <button type="button" onClick={() => { setReady(false); audio.current?.load(); }}>Volver a cargar audio</button>}
      <button type="button" disabled={!soundChecked || !ready || busy || current.phase === "incident" && incident.isPending} onClick={() => void play()}>{current.phase === "listening" ? "Reanudar audio" : "Escuchar audio"}</button>
      <p>El reloj de respuesta empieza después de que termine el audio. El margen de escucha es independiente.</p>
    </section>}
    {(current.phase === "response" || current.phase === "review") && <section aria-label="Pregunta">
      <h2>Pregunta {item.position}</h2><p>{item.prompt.question}</p>
      {item.prompt.options.map((option) => <label key={option.id} className="practice-option"><input type="radio" name={`l2-${item.id}`} checked={item.response?.optionId === option.id} disabled={busy || current.phase === "review"} onChange={() => save.mutate({ itemId: item.id, version: item.version, optionId: option.id })} />{option.text}</label>)}
      <p aria-live="polite">{save.isPending ? "Guardando…" : item.savedAt ? `Guardado · versión ${item.version}` : "Sin respuesta guardada"}</p>
      {current.phase === "review" && <p>{item.outcome === "correct" ? "Correcto" : item.outcome === "omitted" ? "Omitido" : "Incorrecto"}. Respuesta: {item.prompt.options.find((option) => option.id === item.correctOptionId)?.text}. {item.explanation}</p>}
    </section>}
    {current.phase === "response" && <><button type="button" disabled={busy || !item.response || current.currentPosition === current.itemCount} onClick={() => next.mutate(current.currentPosition + 1)}>Siguiente pregunta</button><p>Solo puedes avanzar tras responder. Al vencer el plazo, la pregunta sin respuesta se omite automáticamente.</p><p>{omissions} respuestas vacías.</p><button type="button" disabled={busy} onClick={() => { if (window.confirm(`Hay ${omissions} respuestas vacías. ¿Entregar ahora?`)) submit.mutate(); }}>Entregar</button></>}
    {current.phase === "review" && <><nav><button type="button" disabled={reviewPosition === 1} onClick={() => setReviewPosition(reviewPosition - 1)}>Anterior</button><button type="button" disabled={reviewPosition === current.itemCount} onClick={() => setReviewPosition(reviewPosition + 1)}>Siguiente</button></nav><p>Entregado · {current.pointsAwarded} / {current.pointsPossible} puntos (omisiones incluidas).</p><h2>Transcripciones</h2>{current.groups.map((g) => <section key={g.id}><h3>{g.content.title}</h3><p style={{ whiteSpace: "pre-wrap" }}>{g.transcript}</p></section>)}</>}
    {[localError, playback.error?.message, ended.error?.message, incident.error?.message, save.error?.message, next.error?.message, submit.error?.message].filter(Boolean).map((error, index) => <p key={index} role="alert" className="error">{error} Recarga para recuperar el estado del servidor.</p>)}
  </article>;
}

export function L2AttemptScreen({ id }: { id: string }) {
  const [client] = useState(() => new QueryClient());
  return <QueryClientProvider client={client}><Activity id={id} /></QueryClientProvider>;
}
