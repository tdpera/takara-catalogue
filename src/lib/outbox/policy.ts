/** Pure rules for the upload queue (unit tested). */

const BASE_MS = 2_000;
const MAX_MS = 5 * 60_000;
export const VIDEO_WIFI_WAIT_MS = 24 * 60 * 60_000;

/** Retry delay after `attempts` failures: 2 s, 4 s, 8 s … capped at 5 min, with ±20% jitter. */
export function backoffMs(attempts: number, random: () => number = Math.random): number {
  const raw = Math.min(MAX_MS, BASE_MS * 2 ** Math.max(0, attempts - 1));
  return Math.round(raw * (0.8 + 0.4 * random()));
}

export type Connection = { type?: string; saveData?: boolean } | undefined;

/**
 * Original spin videos are large, so they wait for Wi-Fi when the phone reports mobile data
 * or data saver. After 24 hours, or when the user taps "Upload now", they go anyway.
 * Unknown connection types (most desktops, iPhones) upload straight away.
 */
export function videoMayUpload(conn: Connection, queuedAt: number, now: number, forced: boolean): boolean {
  if (forced) return true;
  if (now - queuedAt >= VIDEO_WIFI_WAIT_MS) return true;
  if (conn?.saveData) return false;
  if (conn?.type === "cellular") return false;
  return true;
}

/** Errors worth retrying (network, timeouts, server hiccups) versus ones that need the user. */
export type FailureKind = "retry" | "auth" | "rejected";

export function nameFor(karat: number, category: string): string {
  return `${karat}K ${category}`;
}
