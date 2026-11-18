import { describe, expect, it } from "vitest";
import { bigChanges, checkRateSet, deriveFrom24, dubaiDay, isRateToday, rateAgeDays, ratesStatus } from "./rates";
import { toRateMap } from "./pricing";
import { formatAED, formatGrams, formatNumber, formatRate } from "./format";

describe("derive from 24K", () => {
  it("uses the brief's ratios, rounded half-up to fils", () => {
    // 472.5 × 0.9257 = 437.39325; × 0.8877 = 419.43825; × 0.7612 = 359.667
    expect(deriveFrom24(472.5)).toEqual({ 22: "437.39", 21: "419.44", 18: "359.67" });
  });
  it("accepts form strings", () => expect(deriveFrom24("500")).toEqual({ 22: "462.85", 21: "443.85", 18: "380.60" }));
  it("rounds .005 up", () => {
    // 0.5 × 0.9257 = 0.46285 → 0.46; 1.5 × 0.9257 = 1.38855 → 1.39
    expect(deriveFrom24("1.5")![22]).toBe("1.39");
  });
  it("refuses blank, zero and junk", () => {
    for (const v of ["", "0", "-5", "abc"]) expect(deriveFrom24(v), v).toBeNull();
  });
});

describe("'today' means today in Dubai", () => {
  it("23:59 Dubai is still the same day; 00:01 is the next", () => {
    const setAt = "2026-11-18T19:59:00Z"; // 23:59 on 18 Nov in Dubai (UTC+4)
    expect(dubaiDay(setAt)).toBe("2026-11-18");
    expect(isRateToday(setAt, new Date("2026-11-18T19:59:30Z"))).toBe(true);
    expect(isRateToday(setAt, new Date("2026-11-18T20:01:00Z"))).toBe(false); // 00:01 on 19 Nov
  });
  it("uses Dubai's date even when the UTC date differs", () => {
    // 01:00 on 18 Nov in Dubai is still 17 Nov in UTC.
    expect(isRateToday("2026-11-17T21:00:00Z", new Date("2026-11-18T10:00:00Z"))).toBe(true);
  });
  it("counts calendar days, not 24-hour periods", () => {
    const now = new Date("2026-11-18T04:00:00Z"); // 08:00 on 18 Nov
    expect(rateAgeDays("2026-11-17T19:00:00Z", now)).toBe(1); // 23:00 on 17 Nov, only 9 hours earlier
    expect(rateAgeDays("2026-11-18T03:00:00Z", now)).toBe(0);
    expect(rateAgeDays("2026-11-14T06:00:00Z", now)).toBe(4);
  });
});

describe("shop rate status", () => {
  const now = new Date("2026-11-18T10:00:00Z");
  it("missing when no rates have ever been set", () => expect(ratesStatus({}, now)).toEqual({ state: "missing" }));
  it("today when every karat with a rate was set today", () => {
    const m = toRateMap([
      { karat: 24, aed_per_g: 1, set_at: "2026-11-18T05:00:00Z" },
      { karat: 22, aed_per_g: 1, set_at: "2026-11-18T06:00:00Z" },
    ]);
    expect(ratesStatus(m, now)).toEqual({ state: "today", oldestSetAt: "2026-11-18T05:00:00Z" });
  });
  it("stale if even one karat is from an earlier day", () => {
    const m = toRateMap([
      { karat: 24, aed_per_g: 1, set_at: "2026-11-18T05:00:00Z" },
      { karat: 14, aed_per_g: 1, set_at: "2026-11-10T05:00:00Z" },
    ]);
    expect(ratesStatus(m, now)).toEqual({ state: "stale", oldestSetAt: "2026-11-10T05:00:00Z", staleKarats: [14] });
  });
});

describe("checking a new set of rates", () => {
  it("accepts a normal board", () => {
    const r = checkRateSet({ 24: "472.50", 22: "437.50", 21: "419.50", 18: "359.75", 14: "" });
    expect(r.ok).toBe(true);
    if (r.ok) expect(Object.keys(r.values).sort()).toEqual(["18", "21", "22", "24"]);
  });
  it("flags invalid numbers", () => {
    const r = checkRateSet({ 24: "abc", 22: "0", 21: "-1", 18: "100000", 14: "1.23456" });
    expect(r).toEqual({ ok: false, errors: { 24: "invalid", 22: "invalid", 21: "invalid", 18: "invalid", 14: "invalid" } });
  });
  it("flags a lower karat priced at or above a purer one (typo guard)", () => {
    expect(checkRateSet({ 24: "472.5", 22: "4375" })).toEqual({ ok: false, errors: { 22: "order" } });
    expect(checkRateSet({ 24: "472.5", 18: "472.5" })).toEqual({ ok: false, errors: { 18: "order" } });
  });
  it("compares across skipped karats", () => {
    expect(checkRateSet({ 22: "437.5", 14: "440" })).toEqual({ ok: false, errors: { 14: "order" } });
  });
  it("needs at least one rate", () => expect(checkRateSet({ 24: " " })).toEqual({ ok: false, errors: {}, empty: true }));
});

describe("large changes since the last rate", () => {
  const current = toRateMap([{ karat: 24, aed_per_g: 472.5, set_at: "x" }, { karat: 22, aed_per_g: 437.5, set_at: "x" }]);
  it("flags moves over 10% (likely a typo)", () => {
    // 24K typed as 520 instead of ~475: 10.05% jump. 22K moves under 1%.
    const r = checkRateSet({ 24: "520", 22: "440" });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const big = bigChanges(r.values, current);
    expect(big.map((b) => b.karat)).toEqual([24]);
    expect(big[0].pct.toFixed(4)).toBe("0.1005");
  });
  it("a dropped digit is caught by the order check before saving", () => {
    expect(checkRateSet({ 24: "47.25", 22: "440" })).toEqual({ ok: false, errors: { 22: "order" } });
  });
  it("ignores karats with no previous rate", () => {
    const r = checkRateSet({ 18: "359.75" });
    expect(r.ok && bigChanges(r.values, current)).toEqual([]);
  });
});

describe("formatting", () => {
  it("whole AED with grouping, half-up", () => {
    expect(formatAED("11717.7375")).toBe("AED 11,718");
    expect(formatAED("1234567.5")).toBe("AED 1,234,568");
    expect(formatAED("999.49")).toBe("AED 999");
  });
  it("fils for breakdown lines", () => expect(formatAED("557.9875", 2)).toBe("AED 557.99"));
  it("grams show 2–3 decimals", () => {
    expect(formatGrams("24.5")).toBe("24.50 g");
    expect(formatGrams("1.235")).toBe("1.235 g");
    expect(formatGrams(12)).toBe("12.00 g");
  });
  it("rates show 2–4 decimals", () => {
    expect(formatRate(437.5)).toBe("437.50");
    expect(formatRate("437.3933")).toBe("437.3933");
  });
  it("never prints -0", () => expect(formatNumber("-0.001", 2)).toBe("0.00"));
});
