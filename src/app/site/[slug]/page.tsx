import { getSite, listSiteCards, siteContext } from "@/lib/site-data";
import { formatDubaiDateTime } from "@/lib/format";
import { makeT } from "@/i18n";
import { oldestShownRate } from "@/lib/public-price";
import { whatsappLink } from "@/lib/share-message";
import { LangLinks, SiteGrid } from "@/components/site/parts";
import { SiteBeacon } from "@/components/site/SiteBeacon";
import { IconChat } from "@/components/icons";

/**
 * Website home: a shop window, not the catalogue (others could copy a shop's designs). The shop's
 * name on velvet, its introduction, "Ask for a tray" (the shop then sends a private Digital tray
 * of pieces picked for the customer), a few showcase pieces the owner chose, and how to visit.
 */
export default async function SiteHome({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const site = (await getSite(slug))!;
  const { base, locale } = await siteContext(slug);
  const t = makeT(locale);
  const { cards } = await listSiteCards(slug, { q: "", category: null, karat: null, w: null, sort: "newest", n: 24 }, 24);
  const showcase = cards.filter((c) => c.status !== "sold");
  const about = site.about[locale] ?? site.about.en;
  const rateAt = oldestShownRate(showcase.map((c) => c.price));
  const ask = site.whatsapp ? whatsappLink(site.whatsapp, t("site.askTrayMessage", { shop: site.name })) : null;

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
            {ask && (
              <a href={ask} className="caps inline-flex min-h-12 flex-1 items-center justify-center gap-2 rounded-[2px] bg-[#f3eee4] px-5 text-[12.5px] font-semibold text-[#16130f] transition hover:bg-white">
                <IconChat size={17} /> {t("site.askTray")}
              </a>
            )}
            <a href={`${base}/visit`} className="caps inline-flex min-h-12 flex-1 items-center justify-center rounded-[2px] border border-[#c9a35b]/60 px-5 text-[12.5px] font-semibold text-[#f3eee4] transition hover:border-[#f3eee4]">
              {t("site.visit")}
            </a>
          </div>
          <div className="mt-6">
            <LangLinks locale={locale} t={t} dark />
          </div>
        </div>
      </section>

      <div className="mx-auto max-w-6xl space-y-14 px-4 pt-10">
        <section aria-labelledby="how-h">
          <h2 id="how-h" className="font-display text-[2rem] leading-tight italic">{t("site.howTitle")}</h2>
          <ol className="mt-5 grid gap-4 sm:grid-cols-3">
            {(["site.how1", "site.how2", "site.how3"] as const).map((k, i) => (
              <li key={k} className="rounded-[2px] border border-line bg-surface p-5">
                <span aria-hidden="true" className="font-display text-[2rem] leading-none text-gold italic">{i + 1}</span>
                <p className="mt-3 text-[15px] leading-relaxed">{t(k, { shop: site.name })}</p>
              </li>
            ))}
          </ol>
          {ask && (
            <a href={ask} className="caps mt-5 inline-flex min-h-12 items-center justify-center gap-2 rounded-[2px] bg-primary px-6 text-[12.5px] font-semibold text-on-primary shadow-[inset_0_-2px_0_var(--gold-line)] hover:opacity-90">
              <IconChat size={17} /> {t("site.askTray")}
            </a>
          )}
        </section>

        {showcase.length > 0 && (
          <section id="showcase" aria-labelledby="show-h" className="scroll-mt-24">
            <div className="mb-5">
              <h2 id="show-h" className="font-display text-[2rem] leading-none italic">{t("site.showcase")}</h2>
              <p className="mt-2 text-[15px] text-muted">{t("site.showcaseHint")}</p>
            </div>
            <SiteGrid cards={showcase} base={base} t={t} />
            {rateAt && (
              <p className="mt-8 text-center text-sm text-muted">{t("site.rateNote", { time: formatDubaiDateTime(rateAt, locale) })}{site.vat_enabled ? ` ${t("site.vatIncl")}` : ""}</p>
            )}
            {site.price_mode === "from" && <p className="mt-1 text-center text-sm text-muted">{t("site.fromNote")}</p>}
          </section>
        )}

        {(site.address || site.hours) && (
          <section aria-labelledby="visit-h" className="border-y border-line py-8">
            <h2 id="visit-h" className="font-display text-[1.6rem] leading-tight">{t("site.visit")}</h2>
            {site.address && <p className="mt-3">{site.address}</p>}
            {site.hours && <p className="mt-1 text-muted">{site.hours}</p>}
            {site.maps_url && <a href={site.maps_url} target="_blank" rel="noopener" className="mt-2 inline-flex min-h-11 items-center font-semibold text-gold hover:underline">{t("site.directions")}</a>}
          </section>
        )}
      </div>
    </main>
  );
}
