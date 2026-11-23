import "server-only";
/**
 * Reads for shop websites. Everything goes through the website database functions (server
 * only), and is turned here into what a page may show: prices are worked out with the shop's
 * price mode and the freshness rules, and making charges are dropped before anything reaches a
 * component, so they can't end up in the page or its data.
 */
import { cache } from "react";
import { cookies, headers } from "next/headers";
import { siteDb } from "./supabase/admin";
import { toRateMap, type Karat, type Rate } from "./pricing";
import { publicPrice, type PriceMode, type PublicPrice } from "./public-price";
import { cleanQuery } from "./catalogue-filters";
import { CATEGORIES, type Category, type Descriptions } from "./ai/shared";
import { isLocale, type Locale } from "@/i18n";
import { isValidSlug } from "./site-host";

export const SITE_PAGE = 24;
export const TRAY_MAX = 24;
export const SITE_LANG_COOKIE = "site_lang";

type RawMedia = { path: string; thumb?: string | null; small?: string | null; frames?: number; cols?: number } | null;
type RawPiece = {
  id: string; sku: string; name: string; category: Category; karat: Karat; gross_g: number; stone_g: number;
  making_per_g: number; making_flat: number | null; extras_aed: number; status: "in_stock" | "reserved" | "sold";
  created_at: string; updated_at: string; descriptions: Descriptions | null;
  photo: RawMedia; spin: RawMedia;
};
type RawSite = {
  shop_id: string; slug: string; name: string; logo: string | null; price_mode: PriceMode; vat_enabled: boolean;
  whatsapp: string | null; address: string | null; maps_url: string | null; hours: string | null; instagram: string | null;
  about: Partial<Record<Locale, string>>; updated_at: string; rates: Rate[]; categories: Partial<Record<Category, number>>; total: number;
};

export type Site = Omit<RawSite, "rates" | "shop_id" | "logo"> & { logo: string | null; rates: ReturnType<typeof toRateMap>; rateRows: Rate[] };
export type SiteSpin = { src: string; small: string | null; frames: number; cols: number };
export type SiteCard = {
  id: string; sku: string; name: string; category: Category; karat: Karat; gross_g: number;
  status: RawPiece["status"]; price: PublicPrice; photo: string | null; spin: SiteSpin | null;
};
export type SitePiece = SiteCard & { photoFull: string | null; descriptions: Descriptions; related: SiteCard[] };

/** Images go through /site-img, which checks each file belongs to the website before serving it. */
export const siteImg = (slug: string, path: string | null | undefined) => (path ? `/site-img/${slug}/${path}` : null);

/** Where links on a website point: "" on the shop's own address, /site/<slug> otherwise. */
export async function siteContext(slug: string) {
  const h = await headers();
  const onOwnHost = h.get("x-site-host") === slug;
  const lang = h.get("x-site-lang");
  return { base: onOwnHost ? "" : `/site/${slug}`, locale: (isLocale(lang) ? lang : "en") as Locale, onOwnHost, path: h.get("x-site-path") ?? "/" };
}

export const getSite = cache(async (slug: string): Promise<Site | null> => {
  if (!isValidSlug(slug)) return null;
  const raw = await siteDb().rpc<RawSite>("get_site", { p_slug: slug });
  if (!raw) return null;
  const { rates, shop_id: _shop, logo, ...rest } = raw;
  void _shop;
  return { ...rest, logo: siteImg(slug, logo), rates: toRateMap(rates), rateRows: rates };
});

function toCard(slug: string, site: Site, p: RawPiece, now: Date): SiteCard {
  return {
    id: p.id,
    sku: p.sku,
    name: p.name,
    category: p.category,
    karat: p.karat,
    gross_g: p.gross_g,
    status: p.status,
    price: publicPrice(p, site.rates, site.vat_enabled, site.price_mode, now),
    photo: siteImg(slug, p.photo?.thumb ?? p.photo?.path),
    spin: p.spin?.frames && p.spin.cols
      ? { src: siteImg(slug, p.spin.path)!, small: siteImg(slug, p.spin.small), frames: p.spin.frames, cols: p.spin.cols }
      : null,
  };
}

// ------------------------------------------------------------------ catalogue filters (in the URL)

export const WEIGHT_BANDS = { u10: [null, 10], "10-25": [10, 25], "25-50": [25, 50], "50p": [50, null] } as const;
export type WeightBand = keyof typeof WEIGHT_BANDS;
export const SITE_SORTS = ["newest", "heavy", "light"] as const;
export type SiteSort = (typeof SITE_SORTS)[number];
export type SiteFilters = { q: string; category: Category | null; karat: Karat | null; w: WeightBand | null; sort: SiteSort; n: number };

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";

