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
import { PieceMedia } from "@/components/piece/PieceMedia";
import { DescriptionTabs } from "@/components/piece/DescriptionTabs";
import { StatusControl } from "@/components/piece/StatusControl";
import { btn, btnLink, card } from "@/components/ui";

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
      <main className="mx-auto max-w-5xl px-4 pt-3 pb-16">
        <Link href="/" className={btnLink}>
          <span aria-hidden="true" className="rtl:rotate-180">←</span>&nbsp;{t("piece.back")}
        </Link>
        <div className="mt-2 grid gap-6 md:grid-cols-2 md:items-start">
          <PieceMedia name={piece.name} photo={piece.photo} spin={piece.spin} />

          <div className="space-y-5">
            <div className="space-y-2">
              <h1 className="text-2xl leading-tight font-semibold [overflow-wrap:anywhere]">{piece.name}</h1>
              <ul className="flex flex-wrap gap-2 text-sm">
                <li dir="ltr" className="num rounded-full border border-line bg-surface px-3 py-0.5">{piece.karat}K</li>
                <li dir="ltr" className="num rounded-full border border-line bg-surface px-3 py-0.5">{formatGrams(piece.gross_g)}</li>
                <li className="rounded-full border border-line bg-surface px-3 py-0.5">{t(`categories.${piece.category}` as MessageKey)}</li>
                <li className="rounded-full border border-line bg-surface px-3 py-0.5">
                  {t("piece.sku")} <span dir="ltr" className="num">{piece.sku}</span>
                </li>
              </ul>
              <p className="text-sm text-muted">
                {t("piece.added")} <span className="num">{formatDubaiDateTime(piece.created_at, locale)}</span>
              </p>
            </div>

            <section aria-labelledby="price-h" className={card}>
              <h2 id="price-h" className="mb-2 font-semibold">{t("piece.price")}</h2>
              <PriceBreakdown piece={piece} rates={rates} vatEnabled={vatEnabled} />
            </section>

            <section className={card}>
              <StatusControl pieceId={piece.id} status={piece.status} />
            </section>

            <section aria-labelledby="desc-h" className={card}>
              <h2 id="desc-h" className="mb-2 font-semibold">{t("piece.description")}</h2>
              <DescriptionTabs descriptions={piece.descriptions ?? {}} />
            </section>

            {canEdit && (
              <Link href={`/p/${piece.id}/edit`} className={btn + " w-full"}>
                {t("piece.edit")}
              </Link>
            )}
          </div>
        </div>
      </main>
    </>
  );
}
