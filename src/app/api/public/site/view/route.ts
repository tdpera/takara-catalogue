/**
 * POST /api/public/site/view  { slug, sku? }
 * Called by a website page's script once it's visible in a real browser. Records the visit
 * (or piece view) unless it's a robot, the shop's own staff, or a repeat. Always answers 204.
 */
import { NextResponse, type NextRequest } from "next/server";
import { cookies } from "next/headers";
import { siteDb } from "@/lib/supabase/admin";
import { supabaseServer } from "@/lib/supabase/server";
import { isValidSlug } from "@/lib/site-host";
import { isBot, visitorHash } from "@/lib/visitors";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const done = () => new NextResponse(null, { status: 204, headers: { "cache-control": "no-store" } });

export async function POST(req: NextRequest) {
  const origin = req.headers.get("origin");
  if (!origin || new URL(origin).host !== req.headers.get("host")) return done();
  const ua = req.headers.get("user-agent");
  if (isBot(ua)) return done();
  let slug = "", sku: string | null = null;
  try {
    const body = (await req.json()) as { slug?: unknown; sku?: unknown };
    slug = typeof body.slug === "string" ? body.slug : "";
    sku = typeof body.sku === "string" && /^[A-Z0-9]{1,6}-\d{1,9}$/.test(body.sku) ? body.sku : null;
  } catch {
    return done();
  }
  if (!isValidSlug(slug)) return done();
  // Staff browsing their own website (signed in on the same address) aren't counted.
  let viewer: string | null = null;
  if ((await cookies()).getAll().some((c) => c.name.startsWith("sb-"))) {
    const { data } = await (await supabaseServer()).auth.getUser();
    viewer = data.user?.id ?? null;
  }
  const ip = (req.headers.get("x-forwarded-for") ?? "").split(",")[0].trim() || req.headers.get("x-real-ip") || "unknown";
  await siteDb()
    .rpc("record_site_view", { p_slug: slug, p_sku: sku, p_visitor: await visitorHash(ip, ua!, `site:${slug}`), p_viewer: viewer })
    .catch((e) => console.error("[site-view]", e instanceof Error ? e.message : e));
  return done();
}
