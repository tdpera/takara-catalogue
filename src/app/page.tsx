import Link from "next/link";
import { requireShop } from "@/lib/session";
import { listCards } from "@/lib/catalogue";
import { filterHref, hasFilters, parseFilters, PAGE } from "@/lib/catalogue-filters";
import { getT } from "@/i18n/server";
import { AppHeader } from "@/components/AppHeader";
import { Filters } from "@/components/catalogue/Filters";
import { Grid } from "@/components/catalogue/Grid";
import { btn, btnLink, btnPrimary } from "@/components/ui";

export default async function CataloguePage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { memberships, current } = await requireShop();
  const { t } = await getT();
  const f = parseFilters(await searchParams);
  const { cards, total } = await listCards(current.shop_id, f);
  const filtered = hasFilters(f);

  return (
    <>
      <AppHeader memberships={memberships} current={current} />
      <main className="mx-auto max-w-5xl space-y-4 px-4 pt-4 pb-28">
        <div className="flex items-center justify-between gap-3">
          <h1 className="text-2xl font-semibold">{t("catalogue.title")}</h1>
          <Link href="/add" className={btnPrimary}>
            <span aria-hidden="true">＋</span> {t("home.addPiece")}
          </Link>
        </div>
        {(total > 0 || filtered) && <Filters f={f} />}

        <p className="num text-sm text-muted" aria-live="polite">
          {cards.length < total ? t("catalogue.showing", { shown: cards.length, count: total }) : t("home.pieces", { count: total })}
        </p>

        {cards.length === 0 ? (
          filtered ? (
            <div className="rounded-2xl border border-dashed border-line p-8 text-center">
              <p className="font-medium">{t("catalogue.noMatch")}</p>
              <Link href="/" className={btnLink}>{t("catalogue.clear")}</Link>
            </div>
          ) : (
            <div className="rounded-2xl border border-dashed border-line p-8 text-center">
              <p className="mb-4 text-muted">{t("home.empty")}</p>
              <Link href="/add" className={btnPrimary + " min-h-14 px-6 text-lg"}>
                <span aria-hidden="true">＋</span> {t("home.addPiece")}
              </Link>
            </div>
          )
        ) : (
          <Grid shopId={current.shop_id} cards={cards} />
        )}

        {cards.length < total && (
          <div className="flex justify-center">
            <Link href={filterHref(f, { n: f.n + PAGE })} scroll={false} className={btn}>
              {t("catalogue.loadMore")}
            </Link>
          </div>
        )}
      </main>
    </>
  );
}
