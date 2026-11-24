import { describe, expect, it } from "vitest";
import { needsAttention, shopIssues, type ShopIssueInput } from "./shop-issues";

const now = new Date("2026-11-26T10:00:00Z");
const ago = (days: number) => new Date(now.getTime() - days * 86400_000).toISOString();
const healthy: ShopIssueInput = {
  status: "active", is_demo: false, last_activity: ago(0.1), rates_set_at: ago(0.1),
  site: { published: true }, health: { choices_waiting: 0, ai_errors_7d: 0, no_photo: 0 },
};

describe("shopIssues", () => {
  it("a healthy shop has none", () => {
    expect(shopIssues(healthy, now)).toEqual([]);
  });
  it("lists problems worst first: customers waiting, then broken things, then quiet, then notes", () => {
    const s = { ...healthy, last_activity: ago(9), rates_set_at: ago(4), site: null, health: { choices_waiting: 2, ai_errors_7d: 1, no_photo: 5 } };
    expect(shopIssues(s, now)).toEqual([
      { kind: "choices", level: 3, count: 2 },
      { kind: "photos", level: 2, count: 5 },
      { kind: "rates", level: 2, count: 4 },
      { kind: "ai", level: 2, count: 1 },
      { kind: "quiet", level: 1, count: 9 },
      { kind: "nosite", level: 0, count: 0 },
    ]);
  });
  it("rates never set and nothing ever done count as issues too", () => {
    const kinds = shopIssues({ ...healthy, rates_set_at: null, last_activity: null }, now).map((i) => [i.kind, i.count]);
    expect(kinds).toEqual([["rates", -1], ["quiet", -1]]);
  });
  it("rates from two days ago are still fine; three days is stale", () => {
    expect(shopIssues({ ...healthy, rates_set_at: ago(2) }, now)).toEqual([]);
    expect(shopIssues({ ...healthy, rates_set_at: ago(3) }, now).map((i) => i.kind)).toEqual(["rates"]);
  });
  it("shops waiting for approval or suspended have nothing to fix", () => {
    const broken = { ...healthy, rates_set_at: null, health: { choices_waiting: 3, ai_errors_7d: 0, no_photo: 0 } };
    expect(shopIssues({ ...broken, status: "pending" }, now)).toEqual([]);
    expect(shopIssues({ ...broken, status: "suspended" }, now)).toEqual([]);
  });
});

describe("needsAttention", () => {
  it("merges all shops, worst first, and leaves out the demo shop and notes", () => {
    const shops = [
      { ...healthy, id: "a", name: "Amber", site: null, rates_set_at: ago(5) },
      { ...healthy, id: "b", name: "Basil", health: { choices_waiting: 1, ai_errors_7d: 0, no_photo: 0 } },
      { ...healthy, id: "d", name: "Demo", is_demo: true, health: { choices_waiting: 9, ai_errors_7d: 0, no_photo: 0 } },
    ];
    expect(needsAttention(shops, now).map((x) => [x.shop.id, x.issue.kind])).toEqual([["b", "choices"], ["a", "rates"]]);
  });
});
