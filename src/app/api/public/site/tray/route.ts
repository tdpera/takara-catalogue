/**
 * POST /api/public/site/tray  { slug, ids, channel: "whatsapp" | "in_store", lang }
 * Turns a visitor's tray into a code (create_tray), and returns what the page needs next:
 * the WhatsApp link with the message already written (the visitor presses send), or the code
 * and a QR for staff to scan. Nothing is ever sent from here.
 */
import { NextResponse, type NextRequest } from "next/server";
import QRCode from "qrcode";
import { z } from "zod";
import { siteDb } from "@/lib/supabase/admin";
import { getSite, getTrayView } from "@/lib/site-data";
import { isValidSlug } from "@/lib/site-host";
import { appOrigin, siteOrigin } from "@/lib/site-origin";
import { isBot, visitorHash } from "@/lib/visitors";
import { whatsappLink } from "@/lib/share-message";
import { isLocale, makeT } from "@/i18n";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const Body = z.object({
  slug: z.string().refine(isValidSlug),
  ids: z.array(z.uuid()).min(1).max(24),
  channel: z.enum(["whatsapp", "in_store"]),
  lang: z.string().optional(),
});

const fail = (status = 400) => NextResponse.json({ ok: false }, { status, headers: { "cache-control": "no-store" } });

export async function POST(req: NextRequest) {
  const origin = req.headers.get("origin");
  if (!origin || new URL(origin).host !== req.headers.get("host")) return fail(403);
  const ua = req.headers.get("user-agent");
  if (isBot(ua)) return fail(403);
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return fail();
  const { slug, ids, channel } = parsed.data;
  const site = await getSite(slug);
  if (!site) return fail(404);
  const ip = (req.headers.get("x-forwarded-for") ?? "").split(",")[0].trim() || req.headers.get("x-real-ip") || "unknown";
  const code = await siteDb().rpc<string>("create_tray", {
    p_slug: slug, p_piece_ids: ids, p_channel: channel, p_visitor: await visitorHash(ip, ua!, `tray:${slug}`),
  });
  if (!code) return fail(409);
  const tray = await getTrayView(slug, code);
  if (!tray) return fail(409);

  const lang = isLocale(parsed.data.lang) ? parsed.data.lang : "en";
  const t = makeT(lang);
  const trayUrl = `${await siteOrigin(slug)}/t/${code}`;
  const lines = tray.cards.map((c, i) => `${i + 1}. ${c.name} (${c.sku})`);
  const text = [t("site.trayMessage", { shop: site.name }), ...lines, "", t("site.trayMessageCode", { code }), trayUrl].join("\n");
  // Staff scan this in the shop: it opens the tray in Takara.
  const staffUrl = `${await appOrigin()}/trays?code=${code}`;
  const qr = await QRCode.toString(staffUrl, { type: "svg", margin: 1, errorCorrectionLevel: "M", color: { dark: "#16130f", light: "#ffffff" } });
  return NextResponse.json(
    { ok: true, code, trayUrl, whatsapp: site.whatsapp ? whatsappLink(site.whatsapp, text) : null, qr },
    { headers: { "cache-control": "no-store" } },
  );
}
