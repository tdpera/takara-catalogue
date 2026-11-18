import { describe, expect, it } from "vitest";
import { LOCALES, dirFor, makeT, messagesFor } from ".";

function keys(o: object, p = ""): string[] {
  return Object.entries(o).flatMap(([k, v]) => (typeof v === "string" ? [p + k] : keys(v, `${p}${k}.`)));
}

describe("i18n", () => {
  const enKeys = keys(messagesFor("en")).sort();

  it.each(LOCALES)("%s has exactly the English keys, none empty", (l) => {
    expect(keys(messagesFor(l)).sort()).toEqual(enKeys);
    for (const k of enKeys) expect(makeT(l)(k as never).trim(), `${l}:${k}`).not.toBe("");
  });

  it.each(LOCALES)("%s keeps every {placeholder} from English", (l) => {
    const en = makeT("en"), t = makeT(l);
    for (const k of enKeys) {
      const want = (en(k as never).match(/\{\w+\}/g) ?? []).sort();
      const got = (t(k as never).match(/\{\w+\}/g) ?? []).sort();
      expect(got, `${l}:${k}`).toEqual(want);
    }
  });

  it("fills placeholders and sets direction", () => {
    expect(makeT("en")("login.codeSentSms", { phone: "+971 50 123 4567" })).toBe("We sent a code by SMS to +971 50 123 4567.");
    expect(dirFor("ar")).toBe("rtl");
    expect(dirFor("ml")).toBe("ltr");
  });
});
