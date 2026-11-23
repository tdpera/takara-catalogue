/**
 * Shop website building blocks (server components): the price as a customer may see it, the
 * catalogue grid, and the header and footer. Styled like the app (Maison), but the shop's name
 * leads and Takara stays a small credit at the bottom.
 */
import type { MessageKey, Translate } from "@/i18n";
import { LOCALES, LOCALE_NAMES, type Locale } from "@/i18n";
import type { PublicPrice } from "@/lib/public-price";
import type { Site, SiteCard } from "@/lib/site-data";
import { formatGrams } from "@/lib/format";
import { SpinViewer } from "@/components/SpinViewer";
import { TiltTile } from "@/components/TiltTile";
import { IconTurn, Logo } from "@/components/icons";
import { AddToTray, TrayLink } from "./tray";

/** The price line on cards and the piece page. Never a breakdown. */
export function SitePrice({ price, t, size = "card" }: { price: PublicPrice; t: Translate; size?: "card" | "large" }) {
  const big = size === "large";
  switch (price.kind) {
    case "price":
      return (
        <p className={`flex flex-wrap items-baseline gap-x-2 gap-y-1 ${big ? "" : "mt-1.5"}`}>
          <span dir="ltr" data-price className={`num font-semibold ${big ? "text-[1.7rem] leading-tight" : "text-[14.5px]"}`}>
            {price.from ? t("site.from", { price: price.text }) : price.text}
          </span>
          {price.indicative && <span className="caps text-[10px] font-semibold text-warn">{t("site.indicative")}</span>}
        </p>
      );
    case "sold":
      return <p className={`font-semibold text-muted ${big ? "text-lg" : "mt-1.5 text-sm"}`}>{t("site.sold")}</p>;
    case "reserved":
      return <p className={`caps font-semibold text-warn ${big ? "text-sm" : "mt-1.5 text-[11px]"}`}>{t("site.reserved")}</p>;
    case "ask":
      return <p className={`font-medium text-muted ${big ? "text-lg" : "mt-1.5 text-sm"}`} data-price>{t("site.askPrice")}</p>;
    case "in_store":
      return <p className={`font-medium text-muted ${big ? "text-lg" : "mt-1.5 text-sm"}`} data-price>{t("site.askToday")}</p>;
  }
}

export function SiteGrid({ cards, base, t, heading = "h3" }: { cards: SiteCard[]; base: string; t: Translate; heading?: "h2" | "h3" }) {
  const H = heading;
  return (
    <ul className="grid grid-cols-2 gap-x-3.5 gap-y-8 sm:grid-cols-[repeat(auto-fill,minmax(14rem,1fr))] sm:gap-x-6 sm:gap-y-10">
      {cards.map((c, i) => (
        <li key={c.id} style={{ "--i": i } as React.CSSProperties} className={`group relative ${i < 6 ? "stagger" : "reveal-scroll"}`}>
          <a href={`${base}/p/${c.sku}`} className="block focus-visible:outline-3 focus-visible:outline-offset-4 focus-visible:outline-[var(--focus)]">
            <TiltTile className="relative aspect-square overflow-hidden bg-tile">
              {c.photo ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={c.photo} alt="" width={480} height={480} loading={i < 4 ? "eager" : "lazy"} decoding="async" draggable={false} className="tile-img photo-zoom img-in size-full object-cover" />
              ) : (
                <div className="size-full" />
              )}
              {c.spin?.small && <SpinViewer mode="card" src={c.spin.small} frames={c.spin.frames} cols={c.spin.cols} label="" className="object-cover" />}
              {c.spin && (
                <span className="caps pointer-events-none absolute start-2 top-2 inline-flex items-center gap-1 rounded-[2px] bg-paper/90 px-1.5 py-1 text-[10px] font-semibold text-ink backdrop-blur-sm">
                  <IconTurn size={13} /> 360°
                </span>
              )}
              {c.status !== "in_stock" && (
                <span className={`caps pointer-events-none absolute bottom-2 start-2 rounded-[2px] px-2 py-1 text-[10px] font-semibold ${c.status === "sold" ? "bg-ink text-paper" : "bg-paper/95 text-warn"}`}>
                  {t(c.status === "sold" ? "site.sold" : "site.reserved")}
                </span>
              )}
            </TiltTile>
            <div className="pt-3">
              <H className="line-clamp-2 font-display text-[17px] leading-snug [overflow-wrap:anywhere]">{c.name}</H>
              <p className="mt-1 text-[12px] font-medium tracking-[0.05em] text-muted">
                <span dir="ltr" className="num font-medium">{c.karat}K · {formatGrams(c.gross_g)}</span> · {t(`categories.${c.category}` as MessageKey)}
              </p>
              <SitePrice price={c.price} t={t} />
            </div>
          </a>
          {c.status !== "sold" && <AddToTray id={c.id} name={c.name} variant="icon" />}
        </li>
      ))}
    </ul>
  );
}

