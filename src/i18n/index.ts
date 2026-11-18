import en, { type Messages } from "./messages/en";
import ar from "./messages/ar";
import hi from "./messages/hi";
import ml from "./messages/ml";

export const LOCALES = ["en", "ar", "hi", "ml"] as const;
export type Locale = (typeof LOCALES)[number];
export const DEFAULT_LOCALE: Locale = "en";
export const LOCALE_COOKIE = "lang";

/** Names shown in the language picker, each in its own script. */
export const LOCALE_NAMES: Record<Locale, string> = { en: "English", ar: "العربية", hi: "हिन्दी", ml: "മലയാളം" };

const CATALOG: Record<Locale, Messages> = { en, ar, hi, ml };

export function isLocale(v: unknown): v is Locale {
  return typeof v === "string" && (LOCALES as readonly string[]).includes(v);
}

export function dirFor(locale: Locale): "rtl" | "ltr" {
  return locale === "ar" ? "rtl" : "ltr";
}

export function messagesFor(locale: Locale): Messages {
  return CATALOG[locale];
}

type Leaves<T, P extends string = ""> = {
  [K in keyof T & string]: T[K] extends string ? `${P}${K}` : Leaves<T[K], `${P}${K}.`>;
}[keyof T & string];
export type MessageKey = Leaves<Messages>;
export type Vars = Record<string, string | number>;
export type Translate = (key: MessageKey, vars?: Vars) => string;

/** Looks up a dotted key and fills {placeholders}. Falls back to English, then to the key. */
export function makeT(locale: Locale): Translate {
  const pick = (m: Messages, key: string) =>
    key.split(".").reduce<unknown>((o, k) => (o as Record<string, unknown> | undefined)?.[k], m);
  return (key, vars) => {
    const raw = pick(CATALOG[locale], key) ?? pick(en, key) ?? key;
    const s = String(raw);
    return vars ? s.replace(/\{(\w+)\}/g, (m, k) => (k in vars ? String(vars[k]) : m)) : s;
  };
}
