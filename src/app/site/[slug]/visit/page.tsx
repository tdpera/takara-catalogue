import type { Metadata } from "next";
import { getSite, siteContext } from "@/lib/site-data";
import { formatPhone } from "@/lib/phone";
import { whatsappLink } from "@/lib/share-message";
import { makeT } from "@/i18n";
import { SiteBeacon } from "@/components/site/SiteBeacon";
import { IconChat, IconGlobe } from "@/components/icons";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const { locale } = await siteContext(slug);
  return { title: makeT(locale)("site.visit"), alternates: { canonical: "visit" } };
}

export default async function SiteVisit({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const site = (await getSite(slug))!;
  const { locale } = await siteContext(slug);
  const t = makeT(locale);
  const about = site.about[locale] ?? site.about.en;
  const row = "grid gap-1 border-b border-line py-5 sm:grid-cols-[12rem_1fr]";
  return (
    <main id="main" className="mx-auto max-w-3xl px-4 pt-8 pb-6">
      <SiteBeacon slug={slug} />
      <h1 className="font-display text-[2.3rem] leading-none italic">{t("site.visit")}</h1>
      {about && <p className="mt-5 text-[16px] leading-relaxed text-muted">{about}</p>}
      <dl className="mt-6 border-t border-line">
        {site.address && (
          <div className={row}>
            <dt className="eyebrow">{t("site.address")}</dt>
            <dd>
              <p>{site.address}</p>
              {site.maps_url && <a href={site.maps_url} className="mt-1 inline-flex min-h-11 items-center gap-1.5 font-semibold text-gold hover:underline" rel="noopener" target="_blank">{t("site.directions")}</a>}
            </dd>
          </div>
        )}
        {site.hours && (
          <div className={row}>
            <dt className="eyebrow">{t("site.hours")}</dt>
            <dd>{site.hours}</dd>
          </div>
        )}
        {site.whatsapp && (
          <div className={row}>
            <dt className="eyebrow">{t("site.whatsapp")}</dt>
            <dd>
              <a href={whatsappLink(site.whatsapp, t("site.helloMessage", { shop: site.name }))} className="inline-flex min-h-11 items-center gap-2 font-semibold hover:underline">
                <IconChat size={18} /> <span dir="ltr" className="num">{formatPhone(site.whatsapp)}</span>
              </a>
            </dd>
          </div>
        )}
        {site.instagram && (
          <div className={row}>
            <dt className="eyebrow">{t("site.instagram")}</dt>
            <dd>
              <a href={`https://instagram.com/${site.instagram}`} rel="noopener" target="_blank" className="inline-flex min-h-11 items-center gap-2 font-semibold hover:underline">
                <IconGlobe size={18} /> <span dir="ltr">@{site.instagram}</span>
              </a>
            </dd>
          </div>
        )}
      </dl>
      <p className="mt-8 text-sm text-muted">{t("site.pricesNote")}</p>
    </main>
  );
}
