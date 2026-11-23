import "server-only";
/**
 * Selling: today's price of a piece at the moment it's sold, for the monthly report. Worked out
 * on the server with the shop's rates, by the same engine as every screen.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { getShopPricing } from "./shop-data";
import { priceOf, type PieceInput } from "./pricing";

export const SOLD_VIA = ["walk_in", "website", "tray", "whatsapp_link", "returning_client"] as const;
export type SoldVia = (typeof SOLD_VIA)[number];

export async function soldValue(supabase: SupabaseClient, pieceId: string): Promise<string | null> {
  const { data: piece } = await supabase
    .from("pieces")
    .select("shop_id, karat, gross_g, stone_g, making_per_g, making_flat, extras_aed")
    .eq("id", pieceId)
    .maybeSingle<PieceInput & { shop_id: string }>();
  if (!piece) return null;
  const { rates, vatEnabled } = await getShopPricing(piece.shop_id);
  const pr = priceOf(piece, rates, vatEnabled);
  return pr.ok ? pr.price.totalWhole.toFixed(0) : null;
}

/**
 * A suggestion for "How did they find it?": the piece was in a tray staff opened in the last
 * two weeks, or in one of this salesperson's share links that the client opened.
 */
export async function suggestSoldVia(supabase: SupabaseClient, pieceId: string): Promise<SoldVia | null> {
  const since = new Date(Date.now() - 14 * 86400 * 1000).toISOString();
  const { data: trays } = await supabase.from("site_trays").select("id").contains("piece_ids", [pieceId]).gte("created_at", since).limit(1);
  if (trays?.length) return "tray";
  const { data: shares } = await supabase.from("shares").select("id, share_views(id)").contains("piece_ids", [pieceId]).gte("created_at", since).limit(10);
  if ((shares ?? []).some((s: { share_views: unknown[] }) => s.share_views.length > 0)) return "whatsapp_link";
  return null;
}