export function parseSiteFilters(sp: Record<string, string | string[] | undefined>): SiteFilters {
  const category = one(sp.category);
  const karat = Number(one(sp.karat));
  const w = one(sp.w);
  const sort = one(sp.sort);
  const n = Number(one(sp.n));
  return {
    q: cleanQuery(one(sp.q)),
    category: (CATEGORIES as readonly string[]).includes(category) ? (category as Category) : null,
    karat: [24, 22, 21, 18, 14].includes(karat) ? (karat as Karat) : null,
    w: w in WEIGHT_BANDS ? (w as WeightBand) : null,
    sort: (SITE_SORTS as readonly string[]).includes(sort) ? (sort as SiteSort) : "newest",
    n: Number.isInteger(n) && n > SITE_PAGE ? Math.min(480, Math.ceil(n / SITE_PAGE) * SITE_PAGE) : SITE_PAGE,
  };
}

/** The collection page's URL with some filters changed. Defaults are left out. */
export function siteFilterHref(base: string, f: SiteFilters, change: Partial<SiteFilters>): string {
  const next = { ...f, ...change };
  if (!("n" in change)) next.n = SITE_PAGE;
  const sp = new URLSearchParams();
  if (next.q) sp.set("q", next.q);
  if (next.category) sp.set("category", next.category);
  if (next.karat) sp.set("karat", String(next.karat));
  if (next.w) sp.set("w", next.w);
  if (next.sort !== "newest") sp.set("sort", next.sort);
  if (next.n > SITE_PAGE) sp.set("n", String(next.n));
  const s = sp.toString();
  return `${base}/collection${s ? `?${s}` : ""}`;
}

export async function listSiteCards(slug: string, f: SiteFilters, limit = f.n): Promise<{ cards: SiteCard[]; total: number }> {
  const site = await getSite(slug);
  if (!site) return { cards: [], total: 0 };
  const [wmin, wmax] = f.w ? WEIGHT_BANDS[f.w] : [null, null];
  const raw = await siteDb().rpc<{ total: number; pieces: RawPiece[] }>("list_site_pieces", {
    p_slug: slug,
    p_category: f.category,
    p_karat: f.karat,
    p_wmin: wmin,
    p_wmax: wmax,
    p_q: f.q || null,
    p_sort: f.sort === "heavy" ? "weight_desc" : f.sort === "light" ? "weight_asc" : "newest",
    p_limit: limit,
    p_offset: 0,
  });
  const now = new Date();
  return { cards: (raw?.pieces ?? []).map((p) => toCard(slug, site, p, now)), total: raw?.total ?? 0 };
}

export async function getSitePiece(slug: string, sku: string): Promise<SitePiece | null> {
  if (!/^[A-Z0-9]{1,6}-\d{1,9}$/.test(sku)) return null;
  const site = await getSite(slug);
  if (!site) return null;
  const raw = await siteDb().rpc<RawPiece & { related: RawPiece[] }>("get_site_piece", { p_slug: slug, p_sku: sku });
  if (!raw) return null;
  const now = new Date();
  return {
    ...toCard(slug, site, raw, now),
    photoFull: siteImg(slug, raw.photo?.path),
    descriptions: raw.descriptions ?? {},
    related: raw.related.map((p) => toCard(slug, site, p, now)),
  };
}

export const TRAY_CODE_RE = /^[A-HJKMNP-Z2-9]{6}$/;

export async function getTrayView(slug: string, code: string): Promise<{ code: string; created_at: string; cards: SiteCard[] } | null> {
  const c = code.toUpperCase();
  if (!TRAY_CODE_RE.test(c)) return null;
  const site = await getSite(slug);
  if (!site) return null;
  const raw = await siteDb().rpc<{ code: string; created_at: string; pieces: RawPiece[] }>("get_tray", { p_slug: slug, p_code: c });
  if (!raw) return null;
  const now = new Date();
  return { code: raw.code, created_at: raw.created_at, cards: raw.pieces.map((p) => toCard(slug, site, p, now)) };
}

// ------------------------------------------------------------------ the tray (a cookie per website)

export const trayCookie = (slug: string) => `tray_${slug.replace(/-/g, "_")}`;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function parseTray(raw: string | undefined): string[] {
  return [...new Set((raw ?? "").split(/[.,]/).filter((x) => UUID.test(x)))].slice(0, TRAY_MAX);
}

/** Pieces in the visitor's tray, in the order they were added, still on the website. */
export async function trayCards(slug: string): Promise<SiteCard[]> {
  const ids = parseTray((await cookies()).get(trayCookie(slug))?.value);
  if (ids.length === 0) return [];
  const site = await getSite(slug);
  if (!site) return [];
  const raw = await siteDb().rpc<RawPiece[]>("site_pieces", { p_slug: slug, p_ids: ids });
  const now = new Date();
  return (raw ?? []).map((p) => toCard(slug, site, p, now));
}
