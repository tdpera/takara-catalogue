/**
 * POST /api/ai/fill: suggests catalogue details from a piece's photo.
 *
 * multipart/form-data: shopId, pieceId (the phone's id for the piece), image (JPEG/PNG/WebP).
 * 200 { ok: true, requestId, suggestions, dropped }
 * 4xx/5xx { ok: false, error, retryAfterS? } with error one of:
 *   auth, forbidden, bad_request, too_large, rate_limited, quota, unreadable, no_jewellery,
 *   refused, invalid_output, busy, timeout, not_configured, error
 *
 * The photo is only read, never edited or stored by this route (it's uploaded separately by
 * the capture queue). The user's own Supabase session is used, so RLS and the membership check
 * in claim_ai_request decide whether this shop can be used.
 */
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { supabaseServer } from "@/lib/supabase/server";
import { aiConfigured, fillFromPhoto } from "@/lib/ai/claude";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const MAX_BYTES = 4_500_000; // the phone sends a 1600 px JPEG, usually 150-500 KB
const Fields = z.object({ shopId: z.uuid(), pieceId: z.uuid() });

type ErrorCode =
  | "auth" | "forbidden" | "bad_request" | "too_large" | "rate_limited" | "quota" | "unreadable" | "no_jewellery"
  | "refused" | "invalid_output" | "busy" | "timeout" | "not_configured" | "error";

function fail(status: number, error: ErrorCode, retryAfterS?: number) {
  const headers = retryAfterS ? { "retry-after": String(retryAfterS) } : undefined;
  return NextResponse.json({ ok: false, error, ...(retryAfterS ? { retryAfterS } : {}) }, { status, headers });
}

function sniff(b: Uint8Array): "image/jpeg" | "image/png" | "image/webp" | null {
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "image/jpeg";
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return "image/png";
  if (String.fromCharCode(...b.slice(0, 4)) === "RIFF" && String.fromCharCode(...b.slice(8, 12)) === "WEBP") return "image/webp";
  return null;
}

export async function POST(req: NextRequest) {
  // Cookies are SameSite=Lax, but check the origin too: this route spends money.
  const origin = req.headers.get("origin");
  if (origin && new URL(origin).host !== req.headers.get("host")) return fail(403, "forbidden");
  if (Number(req.headers.get("content-length") ?? 0) > MAX_BYTES + 10_000) return fail(413, "too_large");

  const supabase = await supabaseServer();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return fail(401, "auth");

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return fail(400, "bad_request");
  }
  const fields = Fields.safeParse({ shopId: form.get("shopId"), pieceId: form.get("pieceId") });
  const image = form.get("image");
  if (!fields.success || !(image instanceof Blob) || image.size === 0) return fail(400, "bad_request");
  if (image.size > MAX_BYTES) return fail(413, "too_large");
  const bytes = new Uint8Array(await image.arrayBuffer());
  const mediaType = sniff(bytes);
  if (!mediaType) return fail(400, "bad_request");

  if (!aiConfigured()) return fail(503, "not_configured");

  const claim = await supabase.rpc("claim_ai_request", { p_shop: fields.data.shopId, p_piece: fields.data.pieceId });
  if (claim.error) {
    if (claim.error.message === "ai_rate_user") return fail(429, "rate_limited", Number(claim.error.hint) || 60);
    if (claim.error.message === "ai_rate_shop") return fail(429, "quota");
    if (claim.error.code === "42501") return fail(403, "forbidden");
    console.error("[ai-fill] claim failed:", claim.error.message);
    return fail(503, "busy", 10);
  }
  const requestId = claim.data as string;

  const started = Date.now();
  const run = await fillFromPhoto({ base64: Buffer.from(bytes).toString("base64"), mediaType });
  const durationMs = Date.now() - started;

  const check = run.ok ? run.check : null;
  let status = "error";
  let result: object | null = null;
  if (check?.ok) {
    status = "ok";
    result = { ...check.suggestions, dropped: check.dropped };
  } else if (check) {
    status = check.error === "invalid_output" ? "invalid_output" : "unreadable";
  } else if (!run.ok) {
    status = run.error === "not_configured" ? "error" : run.error;
  }

  const finish = await supabase.rpc("finish_ai_request", {
    p_id: requestId,
    p_status: status,
    p_model: run.model ?? null,
    p_input_tokens: run.inputTokens ?? null,
    p_output_tokens: run.outputTokens ?? null,
    p_duration_ms: durationMs,
    p_result: result,
  });
  if (finish.error) console.error("[ai-fill] finish failed:", finish.error.message);

  if (check?.ok) {
    return NextResponse.json({ ok: true, requestId, suggestions: check.suggestions, dropped: check.dropped });
  }
  if (check) {
    const e = check.error;
    if (e === "invalid_output") return fail(502, "invalid_output");
    return fail(422, e === "no_jewellery" ? "no_jewellery" : "unreadable");
  }
  if (run.ok) return fail(502, "error");
  switch (run.error) {
    case "refused":
      return fail(422, "refused");
    case "invalid_output":
      return fail(502, "invalid_output");
    case "busy":
      return fail(503, "busy", run.retryAfterS);
    case "timeout":
      return fail(504, "timeout");
    case "not_configured":
      return fail(503, "not_configured");
    default:
      return fail(502, "error");
  }
}
