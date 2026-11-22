import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireShop } from "@/lib/session";
import { getPiece } from "@/lib/catalogue";
import { getShopPricing } from "@/lib/shop-data";
import { formatDubaiDateTime, formatGrams } from "@/lib/format";
import type { MessageKey } from "@/i18n";
import { getT } from "@/i18n/server";
import { AppHeader } from "@/components/AppHeader";
import { PriceBreakdown } from "@/components/PriceBreakdown";
import { BackLink } from "@/components/piece/BackLink";
import { PieceMedia } from "@/components/piece/PieceMedia";
import { DescriptionTabs } from "@/components/piece/DescriptionTabs";
import { StatusControl } from "@/components/piece/StatusControl";
import { btn, btnPrimary, card } from "@/components/ui";
import { IconShare } from "@/components/icons";

export const metadata: Metadata = { title: "Piece" };

export default async function PiecePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { user, memberships, current } = await requireShop();
  const { t, locale } = await getT();
  const piece = await getPiece(id);
  if (!piece) notFound();
  const shopId = piece.shop_id;
  const role = memberships.find((m) => m.shop_id === shopId)?.role;
  const canEdit = piece.created_by === user.id || role === "owner" || role === "manager";
  const { rates, vatEnabled } = await getShopPricing(shopId);

  return (
    <>
      <AppHeader memberships={memberships} current={current} />
      <main id="main" className="mx-auto max-w-5xl px-4 pt-2 pb-16">
        <BackLink pieceId={piece.id} label={t("piece.back")} />
        <div className="mt-1 grid gap-6 md:grid-cols-[1.1fr_1fr] md:items-start md:gap-10">
          <div className="md:sticky md:top-32">
            <PieceMedia name={piece.name} photo={piece.photo} spin={piece.spin} />
          </div>

          <div className="space-y-5">
            <div>
              <p className="eyebrow">
                {t(`categories.${piece.category}` as MessageKey)} · <span dir="ltr">{piece.sku}</span>
              </p>
              <h1 className="mt-2 font-display text-[2.3rem] leading-[1.08] [overflow-wrap:anywhere]">{piece.name}</h1>
              <ul className="mt-3 flex flex-wrap gap-2 text-sm">
                <li dir="ltr" className="num rounded-[2px] border border-gold-line/60 bg-gold-soft px-2.5 py-1 text-[13px]">{piece.karat}K</li>
                <li dir="ltr" className="num rounded-[2px] border border-line px-2.5 py-1 text-[13px]">{formatGrams(piece.gross_g)}</li>
                {piece.status !== "in_stock" && (
                  <li className="caps rounded-[2px] border border-warn/40 bg-warn-soft px-2.5 py-1 text-[11px] font-semibold text-warn">{t(`status.${piece.status}`)}</li>
                )}
              </ul>
            </div>

            <section aria-labelledby="price-h" className={card}>
              <h2 id="price-h" className="sr-only">{t("piece.price")}</h2>
              <PriceBreakdown piece={piece} rates={rates} vatEnabled={vatEnabled} variant="headline" />
            </section>

            <div className="flex gap-2">
              {piece.status !== "sold" && (
                <Link href={`/share?ids=${piece.id}`} className={btnPrimary + " flex-1"}>
                  <IconShare size={18} /> {t("catalogue.share")}
                </Link>
              )}
              {canEdit && (
                <Link href={`/p/${piece.id}/edit`} className={btn + " flex-1"}>
                  {t("piece.edit")}
                </Link>
              )}
            </div>

            <section className={card}>
              <StatusControl pieceId={piece.id} status={piece.status} />
            </section>

            <section aria-labelledby="desc-h" className={card}>
              <h2 id="desc-h" className="eyebrow mb-3">{t("piece.description")}</h2>
              <DescriptionTabs descriptions={piece.descriptions ?? {}} />
            </section>

            <p className="text-center text-sm text-muted">
              {t("piece.added")} <span>{formatDubaiDateTime(piece.created_at, locale)}</span>
            </p>
          </div>
        </div>
      </main>
    </>
  );
}
