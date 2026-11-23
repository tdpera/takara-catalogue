/**
 * The message a salesperson sends with a share. Pure, so it's unit-tested and runs the same in
 * the browser (live preview) and on the server (AI messages).
 *
 * Structure:  intro / one line per piece / price note / closing / shop name
 *
 * The English template fills intro and closing itself. "Write with AI" replaces only the intro
 * and closing, in the client's language. The piece lines (karat, weight, price) and the price
 * note are always inserted by this code, so the AI never touches a figure: it can't change one
 * even by mistake. The AI's text is also checked to contain no numbers at all.
 */
export type MsgLang = "en" | "ar" | "hi" | "ml";

export type ShareLine = {
  name: string;
  karat: number;
  /** As formatted for the catalogue, e.g. "24.35 g". */
  weight: string;
  /** Whole AED, e.g. "AED 11,183"; null when there's no rate for the karat yet. */
  price: string | null;
};

const NOTE: Record<MsgLang, { vat: string; noVat: string; noPrice: string; link: string }> = {
  en: {
    vat: "Prices include 5% VAT, follow today's gold rate and are confirmed in store.",
    noVat: "Prices follow today's gold rate and are confirmed in store.",
    noPrice: "price confirmed in store",
    link: "Your tray, with 360° views. Tick the pieces you'd like to see:",
  },
  ar: {
    vat: "الأسعار شاملة ضريبة القيمة المضافة 5%، وتتبع سعر الذهب اليوم، ويتم تأكيدها في المحل.",
    noVat: "الأسعار تتبع سعر الذهب اليوم، ويتم تأكيدها في المحل.",
    noPrice: "السعر يُؤكَّد في المحل",
    link: "القطع المختارة لك بعرض 360°. اختر ما تودّ رؤيته:",
  },
  hi: {
    vat: "कीमतों में 5% VAT शामिल है, ये आज के सोने के रेट पर आधारित हैं और दुकान में पक्की की जाएँगी।",
    noVat: "कीमतें आज के सोने के रेट पर आधारित हैं और दुकान में पक्की की जाएँगी।",
    noPrice: "कीमत दुकान में पक्की होगी",
    link: "आपकी ट्रे, 360° व्यू के साथ। जो पीस देखना चाहें, उन्हें चुनें:",
  },
  ml: {
    vat: "വിലകളിൽ 5% VAT ഉൾപ്പെടുന്നു, ഇന്നത്തെ സ്വർണ്ണ നിരക്ക് അനുസരിച്ചാണ്, കടയിൽ ഉറപ്പാക്കും.",
    noVat: "വിലകൾ ഇന്നത്തെ സ്വർണ്ണ നിരക്ക് അനുസരിച്ചാണ്, കടയിൽ ഉറപ്പാക്കും.",
    noPrice: "വില കടയിൽ ഉറപ്പാക്കും",
    link: "നിങ്ങളുടെ ട്രേ, 360° കാഴ്ചയോടെ. കാണാൻ ആഗ്രഹിക്കുന്ന പീസുകൾ തിരഞ്ഞെടുക്കുക:",
  },
};

export const firstName = (name: string | null | undefined) => (name ?? "").trim().split(/\s+/)[0] ?? "";

export function englishIntro(clientName: string | null | undefined, count: number): string {
  const n = firstName(clientName);
  const what = count === 1 ? "is the piece" : "are the pieces";
  return n ? `Hello ${n}, here ${what} we talked about:` : `Hello, here ${what} selected for you:`;
}
export const ENGLISH_CLOSING = "Reply here, or visit us in the souk to see them in person.";

export function pieceLine(i: number, l: ShareLine, lang: MsgLang = "en"): string {
  return `${i + 1}. ${l.name.trim()}: ${l.karat}K, ${l.weight}, ${l.price ?? NOTE[lang].noPrice}`;
}

export function buildMessage(p: { intro: string; closing: string; lines: ShareLine[]; vat: boolean; shop: string; lang?: MsgLang }): string {
  const lang = p.lang ?? "en";
  return [
    p.intro.trim(),
    p.lines.map((l, i) => pieceLine(i, l, lang)).join("\n"),
    p.vat ? NOTE[lang].vat : NOTE[lang].noVat,
    p.closing.trim(),
    p.shop.trim(),
  ]
    .filter(Boolean)
    .join("\n\n");
}

/** The text that goes to WhatsApp: the message, then the link with a short label. */
export function withLink(message: string, link: string, lang: MsgLang = "en"): string {
  return `${message.trim()}\n\n${NOTE[lang].link}\n${link}`;
}

/**
 * wa.me link that opens WhatsApp with the text filled in. The salesperson still picks send:
 * nothing is sent automatically. Without a number, WhatsApp asks who to send it to.
 */
export function whatsappLink(phoneE164: string | null | undefined, text: string): string {
  const digits = (phoneE164 ?? "").replace(/\D/g, "");
  return `https://wa.me/${digits}?text=${encodeURIComponent(text)}`;
}

// ------------------------------------------------------------------ checks for AI text

const ANY_DIGIT = /[0-9٠-٩۰-۹०-९൦-൯]/;
const SCRIPT: Record<MsgLang, RegExp> = { en: /[A-Za-z]/, ar: /[؀-ۿ]/, hi: /[ऀ-ॿ]/, ml: /[ഀ-ൿ]/ };

/**
 * An AI-written intro or closing is used only if it's 1-3 sentences in the client's language,
 * with no numbers (in any script), links, emails or phone numbers. Figures come from our lines.
 */
export function checkAiPart(lang: MsgLang, raw: string): string | null {
  const s = raw.replace(/\s+/g, " ").trim();
  if (s.length < 5 || s.length > 400) return null;
  if (ANY_DIGIT.test(s)) return null;
  if (/https?:|www\.|@|\.com\b/i.test(s)) return null;
  if (!SCRIPT[lang].test(s)) return null;
  if (s.split(/(?<=[.!?।۔؟])\s+/).filter(Boolean).length > 3) return null;
  return s;
}

export const priceNote = (lang: MsgLang, vat: boolean) => (vat ? NOTE[lang].vat : NOTE[lang].noVat);
export const noPriceText = (lang: MsgLang) => NOTE[lang].noPrice;
