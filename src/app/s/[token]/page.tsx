/**
 * Public share page: /s/{token}. No login. Shows the chosen pieces with spins and today's
 * prices, in the client's language. Reads only through get_share(token); the service role is
 * used just to sign the images that call returned.
 */
import type { Metadata } from "next";
import { cache } from "react";
import { notFound } from "next/navigation";
import { supabaseServer } from "@/lib/supabase/server";
import { mediaSigner } from "@/lib/supabase/admin";
import { toRateMap, type Karat, type Rate } from "@/lib/pricing";
import { oldestShownRate, publicPrice } from "@/lib/public-price";
import { formatDubaiDateTime, formatGrams } from "@/lib/format";
import { priceNote } from "@/lib/share-message";
import { dirFor, isLocale, LOCALE_NAMES, LOCALES, makeT, type Locale, type MessageKey } from "@/i18n";
import { I18nProvider } from "@/i18n/client";
import { PublicSpin, ViewBeacon } from "./parts";
import { Logo } from "@/components/icons";
import { Odometer } from "@/components/Odometer";
import { TiltTile } from "@/components/TiltTile";

export const dynamic = "force-dynamic";

type SharedPiece = {
  id: string; name: string; category: string; karat: Karat; gross_g: number; stone_g: number; making_per_g: number;
  making_flat: number | null; extras_aed: number; status: "in_stock" | "reserved" | "sold";
  descriptions: Partial<Record<Locale, string>>;
  photo: { path: string; thumb: string | null } | null;
  spin: { path: string; small: string | null; frames: number; cols: number } | null;
};
type Shared =
  | { status: "expired"; shop: string }
  | { status: "ok"; shop: string; vat_enabled: boolean; expires_at: string; language: Locale; rates: Rate[]; pieces: SharedPiece[] };

const load = cache(async (token: string): Promise<Shared | null> => {
  if (!/^[A-Za-z0-9_-]{22}$/.test(token)) return null;
  const supabase = await supabaseServer();
  const { data, error } = await supabase.rpc("get_share", { p_token: token });
  if (error) throw error;
  return (data as Shared | null) ?? null;
});

export async function generateMetadata({ params }: { params: Promise<{ token: string }> }): Promise<Metadata> {
  const share = await load((await params).token).catch(() => null);
  // No prices or piece details in link previews.
  return {
    title: share ? share.shop : "Takara",
    robots: { index: false, follow: false, nocache: true },
    referrer: "no-referrer",
    openGraph: share ? { title: share.shop } : undefined,
  };
}

