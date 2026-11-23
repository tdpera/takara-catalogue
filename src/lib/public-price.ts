/**
 * What a customer may see as a piece's price, on share links and shop websites (DECISIONS §3, §25).
 * Every figure comes from the one pricing engine; this only decides what to show.
 *
 * - Sold and reserved pieces show their status, never a price.
 * - The shop's price mode: "live" shows today's price; "from" shows only the gold value
 *   ("From AED ...": the price is never lower, and the making charge stays private); "ask" shows
 *   no prices at all.
 * - The gold rate must be recent: set today, the price is shown plainly; 1-3 days old, it's
 *   labelled indicative; older (or missing), it's hidden ("Ask for today's price"), because
 *   gold can move several percent in a few days.
 * - Never the breakdown: no making charge, rate or VAT lines.
 */
import { D, priceOf, roundWhole, VAT_RATE, type PieceInput, type RateMap } from "./pricing";
import { formatAED } from "./format";
import { rateAgeDays } from "./rates";

export const PRICE_MODES = ["live", "from", "ask"] as const;
export type PriceMode = (typeof PRICE_MODES)[number];
export const INDICATIVE_MAX_DAYS = 3;

export type PublicPrice =
  | { kind: "price"; text: string; from: boolean; indicative: boolean; rateSetAt: string }
  | { kind: "sold" }
  | { kind: "reserved" }
  /** The shop shows no prices on its website. */
  | { kind: "ask" }
  /** The rate is too old or missing: the price is confirmed in store. */
  | { kind: "in_store" };

export type PublicPieceInput = PieceInput & { status: "in_stock" | "reserved" | "sold" };

export function publicPrice(p: PublicPieceInput, rates: RateMap, vatEnabled: boolean, mode: PriceMode, now: Date = new Date()): PublicPrice {
  if (p.status === "sold") return { kind: "sold" };
  if (p.status === "reserved") return { kind: "reserved" };
  if (mode === "ask") return { kind: "ask" };
  const r = priceOf(p, rates, vatEnabled);
  if (!r.ok) return { kind: "in_store" };
  const age = rateAgeDays(r.price.rateSetAt, now);
  if (age > INDICATIVE_MAX_DAYS) return { kind: "in_store" };
  const amount =
    mode === "from"
      ? roundWhole(r.price.goldValue.times(vatEnabled ? new D(1).plus(VAT_RATE) : 1))
      : r.price.totalWhole;
  return { kind: "price", text: formatAED(amount), from: mode === "from", indicative: age > 0, rateSetAt: r.price.rateSetAt };
}

/** The oldest rate behind the prices shown, for the "at the gold rate of ..." line. */
export function oldestShownRate(prices: PublicPrice[]): string | null {
  const times = prices.flatMap((p) => (p.kind === "price" ? [p.rateSetAt] : [])).sort();
  return times[0] ?? null;
}
