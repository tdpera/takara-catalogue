/**
 * A small 12-month column chart for one measure (one series, so no legend: the title names it).
 * Columns are at most 24px wide with rounded tops, square at the baseline and 2px apart; every
 * column shows its month and value on hover or keyboard focus; the latest value is labelled;
 * a table with the same numbers sits underneath for screen readers and exact reading.
 */
import { formatNumber } from "@/lib/format";

export type MonthPoint = { month: string; value: number };

const short = (month: string, locale: string) =>
  new Intl.DateTimeFormat(locale === "en" ? "en-AE" : locale, { month: "short", timeZone: "UTC", numberingSystem: "latn" }).format(new Date(month.slice(0, 7) + "-01T00:00:00Z"));

export function MonthBars({ title, points, locale, tableLabel }: { title: string; points: MonthPoint[]; locale: string; tableLabel: string }) {
  const max = Math.max(1, ...points.map((p) => p.value));
  const last = points.at(-1);
  return (
    <figure className="rounded-[2px] border border-line bg-surface p-4">
      <figcaption className="flex items-baseline justify-between gap-2">
        <span className="eyebrow">{title}</span>
        {last && <span dir="ltr" className="num font-display text-[1.5rem] leading-none">{formatNumber(last.value, 0)}</span>}
      </figcaption>
      <div dir="ltr" className="mt-4 flex h-24 items-end gap-[2px] border-b border-line" aria-hidden="true">
        {points.map((p) => (
          <div key={p.month} className="group relative flex h-full flex-1 items-end justify-center">
            <div
              className="w-full max-w-6 rounded-t-[4px] bg-gold-line transition-opacity group-hover:opacity-80"
              style={{ height: `${p.value ? Math.max(4, (p.value / max) * 100) : 0}%` }}
            />
            <span className="pointer-events-none absolute bottom-full z-10 mb-1 hidden rounded-[2px] bg-ink px-2 py-1 text-[11px] whitespace-nowrap text-paper group-hover:block">
              {short(p.month, locale)} · {formatNumber(p.value, 0)}
            </span>
          </div>
        ))}
      </div>
      <div dir="ltr" className="mt-1.5 flex justify-between text-[10px] text-muted" aria-hidden="true">
        <span>{points[0] ? short(points[0].month, locale) : ""}</span>
        <span>{last ? short(last.month, locale) : ""}</span>
      </div>
      <details className="mt-2 text-sm">
        <summary className="cursor-pointer text-[12px] text-muted">{tableLabel}</summary>
        <table className="mt-2 w-full text-[13px]">
          <tbody>
            {points.map((p) => (
              <tr key={p.month} className="border-b border-line last:border-0">
                <th scope="row" className="py-1 text-start font-normal">{short(p.month, locale)} {p.month.slice(0, 4)}</th>
                <td dir="ltr" className="num py-1 text-end">{formatNumber(p.value, 0)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </figure>
  );
}