export default async function SharedPage({ params, searchParams }: { params: Promise<{ token: string }>; searchParams: Promise<{ lang?: string }> }) {
  const { token } = await params;
  const share = await load(token);
  if (!share) notFound();
  const wanted = (await searchParams).lang;
  const locale: Locale = isLocale(wanted) ? wanted : share.status === "ok" ? share.language : "en";
  const t = makeT(locale);
  const dir = dirFor(locale);

  if (share.status === "expired") {
    return (
      <main id="main" lang={locale} dir={dir} className="mx-auto max-w-xl space-y-2 px-4 py-16 text-center">
        <h1 className="text-xl font-semibold">{t("pub.expired")}</h1>
        <p className="text-muted">{t("pub.expiredHint", { shop: share.shop })}</p>
      </main>
    );
  }

  const rates = toRateMap(share.rates);
  const paths = share.pieces.flatMap((p) => [p.photo?.path, p.photo?.thumb, p.spin?.path].filter((x): x is string => !!x));
  const urls = await mediaSigner().sign(paths, 24 * 3600);
  // Today's price, labelled indicative on 1-3 day old rates, hidden on older ones (DECISIONS §3).
  const prices = share.pieces.map((p) => publicPrice(p, rates, share.vat_enabled, "live"));
  const oldest = oldestShownRate(prices);
  const indicative = prices.some((p) => p.kind === "price" && p.indicative);

  return (
    <I18nProvider locale={locale}>
      <ViewBeacon token={token} />
      <div lang={locale} dir={dir} className="min-h-dvh bg-paper">
        {/* Black velvet, where gold glows: the shop's name in gold, the client's languages below. */}
        <header className="pub-hero relative overflow-hidden text-[#f3eee4]">
          <div className="relative mx-auto flex max-w-3xl flex-col items-center px-4 pt-14 pb-7 text-center">
            <Logo size={38} draw className="text-[#d9b46a]" />
            <h1 className="eyebrow mt-5 stagger text-[#c9a35b]!" style={{ "--i": 1 } as React.CSSProperties}>{t("pub.title")}</h1>
            <p className="wordmark mt-3 font-display text-[1.9rem] leading-[1.2] font-medium [overflow-wrap:anywhere] stagger" style={{ "--i": 2 } as React.CSSProperties}>
              <span className="gold-text">{share.shop}</span>
            </p>
            <div aria-hidden="true" className="rule-in mt-6 h-px w-14 bg-[#c9a35b]" />
            <nav aria-label={t("pub.language")} className="mt-5">
              <ul className="flex flex-wrap justify-center gap-x-6 text-sm">
                {LOCALES.map((l) => (
                  <li key={l}>
                    <a
                      href={`?lang=${l}`}
                      lang={l}
                      hrefLang={l}
                      aria-current={l === locale ? "true" : undefined}
                      className={`tab-line inline-flex min-h-11 items-center transition-colors duration-200 ${l === locale ? "font-semibold text-[#f3eee4]" : "text-[#b9ad99] hover:text-[#f3eee4]"}`}
                    >
                      {LOCALE_NAMES[l]}
                    </a>
                  </li>
                ))}
              </ul>
            </nav>
          </div>
        </header>

        <main id="main" className="mx-auto max-w-5xl space-y-8 px-4 pt-2 pb-10">
          <p className="mx-auto max-w-xl border-y border-line py-3 text-center text-sm text-muted">
            {priceNote(locale, share.vat_enabled)}
            {oldest && <> {t(indicative ? "pub.indicativeAt" : "pub.rateAt", { time: formatDubaiDateTime(oldest, locale) })}</>}
          </p>
          <ul className="grid gap-x-6 gap-y-10 sm:grid-cols-2 lg:grid-cols-3">
            {share.pieces.map((p, i) => {
              const pr = prices[i];
              const photo = p.photo ? urls.get(p.photo.path) : undefined;
              const poster = p.photo?.thumb ? urls.get(p.photo.thumb) ?? null : null;
              const spin = p.spin ? urls.get(p.spin.path) : undefined;
              const desc = p.descriptions?.[locale] ?? p.descriptions?.en;
              return (
                <li key={p.id} style={{ "--i": i } as React.CSSProperties} className={i < 3 ? "stagger" : "reveal-scroll"}>
                  {spin && p.spin ? (
                    <PublicSpin name={p.name} src={spin} frames={p.spin.frames} cols={p.spin.cols} poster={poster} />
                  ) : photo ? (
                    <TiltTile className="relative aspect-square overflow-hidden bg-tile">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={photo} alt={t("piece.photoAlt", { name: p.name })} width={1600} height={1600} loading="lazy" className="img-in tile-img size-full object-cover" />
                    </TiltTile>
                  ) : (
                    <div className="aspect-square bg-tile" />
                  )}
                  <div className="space-y-1.5 pt-4">
                    <h2 className="font-display text-[1.5rem] leading-tight [overflow-wrap:anywhere]">{p.name}</h2>
                    <p className="text-[12px] font-medium tracking-[0.06em] text-muted">
                      <span dir="ltr" className="num font-medium">{p.karat}K · {formatGrams(p.gross_g)}</span> · {t(`categories.${p.category}` as MessageKey)}
                    </p>
                    {pr.kind === "sold" ? (
                      <p className="pt-1 font-semibold text-muted">{t("pub.sold")}</p>
                    ) : pr.kind === "reserved" ? (
                      <p className="pt-1">
                        <span className="caps rounded-[2px] bg-warn-soft px-2 py-1 text-[10px] font-semibold text-warn">{t("status.reserved")}</span>
                      </p>
                    ) : (
                      <p className="flex flex-wrap items-baseline gap-2 pt-1">
                        {pr.kind === "price" ? (
                          <span dir="ltr" data-price className="num text-[1.2rem] leading-tight font-semibold">
                            AED <Odometer value={pr.text.replace(/^\D+/, "")} />
                          </span>
                        ) : (
                          <span data-price className="font-semibold text-muted">{t("pub.askToday")}</span>
                        )}
                        {pr.kind === "price" && pr.indicative && <span className="caps text-[10px] font-semibold text-warn">{t("pub.indicative")}</span>}
                      </p>
                    )}
                    {desc && (
                      <p lang={p.descriptions?.[locale] ? locale : "en"} dir={p.descriptions?.[locale] ? dir : "ltr"} className="pt-2 text-[15px] leading-relaxed text-start text-muted">
                        {desc}
                      </p>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
          <p className="pt-4 text-center text-sm text-muted">{t("pub.validUntil", { date: formatDubaiDateTime(share.expires_at, locale) })}</p>
          <p className="wordmark flex items-center justify-center gap-2 pt-4 pb-2 text-[10px] font-semibold text-muted">
            <Logo size={16} /> Takara
          </p>
        </main>
      </div>
    </I18nProvider>
  );
}
