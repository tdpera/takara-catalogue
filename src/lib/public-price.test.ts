import { describe, expect, it } from "vitest";
import { oldestShownRate, publicPrice, type PublicPieceInput } from "./public-price";
import { priceOf, toRateMap } from "./pricing";

const now = new Date("2026-11-18T08:00:00Z"); // 12:00 in Dubai
const ratesAt = (setAt: string) => toRateMap([{ karat: 22, aed_per_g: "437.39", set_at: setAt }]);
const today = ratesAt("2026-11-18T05:00:00Z");
const bangle: PublicPieceInput = { karat: 22, gross_g: "24.35", stone_g: "0", making_per_g: "18", making_flat: null, extras_aed: "0", status: "in_stock" };

describe("publicPrice", () => {
  it("live: today's price, same figure as the app", () => {
    const p = publicPrice(bangle, today, true, "live", now);
    const app = priceOf(bangle, today, true);
    expect(app.ok && p.kind === "price" && p.text === `AED ${app.price.totalWhole.toFixed(0).replace(/\B(?=(\d{3})+(?!\d))/g, ",")}`).toBe(true);
    expect(p).toMatchObject({ kind: "price", from: false, indicative: false });
  });

  it("from: the gold value with VAT only, never more than the real price", () => {
    const p = publicPrice(bangle, today, true, "from", now);
    // 24.35 g x 437.39 = 10,650.4465; x 1.05 = 11,182.97 -> 11,183
    expect(p).toMatchObject({ kind: "price", text: "AED 11,183", from: true });
    const live = publicPrice(bangle, today, true, "live", now);
    const n = (x: typeof p) => (x.kind === "price" ? Number(x.text.replace(/\D/g, "")) : NaN);
    expect(n(p)).toBeLessThanOrEqual(n(live));
  });

  it("ask: no price at all", () => {
    expect(publicPrice(bangle, today, true, "ask", now)).toEqual({ kind: "ask" });
  });

  it("rates 1-3 days old: indicative; older or missing: confirmed in store", () => {
    expect(publicPrice(bangle, ratesAt("2026-11-17T05:00:00Z"), true, "live", now)).toMatchObject({ kind: "price", indicative: true });
    expect(publicPrice(bangle, ratesAt("2026-11-15T05:00:00Z"), true, "live", now)).toMatchObject({ kind: "price", indicative: true });
    expect(publicPrice(bangle, ratesAt("2026-11-14T05:00:00Z"), true, "live", now)).toEqual({ kind: "in_store" });
    expect(publicPrice(bangle, toRateMap([]), true, "live", now)).toEqual({ kind: "in_store" });
  });

  it("sold and reserved show their status, never a price (in every mode)", () => {
    for (const mode of ["live", "from", "ask"] as const) {
      expect(publicPrice({ ...bangle, status: "sold" }, today, true, mode, now)).toEqual({ kind: "sold" });
      expect(publicPrice({ ...bangle, status: "reserved" }, today, true, mode, now)).toEqual({ kind: "reserved" });
    }
  });

  it("oldest rate behind the shown prices", () => {
    const a = publicPrice(bangle, today, true, "live", now);
    const b = publicPrice(bangle, ratesAt("2026-11-17T05:00:00Z"), true, "live", now);
    expect(oldestShownRate([a, b, { kind: "sold" }])).toBe("2026-11-17T05:00:00Z");
    expect(oldestShownRate([{ kind: "ask" }])).toBeNull();
  });
});
