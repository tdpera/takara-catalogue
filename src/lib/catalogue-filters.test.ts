import { describe, expect, it } from "vitest";
import { cleanQuery, filterHref, hasFilters, parseFilters, PAGE } from "./catalogue-filters";

describe("parseFilters", () => {
  it("defaults to everything, first page", () => {
    expect(parseFilters({})).toEqual({ q: "", category: null, karat: null, status: null, n: PAGE });
  });
  it("accepts valid values", () => {
    expect(parseFilters({ q: "rope", category: "Bangle", karat: "22", status: "sold", n: "96" })).toEqual({
      q: "rope", category: "Bangle", karat: 22, status: "sold", n: 96,
    });
  });
  it("ignores invalid values", () => {
    expect(parseFilters({ category: "Tiara", karat: "10", status: "lost", n: "-5" })).toMatchObject({
      category: null, karat: null, status: null, n: PAGE,
    });
    expect(parseFilters({ karat: "22abc" }).karat).toBeNull();
  });
  it("rounds and caps the page size", () => {
    expect(parseFilters({ n: "30" }).n).toBe(48);
    expect(parseFilters({ n: "100000" }).n).toBe(480);
    expect(parseFilters({ n: "1.5" }).n).toBe(PAGE);
  });
  it("takes the first of repeated params", () => {
    expect(parseFilters({ karat: ["18", "22"] }).karat).toBe(18);
  });
});

describe("cleanQuery", () => {
  it("keeps letters in every script, digits, spaces and hyphens", () => {
    expect(cleanQuery("  ALF-0042 ")).toBe("ALF-0042");
    expect(cleanQuery("سوار")).toBe("سوار");
    expect(cleanQuery("कंगन")).toBe("कंगन");
    expect(cleanQuery("വള")).toBe("വള");
  });
  it("removes characters that mean something in a PostgREST filter", () => {
    expect(cleanQuery("a,b(c)*d%e_f\\g")).toBe("a b c d e f g");
    expect(cleanQuery("name.ilike.*x*,sku.eq.1")).toBe("name ilike x sku eq 1");
  });
  it("limits the length", () => {
    expect(cleanQuery("x".repeat(100))).toHaveLength(60);
  });
});

describe("filterHref", () => {
  const f = parseFilters({ q: "rope", karat: "22", n: "96" });
  it("changes one filter and goes back to the first page", () => {
    expect(filterHref(f, { category: "Ring" })).toBe("/?q=rope&category=Ring&karat=22");
  });
  it("keeps the page size when only that changes", () => {
    expect(filterHref(f, { n: 144 })).toBe("/?q=rope&karat=22&n=144");
  });
  it("clears to the plain catalogue", () => {
    expect(filterHref(f, { q: "", karat: null })).toBe("/");
    expect(hasFilters(parseFilters({}))).toBe(false);
    expect(hasFilters(f)).toBe(true);
  });
});
