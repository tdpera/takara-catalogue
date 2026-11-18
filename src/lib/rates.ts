/**
 * Gold rate helpers: deriving karats from 24K, deciding whether rates are today's,
 * and validating a new set of rates before it is saved.
 */
import { D, KARATS, toDec, type Dec, type Karat, type Numeric, type RateMap } from "./pricing";

/** Ratio of each karat's board rate to 24K, from the brief (Dubai Jewellery Group board). */
export const DERIVE_RATIOS: Record<22 | 21 | 18, string> = { 22: "0.9257", 21: "0.8877", 18: "0.7612" };

/** "Today" means the calendar day in Dubai, whatever the phone's or server's time zone. */
export const SHOP_TZ = "Asia/Dubai";

/** Fills 22K, 21K and 18K from a 24K rate, rounded half-up to fils. 14K is never derived. */
export function deriveFrom24(rate24: Numeric): Record<22 | 21 | 18, string> | null {
  const r = toDec(rate24);
  if (!r || !r.gt(0)) return null;
  const out = {} as Record<22 | 21 | 18, string>;
  for (const k of [22, 21, 18] as const) out[k] = r.times(DERIVE_RATIOS[k]).toFixed(2, D.ROUND_HALF_UP);
  return out;
}

const dayFmt = new Intl.DateTimeFormat("en-CA", { timeZone: SHOP_TZ, year: "numeric", month: "2-digit", day: "2-digit" });

/** Calendar date in Dubai as YYYY-MM-DD. */
export function dubaiDay(t: string | Date): string {
  return dayFmt.format(typeof t === "string" ? new Date(t) : t);
}

/** Whole calendar days between when a rate was set and now, in Dubai (0 = set today). */
export function rateAgeDays(setAt: string, now: Date = new Date()): number {
  const a = Date.parse(dubaiDay(setAt) + "T00:00:00Z");
  const b = Date.parse(dubaiDay(now) + "T00:00:00Z");
  return Math.round((b - a) / 86_400_000);
}

export function isRateToday(setAt: string, now: Date = new Date()): boolean {
  return dubaiDay(setAt) === dubaiDay(now);
}

export type RatesStatus =
  | { state: "missing" }
  | { state: "stale"; oldestSetAt: string; staleKarats: Karat[] }
  | { state: "today"; oldestSetAt: string };

/** Shop-wide status: "today" only if every karat that has a rate was set today. */
export function ratesStatus(rates: RateMap, now: Date = new Date()): RatesStatus {
  const present = KARATS.filter((k) => rates[k]);
  if (present.length === 0) return { state: "missing" };
  const oldestSetAt = present.map((k) => rates[k]!.set_at).sort()[0];
  const staleKarats = present.filter((k) => !isRateToday(rates[k]!.set_at, now));
  return staleKarats.length ? { state: "stale", oldestSetAt, staleKarats } : { state: "today", oldestSetAt };
}

export type RateFieldError = "invalid" | "order";
export type RateSetCheck =
  | { ok: true; values: Partial<Record<Karat, Dec>> }
  | { ok: false; errors: Partial<Record<Karat, RateFieldError>>; empty?: boolean };

const MAX_RATE = new D(100_000);

/**
 * Validates rates typed into the form. Blank fields are skipped (that karat isn't saved).
 * Each value must be positive, below 100,000 and have at most 4 decimals, and purer gold
 * must cost more per gram (24K > 22K > 21K > 18K > 14K). That catches most typos.
 */
export function checkRateSet(input: Partial<Record<Karat, string>>): RateSetCheck {
  const values: Partial<Record<Karat, Dec>> = {};
  const errors: Partial<Record<Karat, RateFieldError>> = {};
  for (const k of KARATS) {
    const raw = input[k]?.trim();
    if (!raw) continue;
    const d = toDec(raw);
    if (!d || !d.gt(0) || d.gte(MAX_RATE) || d.dp() > 4) errors[k] = "invalid";
    else values[k] = d;
  }
  const filled = KARATS.filter((k) => values[k]);
  for (let i = 1; i < filled.length; i++) {
    const purer = filled[i - 1], k = filled[i];
    if (!values[purer]!.gt(values[k]!)) errors[k] = "order";
  }
  if (Object.keys(errors).length) return { ok: false, errors };
  if (filled.length === 0) return { ok: false, errors: {}, empty: true };
  return { ok: true, values };
}

/** Karats whose new rate moves more than `threshold` (default 10%) from the current one; likely typos. */
export function bigChanges(next: Partial<Record<Karat, Dec>>, current: RateMap, threshold = "0.10") {
  const out: { karat: Karat; from: Dec; to: Dec; pct: Dec }[] = [];
  for (const k of KARATS) {
    const to = next[k];
    const from = current[k] ? toDec(current[k]!.aed_per_g) : null;
    if (!to || !from || !from.gt(0)) continue;
    const pct = to.minus(from).abs().div(from);
    if (pct.gt(threshold)) out.push({ karat: k, from, to, pct });
  }
  return out;
}
