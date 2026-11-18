import { describe, expect, it } from "vitest";
import { checkPiece, priceOf, roundWhole, toDec, toRateMap, D, type PieceInput, type RateMap } from "./pricing";

const SET_AT = "2026-11-18T06:00:00Z";
// Dubai board rates from the prototype (13 Nov 2026), plus a hand-entered 14K.
const rates: RateMap = toRateMap([
  { karat: 24, aed_per_g: 472.5, set_at: SET_AT },
  { karat: 22, aed_per_g: 437.5, set_at: SET_AT },
  { karat: 21, aed_per_g: 419.5, set_at: SET_AT },
  { karat: 18, aed_per_g: 359.75, set_at: SET_AT },
  { karat: 14, aed_per_g: 281.25, set_at: SET_AT },
]);

function price(p: PieceInput, vat = true, r = rates) {
  const res = priceOf(p, r, vat);
  if (!res.ok) throw new Error("expected a price, got " + res.error);
  return res.price;
}
const s = (d: { toString(): string }) => d.toString();

describe("formula, step by step", () => {
  // 22K bangle, 24.5 g, no stones, AED 18/g making, VAT on.
  const p = price({ karat: 22, gross_g: 24.5, stone_g: 0, making_per_g: 18, extras_aed: 0 });

  it("net gold = gross − stone", () => expect(s(p.netGoldG)).toBe("24.5"));
  it("gold value = net × rate for the karat", () => {
    expect(s(p.rate)).toBe("437.5");
    expect(s(p.goldValue)).toBe("10718.75");
  });
  it("making = net × making per gram", () => {
    expect(p.makingMode).toBe("per_g");
    expect(s(p.making)).toBe("441");
  });
  it("base = gold + making + extras", () => expect(s(p.base)).toBe("11159.75"));
  it("VAT = 5% of base", () => expect(s(p.vat)).toBe("557.9875"));
  it("total keeps full precision; display rounds to whole AED", () => {
    expect(s(p.total)).toBe("11717.7375");
    expect(s(p.totalWhole)).toBe("11718");
  });
  it("carries the rate's timestamp", () => expect(p.rateSetAt).toBe(SET_AT));
});

describe("stones and extras", () => {
  it("prices only the gold, and adds extras", () => {
    // 18K, 12.4 g gross with 1.2 g stones, AED 25/g making, AED 150 extras.
    const p = price({ karat: 18, gross_g: 12.4, stone_g: 1.2, making_per_g: 25, extras_aed: 150 });
    expect(s(p.netGoldG)).toBe("11.2");
    expect(s(p.goldValue)).toBe("4029.2");
    expect(s(p.making)).toBe("280");
    expect(s(p.base)).toBe("4459.2");
    expect(s(p.vat)).toBe("222.96");
    expect(s(p.total)).toBe("4682.16");
    expect(s(p.totalWhole)).toBe("4682");
  });

  it("making per gram uses net gold weight, not gross", () => {
    const p = price({ karat: 22, gross_g: 10, stone_g: 2, making_per_g: 10 }, false);
    expect(s(p.making)).toBe("80");
  });
});

describe("flat making charge", () => {
  it("replaces the per-gram charge when set", () => {
    // 21K, 8.35 g, per-gram 20 is ignored because flat 300 is set. VAT off.
    const p = price({ karat: 21, gross_g: 8.35, making_per_g: 20, making_flat: 300 }, false);
    expect(p.makingMode).toBe("flat");
    expect(s(p.goldValue)).toBe("3502.825");
    expect(s(p.making)).toBe("300");
    expect(s(p.total)).toBe("3802.825");
    expect(s(p.totalWhole)).toBe("3803");
  });

  it("a flat charge of 0 is a real value (no making), not 'unset'", () => {
    const p = price({ karat: 22, gross_g: 10, making_per_g: 20, making_flat: 0 }, false);
    expect(p.makingMode).toBe("flat");
    expect(s(p.making)).toBe("0");
    expect(s(p.total)).toBe("4375");
  });

  it("blank or null flat charge falls back to per gram", () => {
    for (const making_flat of [null, undefined, ""] as const) {
      const p = price({ karat: 22, gross_g: 10, making_per_g: 20, making_flat }, false);
      expect(p.makingMode).toBe("per_g");
      expect(s(p.making)).toBe("200");
    }
  });
});

describe("VAT", () => {
  it("is zero when the shop has VAT off", () => {
    const p = price({ karat: 22, gross_g: 24.5, making_per_g: 18 }, false);
    expect(s(p.vat)).toBe("0");
    expect(s(p.total)).toBe(s(p.base));
    expect(p.vatEnabled).toBe(false);
  });

  it("applies to making and extras too, not just gold", () => {
    const p = price({ karat: 24, gross_g: 1, making_per_g: 100, extras_aed: 50 });
    // base = 472.5 + 100 + 50 = 622.5; VAT 31.125
    expect(s(p.vat)).toBe("31.125");
    expect(s(p.total)).toBe("653.625");
  });
});

describe("every karat uses its own rate", () => {
  it.each([
    [24, "472.5"],
    [22, "437.5"],
    [21, "419.5"],
    [18, "359.75"],
    [14, "281.25"],
  ])("%iK", (karat, gold) => {
    expect(s(price({ karat, gross_g: 1 }, false).goldValue)).toBe(gold);
  });
});

