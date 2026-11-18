"use client";
/**
 * Turns a 5–10 second turntable video into a sprite sheet, on the phone:
 * 24 evenly spaced frames, each centre-cropped to a square, packed 6 × 4 at 360 px
 * (2160 × 1440 JPEG), plus a 120 px version for catalogue cards.
 * The original video is always kept and uploaded separately for 3D later.
 */
export const SPIN_FRAMES = 24;
export const SPIN_COLS = 6;
export const SPIN_ROWS = 4;
export const SPIN_CELL = 360;
export const SPIN_SMALL_CELL = 120;
export const MAX_VIDEO_BYTES = 100 * 1024 * 1024;

export type Sprite = { sprite: Blob; small: Blob; frames: number; cols: number; cell: number; durationS: number };
export type SpinError = "unreadable" | "too_short" | "too_long" | "too_big" | "unsupported";

export class SpinExtractError extends Error {
  constructor(public code: SpinError) {
    super(code);
  }
}

const VIDEO_TYPES: Record<string, string> = {
  "video/mp4": "mp4",
  "video/quicktime": "mov",
  "video/3gpp": "3gp",
  "video/webm": "webm",
};

/** File extension for a supported phone video, or null. */
export function videoExt(file: { type: string; name?: string }): string | null {
  if (VIDEO_TYPES[file.type]) return VIDEO_TYPES[file.type];
  const ext = file.name?.split(".").pop()?.toLowerCase();
  return ext && Object.values(VIDEO_TYPES).includes(ext) ? ext : null;
}

export function videoContentType(ext: string): string {
  return Object.entries(VIDEO_TYPES).find(([, e]) => e === ext)?.[0] ?? "video/mp4";
}

function once(el: HTMLMediaElement, event: string, ms: number) {
  return new Promise<void>((resolve, reject) => {
    const done = () => {
      clearTimeout(timer);
      el.removeEventListener(event, done);
      el.removeEventListener("error", fail);
      resolve();
    };
    const fail = () => {
      clearTimeout(timer);
      el.removeEventListener(event, done);
      reject(new SpinExtractError("unreadable"));
    };
    const timer = setTimeout(() => {
      el.removeEventListener(event, done);
      el.removeEventListener("error", fail);
      reject(new SpinExtractError("unreadable"));
    }, ms);
    el.addEventListener(event, done, { once: true });
    el.addEventListener("error", fail, { once: true });
  });
}

function toBlob(c: HTMLCanvasElement, q: number) {
  return new Promise<Blob>((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new SpinExtractError("unreadable"))), "image/jpeg", q));
}

export async function extractSpin(file: File, onProgress?: (fraction: number) => void): Promise<Sprite> {
  if (file.size > MAX_VIDEO_BYTES) throw new SpinExtractError("too_big");
  if (!videoExt(file)) throw new SpinExtractError("unsupported");
  const url = URL.createObjectURL(file);
  const v = document.createElement("video");
  v.muted = true;
  v.playsInline = true;
  v.setAttribute("playsinline", "");
  v.preload = "auto";
  v.src = url;
  try {
    await once(v, "loadeddata", 15000);
    const d = v.duration;
    if (!Number.isFinite(d) || d <= 0) throw new SpinExtractError("unreadable");
    if (d < 2) throw new SpinExtractError("too_short");
    if (d > 30) throw new SpinExtractError("too_long");

    const sheet = document.createElement("canvas");
    sheet.width = SPIN_COLS * SPIN_CELL;
    sheet.height = SPIN_ROWS * SPIN_CELL;
    const ctx = sheet.getContext("2d")!;
    ctx.imageSmoothingQuality = "high";
    for (let i = 0; i < SPIN_FRAMES; i++) {
      // Evenly spaced across the clip; never seek past the last decodable frame.
      v.currentTime = Math.min(Math.max(d - 0.05, 0), (i / SPIN_FRAMES) * d + 0.02);
      await once(v, "seeked", 8000);
      const vw = v.videoWidth, vh = v.videoHeight, s = Math.min(vw, vh);
      if (!s) throw new SpinExtractError("unreadable");
      ctx.drawImage(v, (vw - s) / 2, (vh - s) / 2, s, s, (i % SPIN_COLS) * SPIN_CELL, Math.floor(i / SPIN_COLS) * SPIN_CELL, SPIN_CELL, SPIN_CELL);
      onProgress?.((i + 1) / SPIN_FRAMES);
    }
    const small = document.createElement("canvas");
    small.width = SPIN_COLS * SPIN_SMALL_CELL;
    small.height = SPIN_ROWS * SPIN_SMALL_CELL;
    const sctx = small.getContext("2d")!;
    sctx.imageSmoothingQuality = "high";
    sctx.drawImage(sheet, 0, 0, small.width, small.height);
    const [sprite, smallBlob] = await Promise.all([toBlob(sheet, 0.82), toBlob(small, 0.8)]);
    return { sprite, small: smallBlob, frames: SPIN_FRAMES, cols: SPIN_COLS, cell: SPIN_CELL, durationS: d };
  } finally {
    URL.revokeObjectURL(url);
    v.removeAttribute("src");
    try {
      v.load();
    } catch {}
  }
}
