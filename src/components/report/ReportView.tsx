/**
 * A shop's month at a glance: what the website and trays brought in, how buyers found what they
 * bought, and how the catalogue is kept. Used on the owner's report page and in the Takara
 * dashboard. Counts only; no customer names or numbers.
 */
import type { Translate } from "@/i18n";
import { formatAED, formatNumber } from "@/lib/format";
import { delta, SOURCES, type ShopReport } from "@/lib/report";

function Delta({ cur, prev, t }: { cur: number; prev: number; t: Translate }) {
  const d = delta(cur, prev);
  if (d.dir === "same") return <span className="text-[12px] text-muted">{t("report.same")}</span>;
  return (
    <span className={`text-[12px] font-semibold ${d.dir === "up" ? "text-live" : "text-warn"}`}>
      <span aria-hidden="true">{d.dir === "up" ? "▲" : "▼"}</span> {t(d.dir === "up" ? "report.up" : "report.down", { n: formatNumber(d.n, 0) })}
    </span>
  );
}

function Tile({ label, value, cur, prev, t }: { label: string; value: string; cur: number; prev: number; t: Translate }) {
  return (
    <div className="rounded-[2px] border border-line bg-surface p-4">
      <p className="eyebrow">{label}</p>
      <p dir="ltr" className="num mt-2 text-start font-display text-[2rem] leading-none">{value}</p>
      <p className="mt-2"><Delta cur={cur} prev={prev} t={t} /></p>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-b border-line py-2.5 last:border-0">
      <dt className="text-[15px]">{label}</dt>
      <dd dir="ltr" className="num font-semibold">{value}</dd>
    </div>
  );
}

export function ReportView({ r, t }: { r: ShopReport; t: Translate }) {
  const c = r.current, p = r.previous;
  const maxSold = Math.max(1, ...SOURCES.map((s) => c.sold_by[s]?.count ?? 0));
  const spinPct = r.in_stock ? Math.round((r.with_spin / r.in_stock) * 100) : 0;
  return (
    <div className="space-y-8">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Tile label={t("report.visitors")} value={formatNumber(c.site_visitors, 0)} cur={c.site_visitors} prev={p.site_visitors} t={t} />
        <Tile label={t("report.trays")} value={formatNumber(c.trays, 0)} cur={c.trays} prev={p.trays} t={t} />
        <Tile label={t("report.sold")} value={formatNumber(c.sold, 0)} cur={c.sold} prev={p.sold} t={t} />
        <Tile label={t("report.sales")} value={formatAED(c.sold_value)} cur={c.sold_value} prev={p.sold_value} t={t} />
      </div>

      <section aria-labelledby="src-h">
        <h2 id="src-h" className="font-display text-[1.5rem] leading-tight">{t("report.howFound")}</h2>
        {c.sold === 0 ? (
          <p className="mt-2 text-muted">{t("report.noSales")}</p>
        ) : (
          <ul className="mt-4 space-y-3">
            {SOURCES.filter((s) => c.sold_by[s]?.count).map((s) => {
              const v = c.sold_by[s]!;
              return (
                <li key={s}>
                  <div className="flex items-baseline justify-between gap-3 text-[15px]">
                    <span className={s === "website" || s === "tray" ? "font-semibold" : ""}>{t(`sold.via_${s}`)}</span>
                    <span dir="ltr" className="num text-muted">{v.count} · {formatAED(v.value)}</span>
                  </div>
                  <div className="mt-1.5 h-2 rounded-full bg-tile" aria-hidden="true">
                    <div className={`h-2 rounded-full ${s === "website" || s === "tray" ? "bg-gold-line" : "bg-ink/60"}`} style={{ width: `${(v.count / maxSold) * 100}%` }} />
                  </div>
                </li>
              );
            })}
          </ul>
        )}
        <p className="mt-3 text-sm text-muted">{t("report.howFoundHint")}</p>
      </section>

      <div className="grid gap-8 md:grid-cols-2">
        <section aria-labelledby="tray-h">
          <h2 id="tray-h" className="font-display text-[1.5rem] leading-tight">{t("report.traysTitle")}</h2>
          <dl className="mt-3">
            <Row label={t("report.traysWhatsApp")} value={c.trays_whatsapp} />
            <Row label={t("report.traysInStore")} value={c.trays_in_store} />
            <Row label={t("report.traysOpened")} value={c.trays_opened} />
            <Row label={t("report.pieceViews")} value={c.piece_views} />
          </dl>
        </section>
        <section aria-labelledby="share-h">
          <h2 id="share-h" className="font-display text-[1.5rem] leading-tight">{t("report.sharesTitle")}</h2>
          <dl className="mt-3">
            <Row label={t("report.sharesSent")} value={c.shares} />
            <Row label={t("report.sharesOpened")} value={c.shares_opened} />
          </dl>
        </section>
      </div>

      <section aria-labelledby="top-h">
        <h2 id="top-h" className="font-display text-[1.5rem] leading-tight">{t("report.topPieces")}</h2>
        {r.top_pieces.length === 0 ? (
          <p className="mt-2 text-muted">{t("report.noViews")}</p>
        ) : (
          <ol className="mt-3">
            {r.top_pieces.map((x, i) => (
              <li key={x.id} className="flex items-baseline gap-3 border-b border-line py-2.5 last:border-0">
                <span className="num w-5 text-muted">{i + 1}</span>
                <span className="flex-1">{x.name} <span dir="ltr" className="text-sm text-muted">{x.sku}</span></span>
                <span className="num text-sm text-muted">{t("report.views", { count: x.views })}</span>
              </li>
            ))}
          </ol>
        )}
      </section>

      <section aria-labelledby="cat-h">
        <h2 id="cat-h" className="font-display text-[1.5rem] leading-tight">{t("report.catalogue")}</h2>
        <dl className="mt-3">
          <Row label={t("report.piecesAdded")} value={c.pieces_added} />
          <Row label={t("report.withSpin")} value={`${spinPct}% (${r.with_spin}/${r.in_stock})`} />
          <Row label={t("report.aiFills")} value={c.ai_fills} />
          <Row label={t("report.rateDays")} value={c.rate_days} />
        </dl>
      </section>
    </div>
  );
}
