"use client";
/** Browser side of AI fill: posts the already-compressed photo to /api/ai/fill. */
import type { AiSuggestions } from "./shared";

export type AiFillError =
  | "auth" | "forbidden" | "bad_request" | "too_large" | "rate_limited" | "quota" | "unreadable" | "no_jewellery"
  | "refused" | "invalid_output" | "busy" | "timeout" | "not_configured" | "error" | "offline";

export type AiFillResult =
  | { ok: true; suggestions: AiSuggestions; dropped: string[] }
  | { ok: false; error: AiFillError; retryAfterS?: number };

const KNOWN = new Set<string>([
  "auth", "forbidden", "bad_request", "too_large", "rate_limited", "quota", "unreadable", "no_jewellery",
  "refused", "invalid_output", "busy", "timeout", "not_configured", "error",
]);

export async function requestAiFill(image: Blob, shopId: string, pieceId: string, signal?: AbortSignal): Promise<AiFillResult> {
  if (!navigator.onLine) return { ok: false, error: "offline" };
  const body = new FormData();
  body.set("shopId", shopId);
  body.set("pieceId", pieceId);
  body.set("image", image, "photo.jpg");
  // The server allows 40 s per Claude attempt; give up a little after that.
  const timeout = AbortSignal.timeout(75_000);
  const combined = signal ? AbortSignal.any([signal, timeout]) : timeout;
  let res: Response;
  try {
    res = await fetch("/api/ai/fill", { method: "POST", body, signal: combined, credentials: "same-origin" });
  } catch (e) {
    if ((e as Error)?.name === "AbortError" && signal?.aborted) throw e; // cancelled by the form
    if (timeout.aborted) return { ok: false, error: "timeout" };
    return { ok: false, error: navigator.onLine ? "busy" : "offline" };
  }
  const data = (await res.json().catch(() => null)) as
    | { ok: true; suggestions: AiSuggestions; dropped: string[] }
    | { ok: false; error: string; retryAfterS?: number }
    | null;
  if (data && data.ok) return { ok: true, suggestions: data.suggestions, dropped: data.dropped ?? [] };
  if (data && !data.ok && KNOWN.has(data.error)) return { ok: false, error: data.error as AiFillError, retryAfterS: data.retryAfterS };
  return { ok: false, error: res.status === 413 ? "too_large" : res.status >= 500 ? "busy" : "error" };
}