/** Shop monogram when there's no logo: the first letter in Bodoni, in a gold ring. */
function Monogram({ name }: { name: string }) {
  const letter = [...name.trim()][0]?.toUpperCase() ?? "•";
  return (
    <span aria-hidden="true" className="flex size-10 items-center justify-center rounded-full border border-gold-line font-display text-lg text-gold">
      {letter}
    </span>
  );
}

export function SiteHeader({ site, base, path, t }: { site: Site; base: string; path: string; t: Translate }) {
  const home = base || "/";
  const nav = [
    { href: `${base}/collection`, key: "site.collection" as const, active: path.startsWith("/collection") || path.startsWith("/p/") },
    { href: `${base}/visit`, key: "site.visit" as const, active: path.startsWith("/visit") },
  ];
  return (
    <header className="relative z-30 border-b border-line bg-paper/95 backdrop-blur-md md:sticky md:top-0">
      <div className="mx-auto flex min-h-16 max-w-6xl items-center gap-3 px-4">
        <a href={home} className="flex min-w-0 items-center gap-3">
          {site.logo ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={site.logo} alt="" width={40} height={40} className="size-10 rounded-full object-cover" />
          ) : (
            <Monogram name={site.name} />
          )}
          <span className="wordmark truncate font-display text-[15px] font-medium">{site.name}</span>
        </a>
        <nav aria-label={site.name} className="ms-auto hidden items-center gap-7 md:flex">
          {nav.map((n) => (
            <a key={n.key} href={n.href} aria-current={n.active ? "page" : undefined} className={`tab-line caps inline-flex min-h-11 items-center text-[12px] font-semibold ${n.active ? "text-ink" : "text-muted hover:text-ink"}`}>
              {t(n.key)}
            </a>
          ))}
        </nav>
        <div className="ms-auto md:ms-4">
          <TrayLink href={`${base}/tray`} />
        </div>
      </div>
      <nav aria-label={site.name} className="border-t border-line md:hidden">
        <ul className="mx-auto flex max-w-6xl justify-center gap-8 px-4">
          {nav.map((n) => (
            <li key={n.key}>
              <a href={n.href} aria-current={n.active ? "page" : undefined} className={`tab-line caps inline-flex min-h-11 items-center text-[12px] font-semibold ${n.active ? "text-ink" : "text-muted"}`}>
                {t(n.key)}
              </a>
            </li>
          ))}
        </ul>
      </nav>
    </header>
  );
}

export function SiteFooter({ site, base, locale, t }: { site: Site; base: string; locale: Locale; t: Translate }) {
  return (
    <footer className="mt-16 border-t border-line bg-surface">
      <div className="mx-auto grid max-w-6xl gap-8 px-4 py-10 sm:grid-cols-[1.4fr_1fr_1fr]">
        <div>
          <p className="wordmark font-display text-[15px] font-medium">{site.name}</p>
          {site.address && <p className="mt-2 text-sm text-muted">{site.address}</p>}
          {site.hours && <p className="mt-1 text-sm text-muted">{site.hours}</p>}
        </div>
        <ul className="space-y-1 text-sm">
          <li><a className="inline-flex min-h-11 items-center hover:underline" href={`${base}/collection`}>{t("site.collection")}</a></li>
          <li><a className="inline-flex min-h-11 items-center hover:underline" href={`${base}/visit`}>{t("site.visit")}</a></li>
          <li><a className="inline-flex min-h-11 items-center hover:underline" href={`${base}/tray`}>{t("site.tray")}</a></li>
        </ul>
        <nav aria-label={t("site.language")}>
          <ul className="space-y-1 text-sm">
            {LOCALES.map((l) => (
              <li key={l}>
                <a href={`?lang=${l}`} lang={l} hrefLang={l} aria-current={l === locale ? "true" : undefined} className={`inline-flex min-h-11 items-center ${l === locale ? "font-semibold" : "text-muted hover:text-ink"}`}>
                  {LOCALE_NAMES[l]}
                </a>
              </li>
            ))}
          </ul>
        </nav>
      </div>
      <p className="border-t border-line px-4 py-4 text-center text-[13px] text-muted">{t("site.pricesNote")}</p>
      <p className="wordmark flex items-center justify-center gap-2 pb-6 text-[10px] font-semibold text-muted">
        <Logo size={14} /> {t("site.poweredBy")}
      </p>
    </footer>
  );
}

/** Language switch for the top of the home page (a group, not a second "Language" landmark: the footer has that). */
export function LangLinks({ locale, t, dark = false }: { locale: Locale; t: Translate; dark?: boolean }) {
  return (
    <div role="group" aria-label={t("site.language")}>
      <ul className="flex flex-wrap justify-center gap-x-6 text-sm">
        {LOCALES.map((l) => (
          <li key={l}>
            <a
              href={`?lang=${l}`}
              lang={l}
              hrefLang={l}
              aria-current={l === locale ? "true" : undefined}
              className={`tab-line inline-flex min-h-11 items-center transition-colors duration-200 ${dark ? (l === locale ? "font-semibold text-[#f3eee4]" : "text-[#b9ad99] hover:text-[#f3eee4]") : l === locale ? "font-semibold" : "text-muted hover:text-ink"}`}
            >
              {LOCALE_NAMES[l]}
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
}
