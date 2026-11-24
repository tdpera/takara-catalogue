import Link from "next/link";
import { requireUser } from "@/lib/session";
import { getT } from "@/i18n/server";
import { formatAED, formatDubaiDateTime, formatNumber } from "@/lib/format";
import { aiCostUsd, formatUsd, type TokenUse } from "@/lib/ai-cost";
import { delta, type Stats } from "@/lib/report";
import { needsAttention, shopIssues, type ShopHealth, type ShopStatus } from "@/lib/shop-issues";
import { MonthBars } from "@/components/report/MonthBars";
import { IssueChip, issueText, OwnerPhone, StatusBadge, StatusButtons } from "@/components/admin/parts";
import type { Translate } from "@/i18n";

type Overview = {
  month: string; shops: number; active_shops: number; pending: number; suspended: number; published_sites: number;
  current: Stats; previous: Stats;
  trend: { month: string; pieces_added: number; trays: number; sold: number; site_visitors: number }[];
};
type ShopRow = {
  id: string; name: string; created_at: string; last_activity: string | null; staff: number; in_stock: number;
  status: ShopStatus; status_changed_at: string | null; is_demo: boolean;
  owner: { name: string | null; phone: string | null } | null; health: ShopHealth;
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
  const all = (shopsRaw ?? []) as ShopRow[];
  const waiting = all.filter((s) => s.status === "pending" && !s.is_demo).sort((a, b) => a.created_at.localeCompare(b.created_at));
  const issues = needsAttention(all);
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

      {waiting.length > 0 && (
        <section aria-labelledby="wait-h" className="rounded-[2px] border border-gold-line/60 bg-gold-soft/40 p-4 sm:p-5">
          <h2 id="wait-h" className="font-display text-[1.6rem] leading-tight">{t("admin.approvalsTitle")} <span className="num text-muted">({waiting.length})</span></h2>
          <p className="mt-1 text-sm text-muted">{t("admin.approvalsHint")}</p>
          <ul className="mt-4 divide-y divide-line rounded-[2px] border border-line bg-surface">
            {waiting.map((s) => (
              <li key={s.id} className="flex flex-wrap items-center justify-between gap-3 p-4">
                <div className="min-w-0">
                  <Link href={`/admin/shops/${s.id}`} className="font-semibold hover:underline">{s.name}</Link>
                  <p className="text-[14px] text-muted">
                    {s.owner?.name ?? t("admin.noName")}
                    {s.owner?.phone && <> · <OwnerPhone phone={s.owner.phone} /></>}
                    {" · "}{t("admin.requested", { time: formatDubaiDateTime(s.created_at, locale) })}
                  </p>
                </div>
                <StatusButtons id={s.id} name={s.name} status={s.status} t={t} />
              </li>
            ))}
          </ul>
        </section>
      )}

      <section aria-labelledby="att-h">
        <h2 id="att-h" className="font-display text-[1.6rem] leading-tight">{t("admin.attentionTitle")}</h2>
        <p className="mt-1 text-sm text-muted">{t("admin.attentionHint")}</p>
        {issues.length === 0 ? (
          <p className="mt-3 rounded-[2px] border border-line bg-surface p-4 text-[15px]">{t("admin.attentionNone")}</p>
        ) : (
          <ul className="mt-3 divide-y divide-line rounded-[2px] border border-line bg-surface">
            {issues.slice(0, 30).map(({ shop, issue }) => (
              <li key={shop.id + issue.kind}>
                <Link href={`/admin/shops/${shop.id}`} className="flex min-h-11 items-center gap-3 px-4 py-2.5 hover:bg-paper">
                  <span aria-hidden="true" className={`size-2 shrink-0 rounded-full ${issue.level >= 3 ? "bg-danger" : issue.level === 2 ? "bg-warn" : "bg-gold-line"}`} />
                  <span><span className="font-semibold">{shop.name}</span>: {issueText(issue, t)}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

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
                    <span className="flex flex-wrap items-center gap-1.5">
                      <Link href={`/admin/shops/${s.id}`} className="font-semibold hover:underline">{s.name}</Link>
                      <StatusBadge status={s.status} isDemo={s.is_demo} t={t} />
                    </span>
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
                      {shopIssues(s).map((i) => <IssueChip key={i.kind} i={i} t={t} />)}
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
