import Link from "next/link";
import { getT } from "@/i18n/server";
import { ratesStatus } from "@/lib/rates";
import { KARATS } from "@/lib/pricing";
import { formatDubaiDateTime, formatDubaiTime, formatRate } from "@/lib/format";
import { getShopPricing } from "@/lib/shop-data";
import { IconWarning } from "./icons";

/**
 * Today's rate per karat between two hairlines, under the header. Salespeople quote these all day,
 * so they're on every screen. The figures rise in one after another and a soft gold sheen passes
 * once. When rates weren't set today it turns amber and says so (with a shortcut for managers).
 */
export async function RatesBanner({ shopId, isAdmin, onRatesPage = false }: { shopId: string; isAdmin: boolean; onRatesPage?: boolean }) {
  const { t, locale } = await getT();
  const { rates } = await getShopPricing(shopId);
  const status = ratesStatus(rates);

  if (status.state === "today") {
    const shown = KARATS.filter((k) => rates[k]);
    return (
      <div className="mx-auto max-w-5xl px-4">
        {/* Scrolls sideways on small phones; focusable so keyboard users can scroll it too. */}
        <div
          tabIndex={0}
          role="region"
          aria-label={t("rates.stripLabel")}
          className="sheen no-scrollbar fade-x overflow-x-auto border-y border-line"
        >
          <ul className="flex w-max min-w-full items-center justify-between gap-5 py-2.5 text-[13px]">
            <li className="rate-in inline-flex items-center gap-1.5 whitespace-nowrap text-[12px] font-semibold text-live">
              <span aria-hidden="true" className="relative flex size-1.5">
                <span className="absolute inline-flex size-full animate-ping rounded-full bg-live opacity-50 motion-reduce:hidden" />
                <span className="relative inline-flex size-1.5 rounded-full bg-live" />
              </span>
              {t("rates.stripToday", { time: formatDubaiTime(status.oldestSetAt, locale) })}
            </li>
            {shown.map((k, i) => (
              <li key={k} dir="ltr" style={{ "--i": i + 1 } as React.CSSProperties} className="rate-in inline-flex items-baseline gap-1.5 whitespace-nowrap">
                <span className="text-[11px] font-bold tracking-[0.06em]">{k}K</span>
                <span className="num font-medium text-ink/80">{formatRate(rates[k]!.aed_per_g)}</span>
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
    <div className="mx-auto max-w-5xl px-4">
      <div role="alert" className="pop-in flex flex-wrap items-center gap-x-4 gap-y-2 border-y border-warn/40 bg-warn-soft px-3 py-2.5 text-ink">
        <p className="me-auto flex items-start gap-2 text-sm font-medium">
          <IconWarning size={18} className="mt-px text-warn" />
          {message}
        </p>
        {isAdmin ? (
          !onRatesPage && (
            <Link href="/rates#today" className="caps inline-flex min-h-10 items-center rounded-[2px] bg-warn px-4 text-[12px] font-semibold text-white dark:text-black">
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
