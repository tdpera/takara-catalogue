import { describe, expect, it } from "vitest";
import { isValidSlug, siteAddress, slugFromHost, suggestSlug } from "./site-host";

describe("slugFromHost", () => {
  it("shop subdomains of the Takara domain", () => {
    expect(slugFromHost("alnoor.takara.ae", "takara.ae")).toBe("alnoor");
    expect(slugFromHost("AlNoor.Takara.ae:443", "takara.ae")).toBe("alnoor");
    expect(slugFromHost("gold-line.takara.ae.", "takara.ae")).toBe("gold-line");
  });
  it("*.localhost for local testing", () => {
    expect(slugFromHost("demo.localhost:3000", undefined)).toBe("demo");
  });
  it("the app itself, reserved names and other hosts are not shops", () => {
    expect(slugFromHost("takara.ae", "takara.ae")).toBeNull();
    expect(slugFromHost("app.takara.ae", "takara.ae")).toBeNull();
    expect(slugFromHost("www.takara.ae", "takara.ae")).toBeNull();
    expect(slugFromHost("a.b.takara.ae", "takara.ae")).toBeNull();
    expect(slugFromHost("localhost:3000", undefined)).toBeNull();
    expect(slugFromHost("takara-xyz.vercel.app", undefined)).toBeNull();
    expect(slugFromHost("alnoor.takara.ae", undefined)).toBeNull();
    expect(slugFromHost("evil-takara.ae", "takara.ae")).toBeNull();
    expect(slugFromHost(null, "takara.ae")).toBeNull();
  });
});

describe("slugs", () => {
  it("validates like the database", () => {
    expect(isValidSlug("al-noor")).toBe(true);
    expect(isValidSlug("ab")).toBe(false);
    expect(isValidSlug("-abc")).toBe(false);
    expect(isValidSlug("abc-")).toBe(false);
    expect(isValidSlug("Abc")).toBe(false);
    expect(isValidSlug("admin")).toBe(false);
  });
  it("suggests an address from the shop name", () => {
    expect(suggestSlug("Al Noor Jewellers (demo)")).toBe("al-noor-jewellers");
    expect(suggestSlug("Café Gold")).toBe("cafe-gold");
    expect(suggestSlug("ذهب")).toBe("my-shop");
    expect(suggestSlug("App")).toBe("app-shop");
  });
  it("public address: subdomain when a domain is set, /site/<slug> before", () => {
    expect(siteAddress("alnoor", "https://x.vercel.app", "takara.ae")).toBe("https://alnoor.takara.ae");
    expect(siteAddress("alnoor", "https://x.vercel.app/", "")).toBe("https://x.vercel.app/site/alnoor");
  });
});
