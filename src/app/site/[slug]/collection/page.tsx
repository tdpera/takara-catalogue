import type { Metadata } from "next";
import { getSite, listSiteCards, parseSiteFilters, siteContext, siteFilterHref, WEIGHT_BANDS, type SiteFilters } from "@/lib/site-data";
import { CATEGORIES } from "@/lib/ai/shared";
import { KARATS } from "@/lib/pricing";
import { formatDubaiDateTime } from "@/lib/format";
import { oldestShownRate } from "@/lib/public-price";
import { makeT, type MessageKey, type Translate } from "@/i18n";
import { SiteGrid } from "@/components/site/parts";
import { SiteBeacon } from "@/components/site/SiteBeacon";
import { IconSearch } from "@/components/icons";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const { locale } = await siteContext(slug);
  return { title: makeT(locale)("site.collection"), alternates: { canonical: "collection" } };
}

function Pills({ items, label }: { items: { href: string; text: string; on: boolean }[]; label: string }) {
  return (
    <ul aria-label={label} className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4 pb-1">
      {items.map((it) => (
        <li key={it.href} className="shrink-0">
          <a href={it.href} aria-current={it.on ? "true" : undefined} className={`inline-flex min-h-10 items-center rounded-[2px] border px-3.5 text-[14px] font-medium transition-colors ${it.on ? "border-ink bg-ink text-paper" : "border-line bg-surface hover:border-ink/40"}`}>
            {it.text}
          </a>
        </li>
      ))}
    </ul>
  );
}

function FilterBar({ f, base, t }: { f: SiteFilters; base: string; t: Translate }) {
  const href = (c: Partial<SiteFilters>) => siteFilterHref(base, f, c);
  return (
    <div className="space-y-3">
      <form action={`${base}/collection`} role="search" className="relative">
        {f.category && <input type="hidden" name="category" value={f.category} />}
        <label htmlFor="site-q" className="sr-only">{t("site.search")}</label>
        <IconSearch size={18} className="pointer-events-none absolute start-3.5 top-1/2 -translate-y-1/2 text-muted" />
        <input id="site-q" name="q" type="search" defaultValue={f.q} placeholder={t("site.search")} className="block min-h-12 w-full rounded-[2px] border border-line bg-surface ps-11 pe-4 text-base placeholder:text-muted/80 focus:border-ink" />
      </form>
      <Pills label={t("site.categoryLabel")} items={[{ href: href({ category: null }), text: t("site.allCategories"), on: !f.category }, ...CATEGORIES.map((c) => ({ href: href({ category: c }), text: t(`categories.${c}` as MessageKey), on: f.category === c }))]} />
      <Pills label={t("site.karatLabel")} items={[{ href: href({ karat: null }), text: t("site.karatAll"), on: !f.karat }, ...KARATS.map((k) => ({ href: href({ karat: k }), text: `${k}K`, on: f.karat === k }))]} />
      <Pills label={t("site.weightLabel")} items={[{ href: href({ w: null }), text: t("site.weightAll"), on: !f.w }, ...(Object.keys(WEIGHT_BANDS) as (keyof typeof WEIGHT_BANDS)[]).map((w) => ({ href: href({ w }), text: t(`site.weight_${w}` as MessageKey), on: f.w === w }))]} />
      <Pills label={t("site.sort")} items={(["newest", "heavy", "light"] as const).map((s) => ({ href: href({ sort: s }), text: t(`site.sort_${s}` as MessageKey), on: f.sort === s }))} />
    </div>
  );
}

export default async function SiteCollection({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { slug } = await params;
  const site = (await getSite(slug))!;
  const { base, locale } = await siteContext(slug);
  const t = makeT(locale);
  const f = parseSiteFilters(await searchParams);
  const { cards, total } = await listSiteCards(slug, f);
  const filtered = !!(f.q || f.category || f.karat || f.w);
  const rateAt = oldestShownRate(cards.map((c) => c.price));
  const indicative = cards.some((c) => c.price.kind === "price" && c.price.indicative);

  return (
    <main id="main" className="mx-auto max-w-6xl space-y-6 px-4 pt-8 pb-6">
      <SiteBeacon slug={slug} />
      <div className="flex items-baseline justify-between gap-3">
        <h1 className="font-display text-[2.3rem] leading-none italic">{f.category ? t(`categories.${f.category}` as MessageKey) : t("site.collection")}</h1>
        <p className="eyebrow shrink-0" aria-live="polite">{cards.length < total ? t("site.showing", { shown: cards.length, count: total }) : t("site.pieces", { count: total })}</p>
      </div>
      <FilterBar f={f} base={base} t={t} />
      {cards.length === 0 ? (
        <div className="space-y-3 py-16 text-center">
          <p className="text-muted">{filtered ? t("site.noMatch") : t("site.emptyCollection")}</p>
          {filtered && <a href={`${base}/collection`} className="caps text-[12px] font-semibold text-gold hover:underline">{t("site.clear")}</a>}
        </div>
      ) : (
        <SiteGrid cards={cards} base={base} t={t} heading="h2" />
      )}
      {cards.length < total && (
        <div className="flex justify-center">
          <a href={siteFilterHref(base, f, { n: f.n + 24 })} className="caps inline-flex min-h-11 items-center rounded-[2px] border border-ink/25 px-5 text-[12.5px] font-semibold hover:border-ink">{t("site.loadMore")}</a>
        </div>
      )}
      {rateAt && (
        <p className="pt-4 text-center text-sm text-muted">
          {t(indicative ? "site.indicativeNote" : "site.rateNote", { time: formatDubaiDateTime(rateAt, locale) })}
          {site.vat_enabled ? ` ${t("site.vatIncl")}` : ""}
        </p>
      )}
      {site.price_mode === "from" && <p className="text-center text-sm text-muted">{t("site.fromNote")}</p>}
    </main>
  );
}
