import "server-only";
import { headers } from "next/headers";
import { siteAddress, slugFromHost } from "./site-host";

/** The app's own address (where staff sign in), e.g. https://app.takara.ae. */
export async function appOrigin(): Promise<string> {
  if (process.env.NEXT_PUBLIC_SITE_URL) return process.env.NEXT_PUBLIC_SITE_URL.replace(/\/$/, "");
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const domain = process.env.NEXT_PUBLIC_SITE_DOMAIN;
  const proto = h.get("x-forwarded-proto") ?? (/^(localhost|[^.]+\.localhost)(:|$)/.test(host) ? "http" : "https");
  // On a shop's own address, the app lives at app.<domain>.
  if (domain && host.endsWith("." + domain)) return `https://app.${domain}`;
  return `${proto}://${host.replace(/^[^.]+\.localhost/, "localhost")}`;
}

/** A shop website's public address: the address it's being visited on, if that's its own. */
export async function siteOrigin(slug: string): Promise<string> {
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host");
  if (host && slugFromHost(host, process.env.NEXT_PUBLIC_SITE_DOMAIN) === slug) {
    const proto = h.get("x-forwarded-proto") ?? (/\.localhost(:|$)/.test(host) ? "http" : "https");
    return `${proto}://${host}`;
  }
  return siteAddress(slug, await appOrigin());
}
