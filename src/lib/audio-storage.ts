import { createHash, randomUUID } from "node:crypto";
import { put } from "@vercel/blob";

export type AudioMetadata = {
  kind: "audio"; storageKey: string; mimeType: string; sha256Hex: string;
  byteSize: number; durationMs: number; rightsNote: string; role: "stimulus"; sortOrder: number;
};

export interface AudioStorage {
  upload(bytes: Uint8Array, mimeType: string): Promise<string>;
}

// The key contains a unique version and content digest; overwriting is never allowed.
export const vercelBlobAudioStorage: AudioStorage = {
  async upload(bytes, mimeType) {
    const hash = createHash("sha256").update(bytes).digest("hex");
    const extension = mimeType === "audio/mpeg" ? "mp3" : "mp4";
    const blob = await put(`l2/${randomUUID()}/${hash}.${extension}`, Buffer.from(bytes), {
      access: "public", addRandomSuffix: false, allowOverwrite: false, contentType: mimeType,
    });
    return blob.url;
  },
};

export async function uploadAudio(storage: AudioStorage, bytes: Uint8Array, mimeType: "audio/mpeg" | "audio/mp4", durationMs: number, rightsNote: string): Promise<AudioMetadata> {
  const storageKey = await storage.upload(bytes, mimeType);
  return { kind: "audio", storageKey, mimeType, sha256Hex: createHash("sha256").update(bytes).digest("hex"), byteSize: bytes.byteLength, durationMs, rightsNote, role: "stimulus", sortOrder: 1 };
}
