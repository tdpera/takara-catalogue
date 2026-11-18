"use client";
/**
 * Upload queue processor. Runs in the page while the app is open:
 *   1. create the piece row (small: the details are safe on the server within seconds)
 *   2. upload photo + thumbnail, then register them
 *   3. upload spin sprites, then register them
 *   4. upload the original video when the connection allows (see videoMayUpload)
 * Each step is recorded in IndexedDB, so a dropped connection resumes where it stopped.
 * Retries back off from 2 s to 5 min, and restart immediately when the phone comes back online.
 */
import { allPieces, deleteBlob, deletePiece, getBlob, putBlob, putPiece, type OutboxPiece } from "./db";
import { backoffMs, videoMayUpload, type Connection } from "./policy";
import { createPiece, registerMedia, signUploads } from "@/app/add/actions";

class Retry extends Error {}
class Block extends Error {
  constructor(public kind: "auth" | "rejected", msg?: string) {
    super(msg ?? kind);
  }
}

type Fail = { error: "auth" | "rejected" | "retry"; detail?: string };
function unwrap<T extends object>(r: T | Fail): T {
  if ("error" in r) {
    if (r.error === "retry") throw new Retry(r.detail ?? "retry");
    throw new Block(r.error, r.detail);
  }
  return r;
}

/** Server action calls and uploads give up after a while on stalled connections, then retry. */
function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Retry("timeout")), ms);
    p.then(
      (v) => (clearTimeout(t), resolve(v)),
      (e) => (clearTimeout(t), reject(e instanceof Block ? e : new Retry(String(e?.message ?? e)))),
    );
  });
}

function connection(): Connection {
  return (navigator as Navigator & { connection?: Connection }).connection;
}

// ------------------------------------------------------------------ change notifications

const listeners = new Set<() => void>();
const channel = typeof BroadcastChannel !== "undefined" ? new BroadcastChannel("souq-outbox") : null;
channel?.addEventListener("message", () => listeners.forEach((l) => l()));
function emit() {
  listeners.forEach((l) => l());
  channel?.postMessage("changed");
}
export function subscribe(l: () => void) {
  listeners.add(l);
  return () => void listeners.delete(l);
}

/** Pieces whose upload finished in this session (newest first), for the "Uploaded" confirmation. */
export const finished: { id: string; sku: string; name: string }[] = [];

// ------------------------------------------------------------------ running

let userId: string | null = null;
let running = false;
let again = false;
let timer: ReturnType<typeof setTimeout> | undefined;
let hooked = false;

export function startQueue(forUser: string) {
  userId = forUser;
  if (!hooked && typeof window !== "undefined") {
    hooked = true;
    window.addEventListener("online", kick);
    document.addEventListener("visibilitychange", () => document.visibilityState === "visible" && kick());
    (connection() as unknown as EventTarget | undefined)?.addEventListener?.("change", kick);
  }
  // A fresh sign-in may unblock items that stopped for lack of a session.
  void allPieces().then(async (items) => {
    for (const p of items) {
      if (p.userId === forUser && p.blocked === "auth") {
        p.blocked = undefined;
        p.nextAttemptAt = 0;
        await putPiece(p);
      }
    }
    kick();
  });
}

export function kick() {
  if (running) {
    again = true;
    return;
  }
  void run();
}

async function run() {
  if (!userId) return;
  running = true;
  try {
    const loop = async () => {
      do {
        again = false;
        await processAll();
      } while (again);
    };
    // Only one tab processes at a time.
    if (navigator.locks) await navigator.locks.request("souq-outbox", { ifAvailable: true }, async (lock) => lock && loop());
    else await loop();
  } finally {
    running = false;
    void scheduleNext();
  }
}

async function scheduleNext() {
  clearTimeout(timer);
  const items = (await allPieces()).filter((p) => p.userId === userId && !p.blocked);
  if (items.length === 0) return;
  const soonest = Math.min(...items.map((p) => p.nextAttemptAt));
  // Re-check at least every 30 s (a video may now be allowed on Wi-Fi).
  timer = setTimeout(kick, Math.min(30_000, Math.max(500, soonest - Date.now())));
}

async function processAll() {
  const items = (await allPieces()).filter((p) => p.userId === userId && !p.blocked);
  for (const p of items) {
    if (p.nextAttemptAt > Date.now()) continue;
    if (!navigator.onLine) return;
    await processOne(p);
  }
}

async function putFile(url: string | null, key: string, contentType: string) {
  if (!url) return; // already in storage from an earlier attempt
  const blob = await getBlob(key);
  if (!blob) throw new Block("rejected", "file missing on this phone");
  const ctrl = new AbortController();
  // 30 s plus time for the file at a slow 20 KB/s.
  const t = setTimeout(() => ctrl.abort(), 30_000 + (blob.size / 20_000) * 1000);
  try {
    const res = await fetch(url, { method: "PUT", headers: { "content-type": contentType, "x-upsert": "false" }, body: blob, signal: ctrl.signal });
    if (res.ok) return;
    const text = await res.text().catch(() => "");
    if (/KeyAlreadyExists|already exists/i.test(text)) return;
    if (res.status === 400 && /mime|type|size|payload too large/i.test(text)) throw new Block("rejected", text.slice(0, 200));
    throw new Retry(`upload failed (${res.status})`);
  } catch (e) {
    if (e instanceof Block || e instanceof Retry) throw e;
    throw new Retry(String((e as Error)?.message ?? e));
  } finally {
    clearTimeout(t);
  }
}

