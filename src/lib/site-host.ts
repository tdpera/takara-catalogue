/**
 * Shop website addresses. Each published shop has a website at <slug>.<NEXT_PUBLIC_SITE_DOMAIN>
 * (e.g. alnoor.takara.ae). Until a domain is set up, and always as a fallback, it is also served
 * at <app>/site/<slug>. Locally, <slug>.localhost:3000 works too (browsers resolve *.localhost).
 */

/** Same rules as the database (shop_sites.slug). */
export const SLUG_RE = /^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$/;
export const RESERVED_SLUGS = [
  "app", "www", "admin", "api", "mail", "static", "assets", "cdn", "help", "support",
  "status", "blog", "login", "site", "takara", "dashboard", "shop", "shops", "files",
] as const;

export function isValidSlug(s: string): boolean {
  return SLUG_RE.test(s) && !(RESERVED_SLUGS as readonly string[]).includes(s);
}

/** A suggested address from the shop's name: "Al Noor Jewellers" -> "al-noor-jewellers". */
export function suggestSlug(name: string): string {
  const s = name
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\(.*?\)/g, " ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40)
    .replace(/-+$/g, "");
  if (isValidSlug(s)) return s;
  return s.length >= 3 ? `${s}-shop`.slice(0, 40) : "my-shop";
}

/**
 * The shop a request's host belongs to, or null for the app itself.
 * "alnoor.takara.ae" -> "alnoor" (with domain "takara.ae"); "alnoor.localhost:3000" -> "alnoor";
 * "app.takara.ae", "takara.ae", "foo.bar.takara.ae" and other hosts -> null.
 */
export function slugFromHost(rawHost: string | null | undefined, domain: string | undefined): string | null {
  if (!rawHost) return null;
  const host = rawHost.toLowerCase().replace(/:\d+$/, "").replace(/\.$/, "");
  let sub: string | null = null;
  if (host.endsWith(".localhost")) sub = host.slice(0, -".localhost".length);
  else if (domain) {
    const d = domain.toLowerCase().replace(/^\.+|\.+$/g, "");
    if (d && host.endsWith("." + d)) sub = host.slice(0, -(d.length + 1));
  }
  if (!sub || sub.includes(".")) return null;
  return isValidSlug(sub) ? sub : null;
}

/** The public address of a shop's website, for links shown in the app and in messages. */
export function siteAddress(slug: string, appOrigin: string, domain = process.env.NEXT_PUBLIC_SITE_DOMAIN): string {
  if (domain) return `https://${slug}.${domain.replace(/^\.+|\.+$/g, "")}`;
  return `${appOrigin.replace(/\/$/, "")}/site/${slug}`;
}