describe("rounding", () => {
  it("rounds .5 up, not to even", () => {
    // 1.005 g × AED 100 = 100.5 exactly. Binary floats give 100.49999… and would round down.
    const r = toRateMap([{ karat: 24, aed_per_g: 100, set_at: SET_AT }]);
    const p = price({ karat: 24, gross_g: 1.005 }, false, r);
    expect(s(p.total)).toBe("100.5");
    expect(s(p.totalWhole)).toBe("101");
    expect(Math.round(1.005 * 100)).toBe(100); // the float trap this engine avoids
  });

  it("rounds just below .5 down", () => {
    const r = toRateMap([{ karat: 24, aed_per_g: "100.4999", set_at: SET_AT }]);
    expect(s(price({ karat: 24, gross_g: 1 }, false, r).totalWhole)).toBe("100");
  });

  it("2.5 → 3 and 3.5 → 4 (half-up both ways)", () => {
    expect(s(roundWhole(new D("2.5")))).toBe("3");
    expect(s(roundWhole(new D("3.5")))).toBe("4");
  });

  it("sums exactly where floats drift (0.1 + 0.2)", () => {
    const r = toRateMap([{ karat: 24, aed_per_g: 1, set_at: SET_AT }]);
    const p = price({ karat: 24, gross_g: 0.1, extras_aed: 0.2 }, false, r);
    expect(s(p.total)).toBe("0.3");
    expect(0.1 + 0.2).not.toBe(0.3);
  });
});

describe("inputs from the database and from forms", () => {
  it("accepts numeric strings as Postgres returns them", () => {
    const r = toRateMap([{ karat: 22, aed_per_g: "437.5000", set_at: SET_AT }]);
    const p = price({ karat: 22, gross_g: "24.500", stone_g: "0.000", making_per_g: "18.0000", extras_aed: "0.00" }, true, r);
    expect(s(p.totalWhole)).toBe("11718");
  });

  it("treats blank stone, making and extras as zero", () => {
    const p = price({ karat: 22, gross_g: 2, stone_g: "", making_per_g: "", extras_aed: null }, false);
    expect(s(p.total)).toBe("875");
  });

  it("ignores thousands separators typed into a form", () => expect(s(toDec("1,234.5")!)).toBe("1234.5"));

  it("reads digits typed on Arabic, Hindi and Malayalam keyboards", () => {
    expect(s(toDec("٤٧٢٫٥")!)).toBe("472.5");
    expect(s(toDec("۴۷۲.۵")!)).toBe("472.5");
    expect(s(toDec("४७२.५")!)).toBe("472.5");
    expect(s(toDec("൪൭൨.൫")!)).toBe("472.5");
    expect(s(toDec("١٬٢٣٤٫٥")!)).toBe("1234.5");
  });

  it("rejects junk", () => {
    for (const v of ["12abc", "1.2.3", "", " ", "NaN", "Infinity"]) expect(toDec(v), v).toBeNull();
    expect(toDec(Number.NaN)).toBeNull();
    expect(toDec(Number.POSITIVE_INFINITY)).toBeNull();
  });
});

describe("rejections", () => {
  const ok = { karat: 22, gross_g: 10, making_per_g: 10 };

  it("stone weight equal to gross weight", () => {
    expect(priceOf({ ...ok, stone_g: 10 }, rates, true)).toEqual({ ok: false, error: "stone_not_less_than_gross" });
  });
  it("stone weight above gross weight", () => {
    expect(priceOf({ ...ok, stone_g: 10.001 }, rates, true)).toEqual({ ok: false, error: "stone_not_less_than_gross" });
  });
  it("zero, negative or missing gross weight", () => {
    for (const gross_g of [0, -1, "", "abc"]) expect(priceOf({ ...ok, gross_g }, rates, true)).toEqual({ ok: false, error: "invalid_weight" });
  });
  it("negative stone weight", () => {
    expect(priceOf({ ...ok, stone_g: -0.5 }, rates, true)).toEqual({ ok: false, error: "invalid_weight" });
  });
  it("negative or junk money amounts", () => {
    for (const bad of [{ making_per_g: -1 }, { making_flat: -5 }, { extras_aed: -1 }, { making_flat: "x" }]) {
      expect(priceOf({ ...ok, ...bad }, rates, true), JSON.stringify(bad)).toEqual({ ok: false, error: "invalid_amount" });
    }
  });
  it("unknown karat", () => {
    expect(priceOf({ ...ok, karat: 20 }, rates, true)).toEqual({ ok: false, error: "invalid_karat" });
  });
  it("no rate set for the piece's karat", () => {
    const only22 = toRateMap([{ karat: 22, aed_per_g: 437.5, set_at: SET_AT }]);
    expect(priceOf({ ...ok, karat: 18 }, only22, true)).toEqual({ ok: false, error: "no_rate" });
    expect(priceOf(ok, {}, true)).toEqual({ ok: false, error: "no_rate" });
  });
  it("checkPiece reports the same errors without needing rates (for forms)", () => {
    expect(checkPiece({ ...ok, stone_g: 12 })).toEqual({ ok: false, error: "stone_not_less_than_gross" });
    expect(checkPiece(ok).ok).toBe(true);
  });
});

describe("toRateMap", () => {
  it("ignores rows for unknown karats", () => {
    const m = toRateMap([{ karat: 23, aed_per_g: 1, set_at: SET_AT }, { karat: 22, aed_per_g: 2, set_at: SET_AT }]);
    expect(Object.keys(m)).toEqual(["22"]);
  });
});
