"use server";
/**
 * Server actions used by the upload queue. They never redirect (the queue runs in the
 * background); a missing session comes back as { error: "auth" } so the queue can pause.
 * Every write goes through the user's own Supabase session, so RLS applies.
 */
import { z } from "zod";
import { supabaseServer } from "@/lib/supabase/server";
import { checkPiece, KARATS } from "@/lib/pricing";
import { MEDIA_TYPE, mediaPaths, VIDEO_EXTS } from "@/lib/media-paths";
import { nameFor } from "@/lib/outbox/policy";
import { CATEGORIES } from "@/lib/ai/validate";

type Fail = { error: "auth" | "rejected" | "retry"; detail?: string };

async function session() {
  const supabase = await supabaseServer();
  const { data } = await supabase.auth.getUser();
  return data.user ? { supabase, user: data.user } : null;
}

const num = z.string().max(20);
const desc = z.string().trim().min(1).max(600);
const PieceInput = z.object({
  id: z.uuid(),
  shopId: z.uuid(),
  captureMs: z.number().int().min(0).max(86_400_000),
  createdAt: z.number().int(),
  hasSpin: z.boolean(),
  fields: z.object({
    name: z.string().max(80),
    category: z.enum(CATEGORIES),
    karat: z.number().refine((k) => (KARATS as readonly number[]).includes(k)),
    gross_g: num,
    stone_g: num,
    making_per_g: num,
    making_flat: num,
    extras_aed: num,
    // From AI fill, possibly edited. Checked again here: the server never trusts the phone.
    descriptions: z
      .object({ en: desc, ar: desc, hi: desc, ml: desc })
      .partial()
      .optional(),
  }),
});

const blankToNull = (s: string) => (s.trim() === "" ? null : s.trim());

/** Creates the piece row. Safe to call again after a dropped connection: returns the existing SKU. */
export async function createPiece(raw: unknown): Promise<{ sku: string } | Fail> {
  const parsed = PieceInput.safeParse(raw);
  if (!parsed.success) return { error: "rejected", detail: "invalid input" };
  const { id, shopId, fields: f, captureMs, createdAt, hasSpin } = parsed.data;
  const check = checkPiece(f);
  if (!check.ok) return { error: "rejected", detail: check.error };

  const s = await session();
  if (!s) return { error: "auth" };
  const { supabase, user } = s;

  const existing = await supabase.from("pieces").select("sku").eq("id", id).maybeSingle();
  if (existing.error) return { error: "retry", detail: existing.error.message };
  if (existing.data) return { sku: existing.data.sku };

  const ins = await supabase
    .from("pieces")
    .insert({
      id,
      shop_id: shopId,
      name: f.name.trim() || nameFor(f.karat, f.category),
      category: f.category,
      karat: f.karat,
      gross_g: f.gross_g.trim(),
      stone_g: blankToNull(f.stone_g) ?? "0",
      making_per_g: blankToNull(f.making_per_g) ?? "0",
      making_flat: blankToNull(f.making_flat),
      extras_aed: blankToNull(f.extras_aed) ?? "0",
      // Empty means "none yet": a database trigger then adds the AI reply's descriptions if it
      // arrived before this row (see 20261118000200_ai_fill.sql).
      descriptions: f.descriptions ?? {},
      created_by: user.id,
    })
    .select("sku")
    .single();
  if (ins.error) {
    // 23505: the same id arrived twice at once; 42501/23514/22P02: RLS or check constraint.
    if (ins.error.code === "23505") {
      const again = await supabase.from("pieces").select("sku").eq("id", id).maybeSingle();
      if (again.data) return { sku: again.data.sku };
    }
    const permanent = ["42501", "23514", "22P02", "23503", "22003"].includes(ins.error.code ?? "");
    return { error: permanent ? "rejected" : "retry", detail: ins.error.message };
  }

  await supabase.from("events").insert({
    shop_id: shopId,
    user_id: user.id,
    name: "piece_added",
    props: { piece_id: id, capture_ms: captureMs, has_spin: hasSpin, queued_ms: Math.max(0, Date.now() - createdAt) },
  });
  return { sku: ins.data.sku };
}

