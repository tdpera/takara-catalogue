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
import { priceOf, toRateMap, type Karat, type Rate } from "@/lib/pricing";
import { formatAED, formatDubaiDateTime, formatGrams } from "@/lib/format";
import { priceNote } from "@/lib/share-message";
import { dirFor, isLocale, LOCALE_NAMES, LOCALES, makeT, type Locale, type MessageKey } from "@/i18n";
import { I18nProvider } from "@/i18n/client";
import { PublicSpin, ViewBeacon } from "./parts";
import { Logo } from "@/components/icons";

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
  const rateTimes = share.rates.map((r) => r.set_at);
  const oldest = rateTimes.sort()[0];

  return (
    <I18nProvider locale={locale}>
      <ViewBeacon token={token} />
      <div lang={locale} dir={dir} className="min-h-dvh bg-paper">
        <header className="relative overflow-hidden border-b border-line bg-surface">
          <div aria-hidden="true" className="h-1 bg-gold-gradient" />
          <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 top-0 h-56 bg-[radial-gradient(ellipse_at_top,var(--gold-soft),transparent_70%)]" />
          <div className="relative mx-auto flex max-w-3xl flex-col items-center px-4 pt-10 pb-8 text-center">
            <h1 className="eyebrow">{t("pub.title")}</h1>
            <p className="mt-2 font-display text-[2.6rem] leading-[1.05] [overflow-wrap:anywhere]">{share.shop}</p>
            <div aria-hidden="true" className="gold-rule mt-5 w-32" />
            <nav aria-label={t("pub.language")} className="mt-5">
              <ul className="flex flex-wrap justify-center gap-1 rounded-full border border-line bg-raised p-1 text-sm">
                {LOCALES.map((l) => (
                  <li key={l}>
                    <a
                      href={`?lang=${l}`}
                      lang={l}
                      hrefLang={l}
                      aria-current={l === locale ? "true" : undefined}
                      className={`inline-flex min-h-9 items-center rounded-full px-3.5 transition-colors ${l === locale ? "bg-surface font-semibold text-ink shadow-sm" : "text-muted hover:text-ink"}`}
                    >
                      {LOCALE_NAMES[l]}
                    </a>
                  </li>
                ))}
              </ul>
            </nav>
          </div>
        </header>

        <main id="main" className="mx-auto max-w-5xl space-y-6 px-4 py-8">
          <p className="mx-auto max-w-xl text-center text-sm text-muted">
            {priceNote(locale, share.vat_enabled)}
            {oldest && <> {t("pub.rateAt", { time: formatDubaiDateTime(oldest, locale) })}</>}
          </p>
          <ul className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {share.pieces.map((p) => {
              const pr = priceOf(p, rates, share.vat_enabled);
              const photo = p.photo ? urls.get(p.photo.path) : undefined;
              const poster = p.photo?.thumb ? urls.get(p.photo.thumb) ?? null : null;
              const spin = p.spin ? urls.get(p.spin.path) : undefined;
              const desc = p.descriptions?.[locale] ?? p.descriptions?.en;
              return (
                <li key={p.id} className="overflow-hidden rounded-[1.6rem] bg-surface shadow-card ring-1 ring-line/70">
                  {spin && p.spin ? (
                    <PublicSpin name={p.name} src={spin} frames={p.spin.frames} cols={p.spin.cols} poster={poster} />
                  ) : photo ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={photo} alt={t("piece.photoAlt", { name: p.name })} width={1600} height={1600} loading="lazy" className="aspect-square w-full bg-raised object-cover" />
                  ) : (
                    <div className="aspect-square bg-raised" />
                  )}
                  <div className="space-y-1.5 p-5">
                    <h2 className="font-display text-[1.45rem] leading-tight [overflow-wrap:anywhere]">{p.name}</h2>
                    <p className="text-sm text-muted">
                      <span dir="ltr" className="num">{p.karat}K · {formatGrams(p.gross_g)}</span> · {t(`categories.${p.category}` as MessageKey)}
                    </p>
                    {p.status === "sold" ? (
                      <p className="pt-1 font-semibold text-muted">{t("pub.sold")}</p>
                    ) : (
                      <p className="flex flex-wrap items-baseline gap-2 pt-1">
                        <span dir="ltr" className={pr.ok ? "font-display text-[1.6rem] leading-tight text-gold" : "font-semibold text-muted"}>{pr.ok ? formatAED(pr.price.totalWhole) : t("pub.priceInStore")}</span>
                        {p.status === "reserved" && <span className="rounded-full bg-warn-soft px-2.5 py-0.5 text-xs font-semibold text-warn">{t("status.reserved")}</span>}
                      </p>
                    )}
                    {desc && (
                      <p lang={p.descriptions?.[locale] ? locale : "en"} dir={p.descriptions?.[locale] ? dir : "ltr"} className="border-t border-line pt-3 text-[15px] leading-relaxed text-start text-muted">
                        {desc}
                      </p>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
          <p className="pt-4 text-center text-sm text-muted">{t("pub.validUntil", { date: formatDubaiDateTime(share.expires_at, locale) })}</p>
          <p className="flex items-center justify-center gap-1.5 pt-4 pb-2 text-xs text-muted">
            <Logo size={16} /> Takara
          </p>
        </main>
      </div>
    </I18nProvider>
  );
}
