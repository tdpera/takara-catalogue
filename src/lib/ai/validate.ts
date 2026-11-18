/**
 * The contract for AI fill: the JSON schema Claude must answer in, and the server-side checks
 * that decide which suggestions reach the form. Pure (no server or browser APIs) so it is unit-tested.
 *
 * The rules come from the brief:
 *   - name: at most 6 words, no karat
 *   - karat: only when a stamp, tag or label is readable
 *   - weight: only the number on the scale display, never estimated from appearance
 *   - descriptions: 1-2 sentences in en, ar, hi, ml, without invented stones or weights
 * Anything that fails a check is dropped (left for the salesperson to type), never "fixed up".
 */
import { z } from "zod";
import { KARATS, normalizeDigits, type Karat } from "@/lib/pricing";
import { CATEGORIES, DESC_LANGS, type DescLang, type Descriptions, type AiSuggestions } from "./shared";

export { CATEGORIES, DESC_LANGS, type Category, type DescLang, type Descriptions, type AiSuggestions } from "./shared";


export const PHOTO_PROBLEMS = ["no_jewellery", "too_blurry", "too_dark"] as const;

/** JSON schema sent as output_config.format, so the reply is always parseable JSON of this shape. */
export const AI_FILL_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["photo", "name", "category", "karat_text", "karat", "scale_text", "weight_g", "descriptions"],
  properties: {
    photo: { type: "string", enum: ["ok", ...PHOTO_PROBLEMS] },
    name: { type: "string" },
    category: { type: "string", enum: [...CATEGORIES] },
    karat_text: { type: "string" },
    karat: { anyOf: [{ type: "integer", enum: [...KARATS] }, { type: "null" }] },
    scale_text: { type: "string" },
    weight_g: { anyOf: [{ type: "number" }, { type: "null" }] },
    descriptions: {
      type: "object",
      additionalProperties: false,
      required: [...DESC_LANGS],
      properties: { en: { type: "string" }, ar: { type: "string" }, hi: { type: "string" }, ml: { type: "string" } },
    },
  },
} as const;

/** Shape check of the parsed reply. Content checks follow in checkAiReply. */
const Reply = z.object({
  photo: z.enum(["ok", ...PHOTO_PROBLEMS]),
  name: z.string(),
  category: z.enum(CATEGORIES),
  karat_text: z.string(),
  karat: z.number().nullable(),
  scale_text: z.string(),
  weight_g: z.number().nullable(),
  descriptions: z.object({ en: z.string(), ar: z.string(), hi: z.string(), ml: z.string() }),
});


export type AiCheck =
  | { ok: true; suggestions: AiSuggestions; dropped: string[] }
  | { ok: false; error: "invalid_output" | (typeof PHOTO_PROBLEMS)[number] };

// Digits in every script the app uses: Western, Arabic-Indic, Persian, Devanagari, Malayalam.
const ANY_DIGIT = /[0-9٠-٩۰-۹०-९൦-൯]/;
const SCRIPT: Record<DescLang, RegExp> = {
  en: /[A-Za-z]/,
  ar: /[؀-ۿ]/,
  hi: /[ऀ-ॿ]/,
  ml: /[ഀ-ൿ]/,
};
// "22K", "22 kt", "18 karat", "21ct", "916" hallmark numbers, and karat words in the 4 languages.
const KARAT_IN_NAME = /\b(?:\d{2}\s*(?:k|kt|kt\.|karat|carat|ct)|999|995|916|875|750|585)\b|karat|carat|قيراط|कैरेट|കാരറ്റ്/gi;

/** Name: at most 6 words, at most 80 characters, with any karat mention removed. */
export function cleanName(raw: string): string | null {
  const words = raw.replace(KARAT_IN_NAME, " ").replace(/[\r\n\t]+/g, " ").replace(/\s+/g, " ").trim().split(" ").filter(Boolean);
  const name = words.slice(0, 6).join(" ").replace(/^[\s\-–—·,.]+|[\s\-–—·,]+$/g, "").slice(0, 80).trim();
  return name.length >= 2 ? name : null;
}

/**
 * Weight is kept only when it matches what Claude says the display shows, in grams, with at
 * most 3 decimals, in a sane range. A mismatch means it wasn't really read off the display.
 */
export function checkWeight(weight: number | null, scaleText: string): string | null {
  if (weight === null || !Number.isFinite(weight) || weight <= 0 || weight >= 100_000) return null;
  const text = normalizeDigits(scaleText).replace(/,/g, ".");
  if (/\b(?:ct|tl|tola|oz|ozt|dwt|gn|gr|lb|kg)\b/i.test(text)) return null; // not grams
  const shown = text.match(/\d+(?:\.\d+)?/g);
  if (!shown || shown.length !== 1) return null; // nothing or several numbers: ambiguous
  const [intPart, frac = ""] = shown[0].split(".");
  if (frac.length > 3) return null;
  if (Number(shown[0]) !== weight) return null;
  return frac ? `${Number(intPart)}.${frac}` : String(Number(intPart)); // keep the decimals as displayed
}

/** Karat is kept only with readable evidence (a stamp, tag or label), as the brief asks. */
export function checkKarat(karat: number | null, karatText: string): Karat | null {
  if (karat === null || !(KARATS as readonly number[]).includes(karat)) return null;
  if (karatText.trim().length === 0) return null;
  return karat as Karat;
}

/** A description is kept when it is 1-2 sentences in the right script, with no numbers at all. */
export function checkDescription(lang: DescLang, raw: string): string | null {
  const s = raw.replace(/\s+/g, " ").trim();
  if (s.length < 10 || s.length > 400) return null;
  if (ANY_DIGIT.test(s)) return null; // no weights, karats or prices in descriptions
  if (!SCRIPT[lang].test(s)) return null;
  const sentences = s.split(/(?<=[.!?।۔])\s+/).filter((x) => x.trim().length > 0);
  if (sentences.length > 3) return null;
  return s;
}

export function checkAiReply(raw: unknown): AiCheck {
  const parsed = Reply.safeParse(raw);
  if (!parsed.success) return { ok: false, error: "invalid_output" };
  const r = parsed.data;
  if (r.photo !== "ok") return { ok: false, error: r.photo };

  const dropped: string[] = [];
  const name = cleanName(r.name);
  if (!name && r.name.trim()) dropped.push("name");
  const karat = checkKarat(r.karat, r.karat_text);
  if (r.karat !== null && karat === null) dropped.push("karat");
  const weight = checkWeight(r.weight_g, r.scale_text);
  if (r.weight_g !== null && weight === null) dropped.push("weight");
  const descriptions: Descriptions = {};
  for (const lang of DESC_LANGS) {
    const d = checkDescription(lang, r.descriptions[lang]);
    if (d) descriptions[lang] = d;
    else if (r.descriptions[lang].trim()) dropped.push(`description_${lang}`);
  }
  return { ok: true, suggestions: { name, category: r.category, karat, weight_g: weight, descriptions }, dropped };
}

/** Parses Claude's text reply. Structured outputs make this JSON; a failure is still handled. */
export function parseAiText(text: string): AiCheck {
  try {
    return checkAiReply(JSON.parse(text));
  } catch {
    return { ok: false, error: "invalid_output" };
  }
}
