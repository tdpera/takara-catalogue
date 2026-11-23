import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getSite, getTrayView, siteContext } from "@/lib/site-data";
import { appOrigin } from "@/lib/site-origin";
import { formatGrams } from "@/lib/format";
import { makeT, type MessageKey } from "@/i18n";
import { SitePrice } from "@/components/site/parts";

export const metadata: Metadata = { robots: { index: false, follow: false } };

/** A tray's own page: the link in a customer's WhatsApp message. Shows the code and the pieces. */
export default async function TrayCodePage({ params }: { params: Promise<{ slug: string; code: string }> }) {
  const { slug, code } = await params;
  const site = (await getSite(slug))!;
  const tray = await getTrayView(slug, code);
  if (!tray) notFound();
  const { base, locale } = await siteContext(slug);
  const t = makeT(locale);
  return (
    <main id="main" className="mx-auto max-w-3xl space-y-6 px-4 pt-8 pb-6">
      <div className="text-center">
        <p className="eyebrow">{t("site.trayCodeTitle")}</p>
        <h1 dir="ltr" className="num mt-3 font-display text-[3rem] leading-none font-medium tracking-[0.18em]">{tray.code}</h1>
        <p className="mx-auto mt-4 max-w-md text-[15px] text-muted">{t("site.trayPageHint", { shop: site.name })}</p>
      </div>
      <ol className="divide-y divide-line border-y border-line">
        {tray.cards.map((c, i) => (
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
          </li>
        ))}
      </ol>
      <p className="text-center">
        <a href={`${await appOrigin()}/trays?code=${tray.code}`} className="text-sm font-semibold text-muted underline underline-offset-4 hover:text-ink">{t("site.staffOpen")}</a>
      </p>
    </main>
  );
}
