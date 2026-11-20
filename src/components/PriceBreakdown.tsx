"use client";
import { useT } from "@/i18n/client";
import type { MessageKey } from "@/i18n";
import { priceOf, toDec, type PieceInput, type PriceError, type RateMap } from "@/lib/pricing";
import { isRateToday } from "@/lib/rates";
import { formatAED, formatDubaiDateTime, formatGrams, formatRate } from "@/lib/format";
import { IconChevron } from "./icons";

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

/**
 * Price from the current rates. Lines in fils, final price in whole AED.
 * "table" shows the full breakdown (edit and rates screens); "headline" leads with the price a
 * salesperson quotes, with the breakdown one tap away (piece page).
 */
export function PriceBreakdown({
  piece,
  rates,
  vatEnabled,
  variant = "table",
}: {
  piece: PieceInput;
  rates: RateMap;
  vatEnabled: boolean;
  variant?: "table" | "headline";
}) {
  const { t, locale } = useT();
  const res = priceOf(piece, rates, vatEnabled);
  if (!res.ok) {
    return (
      <p role="status" className="rounded-[2px] border border-line p-3 text-muted">
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

  const lines = (
    <>
      {row(
        t("price.netGold"),
        hasStone ? <Num>{t("price.stonesNote", { gross: formatGrams(piece.gross_g), stone: formatGrams(piece.stone_g!) })}</Num> : null,
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
    </>
  );
  const note = (
    <p className="mt-2 text-sm text-muted">
      {t("price.rateNote", { karat: p.karat, rate: formatRate(p.rate), time: formatDubaiDateTime(p.rateSetAt, locale) })}
      {stale && <strong className="ms-1 font-semibold text-warn">{t("price.notTodayRate")}</strong>}
    </p>
  );

  if (variant === "headline") {
    return (
      <div aria-live="polite">
        <p className="eyebrow">{t(p.vatEnabled ? "price.priceInclVat" : "price.price")}</p>
        <p className="mt-1.5 font-display text-[2.75rem] leading-none">
          <span dir="ltr">{formatAED(p.totalWhole)}</span>
        </p>
        {note}
        <details className="group mt-4 border-t border-line pt-1">
          <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-2 font-medium [&::-webkit-details-marker]:hidden">
            {t("price.breakdown")}
            <IconChevron size={18} className="text-muted transition-transform duration-300 group-open:rotate-90" />
          </summary>
          <table className="w-full border-collapse">
            <caption className="sr-only">{t("price.breakdown")}</caption>
            <tbody className="divide-y divide-line">{lines}</tbody>
          </table>
        </details>
      </div>
    );
  }

  return (
    <div>
      <table className="w-full border-collapse" aria-live="polite">
        <caption className="sr-only">{t("price.breakdown")}</caption>
        <tbody className="divide-y divide-line">
          {lines}
          {row(
            t(p.vatEnabled ? "price.priceInclVat" : "price.price"),
            null,
            <span dir="ltr" className="font-display text-[1.6rem] leading-none whitespace-nowrap text-gold">{formatAED(p.totalWhole)}</span>,
            "bg-gold-soft/70 font-semibold [&>td]:pe-3 [&>td]:align-middle [&>th]:ps-3 [&>th]:align-middle [&>th]:font-semibold",
          )}
        </tbody>
      </table>
      {note}
    </div>
  );
}
