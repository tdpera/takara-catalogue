import { describe, expect, it } from "vitest";
import { mediaPaths } from "./media-paths";

describe("media paths", () => {
  const s = "11111111-1111-1111-1111-111111111111", p = "22222222-2222-2222-2222-222222222222", m = "33333333-3333-3333-3333-333333333333";
  it("photo has a thumbnail", () =>
    expect(mediaPaths(s, p, m, "photo", "jpg")).toEqual({ main: `${s}/${p}/photo-${m}.jpg`, thumb: `${s}/${p}/photo-${m}-thumb.jpg`, mainType: "image/jpeg" }));
  it("spin has a small sprite", () => expect(mediaPaths(s, p, m, "spin", "jpg").thumb).toBe(`${s}/${p}/spin-${m}-small.jpg`));
  it("video keeps its own extension", () => expect(mediaPaths(s, p, m, "video", "mov").main).toBe(`${s}/${p}/video-${m}.mov`));
  it("rejects other video types", () => expect(() => mediaPaths(s, p, m, "video", "exe")).toThrow());
  it("always starts with the shop id (required by storage RLS)", () => {
    for (const k of ["photo", "spin", "video"] as const) expect(mediaPaths(s, p, m, k, "mp4").main.startsWith(s + "/")).toBe(true);
  });
});
