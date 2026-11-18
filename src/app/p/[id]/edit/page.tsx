import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireShop } from "@/lib/session";
import { getPiece } from "@/lib/catalogue";
import { getShopPricing } from "@/lib/shop-data";
import { getT } from "@/i18n/server";
import { AppHeader } from "@/components/AppHeader";
import { btnLink } from "@/components/ui";
import { EditForm } from "./EditForm";

export const metadata: Metadata = { title: "Edit piece" };

const str = (v: number | null | undefined) => (v === null || v === undefined || Number(v) === 0 ? "" : String(v));

export default async function EditPiecePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { user, memberships, current } = await requireShop();
  const { t } = await getT();
  const piece = await getPiece(id);
  if (!piece) notFound();
  const role = memberships.find((m) => m.shop_id === piece.shop_id)?.role;
  const isAdmin = role === "owner" || role === "manager";
  const canEdit = isAdmin || piece.created_by === user.id;
  const { rates, vatEnabled } = await getShopPricing(piece.shop_id);

  return (
    <>
      <AppHeader memberships={memberships} current={current} />
      <main className="mx-auto max-w-3xl px-4 pt-3 pb-32">
        <Link href={`/p/${piece.id}`} className={btnLink}>
          <span aria-hidden="true" className="rtl:rotate-180">←</span>&nbsp;{piece.name}
        </Link>
        <h1 className="mt-2 mb-4 text-2xl font-semibold">
          {t("edit.title", { sku: piece.sku })}
        </h1>
        {canEdit ? (
          <EditForm
            shopId={piece.shop_id}
            canDelete={isAdmin}
            rates={rates}
            vatEnabled={vatEnabled}
            photoUrl={piece.photo?.full ?? null}
            initial={{
              id: piece.id,
              sku: piece.sku,
              name: piece.name,
              category: piece.category,
              karat: piece.karat,
              gross_g: String(piece.gross_g),
              stone_g: str(piece.stone_g),
              making_per_g: str(piece.making_per_g),
              making_flat: piece.making_flat === null ? "" : String(piece.making_flat),
              extras_aed: str(piece.extras_aed),
              descriptions: piece.descriptions ?? {},
            }}
          />
        ) : (
          <p role="alert" className="rounded-xl border border-warn bg-warn-soft p-3">{t("edit.notAllowed")}</p>
        )}
      </main>
    </>
  );
}
