import { getSite } from "@/lib/site-data";
import { siteOrigin } from "@/lib/site-origin";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  if (!(await getSite(slug))) return new Response("User-agent: *\nDisallow: /\n", { headers: { "content-type": "text/plain" } });
  const origin = await siteOrigin(slug);
  return new Response(`User-agent: *\nAllow: /\nDisallow: /tray\nDisallow: /t/\nSitemap: ${origin}/sitemap.xml\n`, {
    headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "public, max-age=3600" },
  });
}