async function processOne(p: OutboxPiece) {
  try {
    if (!p.pieceSaved) {
      const r = unwrap(
        await withTimeout(
          createPiece({ id: p.id, shopId: p.shopId, fields: p.fields, captureMs: p.captureMs, createdAt: p.createdAt, hasSpin: p.media.some((m) => m.kind === "spin") }),
          30_000,
        ),
      );
      p.sku = r.sku;
      p.pieceSaved = true;
      await putPiece(p);
      emit();
    }
    for (const m of p.media) {
      if (m.status === "registered") continue;
      if (m.kind === "video" && !videoMayUpload(connection(), p.createdAt, Date.now(), !!m.forceNow)) continue;
      if (m.status === "pending") {
        const { uploads } = unwrap(await withTimeout(signUploads({ pieceId: p.id, items: [{ mediaId: m.id, kind: m.kind, ext: m.ext }] }), 30_000));
        const u = uploads[0];
        await putFile(u.main.url, m.mainKey, m.contentType);
        if (u.thumb && m.thumbKey) await putFile(u.thumb.url, m.thumbKey, "image/jpeg");
        m.status = "uploaded";
        await putPiece(p);
        emit();
      }
      unwrap(
        await withTimeout(
          registerMedia({ pieceId: p.id, media: { mediaId: m.id, kind: m.kind, ext: m.ext, bytes: m.bytes, frames: m.frames, cols: m.cols, cell: m.cell } }),
          30_000,
        ),
      );
      m.status = "registered";
      await deleteBlob(m.mainKey);
      if (m.thumbKey) await deleteBlob(m.thumbKey);
      await putPiece(p);
      emit();
    }
    if (p.media.every((m) => m.status === "registered")) {
      await deletePiece(p.id);
      finished.unshift({ id: p.id, sku: p.sku ?? "", name: p.fields.name });
      finished.length = Math.min(finished.length, 20);
    } else {
      // Only a video waiting for Wi-Fi is left.
      p.attempts = 0;
      p.lastError = undefined;
      await putPiece(p);
    }
    emit();
  } catch (e) {
    if (e instanceof Block) {
      p.blocked = e.kind;
      p.lastError = e.message;
    } else {
      p.attempts += 1;
      p.nextAttemptAt = Date.now() + backoffMs(p.attempts);
      p.lastError = String((e as Error)?.message ?? e);
    }
    await putPiece(p);
    emit();
  }
}

// ------------------------------------------------------------------ actions from the UI

export async function enqueue(piece: OutboxPiece, blobs: Record<string, Blob>) {
  for (const [k, b] of Object.entries(blobs)) await putBlob(k, b);
  await putPiece(piece);
  emit();
  kick();
}

export async function retryNow(id: string) {
  const p = (await allPieces()).find((x) => x.id === id);
  if (!p) return;
  p.nextAttemptAt = 0;
  if (p.blocked === "auth") p.blocked = undefined;
  await putPiece(p);
  emit();
  kick();
}

export async function uploadVideoNow(id: string) {
  const p = (await allPieces()).find((x) => x.id === id);
  if (!p) return;
  for (const m of p.media) if (m.kind === "video") m.forceNow = true;
  p.nextAttemptAt = 0;
  await putPiece(p);
  emit();
  kick();
}

/** Removes a piece the server rejected, with its files, from this phone. */
export async function discard(id: string) {
  const p = (await allPieces()).find((x) => x.id === id);
  if (!p) return;
  for (const m of p.media) {
    await deleteBlob(m.mainKey);
    if (m.thumbKey) await deleteBlob(m.thumbKey);
  }
  await deletePiece(id);
  emit();
}

export type QueueItemState = "saving" | "uploading" | "waiting_wifi" | "offline" | "retrying" | "needs_sign_in" | "rejected";

export function itemState(p: OutboxPiece, online: boolean, now = Date.now()): QueueItemState {
  if (p.blocked === "auth") return "needs_sign_in";
  if (p.blocked === "rejected") return "rejected";
  if (!online) return "offline";
  const left = p.media.filter((m) => m.status !== "registered");
  if (p.pieceSaved && left.length > 0 && left.every((m) => m.kind === "video") && !videoMayUpload(connection(), p.createdAt, now, left.some((m) => m.forceNow))) {
    return "waiting_wifi";
  }
  if (p.attempts > 0 && p.nextAttemptAt > now) return "retrying";
  return p.pieceSaved ? "uploading" : "saving";
}

export { allPieces };
