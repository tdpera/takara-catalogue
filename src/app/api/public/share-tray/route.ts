/**
 * POST /api/public/share-tray  { token, ids, channel: "whatsapp" | "in_store", lang }
 * A customer's answer to a Digital tray the shop sent: saves the pieces they'd like to see
 * (create_tray_from_share) and returns the code, a QR for staff, and a WhatsApp link with the
 * reply already written (to the shop's number, else the salesperson who sent the tray). Nothing
 * is ever sent from here; the customer presses send.
 */
import { NextResponse, type NextRequest } from "next/server";
import QRCode from "qrcode";
import { z } from "zod";
import { siteDb } from "@/lib/supabase/admin";
import { appOrigin } from "@/lib/site-origin";
import { isBot, visitorHash } from "@/lib/visitors";
import { whatsappLink } from "@/lib/share-message";
import { isLocale, makeT } from "@/i18n";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const Body = z.object({
  token: z.string().regex(/^[A-Za-z0-9_-]{22}$/),
  ids: z.array(z.uuid()).min(1).max(24),
  channel: z.enum(["whatsapp", "in_store"]),
  lang: z.string().optional(),
});
type Share = { status: string; shop: string; reply_to: string | null; pieces: { id: string; sku: string; name: string }[] };

const fail = (status = 400) => NextResponse.json({ ok: false }, { status, headers: { "cache-control": "no-store" } });

export async function POST(req: NextRequest) {
  const origin = req.headers.get("origin");
  if (!origin || new URL(origin).host !== req.headers.get("host")) return fail(403);
  const ua = req.headers.get("user-agent");
  if (isBot(ua)) return fail(403);
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return fail();
  const { token, ids, channel } = parsed.data;
  const db = siteDb();
  const share = await db.rpc<Share>("get_share", { p_token: token });
  if (!share || share.status !== "ok") return fail(404);
  const ip = (req.headers.get("x-forwarded-for") ?? "").split(",")[0].trim() || req.headers.get("x-real-ip") || "unknown";
  const code = await db.rpc<string>("create_tray_from_share", {
    p_token: token, p_piece_ids: ids, p_channel: channel, p_visitor: await visitorHash(ip, ua!, `share:${token}`),
  });
  if (!code) return fail(409);

  const lang = isLocale(parsed.data.lang) ? parsed.data.lang : "en";
  const t = makeT(lang);
  const chosen = new Set(ids);
  const lines = share.pieces.filter((p) => chosen.has(p.id)).map((p, i) => `${i + 1}. ${p.name} (${p.sku})`);
  const text = [t("pub.replyMessage", { shop: share.shop }), ...lines, "", t("site.trayMessageCode", { code })].join("\n");
  const qr = await QRCode.toString(`${await appOrigin()}/trays?code=${code}`, { type: "svg", margin: 1, errorCorrectionLevel: "M", color: { dark: "#16130f", light: "#ffffff" } });
  return NextResponse.json(
    { ok: true, code, qr, whatsapp: share.reply_to ? whatsappLink(share.reply_to, text) : null },
    { headers: { "cache-control": "no-store" } },
  );
}
