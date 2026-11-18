"use client";
import { useT } from "@/i18n/client";
import type { MessageKey } from "@/i18n";
import { priceOf, toDec, type PieceInput, type PriceError, type RateMap } from "@/lib/pricing";
import { isRateToday } from "@/lib/rates";
import { formatAED, formatDubaiDateTime, formatGrams, formatRate } from "@/lib/format";

const ERR: Record<PriceError, MessageKey> = {
  invalid_karat: "price.errKarat",
  invalid_weight: "price.errWeight",
  stone_not_less_than_gross: "price.errStone",
  invalid_amount: "price.errAmount",
  no_rate: "price.errNoRate",
};

const Num = ({ children }: { children: React.ReactNode }) => (
  <span dir="ltr" className="num whitespace-nowrap">{children}</span>
);

/** Full price breakdown from the current rates. Lines in fils, final price in whole AED. */
export function PriceBreakdown({ piece, rates, vatEnabled }: { piece: PieceInput; rates: RateMap; vatEnabled: boolean }) {
  const { t, locale } = useT();
  const res = priceOf(piece, rates, vatEnabled);
  if (!res.ok) {
    return (
      <p role="status" className="rounded-xl border border-line p-3 text-muted">
        {t(ERR[res.error], { karat: piece.karat })}
      </p>
    );
  }
  const p = res.price;
  const stale = !isRateToday(p.rateSetAt);
  const stoneD = toDec(piece.stone_g ?? null);
  const hasStone = !!stoneD && stoneD.gt(0);
  // Two columns so it fits a phone: label (with the calculation underneath) and amount.
  const row = (label: string, detail: React.ReactNode, amount: React.ReactNode, cls = "") => (
    <tr className={cls}>
      <th scope="row" className="py-2 pe-3 text-start align-top font-normal">
        {label}
        {detail && <span className="block text-sm font-normal text-muted">{detail}</span>}
      </th>
      <td className="py-2 text-end align-top">{amount}</td>
    </tr>
  );

  return (
    <div>
      <table className="w-full border-collapse" aria-live="polite">
        <caption className="sr-only">{t("price.breakdown")}</caption>
        <tbody className="divide-y divide-line">
          {row(
            t("price.netGold"),
            hasStone ? (
              <Num>{t("price.stonesNote", { gross: formatGrams(piece.gross_g), stone: formatGrams(piece.stone_g!) })}</Num>
            ) : null,
            <Num>{formatGrams(p.netGoldG)}</Num>,
          )}
          {row(t("price.goldValue"), <Num>{formatGrams(p.netGoldG)} × {formatRate(p.rate)}</Num>, <Num>{formatAED(p.goldValue, 2)}</Num>)}
          {row(
            t("price.making"),
            p.makingMode === "flat" ? t("price.flat") : <Num>{formatGrams(p.netGoldG)} × {formatRate(p.makingPerG)}</Num>,
            <Num>{formatAED(p.making, 2)}</Num>,
          )}
          {p.extras.gt(0) && row(t("price.extrasRow"), null, <Num>{formatAED(p.extras, 2)}</Num>)}
          {p.vatEnabled && row(t("price.subtotal"), null, <Num>{formatAED(p.base, 2)}</Num>)}
          {p.vatEnabled && row(t("price.vat"), null, <Num>{formatAED(p.vat, 2)}</Num>)}
          {row(t("price.total"), null, <Num>{formatAED(p.total, 2)}</Num>)}
          {row(
            t(p.vatEnabled ? "price.priceInclVat" : "price.price"),
            null,
            <Num>{formatAED(p.totalWhole)}</Num>,
            "text-lg font-semibold [&>th]:font-semibold",
          )}
        </tbody>
      </table>
      <p className="mt-2 text-sm text-muted">
        {t("price.rateNote", { karat: p.karat, rate: formatRate(p.rate), time: formatDubaiDateTime(p.rateSetAt, locale) })}
        {stale && <strong className="ms-1 font-semibold text-warn">{t("price.notTodayRate")}</strong>}
      </p>
    </div>
  );
}
