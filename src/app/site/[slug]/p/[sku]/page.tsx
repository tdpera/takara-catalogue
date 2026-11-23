import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getSite, getSitePiece, siteContext } from "@/lib/site-data";
import { siteOrigin } from "@/lib/site-origin";
import { formatDubaiDateTime, formatGrams } from "@/lib/format";
import { whatsappLink } from "@/lib/share-message";
import { makeT, type MessageKey } from "@/i18n";
import { PieceMedia } from "@/components/piece/PieceMedia";
import { SiteGrid, SitePrice } from "@/components/site/parts";
import { AddToTray } from "@/components/site/tray";
import { SiteBeacon } from "@/components/site/SiteBeacon";
import { IconBack, IconChat } from "@/components/icons";

type P = { params: Promise<{ slug: string; sku: string }> };

export async function generateMetadata({ params }: P): Promise<Metadata> {
  const { slug, sku } = await params;
  const piece = await getSitePiece(slug, decodeURIComponent(sku));
  if (!piece) return { title: "—", robots: { index: false } };
  const { locale } = await siteContext(slug);
  const desc = piece.descriptions[locale] ?? piece.descriptions.en;
  return {
    title: piece.name,
    description: desc,
    alternates: { canonical: `p/${piece.sku}` },
    openGraph: { title: piece.name, description: desc, images: piece.photo ? [{ url: piece.photo }] : undefined },
  };
}

export default async function SitePiecePage({ params }: P) {
  const { slug, sku: rawSku } = await params;
  const sku = decodeURIComponent(rawSku);
  const site = (await getSite(slug))!;
  const piece = await getSitePiece(slug, sku);
  if (!piece) notFound();
  const { base, locale } = await siteContext(slug);
  const t = makeT(locale);
  const origin = await siteOrigin(slug);
  const url = `${origin}/p/${piece.sku}`;
  const desc = piece.descriptions[locale];
  const descText = desc ?? piece.descriptions.en;
  const p = piece.price;
  // Search engines: a Product, with a price only when today's exact price is shown.
  const ld = {
    "@context": "https://schema.org",
    "@type": "Product",
    name: piece.name,
    sku: piece.sku,
    description: descText,
    image: piece.photoFull ? [new URL(piece.photoFull, origin + "/").href] : undefined,
    brand: { "@type": "Brand", name: site.name },
    ...(p.kind === "price" && !p.from && !p.indicative
      ? { offers: { "@type": "Offer", priceCurrency: "AED", price: p.text.replace(/[^\d]/g, ""), availability: "https://schema.org/InStoreOnly", url } }
      : {}),
  };

  return (
    <main id="main" className="mx-auto max-w-6xl px-4 pt-3 pb-6">
      <SiteBeacon slug={slug} sku={piece.sku} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(ld).replace(/</g, "\\u003c") }} />
      <a href={`${base}/collection`} className="inline-flex min-h-11 items-center gap-1.5 text-sm font-semibold text-muted hover:text-ink">
        <IconBack size={18} className="rtl:rotate-180" /> {t("site.collection")}
      </a>
      <div className="mt-1 grid gap-6 md:grid-cols-[1.1fr_1fr] md:items-start md:gap-10">
        <div className="md:sticky md:top-24">
          <PieceMedia name={piece.name} photo={piece.photoFull ? { full: piece.photoFull, thumb: piece.photo } : null} spin={piece.spin ? { src: piece.spin.src, frames: piece.spin.frames, cols: piece.spin.cols } : null} />
        </div>
        <div className="space-y-5">
          <div>
            <p className="eyebrow">
              {t(`categories.${piece.category}` as MessageKey)} · <span dir="ltr">{piece.sku}</span>
            </p>
            <h1 className="mt-2 font-display text-[2.3rem] leading-[1.08] [overflow-wrap:anywhere]">{piece.name}</h1>
            <ul className="mt-3 flex flex-wrap gap-2 text-sm">
              <li dir="ltr" className="num rounded-[2px] border border-gold-line/60 bg-gold-soft px-2.5 py-1 text-[13px]">{piece.karat}K</li>
              <li dir="ltr" className="num rounded-[2px] border border-line px-2.5 py-1 text-[13px]">{formatGrams(piece.gross_g)}</li>
            </ul>
          </div>

          <section aria-labelledby="price-h" className="rounded-[2px] border border-line bg-surface p-5">
            <h2 id="price-h" className="sr-only">{t("site.price")}</h2>
            <SitePrice price={p} t={t} size="large" />
            <p className="mt-2 text-sm text-muted">
              {p.kind === "price"
                ? `${t(p.indicative ? "site.indicativeNote" : "site.rateNote", { time: formatDubaiDateTime(p.rateSetAt, locale) })}${site.vat_enabled ? ` ${t("site.vatIncl")}` : ""}`
                : p.kind === "ask" || p.kind === "in_store"
                  ? t("site.askNote")
                  : null}
            </p>
            {p.kind === "price" && p.from && <p className="mt-1 text-sm text-muted">{t("site.fromNote")}</p>}
          </section>

          {piece.status !== "sold" && (
            <div className="flex flex-col gap-2.5 sm:flex-row">
              <AddToTray id={piece.id} name={piece.name} />
              {site.whatsapp && (
                <a href={whatsappLink(site.whatsapp, t("site.askAboutMessage", { shop: site.name, name: piece.name, sku: piece.sku, url }))} className="caps inline-flex min-h-12 flex-1 items-center justify-center gap-2 rounded-[2px] border border-ink/25 px-5 text-[12.5px] font-semibold hover:border-ink">
                  <IconChat size={17} /> {t("site.askAbout")}
                </a>
              )}
            </div>
          )}
          <p className="text-sm text-muted">{t("site.showCode", { sku: piece.sku })}</p>

          {descText && (
            <section aria-labelledby="desc-h" className="rounded-[2px] border border-line bg-surface p-5">
              <h2 id="desc-h" className="eyebrow mb-3">{t("site.description")}</h2>
              <p lang={desc ? locale : "en"} dir={desc ? undefined : "ltr"} className="text-[15.5px] leading-relaxed text-start">{descText}</p>
            </section>
          )}
        </div>
      </div>

      {piece.related.length > 0 && (
        <section aria-labelledby="rel-h" className="mt-14">
          <h2 id="rel-h" className="mb-5 font-display text-[1.8rem] leading-none italic">{t("site.related")}</h2>
          <SiteGrid cards={piece.related} base={base} t={t} />
        </section>
      )}
    </main>
  );
}
