/** Shapes returned by shop_report() / admin_*() (see the migration), and small helpers. */
import type { TokenUse } from "./ai-cost";

export const SOURCES = ["walk_in", "website", "tray", "whatsapp_link", "returning_client", "unknown"] as const;
export type Source = (typeof SOURCES)[number];

export type Stats = {
  site_visitors: number; piece_views: number;
  trays: number; trays_whatsapp: number; trays_in_store: number; trays_opened: number;
  shares: number; shares_opened: number;
  sold: number; sold_value: number; sold_by: Partial<Record<Source, { count: number; value: number }>>;
  pieces_added: number; spins_added: number; ai_fills: number; ai_messages: number; ai_tokens: TokenUse; rate_days: number;
};
export type ShopReport = {
  month: string; current: Stats; previous: Stats;
  top_pieces: { id: string; name: string; sku: string; views: number }[];
  in_stock: number; with_spin: number; site: { slug: string; published: boolean } | null;
};

/** "2026-11-01" from ?m=2026-11, or null for this month. Not before 2024, not in the future. */
export function parseMonth(raw: string | undefined, now = new Date()): string | null {
  if (!raw || !/^\d{4}-(0[1-9]|1[0-2])$/.test(raw)) return null;
  const thisMonth = now.toISOString().slice(0, 7);
  if (raw > thisMonth || raw < "2024-01") return null;
  return `${raw}-01`;
}

/** "2026-11-01" moved by some months, as "2026-10". */
export function shiftMonth(month: string, by: number): string {
  const [y, m] = month.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1 + by, 1)).toISOString().slice(0, 7);
}

/** Change against last month, for the small arrow next to each figure. */
export function delta(cur: number, prev: number): { dir: "up" | "down" | "same"; n: number } {
  const n = Math.round((cur - prev) * 100) / 100;
  return { dir: n > 0 ? "up" : n < 0 ? "down" : "same", n: Math.abs(n) };
}
