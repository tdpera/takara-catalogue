import { describe, expect, it } from "vitest";
import { isBot, visitorHash } from "./visitors";

const chromeAndroid = "Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36";
const safariIphone = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Mobile/15E148 Safari/604.1";

describe("isBot", () => {
  it("lets phone browsers through", () => {
    expect(isBot(chromeAndroid)).toBe(false);
    expect(isBot(safariIphone)).toBe(false);
  });
  it("catches link previews and robots", () => {
    for (const ua of [
      "WhatsApp/2.24.25.76 A",
      "facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)",
      "TelegramBot (like TwitterBot)",
      "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)",
      "Slackbot-LinkExpanding 1.0 (+https://api.slack.com/robots)",
      "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/131.0 Safari/537.36",
      "curl/8.5.0",
      "",
      null,
    ]) expect(isBot(ua)).toBe(true);
  });
});

describe("visitorHash", () => {
  it("is stable within a Dubai day and different across days, people and links", async () => {
    const t1 = new Date("2026-11-18T10:00:00Z");
    const t2 = new Date("2026-11-18T19:00:00Z"); // 23:00 in Dubai, same day
    const t3 = new Date("2026-11-18T20:30:00Z"); // 00:30 the next day in Dubai
    const a = await visitorHash("1.2.3.4", chromeAndroid, "tok", t1);
    expect(a).toMatch(/^[0-9a-f]{32}$/);
    expect(await visitorHash("1.2.3.4", chromeAndroid, "tok", t2)).toBe(a);
    expect(await visitorHash("1.2.3.4", chromeAndroid, "tok", t3)).not.toBe(a);
    expect(await visitorHash("1.2.3.5", chromeAndroid, "tok", t1)).not.toBe(a);
    expect(await visitorHash("1.2.3.4", chromeAndroid, "tok2", t1)).not.toBe(a);
  });
  it("doesn't contain the address", async () => {
    expect(await visitorHash("203.0.113.9", chromeAndroid, "tok", new Date("2026-11-18T10:00:00Z"))).not.toContain("203.0");
  });
});
