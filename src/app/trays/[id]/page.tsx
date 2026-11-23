import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { requireShop } from "@/lib/session";
import { getT } from "@/i18n/server";
import { sign } from "@/lib/catalogue";
import { getShopPricing } from "@/lib/shop-data";
import { priceOf, type Karat } from "@/lib/pricing";
import { formatAED, formatDubaiDateTime, formatGrams } from "@/lib/format";
import type { MessageKey } from "@/i18n";
import { AppHeader } from "@/components/AppHeader";
import { IconBack } from "@/components/icons";
import { SellButton } from "../SellButton";

export const metadata: Metadata = { title: "Tray" };

type PieceRow = {
  id: string; sku: string; name: string; category: string; karat: Karat; gross_g: number; stone_g: number;
  making_per_g: number; making_flat: number | null; extras_aed: number; status: "in_stock" | "reserved" | "sold"; sold_via: string | null;
  piece_media: { type: string; thumb_path: string | null; created_at: string }[];
};

export default async function TrayPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) notFound();
  const { supabase, memberships, current } = await requireShop();
  const { t, locale } = await getT();
  const { data: tray } = await supabase
    .from("site_trays")
    .select("id, shop_id, code, piece_ids, channel, created_at, opened_at, share_id")
    .eq("id", id)
    .maybeSingle<{ id: string; shop_id: string; code: string; piece_ids: string[]; channel: "whatsapp" | "in_store"; created_at: string; opened_at: string | null; share_id: string | null }>();
  if (!tray) notFound();
  // A reply to a tray someone in the shop sent: name the client for the salesperson who sent it.
  const { data: sentTray } = tray.share_id
    ? await supabase.from("shares").select("client:clients(name)").eq("id", tray.share_id).maybeSingle<{ client: { name: string } | null }>()
    : { data: null };
  const { data: rows } = await supabase
    .from("pieces")
    .select("id, sku, name, category, karat, gross_g, stone_g, making_per_g, making_flat, extras_aed, status, sold_via, piece_media(type, thumb_path, created_at)")
    .in("id", tray.piece_ids)
    .returns<PieceRow[]>();
  const byId = new Map((rows ?? []).map((r) => [r.id, r]));
  const pieces = tray.piece_ids.flatMap((pid) => (byId.has(pid) ? [byId.get(pid)!] : []));
  const thumbOf = (p: PieceRow) => p.piece_media.filter((m) => m.type === "photo").sort((a, b) => a.created_at.localeCompare(b.created_at))[0]?.thumb_path;
  const [urls, { rates, vatEnabled }] = await Promise.all([sign(pieces.map(thumbOf)), getShopPricing(tray.shop_id)]);

  return (
    <>
      <AppHeader memberships={memberships} current={current} />
      <main id="main" className="mx-auto max-w-3xl space-y-6 px-4 py-6 pb-28">
        <Link href="/trays" className="inline-flex min-h-11 items-center gap-1.5 text-sm font-semibold text-muted hover:text-ink">
          <IconBack size={18} className="rtl:rotate-180" /> {t("trays.title")}
        </Link>
        <div className="text-center">
          <p className="eyebrow">
            {tray.share_id ? (sentTray?.client?.name ? t("trays.replyFrom", { name: sentTray.client.name }) : t("trays.replyToSent")) : t("trays.fromWebsite")} · {t(tray.channel === "whatsapp" ? "trays.viaWhatsApp" : "trays.viaShop")}
          </p>
          <h1 dir="ltr" className="num mt-2 font-display text-[2.8rem] leading-none tracking-[0.16em]">{tray.code}</h1>
          <p className="mt-3 text-sm text-muted">
            {t("trays.created", { time: formatDubaiDateTime(tray.created_at, locale) })}
            {tray.opened_at && <> · {t("trays.opened", { time: formatDubaiDateTime(tray.opened_at, locale) })}</>}
          </p>
        </div>
        <ol className="divide-y divide-line border-y border-line">
          {pieces.map((p, i) => {
            const pr = priceOf(p, rates, vatEnabled);
            const thumb = thumbOf(p);
            return (
              <li key={p.id} className="flex items-center gap-3.5 py-3">
                <span aria-hidden="true" className="num w-5 text-center text-sm text-muted">{i + 1}</span>
                <Link href={`/p/${p.id}`} aria-hidden="true" tabIndex={-1} className="size-18 shrink-0 overflow-hidden bg-tile">
                  {thumb && urls.has(thumb) && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={urls.get(thumb)!} alt="" width={144} height={144} className="size-full object-cover" />
                  )}
                </Link>
                <div className="min-w-0 flex-1">
                  <Link href={`/p/${p.id}`} className="line-clamp-2 font-display text-[16.5px] leading-snug hover:underline">{p.name}</Link>
                  <p className="text-[12px] font-medium tracking-[0.05em] text-muted">
                    <span dir="ltr" className="num">{p.karat}K · {formatGrams(p.gross_g)} · {p.sku}</span> · {t(`categories.${p.category}` as MessageKey)}
                  </p>
                  {p.status !== "sold" && pr.ok && <p dir="ltr" className="num mt-0.5 text-start text-[14.5px] font-semibold">{formatAED(pr.price.totalWhole)}</p>}
                </div>
                {p.status === "sold" ? (
                  <span className="caps shrink-0 rounded-[2px] bg-ink px-2 py-1 text-[10px] font-semibold text-paper">
                    {t(p.sold_via === "tray" ? "trays.soldHere" : "status.sold")}
                  </span>
                ) : (
                  <SellButton trayId={tray.id} pieceId={p.id} name={p.name} />
                )}
              </li>
            );
          })}
        </ol>
        {pieces.length < tray.piece_ids.length && <p className="text-sm text-muted">{t("trays.missing")}</p>}
      </main>
    </>
  );
}
