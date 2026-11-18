/**
 * Display formatting. Numbers always use Western digits (0-9), the norm for prices
 * and weights in UAE trade, in every interface language.
 */
import { D, toDec, type Dec, type Numeric } from "./pricing";
import { SHOP_TZ } from "./rates";
import type { Locale } from "@/i18n";

function group(intPart: string): string {
  return intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

/** Exact decimal to "4,217.63" (or "4,218" with dp 0), rounded half-up. No float conversion. */
export function formatNumber(v: Dec | Numeric, dp: number): string {
  const d = typeof v === "object" ? v : toDec(v);
  if (!d) return "—";
  const fixed = d.toFixed(dp, D.ROUND_HALF_UP);
  const neg = fixed.startsWith("-") && !/^-0(\.0+)?$/.test(fixed);
  const [i, f] = fixed.replace(/^-/, "").split(".");
  return (neg ? "-" : "") + group(i) + (f ? "." + f : "");
}

/** "AED 4,218" for totals, "AED 4,217.63" for breakdown lines. */
export function formatAED(v: Dec | Numeric, dp: 0 | 2 = 0): string {
  return "AED " + formatNumber(v, dp);
}

/** Weights: at least 2 decimals, up to 3 when the scale gave them ("24.50 g", "1.235 g"). */
export function formatGrams(v: Dec | Numeric): string {
  const d = typeof v === "object" ? v : toDec(v);
  if (!d) return "—";
  return formatNumber(d, Math.min(3, Math.max(2, d.dp()))) + " g";
}

/** Rates per gram: 2 decimals, up to 4 if entered ("437.50", "437.3933"). */
export function formatRate(v: Dec | Numeric): string {
  const d = typeof v === "object" ? v : toDec(v);
  if (!d) return "—";
  return formatNumber(d, Math.min(4, Math.max(2, d.dp())));
}

const INTL_LOCALE: Record<Locale, string> = { en: "en-AE", ar: "ar-AE", hi: "hi-IN", ml: "ml-IN" };

/** Date and time in Dubai, e.g. "18 Nov, 10:05". */
export function formatDubaiDateTime(iso: string, locale: Locale): string {
  return new Intl.DateTimeFormat(INTL_LOCALE[locale], {
    timeZone: SHOP_TZ,
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    numberingSystem: "latn",
  }).format(new Date(iso));
}

export function formatDubaiTime(iso: string, locale: Locale): string {
  return new Intl.DateTimeFormat(INTL_LOCALE[locale], {
    timeZone: SHOP_TZ,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    numberingSystem: "latn",
  }).format(new Date(iso));
}
