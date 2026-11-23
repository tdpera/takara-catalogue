import "server-only";
/**
 * Digital trays the signed-in salesperson sent (share links), newest first, with when each was
 * opened. RLS shows each salesperson only their own.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { ShareRow } from "@/app/shares/SharesList";
import { appOrigin } from "./site-origin";

type Row = {
  id: string; public_token: string; piece_ids: string[]; expires_at: string; revoked_at: string | null; created_at: string;
  client: { name: string; phone: string | null } | null; share_views: { viewed_at: string }[];
};

export async function loadSentTrays(supabase: SupabaseClient, shopId: string, limit = 100): Promise<ShareRow[]> {
  const { data, error } = await supabase
    .from("shares")
    .select("id, public_token, piece_ids, expires_at, revoked_at, created_at, client:clients(name, phone), share_views(viewed_at)")
    .eq("shop_id", shopId)
    .order("created_at", { ascending: false })
    .limit(limit)
    .returns<Row[]>();
  if (error) throw error;
  const base = await appOrigin();
  return (data ?? []).map((s) => {
    const views = s.share_views.map((v) => v.viewed_at).sort();
    return {
      id: s.id,
      url: `${base}/s/${s.public_token}`,
      pieces: s.piece_ids.length,
      client: s.client?.name ?? null,
      createdAt: s.created_at,
      expiresAt: s.expires_at,
      state: s.revoked_at ? "revoked" : new Date(s.expires_at) <= new Date() ? "expired" : "active",
      views: views.length,
      lastView: views.at(-1) ?? null,
    };
  });
}
