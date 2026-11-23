import { describe, expect, it } from "vitest";
import { delta, parseMonth, shiftMonth } from "./report";

describe("report helpers", () => {
  const now = new Date("2026-11-23T10:00:00Z");
  it("parses ?m= within range", () => {
    expect(parseMonth("2026-10", now)).toBe("2026-10-01");
    expect(parseMonth("2026-12", now)).toBeNull();
    expect(parseMonth("2023-12", now)).toBeNull();
    expect(parseMonth("2026-13", now)).toBeNull();
    expect(parseMonth(undefined, now)).toBeNull();
  });
  it("moves between months across years", () => {
    expect(shiftMonth("2026-01-01", -1)).toBe("2025-12");
    expect(shiftMonth("2026-11-01", 1)).toBe("2026-12");
  });
  it("delta", () => {
    expect(delta(12, 9)).toEqual({ dir: "up", n: 3 });
    expect(delta(2, 5)).toEqual({ dir: "down", n: 3 });
    expect(delta(4, 4)).toEqual({ dir: "same", n: 0 });
  });
});
