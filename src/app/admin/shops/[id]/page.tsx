import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { requireUser } from "@/lib/session";
import { getT } from "@/i18n/server";
import { formatDubaiDateTime } from "@/lib/format";
import { formatPhone } from "@/lib/phone";
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

  return (
    <main id="main" className="mx-auto max-w-6xl space-y-8 px-4 py-8">
      <Link href="/admin" className="inline-flex min-h-11 items-center gap-1.5 text-sm font-semibold text-muted hover:text-ink">
        <IconBack size={18} className="rtl:rotate-180" /> {t("admin.title")}
      </Link>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-[2.2rem] leading-tight">{s.name}</h1>
          <p className="mt-1 text-sm text-muted">
            {t("admin.since", { date: formatDubaiDateTime(s.created_at, locale) })} · {t("admin.staffN", { count: s.staff })}
            {s.last_activity && <> · {t("admin.lastActive", { time: formatDubaiDateTime(s.last_activity, locale) })}</>}
          </p>
        </div>
        {site && <a href={site} target="_blank" rel="noopener" className="caps text-[12px] font-semibold text-gold hover:underline" dir="ltr">{site.replace(/^https?:\/\//, "")}</a>}
      </div>

      <section aria-labelledby="own-h" className="rounded-[2px] border border-line bg-surface p-4">
        <h2 id="own-h" className="eyebrow mb-2">{t("admin.owner")}</h2>
        <ul className="space-y-1">
          {s.owners.map((o, i) => (
            <li key={i}>
              {o.name ?? t("admin.noName")}
              {o.phone && <> · <a href={`https://wa.me/${o.phone.replace(/\D/g, "")}`} className="font-semibold hover:underline" dir="ltr">{formatPhone("+" + o.phone.replace(/^\+/, ""))}</a></>}
            </li>
          ))}
        </ul>
      </section>

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
