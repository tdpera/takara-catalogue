/**
 * Catalogue filters live in the URL (?q=&category=&karat=&status=&n=), so they survive reloads,
 * the back button and sharing a link with a colleague. Parsing is strict: anything unexpected
 * is ignored rather than passed to the database.
 */
import { KARATS, type Karat } from "@/lib/pricing";
import { CATEGORIES, type Category } from "@/lib/ai/shared";

export const STATUSES = ["in_stock", "reserved", "sold"] as const;
export type Status = (typeof STATUSES)[number];
export const PAGE = 24;
export const MAX_SHOWN = 480;

export type Filters = { q: string; category: Category | null; karat: Karat | null; status: Status | null; n: number };

type Params = Record<string, string | string[] | undefined>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";

/**
 * Search text: letters (any script), digits, spaces and hyphens only, at most 60 characters.
 * That keeps it safe inside a PostgREST filter, where , ( ) * % _ and \ have meanings.
 */
export function cleanQuery(raw: string): string {
  return raw
    .normalize("NFC")
    .replace(/[^\p{L}\p{M}\p{N}\s-]/gu, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 60)
    .trim();
}

export function parseFilters(sp: Params): Filters {
  const category = one(sp.category);
  const karat = Number(one(sp.karat));
  const status = one(sp.status);
  const n = Number(one(sp.n));
  return {
    q: cleanQuery(one(sp.q)),
    category: (CATEGORIES as readonly string[]).includes(category) ? (category as Category) : null,
    karat: (KARATS as readonly number[]).includes(karat) ? (karat as Karat) : null,
    status: (STATUSES as readonly string[]).includes(status) ? (status as Status) : null,
    n: Number.isInteger(n) && n > PAGE ? Math.min(MAX_SHOWN, Math.ceil(n / PAGE) * PAGE) : PAGE,
  };
}

/** Builds the URL for the catalogue with some filters changed. Defaults are left out. */
export function filterHref(f: Filters, change: Partial<Filters>): string {
  const next = { ...f, ...change };
  // Changing what's shown starts again from the first page.
  if (!("n" in change)) next.n = PAGE;
  const sp = new URLSearchParams();
  if (next.q) sp.set("q", next.q);
  if (next.category) sp.set("category", next.category);
  if (next.karat) sp.set("karat", String(next.karat));
  if (next.status) sp.set("status", next.status);
  if (next.n > PAGE) sp.set("n", String(next.n));
  const s = sp.toString();
  return s ? `/?${s}` : "/";
}

export const hasFilters = (f: Filters) => !!(f.q || f.category || f.karat || f.status);
