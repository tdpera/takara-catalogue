import { describe, expect, it } from "vitest";
import { buildMessage, checkAiPart, ENGLISH_CLOSING, englishIntro, pieceLine, whatsappLink, withLink, type ShareLine } from "./share-message";

const lines: ShareLine[] = [
  { name: "Twisted rope bangle", karat: 22, weight: "24.35 g", price: "AED 11,183" },
  { name: "Floral jhumka earrings ", karat: 18, weight: "8.10 g", price: null },
];

describe("English template", () => {
  it("greets the client by first name, or generally", () => {
    expect(englishIntro("Fatima Al Mansoori", 2)).toBe("Hello Fatima, here are the pieces we talked about:");
    expect(englishIntro(null, 1)).toBe("Hello, here is the piece selected for you:");
    expect(englishIntro("Ali", 1)).toBe("Hello Ali, here is the piece we talked about:");
    expect(englishIntro("  ", 3)).toBe("Hello, here are the pieces selected for you:");
  });

  it("lists each piece with karat, weight and price exactly as shown in the catalogue", () => {
    expect(pieceLine(0, lines[0])).toBe("1. Twisted rope bangle: 22K, 24.35 g, AED 11,183");
    expect(pieceLine(1, lines[1])).toBe("2. Floral jhumka earrings: 18K, 8.10 g, price confirmed in store");
  });

  it("builds the whole message with the price note", () => {
    const m = buildMessage({ intro: englishIntro("Fatima", 2), closing: ENGLISH_CLOSING, lines, vat: true, shop: "Al Fahidi Jewellers" });
    expect(m).toBe(
      [
        "Hello Fatima, here are the pieces we talked about:",
        "1. Twisted rope bangle: 22K, 24.35 g, AED 11,183\n2. Floral jhumka earrings: 18K, 8.10 g, price confirmed in store",
        "Prices include 5% VAT, follow today's gold rate and are confirmed in store.",
        ENGLISH_CLOSING,
        "Al Fahidi Jewellers",
      ].join("\n\n"),
    );
    expect(buildMessage({ intro: "Hi", closing: "", lines, vat: false, shop: "S" })).toContain("Prices follow today's gold rate and are confirmed in store.");
  });

  it("keeps figures identical in other languages; only the words around them change", () => {
    const m = buildMessage({ intro: "مرحبًا فاطمة", closing: "بانتظارك", lines, vat: true, shop: "S", lang: "ar" });
    expect(m).toContain("1. Twisted rope bangle: 22K, 24.35 g, AED 11,183");
    expect(m).toContain("الأسعار شاملة ضريبة القيمة المضافة");
  });
});

describe("WhatsApp", () => {
  it("adds the link with a label", () => {
    expect(withLink("Hello", "https://x.test/s/abc")).toBe("Hello\n\nYour tray, with 360° views. Tick the pieces you'd like to see:\nhttps://x.test/s/abc");
  });
  it("opens a chat with the client's number, text filled in", () => {
    expect(whatsappLink("+971501234567", "Hi & bye")).toBe("https://wa.me/971501234567?text=Hi%20%26%20bye");
  });
  it("lets the salesperson pick the contact when there's no number", () => {
    expect(whatsappLink(null, "Hi")).toBe("https://wa.me/?text=Hi");
  });
  it("encodes Arabic and line breaks", () => {
    expect(whatsappLink(null, "مرحبا\nAED 1,000")).toBe("https://wa.me/?text=" + encodeURIComponent("مرحبا\nAED 1,000"));
  });
});

describe("checkAiPart", () => {
  it("accepts short text in the client's language", () => {
    expect(checkAiPart("en", "Dear Fatima, I picked these light pieces for daily wear.")).toBeTruthy();
    expect(checkAiPart("ar", "عزيزتي فاطمة، اخترت لك هذه القطع الخفيفة للاستخدام اليومي.")).toBeTruthy();
    expect(checkAiPart("hi", "प्रिय प्रिया, ये हल्के गहने रोज़ पहनने के लिए चुने हैं।")).toBeTruthy();
    expect(checkAiPart("ml", "പ്രിയ അനിത, ദിവസവും അണിയാൻ പറ്റിയ ഭാരം കുറഞ്ഞ പീസുകൾ ഇതാ.")).toBeTruthy();
  });
  it("rejects any number, in any script", () => {
    expect(checkAiPart("en", "Only AED 9,999 today!")).toBeNull();
    expect(checkAiPart("en", "These 22K pieces suit you.")).toBeNull();
    expect(checkAiPart("ar", "سعر خاص ١٠٠٠ درهم")).toBeNull();
    expect(checkAiPart("hi", "सिर्फ़ ५००० रुपये")).toBeNull();
  });
  it("rejects links, emails and the wrong language", () => {
    expect(checkAiPart("en", "See www.example.com for more")).toBeNull();
    expect(checkAiPart("en", "Email me at a@b.co please")).toBeNull();
    expect(checkAiPart("ar", "Hello Fatima, here you go.")).toBeNull();
  });
  it("rejects empty, very long or rambling text", () => {
    expect(checkAiPart("en", "")).toBeNull();
    expect(checkAiPart("en", "word ".repeat(100))).toBeNull();
    expect(checkAiPart("en", "One. Two here. Three here. Four here.")).toBeNull();
  });
});