const UploadReq = z.object({
  pieceId: z.uuid(),
  items: z
    .array(z.object({ mediaId: z.uuid(), kind: z.enum(["photo", "spin", "video"]), ext: z.string().max(5) }))
    .min(1)
    .max(3),
});

export type SignedUpload = { mediaId: string; main: { path: string; url: string | null }; thumb: { path: string; url: string | null } | null };

/** Signed upload URLs (valid 2 hours) for a piece's files. url is null when the file is already there. */
export async function signUploads(raw: unknown): Promise<{ uploads: SignedUpload[] } | Fail> {
  const parsed = UploadReq.safeParse(raw);
  if (!parsed.success) return { error: "rejected", detail: "invalid input" };
  const s = await session();
  if (!s) return { error: "auth" };
  const { supabase } = s;
  const piece = await supabase.from("pieces").select("shop_id").eq("id", parsed.data.pieceId).maybeSingle();
  if (piece.error) return { error: "retry", detail: piece.error.message };
  if (!piece.data) return { error: "rejected", detail: "piece not found" };

  const sign = async (path: string) => {
    const r = await supabase.storage.from("media").createSignedUploadUrl(path);
    if (!r.error) return { path, url: r.data.signedUrl };
    if (/exists/i.test(r.error.message)) return { path, url: null };
    throw r.error;
  };
  try {
    const uploads: SignedUpload[] = [];
    for (const it of parsed.data.items) {
      if (it.kind === "video" && !(VIDEO_EXTS as readonly string[]).includes(it.ext)) return { error: "rejected", detail: "video type" };
      const p = mediaPaths(piece.data.shop_id, parsed.data.pieceId, it.mediaId, it.kind, it.ext);
      uploads.push({ mediaId: it.mediaId, main: await sign(p.main), thumb: p.thumb ? await sign(p.thumb) : null });
    }
    return { uploads };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { error: /row-level security|not allowed|403/i.test(msg) ? "rejected" : "retry", detail: msg };
  }
}

const RegisterReq = z.object({
  pieceId: z.uuid(),
  media: z.object({
    mediaId: z.uuid(),
    kind: z.enum(["photo", "spin", "video"]),
    ext: z.string().max(5),
    bytes: z.number().int().min(0),
    frames: z.number().int().min(1).max(120).optional(),
    cols: z.number().int().min(1).max(24).optional(),
    cell: z.number().int().min(32).max(2048).optional(),
  }),
});

/** Records an uploaded file against its piece. Safe to repeat. */
export async function registerMedia(raw: unknown): Promise<{ ok: true } | Fail> {
  const parsed = RegisterReq.safeParse(raw);
  if (!parsed.success) return { error: "rejected", detail: "invalid input" };
  const s = await session();
  if (!s) return { error: "auth" };
  const { supabase, user } = s;
  const { pieceId, media: m } = parsed.data;

  const piece = await supabase.from("pieces").select("shop_id").eq("id", pieceId).maybeSingle();
  if (piece.error) return { error: "retry", detail: piece.error.message };
  if (!piece.data) return { error: "rejected", detail: "piece not found" };

  const exists = await supabase.from("piece_media").select("id").eq("id", m.mediaId).maybeSingle();
  if (exists.error) return { error: "retry", detail: exists.error.message };
  if (exists.data) return { ok: true };

  const p = mediaPaths(piece.data.shop_id, pieceId, m.mediaId, m.kind, m.ext);
  const ins = await supabase.from("piece_media").insert({
    id: m.mediaId,
    piece_id: pieceId,
    shop_id: piece.data.shop_id,
    type: MEDIA_TYPE[m.kind],
    storage_path: p.main,
    thumb_path: p.thumb,
    bytes: m.bytes,
    frames: m.kind === "spin" ? m.frames : null,
    cols: m.kind === "spin" ? m.cols : null,
    cell_px: m.kind === "spin" ? m.cell : null,
    sort_order: m.kind === "photo" ? 0 : m.kind === "spin" ? 1 : 2,
    created_by: user.id,
  });
  if (ins.error && ins.error.code !== "23505") {
    return { error: ins.error.code === "42501" ? "rejected" : "retry", detail: ins.error.message };
  }
  return { ok: true };
}
