import { describe, expect, it } from "vitest";
import { backoffMs, nameFor, videoMayUpload, VIDEO_WIFI_WAIT_MS } from "./policy";

describe("retry backoff", () => {
  const mid = () => 0.5; // no jitter
  it("doubles from 2 s", () => {
    expect([1, 2, 3, 4].map((a) => backoffMs(a, mid))).toEqual([2000, 4000, 8000, 16000]);
  });
  it("caps at 5 minutes", () => expect(backoffMs(30, mid)).toBe(300_000));
  it("jitters within ±20%", () => {
    expect(backoffMs(1, () => 0)).toBe(1600);
    expect(backoffMs(1, () => 1)).toBe(2400);
  });
});

describe("video upload waits for Wi-Fi", () => {
  const t0 = 1_000_000;
  it("uploads on Wi-Fi or unknown connections", () => {
    expect(videoMayUpload({ type: "wifi" }, t0, t0, false)).toBe(true);
    expect(videoMayUpload(undefined, t0, t0, false)).toBe(true);
  });
  it("waits on mobile data and data saver", () => {
    expect(videoMayUpload({ type: "cellular" }, t0, t0 + 1000, false)).toBe(false);
    expect(videoMayUpload({ type: "wifi", saveData: true }, t0, t0, false)).toBe(false);
  });
  it("goes anyway after 24 hours or when the user taps Upload now", () => {
    expect(videoMayUpload({ type: "cellular" }, t0, t0 + VIDEO_WIFI_WAIT_MS, false)).toBe(true);
    expect(videoMayUpload({ type: "cellular" }, t0, t0, true)).toBe(true);
  });
});

it("default piece name", () => expect(nameFor(22, "Bangle")).toBe("22K Bangle"));
