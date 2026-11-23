import "server-only";
/**
 * Reads for the catalogue grid and the piece page. Everything goes through the user's own
 * Supabase session, so RLS decides what's visible; prices are worked out here from the shop's
 * current rates, so every page shows today's price.
 */
import { supabaseServer } from "./supabase/server";
import { getShopPricing } from "./shop-data";
import { priceOf, type Karat } from "./pricing";
import { formatAED } from "./format";
import type { Filters, Status } from "./catalogue-filters";
import type { Category, Descriptions } from "./ai/shared";

/** Signed image URLs last 6 hours. The service worker caches the files by path, so a new
 * signature doesn't mean a new download (see public/sw.js). */
const URL_TTL_S = 6 * 3600;

type MediaRow = {
  id: string;
  type: "photo" | "spin_sprite" | "spin_video";
  storage_path: string;
  thumb_path: string | null;
  frames: number | null;
  cols: number | null;
  bytes: number | null;
};
type PieceRow = {
  id: string;
  sku: string;
  name: string;
  category: Category;
  karat: Karat;
  gross_g: number;
  stone_g: number;
  making_per_g: number;
  making_flat: number | null;
  extras_aed: number;
  status: Status;
  on_website: boolean;
  sold_via: "walk_in" | "website" | "tray" | "whatsapp_link" | "returning_client" | null;
  descriptions: Descriptions;
  created_by: string | null;
  created_at: string;
  piece_media: MediaRow[];
};

export type Spin = { src: string; frames: number; cols: number };
export type Card = {
  id: string;
  sku: string;
  name: string;
  category: Category;
  karat: Karat;
  gross_g: number;
  status: Status;
  onWebsite: boolean;
  price: string | null;
  photo: string | null;
  spin: Spin | null;
};

export async function sign(paths: (string | null | undefined)[]) {
  const list = [...new Set(paths.filter((p): p is string => !!p))];
  if (list.length === 0) return new Map<string, string>();
  const supabase = await supabaseServer();
  const { data, error } = await supabase.storage.from("media").createSignedUrls(list, URL_TTL_S);
  if (error) throw error;
  return new Map((data ?? []).filter((d) => d.signedUrl && d.path).map((d) => [d.path!, d.signedUrl]));
}

const photoOf = (m: MediaRow[]) => m.find((x) => x.type === "photo");
const spinOf = (m: MediaRow[]) => m.find((x) => x.type === "spin_sprite" && x.frames && x.cols);

export async function listCards(shopId: string, f: Filters): Promise<{ cards: Card[]; total: number }> {
  const supabase = await supabaseServer();
  let query = supabase
    .from("pieces")
    .select(
      "id, sku, name, category, karat, gross_g, stone_g, making_per_g, making_flat, extras_aed, status, on_website, piece_media(id, type, storage_path, thumb_path, frames, cols)",
      { count: "exact" },
    )
    .eq("shop_id", shopId);
  if (f.q) query = query.or(`name.ilike."*${f.q}*",sku.ilike."*${f.q}*"`);
  if (f.category) query = query.eq("category", f.category);
  if (f.karat) query = query.eq("karat", f.karat);
  if (f.status) query = query.eq("status", f.status);
  const { data, count, error } = await query
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(f.n)
    .returns<PieceRow[]>();
  if (error) throw error;
  const rows = data ?? [];

  const [{ rates, vatEnabled }, urls] = await Promise.all([
    getShopPricing(shopId),
    sign(rows.flatMap((p) => [photoOf(p.piece_media)?.thumb_path, spinOf(p.piece_media)?.thumb_path])),
  ]);
  const cards = rows.map((p): Card => {
    const pr = priceOf(p, rates, vatEnabled);
    const photo = photoOf(p.piece_media);
    const spin = spinOf(p.piece_media);
    const spinSrc = spin?.thumb_path ? urls.get(spin.thumb_path) : undefined;
    return {
      id: p.id,
      sku: p.sku,
      name: p.name,
      category: p.category,
      karat: p.karat,
      gross_g: p.gross_g,
      status: p.status,
      onWebsite: p.on_website,
      price: pr.ok ? formatAED(pr.price.totalWhole) : null,
      photo: (photo?.thumb_path && urls.get(photo.thumb_path)) || null,
      spin: spin && spinSrc ? { src: spinSrc, frames: spin.frames!, cols: spin.cols! } : null,
    };
  });
  return { cards, total: count ?? cards.length };
}

export type PieceDetail = Omit<PieceRow, "piece_media"> & {
  shop_id: string;
  photo: { full: string; thumb: string | null; path: string } | null;
  spin: Spin | null;
  hasVideo: boolean;
};

/** One piece for the detail and edit pages, or null if it doesn't exist or isn't visible. */
export async function getPiece(id: string): Promise<PieceDetail | null> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const supabase = await supabaseServer();
  const { data, error } = await supabase
    .from("pieces")
    .select(
      "id, sku, name, category, karat, gross_g, stone_g, making_per_g, making_flat, extras_aed, status, on_website, sold_via, descriptions, created_by, created_at, shop_id, piece_media(id, type, storage_path, thumb_path, frames, cols, bytes)",
    )
    .eq("id", id)
    .maybeSingle<PieceRow & { shop_id: string }>();
  if (error) throw error;
  if (!data) return null;
  const photo = photoOf(data.piece_media);
  const spin = spinOf(data.piece_media);
  const urls = await sign([photo?.storage_path, photo?.thumb_path, spin?.storage_path]);
  const { piece_media, ...rest } = data;
  return {
    ...rest,
    photo: photo && urls.get(photo.storage_path) ? { full: urls.get(photo.storage_path)!, thumb: (photo.thumb_path && urls.get(photo.thumb_path)) || null, path: photo.storage_path } : null,
    spin: spin && urls.get(spin.storage_path) ? { src: urls.get(spin.storage_path)!, frames: spin.frames!, cols: spin.cols! } : null,
    hasVideo: piece_media.some((m) => m.type === "spin_video"),
  };
}
