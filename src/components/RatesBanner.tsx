import Link from "next/link";
import { getT } from "@/i18n/server";
import { ratesStatus } from "@/lib/rates";
import { formatDubaiDateTime, formatDubaiTime } from "@/lib/format";
import { getShopPricing } from "@/lib/shop-data";

/** Shown on every screen: a clear warning when rates weren't set today, a quiet note when they were. */
export async function RatesBanner({ shopId, isAdmin, onRatesPage = false }: { shopId: string; isAdmin: boolean; onRatesPage?: boolean }) {
  const { t, locale } = await getT();
  const { rates } = await getShopPricing(shopId);
  const status = ratesStatus(rates);

  if (status.state === "today") {
    return (
      <p className="mx-auto max-w-5xl px-4 pt-3 text-sm text-live">
        {t("rates.bannerToday", { time: formatDubaiTime(status.oldestSetAt, locale) })}
      </p>
    );
  }

  const message =
    status.state === "missing"
      ? t("rates.bannerMissing")
      : t("rates.bannerStale", { date: formatDubaiDateTime(status.oldestSetAt, locale) });
  return (
    <div className="mx-auto max-w-5xl px-4 pt-3">
      <div role="alert" className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-2xl border border-warn bg-warn-soft p-3 text-ink">
        <p className="me-auto font-medium">
          <span aria-hidden="true">⚠ </span>
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
