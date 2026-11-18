import type { Metadata } from "next";
import { requireShop } from "@/lib/session";
import { getShopPricing } from "@/lib/shop-data";
import { KARATS, toDec, type Karat } from "@/lib/pricing";
import { isRateToday } from "@/lib/rates";
import { formatDubaiDateTime, formatRate } from "@/lib/format";
import { getT } from "@/i18n/server";
import { AppHeader } from "@/components/AppHeader";
import { card } from "@/components/ui";
import { PriceCalculator, RatesForm, SettingsForm } from "./RatesForms";

export const metadata: Metadata = { title: "Gold rates" };

type HistoryRow = { karat: number; aed_per_g: number; set_at: string; set_by: string | null };

/** Plain decimal string for an input field: "437.5000" → "437.50". */
function inputValue(v: number | string | undefined): string {
  const d = toDec(v ?? null);
  return d ? d.toFixed(Math.max(2, Math.min(4, d.dp()))) : "";
}

export default async function RatesPage() {
  const { supabase, memberships, current, isAdmin } = await requireShop();
  const { t, locale } = await getT();
  const { rates, vatEnabled, defaultMakingPerG } = await getShopPricing(current.shop_id);

  const { data: history } = await supabase
    .from("gold_rates")
    .select("karat, aed_per_g, set_at, set_by")
    .eq("shop_id", current.shop_id)
    .order("set_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(60)
    .returns<HistoryRow[]>();

  // Rows saved together share one timestamp; show them as one change.
  const groups: { setAt: string; setBy: string | null; rates: Map<number, number> }[] = [];
  for (const r of history ?? []) {
    const last = groups[groups.length - 1];
    if (last && last.setAt === r.set_at && last.setBy === r.set_by) last.rates.set(r.karat, r.aed_per_g);
    else groups.push({ setAt: r.set_at, setBy: r.set_by, rates: new Map([[r.karat, r.aed_per_g]]) });
  }
  const shown = groups.slice(0, 10);
  const setterIds = [...new Set(shown.map((g) => g.setBy).filter((x): x is string => !!x))];
  const { data: profiles } = setterIds.length
    ? await supabase.from("profiles").select("user_id, display_name, phone").in("user_id", setterIds)
    : { data: [] as { user_id: string; display_name: string | null; phone: string | null }[] };
  const nameOf = (id: string | null) => {
    const p = (profiles ?? []).find((x) => x.user_id === id);
    return p?.display_name || p?.phone || "—";
  };

  const initial = Object.fromEntries(KARATS.map((k) => [k, inputValue(rates[k]?.aed_per_g)])) as Record<Karat, string>;
  const anyRate = KARATS.some((k) => rates[k]);

  return (
    <>
      <AppHeader memberships={memberships} current={current} onRatesPage />
      <main id="main" className="mx-auto max-w-3xl space-y-6 px-4 py-6">
        <h1 className="font-display text-[2rem] leading-tight">{t("rates.title")}</h1>

        <section className="rounded-3xl bg-ticker p-5 text-ticker-muted shadow-lift" aria-labelledby="current-h">
          <h2 id="current-h" className="eyebrow text-ticker-muted!">{t("rates.current")}</h2>
          {anyRate ? (
            <table className="mt-2 w-full">
              <thead className="sr-only">
                <tr>
                  <th scope="col">{t("price.karat")}</th>
                  <th scope="col">{t("rates.perGram")}</th>
                  <th scope="col">{t("rates.setAt", { time: "" })}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/10">
                {KARATS.map((k) => {
                  const r = rates[k];
                  const today = r && isRateToday(r.set_at);
                  return (
                    <tr key={k}>
                      <th scope="row" className="py-3 pe-3 text-start text-lg font-semibold text-[#f2eee7]">{k}K</th>
                      <td className="py-3 pe-3">
                        <span dir="ltr" className="num text-[1.6rem] leading-none text-ticker-gold">{r ? formatRate(r.aed_per_g) : "—"}</span>
                        {r && <span className="ms-1.5 text-xs">AED/g</span>}
                      </td>
                      <td className={"py-3 text-end text-xs " + (r && !today ? "font-medium text-[#f0b04a]" : "")}>
                        {r && t("rates.setAt", { time: formatDubaiDateTime(r.set_at, locale) })}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          ) : (
            <p className="mt-2">{t("rates.noneYet")}</p>
          )}
        </section>

        {isAdmin ? (
          <>
            <section id="today" className={card + " scroll-mt-4"} aria-labelledby="today-h">
              <h2 id="today-h" className="mb-2 font-display text-[1.35rem] leading-tight">{t("rates.todayTitle")}</h2>
              <RatesForm initial={initial} current={rates} />
            </section>
            <section className={card} aria-labelledby="settings-h">
              <h2 id="settings-h" className="mb-2 font-display text-[1.35rem] leading-tight">{t("rates.settingsTitle")}</h2>
              <SettingsForm making={inputValue(defaultMakingPerG)} vat={vatEnabled} />
            </section>
          </>
        ) : (
          <p className="text-muted">{t("rates.viewOnly")}</p>
        )}

        <section className={card} aria-labelledby="calc-h">
          <h2 id="calc-h" className="mb-2 font-display text-[1.35rem] leading-tight">{t("price.calculator")}</h2>
          <PriceCalculator rates={rates} vatEnabled={vatEnabled} defaultMaking={inputValue(defaultMakingPerG)} />
        </section>

        <section className={card} aria-labelledby="history-h">
          <h2 id="history-h" className="font-display text-[1.35rem] leading-tight">{t("rates.history")}</h2>
          {shown.length === 0 ? (
            <p className="mt-2 text-muted">{t("rates.historyEmpty")}</p>
          ) : (
            <ol className="mt-2 divide-y divide-line">
              {shown.map((g) => (
                <li key={g.setAt + g.setBy} className="py-3">
                  <p className="text-sm text-muted">
                    {t("rates.setAtBy", { time: formatDubaiDateTime(g.setAt, locale), name: nameOf(g.setBy) })}
                  </p>
                  <p className="num mt-1 flex flex-wrap gap-x-4">
                    {KARATS.filter((k) => g.rates.has(k)).map((k) => (
                      <span key={k} dir="ltr">
                        <span className="text-muted">{k}K</span> {formatRate(g.rates.get(k)!)}
                      </span>
                    ))}
                  </p>
                </li>
              ))}
            </ol>
          )}
        </section>
      </main>
    </>
  );
}
