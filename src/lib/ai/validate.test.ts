import { describe, expect, it } from "vitest";
import { checkAiReply, checkDescription, checkKarat, checkWeight, cleanName, parseAiText } from "./validate";

const good = {
  photo: "ok",
  name: "Twisted rope bangle",
  category: "Bangle",
  karat_text: "916",
  karat: 22,
  scale_text: "24.350 g",
  weight_g: 24.35,
  descriptions: {
    en: "A polished twisted rope bangle with a bright finish. Lovely for weddings and festive wear.",
    ar: "سوار مجدول بلمسة لامعة وتصميم أنيق. مثالي للأعراس والمناسبات.",
    hi: "चमकदार फ़िनिश वाला सुंदर बटा हुआ कंगन। शादियों और त्योहारों के लिए उत्तम।",
    ml: "തിളങ്ങുന്ന ഫിനിഷുള്ള പിരിച്ച വള. വിവാഹങ്ങൾക്കും ആഘോഷങ്ങൾക്കും അനുയോജ്യം.",
  },
};

describe("checkAiReply", () => {
  it("accepts a complete, valid reply", () => {
    const r = checkAiReply(good);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.suggestions).toMatchObject({ name: "Twisted rope bangle", category: "Bangle", karat: 22, weight_g: "24.350" });
    expect(Object.keys(r.suggestions.descriptions)).toEqual(["en", "ar", "hi", "ml"]);
    expect(r.dropped).toEqual([]);
  });

  it("keeps the decimals exactly as the scale shows them", () => {
    const r = checkAiReply({ ...good, scale_text: "7.10 g", weight_g: 7.1 });
    expect(r.ok && r.suggestions.weight_g).toBe("7.10");
  });

  it("reports photo problems instead of suggestions", () => {
    expect(checkAiReply({ ...good, photo: "too_blurry" })).toEqual({ ok: false, error: "too_blurry" });
    expect(checkAiReply({ ...good, photo: "no_jewellery" })).toEqual({ ok: false, error: "no_jewellery" });
  });

  it("rejects replies of the wrong shape", () => {
    expect(checkAiReply({ ...good, category: "Tiara" })).toEqual({ ok: false, error: "invalid_output" });
    expect(checkAiReply({ ...good, descriptions: { en: "x" } })).toEqual({ ok: false, error: "invalid_output" });
    expect(checkAiReply(null)).toEqual({ ok: false, error: "invalid_output" });
    expect(parseAiText("not json")).toEqual({ ok: false, error: "invalid_output" });
    expect(parseAiText('{"photo":"ok"')).toEqual({ ok: false, error: "invalid_output" });
  });

  it("drops fields that fail checks and says which", () => {
    const r = checkAiReply({ ...good, karat_text: "", scale_text: "", descriptions: { ...good.descriptions, hi: "Weighs 24 grams." } });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.suggestions.karat).toBeNull();
    expect(r.suggestions.weight_g).toBeNull();
    expect(r.suggestions.descriptions.hi).toBeUndefined();
    expect(r.dropped).toEqual(["karat", "weight", "description_hi"]);
  });

  it("treats null karat and weight as simply not read", () => {
    const r = checkAiReply({ ...good, karat: null, karat_text: "", weight_g: null, scale_text: "" });
    expect(r.ok && r.dropped).toEqual([]);
  });
});

describe("cleanName", () => {
  it("removes karat mentions and limits to 6 words", () => {
    expect(cleanName("22K Twisted rope bangle")).toBe("Twisted rope bangle");
    expect(cleanName("Floral 18 kt gold jhumka earrings")).toBe("Floral gold jhumka earrings");
    expect(cleanName("916 Kada")).toBe("Kada");
    expect(cleanName("Very long name with far too many words in it")).toBe("Very long name with far too");
    expect(cleanName("21 karat")).toBeNull();
    expect(cleanName("  ")).toBeNull();
  });
});

describe("checkWeight: only what the display shows, in grams", () => {
  it("accepts a matching reading", () => {
    expect(checkWeight(12.345, "12.345 g")).toBe("12.345");
    expect(checkWeight(12.345, "12.345g")).toBe("12.345");
    expect(checkWeight(8, "8.00")).toBe("8.00");
    expect(checkWeight(12.5, "12,5 g")).toBe("12.5"); // decimal comma
    expect(checkWeight(12.34, "١٢٫٣٤ g")).toBe("12.34"); // Arabic-Indic digits
  });
  it("rejects a value that doesn't match the display", () => {
    expect(checkWeight(12.3, "12.345 g")).toBeNull();
    expect(checkWeight(12, "")).toBeNull();
    expect(checkWeight(12, "about 12 g")).toBe("12"); // one number, matching
    expect(checkWeight(12, "12 g TARE 3 g")).toBeNull(); // two numbers: ambiguous
  });
  it("rejects other units and impossible values", () => {
    expect(checkWeight(60.5, "60.5 ct")).toBeNull();
    expect(checkWeight(1.04, "1.04 tl")).toBeNull();
    expect(checkWeight(0.75, "0.75 oz")).toBeNull();
    expect(checkWeight(0, "0.000 g")).toBeNull();
    expect(checkWeight(-1, "-1 g")).toBeNull();
    expect(checkWeight(1.2345, "1.2345 g")).toBeNull(); // more than 3 decimals
    expect(checkWeight(null, "12 g")).toBeNull();
  });
});

describe("checkKarat: needs a readable marking", () => {
  it("keeps karat with evidence", () => {
    expect(checkKarat(22, "916")).toBe(22);
    expect(checkKarat(18, "18K")).toBe(18);
  });
  it("drops karat without evidence or out of range", () => {
    expect(checkKarat(22, "")).toBeNull();
    expect(checkKarat(22, "  ")).toBeNull();
    expect(checkKarat(10, "10K")).toBeNull();
    expect(checkKarat(null, "916")).toBeNull();
  });
});

describe("checkDescription", () => {
  it("keeps 1-2 sentences in the right script", () => {
    expect(checkDescription("en", good.descriptions.en)).toBe(good.descriptions.en);
    expect(checkDescription("ar", good.descriptions.ar)).toBe(good.descriptions.ar);
  });
  it("drops descriptions containing numbers in any script", () => {
    expect(checkDescription("en", "A bangle of 24 grams in polished gold.")).toBeNull();
    expect(checkDescription("ar", "سوار وزنه ٢٤ غرام بلمسة لامعة.")).toBeNull();
    expect(checkDescription("hi", "२२ कैरेट का सुंदर कंगन, शादी के लिए।")).toBeNull();
    expect(checkDescription("ml", "൨൨ കാരറ്റ് വള, വിവാഹങ്ങൾക്ക് അനുയോജ്യം.")).toBeNull();
  });
  it("drops the wrong language, too short, too long and rambling text", () => {
    expect(checkDescription("ar", good.descriptions.en)).toBeNull();
    expect(checkDescription("ml", good.descriptions.hi)).toBeNull();
    expect(checkDescription("en", "Nice.")).toBeNull();
    expect(checkDescription("en", "A ".repeat(250))).toBeNull();
    expect(checkDescription("en", "One. Two here. Three here. Four here.")).toBeNull();
  });
});
