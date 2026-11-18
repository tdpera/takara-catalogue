/**
 * POST /api/public/share-view  { token }
 * Called by the share page's script once the page is visible in a real browser. Records the
 * view unless it's a robot, the salesperson themselves, or a repeat (see record_share_view).
 * Always answers 204, so it reveals nothing about the link.
 */
import { NextResponse, type NextRequest } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { isBot, visitorHash } from "@/lib/visitors";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const done = () => new NextResponse(null, { status: 204, headers: { "cache-control": "no-store" } });

export async function POST(req: NextRequest) {
  const origin = req.headers.get("origin");
  if (!origin || new URL(origin).host !== req.headers.get("host")) return done();
  const ua = req.headers.get("user-agent");
  if (isBot(ua)) return done();
  let token = "";
  try {
    const body = (await req.json()) as { token?: unknown };
    token = typeof body.token === "string" ? body.token : "";
  } catch {
    return done();
  }
  if (!/^[A-Za-z0-9_-]{22}$/.test(token)) return done();
  const ip = (req.headers.get("x-forwarded-for") ?? "").split(",")[0].trim() || req.headers.get("x-real-ip") || "unknown";
  // The user's own session (if any), so the salesperson's visits are recognised and skipped.
  const supabase = await supabaseServer();
  const { error } = await supabase.rpc("record_share_view", { p_token: token, p_visitor: await visitorHash(ip, ua!, token) });
  if (error) console.error("[share-view]", error.message);
  return done();
}
