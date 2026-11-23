import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { requireShop } from "@/lib/session";
import { getT } from "@/i18n/server";
import { parseMonth, shiftMonth, type ShopReport } from "@/lib/report";
import { AppHeader } from "@/components/AppHeader";
import { ReportView } from "@/components/report/ReportView";
import { IconChevron } from "@/components/icons";

export const metadata: Metadata = { title: "Monthly report" };

const monthName = (month: string, locale: string) =>
  new Intl.DateTimeFormat(locale === "en" ? "en-AE" : locale, { month: "long", year: "numeric", timeZone: "UTC", numberingSystem: "latn" }).format(new Date(month + "T00:00:00Z"));

/** The owner's monthly report: what the website, trays and links brought in. */
export default async function ReportPage({ searchParams }: { searchParams: Promise<{ m?: string }> }) {
  const { supabase, memberships, current } = await requireShop();
  if (current.role !== "owner") redirect("/shop");
  const { t, locale } = await getT();
  const month = parseMonth((await searchParams).m);
  const { data, error } = await supabase.rpc("shop_report", { p_shop: current.shop_id, p_month: month });
  if (error) throw error;
  const r = data as ShopReport;
  const thisMonth = new Date().toISOString().slice(0, 7);
  const next = shiftMonth(r.month, 1);

  return (
    <>
      <AppHeader memberships={memberships} current={current} />
      <main id="main" className="mx-auto max-w-4xl space-y-6 px-4 py-6 pb-28">
        <div>
          <h1 className="font-display text-[2rem] leading-tight">{t("report.title")}</h1>
          <nav aria-label={t("report.month")} className="mt-3 flex items-center gap-2">
            <Link href={`/report?m=${shiftMonth(r.month, -1)}`} className="flex size-11 items-center justify-center rounded-full border border-line hover:border-ink" aria-label={t("report.previous")}>
              <IconChevron size={18} className="rotate-180" />
            </Link>
            <p className="min-w-40 text-center font-semibold" aria-live="polite">{monthName(r.month, locale)}</p>
            {next <= thisMonth ? (
              <Link href={`/report?m=${next}`} className="flex size-11 items-center justify-center rounded-full border border-line hover:border-ink" aria-label={t("report.next")}>
                <IconChevron size={18} />
              </Link>
            ) : (
              <span className="size-11" />
            )}
          </nav>
          {!r.site?.published && <p className="mt-3 text-sm text-muted">{t("report.noSite")} <Link href="/website" className="font-semibold text-gold hover:underline">{t("trays.setUpSite")}</Link></p>}
        </div>
        <ReportView r={r} t={t} />
      </main>
    </>
  );
}
