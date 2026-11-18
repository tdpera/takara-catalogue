"use client";
/**
 * The upload queue lives in IndexedDB on the phone, so captured pieces survive bad Wi-Fi,
 * closing the app and restarting the phone. Photos and videos are stored as Blobs.
 */
export type MediaKind = "photo" | "spin" | "video";

export type OutboxMedia = {
  id: string;
  kind: MediaKind;
  /** pending → uploaded (files in storage) → registered (piece_media row exists) */
  status: "pending" | "uploaded" | "registered";
  mainKey: string;
  thumbKey?: string;
  contentType: string;
  ext: string;
  bytes: number;
  frames?: number;
  cols?: number;
  cell?: number;
  path?: string;
  thumbPath?: string;
  forceNow?: boolean;
};

export type PieceFields = {
  name: string;
  category: string;
  karat: number;
  gross_g: string;
  stone_g: string;
  making_per_g: string;
  making_flat: string;
  extras_aed: string;
  descriptions?: Partial<Record<"en" | "ar" | "hi" | "ml", string>>;
};

export type OutboxPiece = {
  id: string;
  userId: string;
  shopId: string;
  fields: PieceFields;
  createdAt: number;
  captureMs: number;
  sku?: string;
  pieceSaved: boolean;
  media: OutboxMedia[];
  attempts: number;
  nextAttemptAt: number;
  lastError?: string;
  /** Set when the server rejected the piece; needs the user, won't retry by itself. */
  blocked?: "auth" | "rejected";
};

const DB_NAME = "souq-outbox";
const VERSION = 1;
let dbp: Promise<IDBDatabase> | null = null;

function open(): Promise<IDBDatabase> {
  dbp ??= new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains("pieces")) db.createObjectStore("pieces", { keyPath: "id" });
      if (!db.objectStoreNames.contains("blobs")) db.createObjectStore("blobs");
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => {
      dbp = null;
      reject(req.error);
    };
  });
  return dbp;
}

function wrap<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function store(name: "pieces" | "blobs", mode: IDBTransactionMode) {
  return (await open()).transaction(name, mode).objectStore(name);
}

export async function putBlob(key: string, blob: Blob) {
  await wrap((await store("blobs", "readwrite")).put(blob, key));
}
export async function getBlob(key: string): Promise<Blob | undefined> {
  return wrap((await store("blobs", "readonly")).get(key));
}
export async function deleteBlob(key: string) {
  await wrap((await store("blobs", "readwrite")).delete(key));
}
export async function putPiece(p: OutboxPiece) {
  await wrap((await store("pieces", "readwrite")).put(p));
}
export async function deletePiece(id: string) {
  await wrap((await store("pieces", "readwrite")).delete(id));
}
export async function allPieces(): Promise<OutboxPiece[]> {
  const rows = await wrap((await store("pieces", "readonly")).getAll());
  return (rows as OutboxPiece[]).sort((a, b) => a.createdAt - b.createdAt);
}
