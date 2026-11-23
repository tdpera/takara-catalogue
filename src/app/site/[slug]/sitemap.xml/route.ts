import { siteDb } from "@/lib/supabase/admin";
import { getSite } from "@/lib/site-data";
import { siteOrigin } from "@/lib/site-origin";

export const dynamic = "force-dynamic";

/** Sitemap for a shop website: home, collection, visit and every piece on show. */
export async function GET(_req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const site = await getSite(slug);
  if (!site) return new Response("Not found", { status: 404 });
  const origin = await siteOrigin(slug);
  const pieces = (await siteDb().rpc<{ sku: string; updated_at: string }[]>("site_sitemap", { p_slug: slug })) ?? [];
  const urls = [
    { loc: origin + "/", lastmod: site.updated_at },
    { loc: `${origin}/collection`, lastmod: pieces[0]?.updated_at ?? site.updated_at },
    { loc: `${origin}/visit`, lastmod: site.updated_at },
    ...pieces.map((p) => ({ loc: `${origin}/p/${p.sku}`, lastmod: p.updated_at })),
  ];
  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls
    .map((u) => `  <url><loc>${u.loc}</loc><lastmod>${new Date(u.lastmod).toISOString()}</lastmod></url>`)
    .join("\n")}\n</urlset>\n`;
  return new Response(xml, { headers: { "content-type": "application/xml; charset=utf-8", "cache-control": "public, max-age=3600" } });
}
