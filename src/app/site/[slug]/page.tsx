import { getSite, listSiteCards, siteContext } from "@/lib/site-data";
import { formatDubaiDateTime } from "@/lib/format";
import { CATEGORIES } from "@/lib/ai/shared";
import { makeT, type MessageKey } from "@/i18n";
import { oldestShownRate } from "@/lib/public-price";
import { whatsappLink } from "@/lib/share-message";
import { LangLinks, SiteGrid } from "@/components/site/parts";
import { SiteBeacon } from "@/components/site/SiteBeacon";
import { IconChat } from "@/components/icons";

/** Website home: the shop's name on velvet, a short introduction, categories and what's new. */
export default async function SiteHome({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const site = (await getSite(slug))!;
  const { base, locale } = await siteContext(slug);
  const t = makeT(locale);
  const { cards } = await listSiteCards(slug, { q: "", category: null, karat: null, w: null, sort: "newest", n: 8 }, 8);
  const fresh = cards.filter((c) => c.status !== "sold");
  const about = site.about[locale] ?? site.about.en;
  const categories = CATEGORIES.filter((c) => (site.categories[c] ?? 0) > 0);
  const rateAt = oldestShownRate(fresh.map((c) => c.price));

  return (
    <main id="main">
      <SiteBeacon slug={slug} />
      <section className="pub-hero relative overflow-hidden text-[#f3eee4]">
        <div className="relative mx-auto flex max-w-3xl flex-col items-center px-4 pt-14 pb-10 text-center">
          <p className="eyebrow stagger text-[#c9a35b]!" style={{ "--i": 0 } as React.CSSProperties}>{t("site.heroEyebrow")}</p>
          <h1 className="wordmark mt-4 font-display text-[2.2rem] leading-[1.15] font-medium [overflow-wrap:anywhere] stagger sm:text-[2.8rem]" style={{ "--i": 1 } as React.CSSProperties}>
            <span className="gold-text">{site.name}</span>
          </h1>
          <div aria-hidden="true" className="rule-in mt-6 h-px w-14 bg-[#c9a35b]" />
          {about && <p className="mt-6 max-w-xl text-[16px] leading-relaxed text-[#d9cfbe] stagger" style={{ "--i": 2 } as React.CSSProperties}>{about}</p>}
          <div className="mt-8 flex w-full max-w-md flex-col gap-2.5 sm:flex-row stagger" style={{ "--i": 3 } as React.CSSProperties}>
            <a href={`${base}/collection`} className="caps inline-flex min-h-12 flex-1 items-center justify-center rounded-[2px] bg-[#f3eee4] px-5 text-[12.5px] font-semibold text-[#16130f] transition hover:bg-white">
              {t("site.browse")}
            </a>
            {site.whatsapp && (
              <a href={whatsappLink(site.whatsapp, t("site.helloMessage", { shop: site.name }))} className="caps inline-flex min-h-12 flex-1 items-center justify-center gap-2 rounded-[2px] border border-[#c9a35b]/60 px-5 text-[12.5px] font-semibold text-[#f3eee4] transition hover:border-[#f3eee4]">
                <IconChat size={17} /> {t("site.askWhatsApp")}
              </a>
            )}
          </div>
          <div className="mt-6">
            <LangLinks locale={locale} t={t} dark />
          </div>
        </div>
      </section>

      <div className="mx-auto max-w-6xl space-y-14 px-4 pt-10">
        {categories.length > 0 && (
          <section aria-labelledby="cat-h">
            <h2 id="cat-h" className="eyebrow mb-4">{t("site.categories")}</h2>
            <ul className="no-scrollbar -mx-4 flex gap-2.5 overflow-x-auto px-4 pb-1 sm:flex-wrap">
              {categories.map((c) => (
                <li key={c} className="shrink-0">
                  <a href={`${base}/collection?category=${c}`} className="inline-flex min-h-12 items-center gap-2 rounded-[2px] border border-line bg-surface px-4 text-[15px] font-medium transition-colors hover:border-ink/40">
                    {t(`categories.${c}` as MessageKey)}
                    <span className="num text-[12px] text-muted">{site.categories[c]}</span>
                  </a>
                </li>
              ))}
            </ul>
          </section>
        )}

        {fresh.length > 0 && (
          <section aria-labelledby="new-h">
            <div className="mb-5 flex items-baseline justify-between gap-3">
              <h2 id="new-h" className="font-display text-[2rem] leading-none italic">{t("site.newest")}</h2>
              <a href={`${base}/collection`} className="caps text-[12px] font-semibold text-gold hover:underline">{t("site.seeAll", { count: site.total })}</a>
            </div>
            <SiteGrid cards={fresh} base={base} t={t} />
            {rateAt && (
              <p className="mt-8 text-center text-sm text-muted">{t("site.rateNote", { time: formatDubaiDateTime(rateAt, locale) })}{site.vat_enabled ? ` ${t("site.vatIncl")}` : ""}</p>
            )}
          </section>
        )}

        <section aria-labelledby="tray-h" className="grid gap-6 border-y border-line py-10 sm:grid-cols-[auto_1fr] sm:items-center">
          <p aria-hidden="true" className="font-display text-[3.4rem] leading-none text-gold italic">1·2·3</p>
          <div>
            <h2 id="tray-h" className="font-display text-[1.6rem] leading-tight">{t("site.howTitle")}</h2>
            <p className="mt-2 max-w-2xl text-[15px] leading-relaxed text-muted">{t("site.howText", { shop: site.name })}</p>
          </div>
        </section>
      </div>
    </main>
  );
}
