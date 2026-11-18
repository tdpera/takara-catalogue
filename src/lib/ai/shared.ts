/** Constants and types shared by the AI fill route and the capture form (no zod, keeps the browser bundle small). */
import type { Karat } from "@/lib/pricing";

export const CATEGORIES = ["Bangle", "Ring", "Chain", "Necklace", "Earrings", "Pendant", "Bracelet", "Set", "Other"] as const;
export type Category = (typeof CATEGORIES)[number];
export const DESC_LANGS = ["en", "ar", "hi", "ml"] as const;
export type DescLang = (typeof DESC_LANGS)[number];
export type Descriptions = Partial<Record<DescLang, string>>;

export type AiSuggestions = {
  name: string | null;
  category: Category;
  karat: Karat | null;
  weight_g: string | null;
  descriptions: Descriptions;
};
