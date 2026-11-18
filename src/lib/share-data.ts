import "server-only";
/**
 * Data for the share composer: the chosen pieces with today's prices (worked out here, never
 * taken from the browser), and the salesperson's own clients.
 */
import { supabaseServer } from "./supabase/server";
import { getShopPricing } from "./shop-data";
import { priceOf, type Karat } from "./pricing";
import { formatAED, formatGrams } from "./format";
import { sign } from "./catalogue";
import type { ShareLine } from "./share-message";
import type { Status } from "./catalogue-filters";

export type ShareItem = ShareLine & {
  id: string;
  sku: string;
  category: string;
  status: Status;
  thumb: string | null;
  photo: string | null;
};

export type ClientRow = { id: string; name: string; phone: string | null; language: "en" | "ar" | "hi" | "ml"; preferences: string | null };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function parseIds(raw: string | string[] | undefined): string[] {
  const s = Array.isArray(raw) ? raw.join(",") : (raw ?? "");
  return [...new Set(s.split(",").map((x) => x.trim()).filter((x) => UUID.test(x)))].slice(0, 24);
}

/** Pieces in the order given. Pieces that don't exist or belong to another shop are left out. */
export async function loadShareItems(shopId: string, ids: string[], withPhotos = true): Promise<ShareItem[]> {
  if (ids.length === 0) return [];
  const supabase = await supabaseServer();
  const { data, error } = await supabase
    .from("pieces")
    .select("id, sku, name, category, karat, gross_g, stone_g, making_per_g, making_flat, extras_aed, status, piece_media(type, storage_path, thumb_path)")
    .eq("shop_id", shopId)
    .in("id", ids)
    .returns<
      {
        id: string; sku: string; name: string; category: string; karat: Karat; gross_g: number; stone_g: number;
        making_per_g: number; making_flat: number | null; extras_aed: number; status: Status;
        piece_media: { type: string; storage_path: string; thumb_path: string | null }[];
      }[]
    >();
  if (error) throw error;
  const { rates, vatEnabled } = await getShopPricing(shopId);
  const photoOf = (p: (typeof data)[number]) => p.piece_media.find((m) => m.type === "photo");
  const urls = withPhotos ? await sign((data ?? []).flatMap((p) => [photoOf(p)?.thumb_path, photoOf(p)?.storage_path])) : new Map<string, string>();
  const byId = new Map((data ?? []).map((p) => [p.id, p]));
  return ids.flatMap((id) => {
    const p = byId.get(id);
    if (!p) return [];
    const pr = priceOf(p, rates, vatEnabled);
    const m = photoOf(p);
    return [{
      id: p.id,
      sku: p.sku,
      name: p.name,
      category: p.category,
      karat: p.karat,
      weight: formatGrams(p.gross_g),
      price: pr.ok ? formatAED(pr.price.totalWhole) : null,
      status: p.status,
      thumb: (m?.thumb_path && urls.get(m.thumb_path)) || null,
      photo: (m?.storage_path && urls.get(m.storage_path)) || null,
    }];
  });
}

export async function loadClients(shopId: string): Promise<ClientRow[]> {
  const supabase = await supabaseServer();
  const { data, error } = await supabase
    .from("clients")
    .select("id, name, phone, language, preferences")
    .eq("shop_id", shopId)
    .order("name")
    .returns<ClientRow[]>();
  if (error) throw error;
  return data ?? [];
}
