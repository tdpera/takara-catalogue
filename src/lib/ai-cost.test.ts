import { describe, expect, it } from "vitest";
import { aiCostUsd, formatUsd } from "./ai-cost";

describe("aiCostUsd", () => {
  it("prices tokens per model", () => {
    // 1M in + 100k out on Opus 5.5 = $4 + $2
    expect(aiCostUsd({ "claude-opus-5-5": { in: 1_000_000, out: 100_000 } })).toBeCloseTo(6);
    expect(aiCostUsd({ "claude-haiku-5-5": { in: 1_000_000, out: 1_000_000 } })).toBeCloseTo(0.6);
  });
  it("unknown models are priced as the default model; empty is zero", () => {
    expect(aiCostUsd({ unknown: { in: 1_000_000, out: 0 } })).toBeCloseTo(4);
    expect(aiCostUsd(null)).toBe(0);
  });
  it("formats small amounts", () => {
    expect(formatUsd(0)).toBe("$0.00");
    expect(formatUsd(0.004)).toBe("< $0.01");
    expect(formatUsd(12.345)).toBe("$12.35");
  });
});
