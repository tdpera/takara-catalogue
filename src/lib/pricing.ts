/**
 * Pricing engine. Pure functions, used on the phone, on the server and in share links,
 * so every price is computed exactly the same way everywhere.
 *
 *   net_gold_g = gross_g − stone_g                (rejected if stone_g ≥ gross_g)
 *   gold_value = net_gold_g × rate for the piece's karat
 *   making     = making_flat if set, else net_gold_g × making_per_g
 *   base       = gold_value + making + extras_aed
 *   vat        = base × 5% when VAT is on, else 0
 *   total      = base + vat
 *
 * All arithmetic is decimal (never binary floating point). Results keep full precision;
 * only display rounds, half-up, to whole AED (totals) or fils (breakdown lines).
 */
import DecimalLight from "decimal.js-light";

export const D = DecimalLight.clone({ precision: 40, rounding: DecimalLight.ROUND_HALF_UP });
export type Dec = InstanceType<typeof D>;

export const KARATS = [24, 22, 21, 18, 14] as const;
export type Karat = (typeof KARATS)[number];
export const VAT_RATE = new D("0.05");

/** Values come from Postgres (numbers) or form fields (strings). */
export type Numeric = number | string;

export type PieceInput = {
  karat: number;
  gross_g: Numeric;
  stone_g?: Numeric | null;
  making_per_g?: Numeric | null;
  making_flat?: Numeric | null;
  extras_aed?: Numeric | null;
};

export type Rate = { karat: number; aed_per_g: Numeric; set_at: string };
export type RateMap = Partial<Record<Karat, Rate>>;

export type PriceError = "invalid_karat" | "invalid_weight" | "stone_not_less_than_gross" | "invalid_amount" | "no_rate";

export type Price = {
  karat: Karat;
  netGoldG: Dec;
  rate: Dec;
  rateSetAt: string;
  goldValue: Dec;
  makingMode: "per_g" | "flat";
  makingPerG: Dec;
  making: Dec;
  extras: Dec;
  base: Dec;
  vatEnabled: boolean;
  vat: Dec;
  total: Dec;
  /** Total rounded half-up to whole AED, for display. */
  totalWhole: Dec;
};

export type PriceResult = { ok: true; price: Price } | { ok: false; error: PriceError };

// Digits a phone keyboard may produce in Arabic, Persian, Hindi (Devanagari) and Malayalam.
const DIGIT_BLOCKS = [0x0660, 0x06f0, 0x0966, 0x0d66];

/** Converts local-script digits and the Arabic decimal/thousands marks to ASCII. */
export function normalizeDigits(s: string): string {
  return s
    .replace(/[\u0660-\u0669\u06F0-\u06F9\u0966-\u096F\u0D66-\u0D6F]/g, (ch) => {
      const c = ch.charCodeAt(0);
      const base = DIGIT_BLOCKS.find((b) => c >= b && c <= b + 9)!;
      return String(c - base);
    })
    .replace(/\u066B/g, ".") // Arabic decimal separator
    .replace(/[\u066C\u060C]/g, ","); // Arabic thousands separator, Arabic comma
}

/** Parses a number or numeric string. Returns null for blanks, NaN, Infinity and junk like "12abc". */
export function toDec(v: Numeric | null | undefined): Dec | null {
  if (v === null || v === undefined) return null;
  if (typeof v === "number") {
    // String(n) gives the shortest round-trip form, so 0.1 stays "0.1".
    return Number.isFinite(v) ? new D(String(v)) : null;
  }
  const s = normalizeDigits(v).trim().replace(/,/g, "");
  if (!/^[+-]?(\d+\.?\d*|\.\d+)$/.test(s)) return null;
  return new D(s);
}

export function isKarat(k: unknown): k is Karat {
  return typeof k === "number" && (KARATS as readonly number[]).includes(k);
}

type CheckedPiece = { karat: Karat; gross: Dec; stone: Dec; makingPerG: Dec; makingFlat: Dec | null; extras: Dec };

/** Validates a piece's pricing fields. Blank optional fields count as zero / not set. */
export function checkPiece(p: PieceInput): { ok: true; piece: CheckedPiece } | { ok: false; error: PriceError } {
  if (!isKarat(p.karat)) return { ok: false, error: "invalid_karat" };
  const gross = toDec(p.gross_g);
  const stone = p.stone_g === null || p.stone_g === undefined || p.stone_g === "" ? new D(0) : toDec(p.stone_g);
  if (!gross || !stone || !gross.gt(0) || stone.isneg()) return { ok: false, error: "invalid_weight" };
  if (stone.gte(gross)) return { ok: false, error: "stone_not_less_than_gross" };

  const blankZero = (v: Numeric | null | undefined) => (v === null || v === undefined || v === "" ? new D(0) : toDec(v));
  const makingPerG = blankZero(p.making_per_g);
  const extras = blankZero(p.extras_aed);
  const flatSet = !(p.making_flat === null || p.making_flat === undefined || p.making_flat === "");
  const makingFlat = flatSet ? toDec(p.making_flat) : null;
  if (!makingPerG || !extras || makingPerG.isneg() || extras.isneg() || (flatSet && (!makingFlat || makingFlat.isneg()))) {
    return { ok: false, error: "invalid_amount" };
  }
  return { ok: true, piece: { karat: p.karat, gross, stone, makingPerG, makingFlat, extras } };
}

/** Prices a piece from the shop's current rates. */
export function priceOf(p: PieceInput, rates: RateMap, vatEnabled: boolean): PriceResult {
  const checked = checkPiece(p);
  if (!checked.ok) return checked;
  const { karat, gross, stone, makingPerG, makingFlat, extras } = checked.piece;

  const rateRow = rates[karat];
  const rate = rateRow ? toDec(rateRow.aed_per_g) : null;
  if (!rateRow || !rate || !rate.gt(0)) return { ok: false, error: "no_rate" };

  const netGoldG = gross.minus(stone);
  const goldValue = netGoldG.times(rate);
  const making = makingFlat ?? netGoldG.times(makingPerG);
  const base = goldValue.plus(making).plus(extras);
  const vat = vatEnabled ? base.times(VAT_RATE) : new D(0);
  const total = base.plus(vat);

  return {
    ok: true,
    price: {
      karat,
      netGoldG,
      rate,
      rateSetAt: rateRow.set_at,
      goldValue,
      makingMode: makingFlat ? "flat" : "per_g",
      makingPerG,
      making,
      extras,
      base,
      vatEnabled,
      vat,
      total,
      totalWhole: roundWhole(total),
    },
  };
}

/** Half-up to whole AED (4,217.50 → 4,218). */
export function roundWhole(d: Dec): Dec {
  return d.toDecimalPlaces(0, D.ROUND_HALF_UP);
}

/** Builds a RateMap from current_gold_rates rows. */
export function toRateMap(rows: Rate[] | null | undefined): RateMap {
  const map: RateMap = {};
  for (const r of rows ?? []) if (isKarat(r.karat)) map[r.karat] = r;
  return map;
}
