import type { Metadata } from "next";
import { getSite, siteContext, trayCards } from "@/lib/site-data";
import { formatGrams } from "@/lib/format";
import { makeT, type MessageKey } from "@/i18n";
import { SitePrice } from "@/components/site/parts";
import { RemoveFromTray } from "@/components/site/tray";
import { TrayActions } from "@/components/site/TrayActions";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const { locale } = await siteContext(slug);
  return { title: makeT(locale)("site.trayTitle"), robots: { index: false } };
}

/** The visitor's tray: the pieces they'd like to see, and the two ways to bring it to the shop. */
export default async function SiteTray({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const site = (await getSite(slug))!;
  const { base, locale } = await siteContext(slug);
  const t = makeT(locale);
  const cards = await trayCards(slug);
  return (
    <main id="main" className="mx-auto max-w-3xl space-y-6 px-4 pt-8 pb-6">
      <div>
        <h1 className="font-display text-[2.3rem] leading-none italic">{t("site.trayTitle")}</h1>
        <p className="mt-3 text-[15px] leading-relaxed text-muted">{t("site.trayIntro", { shop: site.name })}</p>
      </div>
      {cards.length === 0 ? (
        <div className="space-y-4 rounded-[2px] border border-dashed border-line px-5 py-12 text-center">
          <p className="text-muted">{t("site.trayEmpty")}</p>
          <a href={`${base}/#showcase`} className="caps inline-flex min-h-11 items-center rounded-[2px] bg-primary px-5 text-[12.5px] font-semibold text-on-primary">{t("site.browse")}</a>
        </div>
      ) : (
        <>
          <ol className="divide-y divide-line border-y border-line">
            {cards.map((c, i) => (
              <li key={c.id} className="flex items-center gap-4 py-3">
                <span aria-hidden="true" className="num w-5 text-center text-sm text-muted">{i + 1}</span>
                <a href={`${base}/p/${c.sku}`} aria-hidden="true" tabIndex={-1} className="size-20 shrink-0 overflow-hidden bg-tile">
                  {c.photo && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={c.photo} alt="" width={160} height={160} className="size-full object-cover" />
                  )}
                </a>
                <div className="min-w-0 flex-1">
                  <a href={`${base}/p/${c.sku}`} className="line-clamp-2 font-display text-[17px] leading-snug hover:underline">{c.name}</a>
                  <p className="text-[12px] font-medium tracking-[0.05em] text-muted">
                    <span dir="ltr" className="num">{c.karat}K · {formatGrams(c.gross_g)} · {c.sku}</span> · {t(`categories.${c.category}` as MessageKey)}
                  </p>
                  <SitePrice price={c.price} t={t} />
                </div>
                <RemoveFromTray id={c.id} name={c.name} />
              </li>
            ))}
          </ol>
          <TrayActions slug={slug} lang={locale} hasWhatsApp={!!site.whatsapp} />
          <p className="text-sm text-muted">{t("site.trayPrivacy")}</p>
        </>
      )}
    </main>
  );
}
