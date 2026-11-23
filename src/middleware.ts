import { NextResponse, type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";
import { slugFromHost, isValidSlug } from "@/lib/site-host";

const LOCALES = ["en", "ar", "hi", "ml"];
const SITE_LANG_COOKIE = "site_lang";
// Headers only this middleware may set: anything a visitor sends under these names is dropped.
const OWN_HEADERS = ["x-site-slug", "x-site-host", "x-site-lang", "x-site-path"];

/** The visitor's language on a shop website: ?lang=, then their last choice, then their browser. */
function siteLang(req: NextRequest): { lang: string; remember: boolean } {
  const q = req.nextUrl.searchParams.get("lang");
  if (q && LOCALES.includes(q)) return { lang: q, remember: true };
  const c = req.cookies.get(SITE_LANG_COOKIE)?.value;
  if (c && LOCALES.includes(c)) return { lang: c, remember: false };
  const accept = (req.headers.get("accept-language") ?? "").toLowerCase();
  const first = accept.split(",").map((x) => x.trim().slice(0, 2)).find((x) => LOCALES.includes(x));
  return { lang: first ?? "en", remember: false };
}

function forSite(req: NextRequest, slug: string, onOwnHost: boolean): NextResponse {
  // The whole collection isn't public any more: its old address goes to the showcase.
  const rel = onOwnHost ? req.nextUrl.pathname : req.nextUrl.pathname.replace(/^\/site\/[^/]+/, "") || "/";
  if (rel === "/collection" || rel.startsWith("/collection/")) {
    const url = req.nextUrl.clone();
    url.pathname = onOwnHost ? "/" : `/site/${slug}`;
    url.search = "";
    url.hash = "showcase";
    return NextResponse.redirect(url);
  }
  const headers = new Headers(req.headers);
  OWN_HEADERS.forEach((h) => headers.delete(h));
  const { lang, remember } = siteLang(req);
  headers.set("x-site-slug", slug);
  headers.set("x-site-lang", lang);
  headers.set("x-site-path", onOwnHost ? req.nextUrl.pathname : req.nextUrl.pathname.replace(/^\/site\/[^/]+/, "") || "/");
  if (onOwnHost) headers.set("x-site-host", slug);
  let res: NextResponse;
  if (onOwnHost) {
    const url = req.nextUrl.clone();
    url.pathname = `/site/${slug}${req.nextUrl.pathname === "/" ? "" : req.nextUrl.pathname}`;
    res = NextResponse.rewrite(url, { request: { headers } });
  } else {
    res = NextResponse.next({ request: { headers } });
  }
  if (remember) res.cookies.set(SITE_LANG_COOKIE, lang, { path: "/", maxAge: 365 * 86400, sameSite: "lax" });
  return res;
}

export function middleware(request: NextRequest) {
  const path = request.nextUrl.pathname;
  // A shop's own address (alnoor.takara.ae): everything is that shop's website, except the
  // image and visit endpoints, which work the same on every host.
  const hostSlug = slugFromHost(request.headers.get("host"), process.env.NEXT_PUBLIC_SITE_DOMAIN);
  if (hostSlug) {
    if (path.startsWith("/api/public/") || path.startsWith("/site-img/")) return NextResponse.next();
    if (path.startsWith("/site/")) {
      // /site/<slug>/... on a shop address: send it to the same page on the shop's address.
      const url = request.nextUrl.clone();
      url.pathname = path.replace(/^\/site\/[^/]+/, "") || "/";
      return NextResponse.redirect(url);
    }
    return forSite(request, hostSlug, true);
  }
  // /site/<slug>/... on the app's address: the website before a domain is set up.
  const m = path.match(/^\/site\/([^/]+)/);
  if (m) return isValidSlug(m[1]) ? forSite(request, m[1], false) : NextResponse.next();
  return updateSession(request);
}

export const config = {
  // Static files (build output, icons, the launch film, images) skip this entirely.
  matcher: ["/((?!_next/static|_next/image|favicon.ico|icons/|splash/|manifest.webmanifest|sw.js|.*\\.(?:png|jpg|jpeg|svg|webp|ico|mp4|webm)$).*)"],
};
