import Link from "next/link";
import { requireShop } from "@/lib/session";
import { listCards } from "@/lib/catalogue";
import { filterHref, hasFilters, parseFilters, PAGE } from "@/lib/catalogue-filters";
import { getT } from "@/i18n/server";
import { AppHeader } from "@/components/AppHeader";
import { CategoryTabs, Filters } from "@/components/catalogue/Filters";
import { Grid } from "@/components/catalogue/Grid";
import { btn, btnGold, btnLink } from "@/components/ui";
import { EmptyState } from "@/components/EmptyState";
import { IconPlus } from "@/components/icons";
import { DemoButton } from "@/components/DemoButton";
import { isDemoPhone } from "@/lib/demo";

// Loading the demo shop (demo account, empty catalogue) draws and uploads pictures (10-20 s).
export const maxDuration = 60;

export default async function CataloguePage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { supabase, user, memberships, current, isAdmin } = await requireShop();
  const { t } = await getT();
  const f = parseFilters(await searchParams);
  const [{ cards, total }, { data: site }] = await Promise.all([
    listCards(current.shop_id, f),
    supabase.from("shop_sites").select("shop_id").eq("shop_id", current.shop_id).maybeSingle(),
  ]);
  const filtered = hasFilters(f);

  return (
    <>
      <AppHeader memberships={memberships} current={current} />
      <main id="main" className="mx-auto max-w-5xl space-y-4 px-4 pt-1 pb-28">
        {(total > 0 || filtered) && <CategoryTabs f={f} />}
        <div className="flex items-baseline justify-between gap-3 pt-2">
          <h1 className="font-display text-[2.1rem] leading-none italic">{t("catalogue.heading")}</h1>
          <p className="eyebrow shrink-0 text-end" aria-live="polite">
            {cards.length < total ? t("catalogue.showing", { shown: cards.length, count: total }) : t("home.pieces", { count: total })}
          </p>
        </div>
        {(total > 0 || filtered) && <Filters f={f} />}

        {cards.length === 0 ? (
          filtered ? (
            <EmptyState title={t("catalogue.noMatch")} action={<Link href="/" className={btnLink}>{t("catalogue.clear")}</Link>} />
          ) : (
            <EmptyState
              title={t("home.empty")}
              action={
                <div className="space-y-3">
                  <Link href="/add" className={btnGold + " mt-1 min-h-12 px-7"}>
                    <IconPlus className="stroke-[2.4]" /> {t("home.addPiece")}
                  </Link>
                  {isDemoPhone(user.phone) && <DemoButton />}
                </div>
              }
            />
          )
        ) : (
          <Grid shopId={current.shop_id} cards={cards} isAdmin={isAdmin} hasSite={!!site} />
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
