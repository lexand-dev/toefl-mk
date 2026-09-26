"use client";

import { useCallback, useEffect, useState } from "react";
import { hc } from "hono/client";
import type { EditorialAppType } from "@/app/api/editorial/[[...route]]/route";
import type { EditorialAudioAppType } from "@/app/api/editorial/audio/route";
import { exampleR3 } from "../example-r3";
import { createSchema, revisionSchema } from "../schemas";

const api = hc<EditorialAppType>("/").api.editorial;
const audioApi = hc<EditorialAudioAppType>("/").api.editorial.audio;
type List = Awaited<ReturnType<typeof api.$get>>;
type Row = Extract<Awaited<ReturnType<List["json"]>>, { data: unknown }> extends { data: infer T } ? T extends Array<infer U> ? U : never : never;

function previewContent(content: Record<string, unknown>) {
  if (Array.isArray(content.segments)) return content.segments.map((value) => {
    if (!value || typeof value !== "object") return "";
    const segment = value as { kind?: unknown; text?: unknown; stem?: unknown };
    return segment.kind === "text" ? String(segment.text ?? "") : segment.kind === "gap" ? `${String(segment.stem ?? "")}___` : "";
  }).join("");
  return String(content.passage ?? content.text ?? content.description ?? content.situation ?? content.context ?? "");
}

