import Link from "next/link";
import { getT } from "@/i18n/server";
import { ratesStatus } from "@/lib/rates";
import { KARATS } from "@/lib/pricing";
import { formatDubaiDateTime, formatDubaiTime, formatRate } from "@/lib/format";
import { getShopPricing } from "@/lib/shop-data";
import { IconWarning } from "./icons";

/**
 * Today's rates as a strip of chips under the shop name (salespeople quote them all day), or a
 * clear warning when rates weren't set today. Rendered inside the page header.
 */
export async function RatesBanner({ shopId, isAdmin, onRatesPage = false }: { shopId: string; isAdmin: boolean; onRatesPage?: boolean }) {
  const { t, locale } = await getT();
  const { rates } = await getShopPricing(shopId);
  const status = ratesStatus(rates);

  if (status.state === "today") {
    return (
      <div className="pb-2.5">
        <ul aria-label={t("rates.stripLabel")} className="flex flex-wrap items-center gap-1.5 text-[13px]">
          <li className="me-1 inline-flex items-center gap-1.5 whitespace-nowrap text-live">
            <span aria-hidden="true" className="size-2 rounded-full bg-live shadow-[0_0_0_3px] shadow-live/20" />
            {t("rates.stripToday", { time: formatDubaiTime(status.oldestSetAt, locale) })}
          </li>
          {KARATS.filter((k) => rates[k]).map((k) => (
            <li key={k} dir="ltr" className="inline-flex items-baseline gap-1.5 rounded-full border border-line bg-paper px-2.5 py-1 whitespace-nowrap">
              <span className="text-muted">{k}K</span>
              <span className="num text-gold">{formatRate(rates[k]!.aed_per_g)}</span>
            </li>
          ))}
        </ul>
      </div>
    );
  }

  const message =
    status.state === "missing"
      ? t("rates.bannerMissing")
      : t("rates.bannerStale", { date: formatDubaiDateTime(status.oldestSetAt, locale) });
  return (
    <div className="pb-3">
      <div role="alert" className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-2xl border border-warn bg-warn-soft p-3 text-ink">
        <p className="me-auto flex items-start gap-2 font-medium">
          <IconWarning className="mt-0.5 text-warn" />
          {message}
        </p>
        {isAdmin ? (
          !onRatesPage && (
            <Link href="/rates#today" className="inline-flex min-h-11 items-center rounded-xl bg-warn px-4 font-semibold text-white dark:text-black">
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
