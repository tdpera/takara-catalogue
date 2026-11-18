"use client";
/** Photo sizes uploaded for every piece. */
export const PHOTO_MAX_PX = 1600;
export const THUMB_MAX_PX = 480;
const QUALITY = 0.88;
const THUMB_QUALITY = 0.8;

export type CompressedPhoto = { full: Blob; thumb: Blob; width: number; height: number };

let worker: Worker | null = null;
let seq = 0;
const waiting = new Map<number, (r: { ok: boolean; error?: string } & Partial<CompressedPhoto>) => void>();

function getWorker(): Worker | null {
  if (typeof Worker === "undefined" || typeof OffscreenCanvas === "undefined") return null;
  if (!worker) {
    worker = new Worker(new URL("./image.worker.ts", import.meta.url), { type: "module" });
    worker.onmessage = (e) => {
      const cb = waiting.get(e.data.id);
      waiting.delete(e.data.id);
      cb?.(e.data);
    };
  }
  return worker;
}

/** Fallback for browsers without OffscreenCanvas in workers. */
async function compressOnMainThread(file: Blob): Promise<CompressedPhoto> {
  const bmp = await createImageBitmap(file);
  const draw = (max: number, q: number) => {
    const s = Math.min(1, max / Math.max(bmp.width, bmp.height));
    const c = document.createElement("canvas");
    c.width = Math.round(bmp.width * s);
    c.height = Math.round(bmp.height * s);
    const ctx = c.getContext("2d")!;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(bmp, 0, 0, c.width, c.height);
    return new Promise<{ blob: Blob; w: number; h: number }>((res, rej) =>
      c.toBlob((b) => (b ? res({ blob: b, w: c.width, h: c.height }) : rej(new Error("encode failed"))), "image/jpeg", q),
    );
  };
  const full = await draw(PHOTO_MAX_PX, QUALITY);
  const thumb = await draw(THUMB_MAX_PX, THUMB_QUALITY);
  bmp.close();
  return { full: full.blob, thumb: thumb.blob, width: full.w, height: full.h };
}

/** Shrinks a camera photo to 1600 px (and a 480 px thumbnail) as JPEG. */
export async function compressPhoto(file: Blob): Promise<CompressedPhoto> {
  const w = getWorker();
  if (!w) return compressOnMainThread(file);
  const id = ++seq;
  const res = await new Promise<{ ok: boolean; error?: string } & Partial<CompressedPhoto>>((resolve) => {
    waiting.set(id, resolve);
    w.postMessage({ id, file, max: PHOTO_MAX_PX, thumb: THUMB_MAX_PX, quality: QUALITY, thumbQuality: THUMB_QUALITY });
  });
  if (!res.ok) return compressOnMainThread(file);
  return { full: res.full!, thumb: res.thumb!, width: res.width!, height: res.height! };
}
