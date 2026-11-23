"use server";
/**
 * Piece page actions. All run as the signed-in user, so RLS and the database functions decide:
 * any member can change the status; the creator, a manager or the owner can edit; only a
 * manager or the owner can delete.
 */
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { supabaseServer } from "@/lib/supabase/server";
import { checkPiece, KARATS } from "@/lib/pricing";
import { CATEGORIES } from "@/lib/ai/shared";
import { STATUSES } from "@/lib/catalogue-filters";
import { SOLD_VIA, soldValue } from "@/lib/sold";

type Result = { ok: true } | { ok: false; error: "auth" | "not_allowed" | "invalid" | "failed"; detail?: string };

async function session() {
  const supabase = await supabaseServer();
  const { data } = await supabase.auth.getUser();
  return data.user ? { supabase, user: data.user } : null;
}

export async function setStatus(pieceId: string, status: string): Promise<Result> {
  if (!z.uuid().safeParse(pieceId).success || !(STATUSES as readonly string[]).includes(status)) return { ok: false, error: "invalid" };
  const s = await session();
  if (!s) return { ok: false, error: "auth" };
  // Selling records today's price too, for the monthly report.
  const value = status === "sold" ? await soldValue(s.supabase, pieceId) : null;
  const { error } = await s.supabase.rpc("set_piece_status", { p_piece: pieceId, p_status: status, p_sold_value: value });
  if (error) return { ok: false, error: error.code === "42501" ? "not_allowed" : "failed", detail: error.message };
  revalidatePath(`/p/${pieceId}`);
  revalidatePath("/");
  return { ok: true };
}

/** "How did they find it?" for a sold piece (or null to clear it). */
export async function setSoldVia(pieceId: string, via: string | null): Promise<Result> {
  if (!z.uuid().safeParse(pieceId).success || (via !== null && !(SOLD_VIA as readonly string[]).includes(via))) return { ok: false, error: "invalid" };
  const s = await session();
  if (!s) return { ok: false, error: "auth" };
  const { error } = await s.supabase.rpc("set_sold_via", { p_piece: pieceId, p_via: via });
  if (error) return { ok: false, error: error.code === "42501" ? "not_allowed" : "failed", detail: error.message };
  revalidatePath(`/p/${pieceId}`);
  return { ok: true };
}

const num = z.string().trim().max(20);
const desc = z.string().trim().max(600);
const EditInput = z.object({
  id: z.uuid(),
  name: z.string().trim().min(1).max(80),
  category: z.enum(CATEGORIES),
  karat: z.number().refine((k) => (KARATS as readonly number[]).includes(k)),
  gross_g: num,
  stone_g: num,
  making_per_g: num,
  making_flat: num,
  extras_aed: num,
  descriptions: z.object({ en: desc, ar: desc, hi: desc, ml: desc }).partial(),
});

const blank = (s: string) => s.trim() === "";

export async function updatePiece(raw: unknown): Promise<Result> {
  const parsed = EditInput.safeParse(raw);
  if (!parsed.success) return { ok: false, error: "invalid" };
  const f = parsed.data;
  const check = checkPiece(f);
  if (!check.ok) return { ok: false, error: "invalid", detail: check.error };
  const s = await session();
  if (!s) return { ok: false, error: "auth" };

  const descriptions = Object.fromEntries(Object.entries(f.descriptions).filter(([, v]) => v && v.trim()));
  const { data, error } = await s.supabase
    .from("pieces")
    .update({
      name: f.name,
      category: f.category,
      karat: f.karat,
      gross_g: f.gross_g,
      stone_g: blank(f.stone_g) ? "0" : f.stone_g,
      making_per_g: blank(f.making_per_g) ? "0" : f.making_per_g,
      making_flat: blank(f.making_flat) ? null : f.making_flat,
      extras_aed: blank(f.extras_aed) ? "0" : f.extras_aed,
      descriptions,
    })
    .eq("id", f.id)
    .select("id");
  if (error) return { ok: false, error: ["42501", "23514"].includes(error.code ?? "") ? "not_allowed" : "failed", detail: error.message };
  // RLS hides rows the user may not update: no error, but nothing changed.
  if (!data || data.length === 0) return { ok: false, error: "not_allowed" };
  revalidatePath(`/p/${f.id}`);
  revalidatePath("/");
  return { ok: true };
}

/** Deletes the piece and its files. Managers and owners only (RLS on both). */
export async function deletePiece(pieceId: string): Promise<Result> {
  if (!z.uuid().safeParse(pieceId).success) return { ok: false, error: "invalid" };
  const s = await session();
  if (!s) return { ok: false, error: "auth" };
  const media = await s.supabase.from("piece_media").select("storage_path, thumb_path").eq("piece_id", pieceId);
  if (media.error) return { ok: false, error: "failed", detail: media.error.message };

  const del = await s.supabase.from("pieces").delete().eq("id", pieceId).select("id");
  if (del.error) return { ok: false, error: del.error.code === "42501" ? "not_allowed" : "failed", detail: del.error.message };
  if (!del.data || del.data.length === 0) return { ok: false, error: "not_allowed" };

  // The rows are gone (piece_media cascades); now the files. A failure here leaves orphan
  // files only, which a later cleanup can remove; the piece itself is already deleted.
  const paths = (media.data ?? []).flatMap((m) => [m.storage_path, m.thumb_path]).filter((p): p is string => !!p);
  if (paths.length) {
    const rm = await s.supabase.storage.from("media").remove(paths);
    if (rm.error) console.error("[deletePiece] files not removed:", rm.error.message);
  }
  revalidatePath("/");
  return { ok: true };
}
