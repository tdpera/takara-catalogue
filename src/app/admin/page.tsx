import Link from "next/link";
import { requireUser } from "@/lib/session";
import { getT } from "@/i18n/server";
import { formatAED, formatDubaiDateTime, formatNumber } from "@/lib/format";
import { aiCostUsd, formatUsd, type TokenUse } from "@/lib/ai-cost";
import { delta, type Stats } from "@/lib/report";
import { rateAgeDays } from "@/lib/rates";
import { MonthBars } from "@/components/report/MonthBars";
import type { Translate } from "@/i18n";

type Overview = {
  month: string; shops: number; active_shops: number; published_sites: number;
  current: Stats; previous: Stats;
  trend: { month: string; pieces_added: number; trays: number; sold: number; site_visitors: number }[];
};
type ShopRow = {
  id: string; name: string; created_at: string; last_activity: string | null; staff: number; in_stock: number;
  rates_set_at: string | null; site: { slug: string; published: boolean } | null;
  last30: Stats & { ai_tokens: TokenUse };
};

const SORTS = ["activity", "name", "trays", "sold", "visitors"] as const;
type Sort = (typeof SORTS)[number];

function Tile({ label, value, sub }: { label: string; value: string; sub?: React.ReactNode }) {
  return (
    <div className="rounded-[2px] border border-line bg-surface p-4">
      <p className="eyebrow">{label}</p>
      <p dir="ltr" className="num mt-2 text-start font-display text-[2rem] leading-none">{value}</p>
      {sub && <p className="mt-2 text-[12px] text-muted">{sub}</p>}
    </div>
  );
}

function Change({ cur, prev, t }: { cur: number; prev: number; t: Translate }) {
  const d = delta(cur, prev);
  if (d.dir === "same") return <>{t("report.same")}</>;
  return <span className={d.dir === "up" ? "font-semibold text-live" : "font-semibold text-warn"}>{d.dir === "up" ? "▲" : "▼"} {t(d.dir === "up" ? "report.up" : "report.down", { n: formatNumber(d.n, 0) })}</span>;
}

/** Flags worth a phone call: stale rates, a quiet shop, no website yet. */
function flags(s: ShopRow): ("stale" | "quiet" | "nosite")[] {
  const out: ("stale" | "quiet" | "nosite")[] = [];
  if (!s.rates_set_at || rateAgeDays(s.rates_set_at) >= 3) out.push("stale");
  if (!s.last_activity || Date.now() - Date.parse(s.last_activity) > 7 * 86400_000) out.push("quiet");
  if (!s.site?.published) out.push("nosite");
  return out;
}

