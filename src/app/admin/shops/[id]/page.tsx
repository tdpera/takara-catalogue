import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { requireUser } from "@/lib/session";
import { getT } from "@/i18n/server";
import { formatDubaiDateTime } from "@/lib/format";
import { shopIssues, type ShopHealth, type ShopStatus } from "@/lib/shop-issues";
import { issueText, OwnerPhone, StatusBadge, StatusButtons } from "@/components/admin/parts";
import { siteAddress } from "@/lib/site-host";
import { appOrigin } from "@/lib/site-origin";
import type { ShopReport } from "@/lib/report";
import type { MessageKey, Translate } from "@/i18n";
import { ReportView } from "@/components/report/ReportView";
import { IconBack } from "@/components/icons";

type Activity = {
  at: string; kind: string; props: Record<string, unknown>;
  piece?: { name: string; sku: string; sold_via: string | null } | null; tray?: string | null;
};
type ShopDetail = {
  id: string; name: string; created_at: string; last_activity: string | null; staff: number;
  status: ShopStatus; status_changed_at: string | null; is_demo: boolean; rates_set_at: string | null; health: ShopHealth;
  owners: { name: string | null; phone: string | null }[];
  site: { slug: string; published: boolean; price_mode: string } | null;
  report: ShopReport; activity: Activity[];
};

/** One line of the activity feed, in plain words. */
function describe(a: Activity, t: Translate): string {
  const piece = a.piece ? `${a.piece.name} (${a.piece.sku})` : t("admin.aPiece");
  switch (a.kind) {
    case "piece_added": return t("admin.ev_piece_added", { piece });
    case "ai_fill_used": return t("admin.ev_ai_fill_used", { piece });
    case "share_created": return t("admin.ev_share_created", { count: Number(a.props.pieces ?? 0) });
    case "share_viewed": return t("admin.ev_share_viewed");
    case "piece_sold": return a.piece?.sold_via ? t("admin.ev_piece_sold_via", { piece, via: t(`sold.via_${a.piece.sold_via}` as MessageKey) }) : t("admin.ev_piece_sold", { piece });
    case "tray_created": return t(a.props.channel === "whatsapp" ? "admin.ev_tray_whatsapp" : "admin.ev_tray_in_store", { code: a.tray ?? "", count: Number(a.props.pieces ?? 0) });
    case "tray_opened": return t("admin.ev_tray_opened", { code: a.tray ?? "" });
    case "rates_set": return t("admin.ev_rates_set", { count: Number(a.props.karats ?? 0) });
    case "shop_status": return t(a.props.to === "active" ? (a.props.from === "pending" ? "admin.ev_shop_approved" : "admin.ev_shop_reactivated") : (a.props.from === "pending" ? "admin.ev_shop_declined" : "admin.ev_shop_suspended"));
    default: return a.kind;
  }
}

export default async function AdminShopPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) notFound();
  const { supabase } = await requireUser();
  const { t, locale } = await getT();
  const { data, error } = await supabase.rpc("admin_shop", { p_shop: id });
  if (error) throw error;
  if (!data) notFound();
  const s = data as ShopDetail;
  const site = s.site?.published ? siteAddress(s.site.slug, await appOrigin()) : null;
  const issues = shopIssues(s);

  return (
    <main id="main" className="mx-auto max-w-6xl space-y-8 px-4 py-8">
      <Link href="/admin" className="inline-flex min-h-11 items-center gap-1.5 text-sm font-semibold text-muted hover:text-ink">
        <IconBack size={18} className="rtl:rotate-180" /> {t("admin.title")}
      </Link>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="flex flex-wrap items-center gap-3 font-display text-[2.2rem] leading-tight">
            {s.name} <StatusBadge status={s.status} isDemo={s.is_demo} t={t} />
          </h1>
          <p className="mt-1 text-sm text-muted">
            {t("admin.since", { date: formatDubaiDateTime(s.created_at, locale) })} · {t("admin.staffN", { count: s.staff })}
            {s.last_activity && <> · {t("admin.lastActive", { time: formatDubaiDateTime(s.last_activity, locale) })}</>}
          </p>
        </div>
        {site && <a href={site} target="_blank" rel="noopener" className="caps text-[12px] font-semibold text-gold hover:underline" dir="ltr">{site.replace(/^https?:\/\//, "")}</a>}
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <section aria-labelledby="own-h" className="rounded-[2px] border border-line bg-surface p-4">
          <h2 id="own-h" className="eyebrow mb-2">{t("admin.owner")}</h2>
          <ul className="space-y-1">
            {s.owners.map((o, i) => (
              <li key={i}>
                {o.name ?? t("admin.noName")}
                {o.phone && <> · <OwnerPhone phone={o.phone} /></>}
              </li>
            ))}
          </ul>
        </section>
        <section aria-labelledby="st-h" className="space-y-3 rounded-[2px] border border-line bg-surface p-4">
          <h2 id="st-h" className="eyebrow">{t("admin.statusTitle")}</h2>
          <p className="text-[15px]">
            <span className="font-semibold">{t(`admin.status_${s.status}` as MessageKey)}</span>
            {s.status_changed_at && <span className="text-muted"> · {t("admin.statusSince", { date: formatDubaiDateTime(s.status_changed_at, locale) })}</span>}
          </p>
          {s.is_demo ? (
            <p className="text-sm text-muted">{t("admin.demoHint")}</p>
          ) : (
            <>
              <p className="text-sm text-muted">{t(s.status === "pending" ? "admin.approvalsHint" : s.status === "active" ? "admin.suspendHint" : "admin.reactivateHint")}</p>
              <StatusButtons id={s.id} name={s.name} status={s.status} t={t} />
            </>
          )}
        </section>
      </div>

      {s.status === "active" && (
        <section aria-labelledby="att-h">
          <h2 id="att-h" className="font-display text-[1.6rem] leading-tight">{t("admin.attentionTitle")}</h2>
          {issues.length === 0 ? (
            <p className="mt-2 text-muted">{t("admin.attentionNone")}</p>
          ) : (
            <ul className="mt-3 space-y-1.5">
              {issues.map((i) => (
                <li key={i.kind} className="flex items-center gap-3 text-[15px]">
                  <span aria-hidden="true" className={`size-2 shrink-0 rounded-full ${i.level >= 3 ? "bg-danger" : i.level === 2 ? "bg-warn" : i.level === 1 ? "bg-gold-line" : "bg-line"}`} />
                  {issueText(i, t)}
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      <div className="grid gap-10 lg:grid-cols-[1.5fr_1fr]">
        <section aria-labelledby="rep-h">
          <h2 id="rep-h" className="mb-4 font-display text-[1.6rem] leading-tight">{t("admin.thisMonthReport")}</h2>
          <ReportView r={s.report} t={t} />
        </section>
        <section aria-labelledby="act-h">
          <h2 id="act-h" className="font-display text-[1.6rem] leading-tight">{t("admin.activity")}</h2>
          {s.activity.length === 0 ? (
            <p className="mt-2 text-muted">{t("admin.noActivity")}</p>
          ) : (
            <ol className="mt-3 border-s border-line">
              {s.activity.slice(0, 60).map((a, i) => (
                <li key={i} className="relative ps-4 pb-4">
                  <span aria-hidden="true" className="absolute -start-[4.5px] top-1.5 size-2 rounded-full bg-gold-line" />
                  <p className="text-[14.5px]">{describe(a, t)}</p>
                  <p className="text-[12px] text-muted">{formatDubaiDateTime(a.at, locale)}</p>
                </li>
              ))}
            </ol>
          )}
        </section>
      </div>
    </main>
  );
}