export function Workbench({ admin, actorId }: { admin: boolean; actorId: string }) {
  const [rows, setRows] = useState<Row[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [detail, setDetail] = useState<unknown>(null);
  const [typeCode, setTypeCode] = useState("R3");
  const [topic, setTopic] = useState("Infraestructura urbana");
  const [difficulty, setDifficulty] = useState("intermediate");
  const [draft, setDraft] = useState(JSON.stringify(exampleR3, null, 2));
  const [message, setMessage] = useState("");
  const [humanReviewed, setHumanReviewed] = useState(false);
  const [audioFile, setAudioFile] = useState<File | null>(null);
  const [audioDuration, setAudioDuration] = useState("");
  const [audioRights, setAudioRights] = useState("");

  const refresh = useCallback(async (id?: string) => {
    const list = await api.$get();
    if (list.ok) { const body = await list.json(); if ("data" in body) setRows(body.data); }
    if (id) {
      const response = await api[":id"].$get({ param: { id } });
      if (response.ok) {
        const body = await response.json();
        if ("data" in body) setDetail(body.data);
      }
    }
  }, []);
  useEffect(() => { void refresh(); }, [refresh]);

  async function readResponse(response: Response) {
    const result = await response.json();
    if (!response.ok) { setMessage(`${result.error ?? "Error"}: ${result.details?.join("; ") ?? ""}`); return false; }
    setMessage("Guardado correctamente");
    return result.data as { id?: string };
  }

  async function open(id: string) {
    setSelected(id); setHumanReviewed(false);
    const response = await api[":id"].$get({ param: { id } });
    if (!response.ok) { setMessage("No se pudo abrir la revisión"); return; }
    const { data } = await response.json();
    if (!("status" in data.revision)) return;
    setDetail(data);
    setTypeCode(data.exercise.typeCode);
    setTopic(data.exercise.topic ?? "");
    setDifficulty(data.exercise.difficulty ?? "intermediate");
    setDraft(JSON.stringify({ publicContent: data.revision.publicContent, provenanceNote: data.revision.provenanceNote, rightsNote: data.revision.rightsNote, items: data.items.map((item) => ({ ordinal: item.ordinal, responseKind: item.responseKind, publicPrompt: item.publicPrompt, pointsPossible: Number(item.pointsPossible), key: item.key && { acceptedAnswers: item.key.acceptedAnswers, scoringRule: item.key.scoringRule, explanation: item.key.explanation } })), assets: data.assets.map((asset) => ({ kind: asset.kind, storageKey: asset.storageKey, mimeType: asset.mimeType, sha256Hex: asset.sha256Hex, byteSize: Number(asset.byteSize), durationMs: asset.durationMs, rightsNote: asset.rightsNote, role: asset.role, sortOrder: asset.sortOrder })), reviewContent: data.reviewContent }, null, 2));
  }

  async function save(mode: "new" | "edit" | "revision") {
    let value: unknown;
    try { value = JSON.parse(draft); } catch { setMessage("JSON inválido"); return; }
    const parsed = revisionSchema.safeParse(value);
    if (!parsed.success) { setMessage(parsed.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`).join("; ")); return; }
    if (mode === "new") {
      const input = createSchema.safeParse({ typeCode, topic, difficulty, revision: parsed.data });
      if (!input.success) { setMessage("Tipo, tema o dificultad inválidos"); return; }
      const result = await readResponse(await api.$post({ json: input.data }));
      if (result && result.id) { await refresh(); await open(result.id); }
    } else if (mode === "revision" && selected) {
      const current = detail as { revision: { exerciseId: string } };
      const result = await readResponse(await api[":id"].revisions.$post({ param: { id: current.revision.exerciseId }, json: parsed.data }));
      if (result && result.id) { await refresh(); await open(result.id); }
    } else if (selected) {
      if (await readResponse(await api[":id"].$put({ param: { id: selected }, json: parsed.data }))) { await refresh(selected); await open(selected); }
    }
  }

  async function uploadL2Audio() {
    if (!audioFile) return;
    try {
      const response = await audioApi.$post({ form: { audio: audioFile, durationMs: audioDuration, rightsNote: audioRights } });
      const result = await response.json();
      if (!response.ok || !("data" in result)) { setMessage("error" in result && typeof result.error === "string" ? result.error : "Error de carga"); return; }
      const parsed = revisionSchema.safeParse(JSON.parse(draft));
      if (!parsed.success) { setMessage("Corrige el JSON de la revisión antes de añadir el audio"); return; }
      setDraft(JSON.stringify({ ...parsed.data, assets: [...parsed.data.assets.filter((asset) => asset.role !== "stimulus" || asset.kind !== "audio"), result.data] }, null, 2));
      setMessage("Audio público almacenado; guarda el borrador para vincularlo a la revisión");
    } catch { setMessage("No se pudo cargar el audio"); }
  }

  async function action(name: "submit" | "approve" | "reject" | "publish" | "retire") {
    if (!selected) return;
    const param = { id: selected };
    const response = name === "submit" ? await api[":id"].submit.$post({ param })
      : name === "approve" ? await api[":id"].approve.$post({ param, json: { humanReviewed: true } })
      : name === "reject" ? await api[":id"].reject.$post({ param })
      : name === "publish" ? await api[":id"].publish.$post({ param })
      : await api[":id"].retire.$post({ param });
    if (await readResponse(response)) { await refresh(selected); await open(selected); }
  }

  const current = detail as null | { revision: { status: string; authorId: string; reviewedBy: string | null; revisionNumber: number; exerciseId: string; publicContent: Record<string, unknown> }; exercise: { typeCode: string }; items: { ordinal: number; publicPrompt: { question?: string; instruction?: string; sentence?: string; gapId?: string; options?: { id: string; text: string }[] }; key?: { acceptedAnswers: unknown; explanation: string } }[]; assets: { kind: string; storageKey: string; role: string }[] };
  return <section>
    <p>Solo una persona distinta del autor puede aprobar. La muestra R3 es un borrador original sin revisión humana; no la publiques hasta comprobarla.</p>
    <nav><button type="button" onClick={() => { setSelected(null); setDetail(null); setDraft(JSON.stringify(exampleR3, null, 2)); setTypeCode("R3"); setHumanReviewed(false); }}>Nuevo material R3 de ejemplo</button></nav>
    <h2>Revisiones</h2>
    <ul>{rows.map((row) => <li key={row.id}><button type="button" onClick={() => void open(row.id)}>{row.topic} — {row.typeCode} v{row.revisionNumber} ({row.status})</button></li>)}</ul>
    {current && <p>Revisión {current.revision.revisionNumber}: {current.revision.status}. {current.items.length} ítems. {current.revision.reviewedBy ? "Aprobada por una persona distinta del autor." : "Pendiente de aprobación."}</p>}
    {current && <section aria-label="Previsualización editorial"><h2>Previsualización</h2>
      <h3>{String(current.revision.publicContent.title ?? current.exercise.typeCode)}</h3>
      <p>{previewContent(current.revision.publicContent)}</p>
      <ol>{current.items.map((item) => <li key={item.ordinal}><p>{item.publicPrompt.question ?? item.publicPrompt.instruction ?? item.publicPrompt.sentence ?? (item.publicPrompt.gapId ? `Hueco ${item.publicPrompt.gapId}` : "")}</p><ul>{item.publicPrompt.options?.map((option) => <li key={option.id}>{option.id}: {option.text}</li>)}</ul><p>Clave privada: {JSON.stringify(item.key?.acceptedAnswers ?? null)}. {item.key?.explanation}</p></li>)}</ol>
      <ul>{current.assets.map((asset) => <li key={asset.storageKey}>{asset.role}: {asset.kind} — {asset.storageKey}{asset.kind === "audio" && /^https:\/\//.test(asset.storageKey) && <audio controls src={asset.storageKey} />}{asset.kind === "image" && /^https:\/\//.test(asset.storageKey) && <a href={asset.storageKey}>Abrir imagen</a>}</li>)}</ul>
    </section>}
    <h2>{selected ? "Previsualizar y editar revisión" : "Crear borrador"}</h2>
    <p>El contenido, los ítems, las claves privadas, las explicaciones, los recursos y la transcripción de revisión se editan aquí; nunca se incluyen en la lectura pública.</p>
    <div className="editorial-form">
      <label>Tipo <select value={typeCode} onChange={(event) => setTypeCode(event.target.value)} disabled={!!selected}><option>R3</option><option>R1</option><option>L2</option><option>W1</option><option>W2</option></select></label>
      <label>Tema <input value={topic} onChange={(event) => setTopic(event.target.value)} disabled={!!selected} /></label>
      <label>Dificultad <select value={difficulty} onChange={(event) => setDifficulty(event.target.value)} disabled={!!selected}><option>intro</option><option>intermediate</option><option>advanced</option></select></label>
      <label>Revisión JSON <textarea rows={26} value={draft} onChange={(event) => setDraft(event.target.value)} aria-label="Contenido editorial JSON" /></label>
      {typeCode === "L2" && <fieldset><legend>Audio original versionado (Vercel Blob público)</legend>
        <label>Archivo MP3 o M4A <input type="file" accept="audio/mpeg,audio/mp4" onChange={(event) => setAudioFile(event.target.files?.[0] ?? null)} /></label>
        <label>Duración en milisegundos <input type="number" min="1" value={audioDuration} onChange={(event) => setAudioDuration(event.target.value)} /></label>
        <label>Derechos <input value={audioRights} onChange={(event) => setAudioRights(event.target.value)} /></label>
        <button type="button" disabled={!audioFile || !audioRights || !audioDuration} onClick={() => void uploadL2Audio()}>Subir audio y añadir metadatos al JSON</button>
      </fieldset>}
      {!selected && <button type="button" onClick={() => void save("new")}>Crear borrador</button>}
      {current?.revision.status === "draft" && (admin || current.revision.authorId === actorId) && <button type="button" onClick={() => void save("edit")}>Guardar borrador</button>}
      {current && <button type="button" onClick={() => void save("revision")}>Crear nueva revisión con este contenido</button>}
      {current?.revision.status === "draft" && (admin || current.revision.authorId === actorId) && <button type="button" onClick={() => void action("submit")}>Enviar a revisión</button>}
      {current?.revision.status === "in_review" && current.revision.authorId !== actorId && !current.revision.reviewedBy && <><label><input type="checkbox" checked={humanReviewed} onChange={(event) => setHumanReviewed(event.target.checked)} /> He revisado personalmente texto, opciones, claves, explicaciones, recursos, procedencia y derechos.</label><button type="button" disabled={!humanReviewed} onClick={() => void action("approve")}>Aprobar revisión humana</button></>}
      {current?.revision.status === "in_review" && current.revision.authorId !== actorId && !current.revision.reviewedBy && <button type="button" onClick={() => void action("reject")}>Devolver al autor para correcciones</button>}
      {admin && current?.revision.status === "in_review" && current.revision.reviewedBy && <button type="button" onClick={() => void action("publish")}>Publicar</button>}
      {admin && current?.revision.status === "published" && <button type="button" onClick={() => void action("retire")}>Retirar de nuevos lotes</button>}
      {current?.revision.status === "published" && <a href={`/api/editorial/published/${selected}`}>Comprobar lectura pública sin soluciones</a>}
      {message && <p role="status">{message}</p>}
    </div>
  </section>;
}