export default async function AdminHome({ searchParams }: { searchParams: Promise<{ sort?: string }> }) {
  const { supabase } = await requireUser();
  const { t, locale } = await getT();
  const [{ data: ov, error: e1 }, { data: shopsRaw, error: e2 }] = await Promise.all([supabase.rpc("admin_overview"), supabase.rpc("admin_shops")]);
  if (e1 || e2) throw e1 ?? e2;
  const o = ov as Overview;
  const raw = (await searchParams).sort;
  const sort: Sort = (SORTS as readonly string[]).includes(raw ?? "") ? (raw as Sort) : "activity";
  const shops = [...((shopsRaw ?? []) as ShopRow[])].sort((a, b) => {
    switch (sort) {
      case "name": return a.name.localeCompare(b.name);
      case "trays": return b.last30.trays - a.last30.trays;
      case "sold": return b.last30.sold - a.last30.sold;
      case "visitors": return b.last30.site_visitors - a.last30.site_visitors;
      default: return (b.last_activity ?? "").localeCompare(a.last_activity ?? "");
    }
  });
  const c = o.current, p = o.previous;
  const webSales = (s: Stats) => (s.sold_by.website?.count ?? 0) + (s.sold_by.tray?.count ?? 0);
  const th = (key: Sort, label: string) => (
    <th scope="col" className="py-2 pe-3 text-start font-semibold whitespace-nowrap" aria-sort={sort === key ? "descending" : undefined}>
      <Link href={`/admin?sort=${key}`} className={`hover:underline ${sort === key ? "text-ink" : "text-muted"}`}>{label}</Link>
    </th>
  );

  return (
    <main id="main" className="mx-auto max-w-6xl space-y-10 px-4 py-8">
      <div>
        <h1 className="font-display text-[2.2rem] leading-tight">{t("admin.title")}</h1>
        <p className="mt-1 text-muted">{t("admin.intro")}</p>
      </div>

      <section aria-labelledby="ov-h" className="space-y-3">
        <h2 id="ov-h" className="sr-only">{t("admin.thisMonth")}</h2>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <Tile label={t("admin.shops")} value={`${o.active_shops}/${o.shops}`} sub={t("admin.activeHint")} />
          <Tile label={t("admin.sites")} value={formatNumber(o.published_sites, 0)} sub={t("admin.sitesHint")} />
          <Tile label={t("report.visitors")} value={formatNumber(c.site_visitors, 0)} sub={<Change cur={c.site_visitors} prev={p.site_visitors} t={t} />} />
          <Tile label={t("report.trays")} value={formatNumber(c.trays, 0)} sub={<Change cur={c.trays} prev={p.trays} t={t} />} />
          <Tile label={t("report.sold")} value={formatNumber(c.sold, 0)} sub={<>{t("admin.viaWebsite", { count: webSales(c) })}</>} />
          <Tile label={t("report.sales")} value={formatAED(c.sold_value)} sub={<Change cur={c.sold_value} prev={p.sold_value} t={t} />} />
          <Tile label={t("report.piecesAdded")} value={formatNumber(c.pieces_added, 0)} sub={<Change cur={c.pieces_added} prev={p.pieces_added} t={t} />} />
          <Tile label={t("admin.aiCost")} value={formatUsd(aiCostUsd(c.ai_tokens))} sub={t("admin.aiCostHint", { fills: c.ai_fills })} />
        </div>
      </section>

      <section aria-labelledby="trend-h">
        <h2 id="trend-h" className="font-display text-[1.6rem] leading-tight">{t("admin.trend")}</h2>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <MonthBars title={t("report.piecesAdded")} points={o.trend.map((x) => ({ month: x.month, value: x.pieces_added }))} locale={locale} tableLabel={t("admin.asTable")} />
          <MonthBars title={t("report.visitors")} points={o.trend.map((x) => ({ month: x.month, value: x.site_visitors }))} locale={locale} tableLabel={t("admin.asTable")} />
          <MonthBars title={t("report.trays")} points={o.trend.map((x) => ({ month: x.month, value: x.trays }))} locale={locale} tableLabel={t("admin.asTable")} />
          <MonthBars title={t("report.sold")} points={o.trend.map((x) => ({ month: x.month, value: x.sold }))} locale={locale} tableLabel={t("admin.asTable")} />
        </div>
      </section>

      <section aria-labelledby="shops-h">
        <h2 id="shops-h" className="font-display text-[1.6rem] leading-tight">{t("admin.shopsTitle")}</h2>
        <p className="mt-1 text-sm text-muted">{t("admin.shopsHint")}</p>
        <div className="mt-4 overflow-x-auto rounded-[2px] border border-line bg-surface" tabIndex={0} role="region" aria-label={t("admin.shopsTable")}>
          <table className="w-full min-w-[56rem] text-[14px]">
            <thead className="border-b border-line text-[12px]">
              <tr>
                <th scope="col" className="py-2 ps-4 pe-3 text-start font-semibold"><Link href="/admin?sort=name" className={`hover:underline ${sort === "name" ? "text-ink" : "text-muted"}`}>{t("admin.colShop")}</Link></th>
                {th("activity", t("admin.colActivity"))}
                <th scope="col" className="py-2 pe-3 text-end font-semibold text-muted">{t("admin.colStock")}</th>
                <th scope="col" className="py-2 pe-3 text-end font-semibold text-muted">{t("admin.colAdded")}</th>
                {th("visitors", t("admin.colVisitors"))}
                {th("trays", t("admin.colTrays"))}
                {th("sold", t("admin.colSold"))}
                <th scope="col" className="py-2 pe-3 text-end font-semibold text-muted">{t("admin.colAi")}</th>
                <th scope="col" className="py-2 pe-4 text-start font-semibold text-muted">{t("admin.colFlags")}</th>
              </tr>
            </thead>
            <tbody>
              {shops.map((s) => (
                <tr key={s.id} className="border-b border-line last:border-0 hover:bg-paper">
                  <th scope="row" className="py-3 ps-4 pe-3 text-start font-normal">
                    <Link href={`/admin/shops/${s.id}`} className="font-semibold hover:underline">{s.name}</Link>
                    <span className="block text-[12px] text-muted">{t("admin.staffN", { count: s.staff })}{s.site?.published ? ` · ${s.site.slug}` : ""}</span>
                  </th>
                  <td className="py-3 pe-3 whitespace-nowrap text-muted">{s.last_activity ? formatDubaiDateTime(s.last_activity, locale) : "—"}</td>
                  <td dir="ltr" className="num py-3 pe-3 text-end">{s.in_stock}</td>
                  <td dir="ltr" className="num py-3 pe-3 text-end">{s.last30.pieces_added}</td>
                  <td dir="ltr" className="num py-3 pe-3 text-end">{s.last30.site_visitors}</td>
                  <td dir="ltr" className="num py-3 pe-3 text-end">{s.last30.trays}</td>
                  <td dir="ltr" className="num py-3 pe-3 text-end">{s.last30.sold}<span className="text-muted"> ({webSales(s.last30)})</span></td>
                  <td dir="ltr" className="num py-3 pe-3 text-end">{formatUsd(aiCostUsd(s.last30.ai_tokens))}</td>
                  <td className="py-3 pe-4">
                    <ul className="flex flex-wrap gap-1">
                      {flags(s).map((f) => (
                        <li key={f} className={`caps rounded-[2px] px-1.5 py-0.5 text-[10px] font-semibold ${f === "nosite" ? "bg-tile text-muted" : "bg-warn-soft text-warn"}`}>{t(`admin.flag_${f}`)}</li>
                      ))}
                    </ul>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-2 text-[12px] text-muted">{t("admin.tableNote")}</p>
      </section>
    </main>
  );
}
