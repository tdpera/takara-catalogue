/**
 * GET /site-img/{slug}/{storage path}: a photo, spin or logo for a shop website.
 * Served only if site_media_bucket() says the file belongs to a piece that website shows (or the
 * shop's logo). File paths never change (each file has its own id), so the CDN keeps a copy and
 * this runs rarely; signed URLs would change on every page and defeat that caching.
 */
import { NextResponse, type NextRequest } from "next/server";
import { siteDb } from "@/lib/supabase/admin";
import { isValidSlug } from "@/lib/site-host";

export const runtime = "nodejs";

const UUID = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";
// media/{shop}/{piece}/{photo|spin}-{id}[-thumb|-small].{jpg|png}  or  branding/{shop}/logo-{id}.{webp|png|jpg}
const MEDIA = new RegExp(`^${UUID}/${UUID}/(photo|spin)-${UUID}(-thumb|-small)?\\.(jpg|png)$`);
const LOGO = new RegExp(`^${UUID}/logo-${UUID}\\.(webp|png|jpg)$`);
const TYPES: Record<string, string> = { jpg: "image/jpeg", png: "image/png", webp: "image/webp" };

const notFound = () => new NextResponse(null, { status: 404, headers: { "cache-control": "public, max-age=60" } });

export async function GET(_req: NextRequest, { params }: { params: Promise<{ slug: string; path: string[] }> }) {
  const { slug, path: parts } = await params;
  const path = parts.join("/");
  if (!isValidSlug(slug) || !(MEDIA.test(path) || LOGO.test(path))) return notFound();
  const db = siteDb();
  const bucket = await db.rpc<"media" | "branding">("site_media_bucket", { p_slug: slug, p_path: path }).catch(() => null);
  if (!bucket) return notFound();
  const file = await db.download(bucket, path);
  if (!file) return notFound();
  return new NextResponse(file.stream(), {
    headers: {
      "content-type": TYPES[path.split(".").pop()!] ?? "application/octet-stream",
      "content-length": String(file.size),
      // A day in browsers, a week at the CDN. A piece hidden later drops off within that time.
      "cache-control": "public, max-age=86400, s-maxage=604800, stale-while-revalidate=86400",
      "x-content-type-options": "nosniff",
    },
  });
}
