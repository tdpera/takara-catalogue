import Link from "next/link";
import { getT } from "@/i18n/server";
import { ratesStatus } from "@/lib/rates";
import { KARATS } from "@/lib/pricing";
import { formatDubaiDateTime, formatDubaiTime, formatRate } from "@/lib/format";
import { getShopPricing } from "@/lib/shop-data";
import { IconWarning } from "./icons";

/**
 * The rate ticker under the header, styled like the souk's rate boards: today's rate per karat
 * in gold on ink. Salespeople quote these all day, so they're on every screen. When rates
 * weren't set today it turns amber and says so (with a shortcut for managers).
 */
export async function RatesBanner({ shopId, isAdmin, onRatesPage = false }: { shopId: string; isAdmin: boolean; onRatesPage?: boolean }) {
  const { t, locale } = await getT();
  const { rates } = await getShopPricing(shopId);
  const status = ratesStatus(rates);

  if (status.state === "today") {
    return (
      <div className="bg-ticker text-[13px] text-ticker-muted">
        {/* Scrolls sideways on small phones; focusable so keyboard users can scroll it too. */}
        <div tabIndex={0} role="region" aria-label={t("rates.stripLabel")} className="no-scrollbar fade-x mx-auto max-w-5xl overflow-x-auto">
          <ul className="flex w-max items-center gap-4 px-4 py-2">
            <li className="inline-flex items-center gap-1.5 whitespace-nowrap font-medium text-[#5fd39b]">
              <span aria-hidden="true" className="relative flex size-2">
                <span className="absolute inline-flex size-full animate-ping rounded-full bg-[#5fd39b] opacity-60 motion-reduce:hidden" />
                <span className="relative inline-flex size-2 rounded-full bg-[#5fd39b]" />
              </span>
              {t("rates.stripToday", { time: formatDubaiTime(status.oldestSetAt, locale) })}
            </li>
            {KARATS.filter((k) => rates[k]).map((k) => (
              <li key={k} dir="ltr" className="inline-flex items-baseline gap-1.5 whitespace-nowrap">
                <span>{k}K</span>
                <span className="num text-[14px] text-ticker-gold">{formatRate(rates[k]!.aed_per_g)}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    );
  }

  const message =
    status.state === "missing"
      ? t("rates.bannerMissing")
      : t("rates.bannerStale", { date: formatDubaiDateTime(status.oldestSetAt, locale) });
  return (
    <div className="border-b border-warn/30 bg-warn-soft">
      <div role="alert" className="mx-auto flex max-w-5xl flex-wrap items-center gap-x-4 gap-y-2 px-4 py-2.5 text-ink">
        <p className="me-auto flex items-start gap-2 text-sm font-medium">
          <IconWarning size={18} className="mt-px text-warn" />
          {message}
        </p>
        {isAdmin ? (
          !onRatesPage && (
            <Link href="/rates#today" className="inline-flex min-h-10 items-center rounded-full bg-warn px-4 text-sm font-semibold text-white dark:text-black">
              {t("rates.updateNow")}
            </Link>
          )
        ) : (
          <p className="text-sm">{t("rates.askManager")}</p>
        )}
      </div>
    </div>
  );
}
