import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { requireShop } from "@/lib/session";
import { getT } from "@/i18n/server";
import { formatDubaiDateTime } from "@/lib/format";
import { AppHeader } from "@/components/AppHeader";
import { btnPrimary, input } from "@/components/ui";
import { EmptyState } from "@/components/EmptyState";
import { IconChat, IconChevron, IconTray } from "@/components/icons";

export const metadata: Metadata = { title: "Trays" };

type TrayRow = { id: string; code: string; piece_ids: string[]; channel: "whatsapp" | "in_store"; created_at: string; opened_at: string | null };

/**
 * Trays customers made on the shop's website. A customer shows a code (or a QR) in the shop, or
 * sends it on WhatsApp; typing or scanning it here opens the tray and records the visit.
 */
export default async function TraysPage({ searchParams }: { searchParams: Promise<{ code?: string }> }) {
  const { supabase, memberships, current } = await requireShop();
  const { t, locale } = await getT();
  const raw = (await searchParams).code;
  const code = typeof raw === "string" ? raw.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 12) : "";
  let notFound = false;
  if (code) {
    const { data: id } = await supabase.rpc("open_tray", { p_shop: current.shop_id, p_code: code });
    if (typeof id === "string") redirect(`/trays/${id}`);
    notFound = true;
  }
  const since = new Date(Date.now() - 60 * 86400 * 1000).toISOString();
  const [{ data: trays }, { data: site }] = await Promise.all([
    supabase.from("site_trays").select("id, code, piece_ids, channel, created_at, opened_at").eq("shop_id", current.shop_id).gte("created_at", since).order("created_at", { ascending: false }).limit(60).returns<TrayRow[]>(),
    supabase.from("shop_sites").select("published").eq("shop_id", current.shop_id).maybeSingle<{ published: boolean }>(),
  ]);
  const ids = [...new Set((trays ?? []).flatMap((x) => x.piece_ids))];
  const { data: sold } = ids.length
    ? await supabase.from("pieces").select("id").in("id", ids).eq("status", "sold").returns<{ id: string }[]>()
    : { data: [] as { id: string }[] };
  const soldIds = new Set((sold ?? []).map((s) => s.id));

  return (
    <>
      <AppHeader memberships={memberships} current={current} />
      <main id="main" className="mx-auto max-w-3xl space-y-6 px-4 py-6 pb-28">
        <div>
          <h1 className="font-display text-[2rem] leading-tight">{t("trays.title")}</h1>
          <p className="mt-2 text-muted">{t("trays.intro")}</p>
        </div>
        <form method="get" action="/trays" className="flex gap-2" role="search">
          <label htmlFor="tray-code" className="sr-only">{t("trays.codeLabel")}</label>
          <input
            id="tray-code"
            name="code"
            dir="ltr"
            required
            maxLength={8}
            autoCapitalize="characters"
            autoComplete="off"
            spellCheck={false}
            placeholder={t("trays.codePlaceholder")}
            defaultValue={notFound ? code : ""}
            className={input + " num text-center text-[1.4rem] tracking-[0.3em] uppercase"}
            aria-invalid={notFound || undefined}
            aria-describedby={notFound ? "tray-err" : undefined}
          />
          <button type="submit" className={btnPrimary + " shrink-0"}>{t("trays.open")}</button>
        </form>
        {notFound && <p id="tray-err" role="alert" className="text-sm font-medium text-danger">{t("trays.notFound", { code })}</p>}

        {(trays ?? []).length === 0 ? (
          <EmptyState title={t("trays.empty")}>
            <p className="text-sm text-muted">{site?.published ? t("trays.emptyHint") : t("trays.noSiteHint")}</p>
            {!site?.published && current.role !== "salesperson" && (
              <Link href="/website" className="mt-3 inline-flex min-h-11 items-center font-semibold text-gold hover:underline">{t("trays.setUpSite")}</Link>
            )}
          </EmptyState>
        ) : (
          <section aria-labelledby="recent-h">
            <h2 id="recent-h" className="eyebrow mb-2">{t("trays.recent")}</h2>
            <ul className="divide-y divide-line border-y border-line">
              {(trays ?? []).map((x) => {
                const soldN = x.piece_ids.filter((id) => soldIds.has(id)).length;
                return (
                  <li key={x.id}>
                    <Link href={`/trays/${x.id}`} className="flex min-h-16 items-center gap-4 py-3 hover:bg-surface">
                      <span className="flex size-10 shrink-0 items-center justify-center rounded-full border border-line">
                        {x.channel === "whatsapp" ? <IconChat size={18} /> : <IconTray size={18} />}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span dir="ltr" className="num block font-semibold tracking-[0.12em]">{x.code}</span>
                        <span className="block text-sm text-muted">
                          {t(x.channel === "whatsapp" ? "trays.viaWhatsApp" : "trays.viaShop")} · {t("trays.pieces", { count: x.piece_ids.length })} · {formatDubaiDateTime(x.created_at, locale)}
                        </span>
                      </span>
                      <span className="flex shrink-0 flex-col items-end gap-1">
                        {soldN > 0 && <span className="caps rounded-[2px] bg-ink px-2 py-0.5 text-[10px] font-semibold text-paper">{t("trays.soldN", { count: soldN })}</span>}
                        {!x.opened_at && <span className="caps rounded-[2px] bg-gold-soft px-2 py-0.5 text-[10px] font-semibold text-gold">{t("trays.new")}</span>}
                      </span>
                      <IconChevron size={16} className="text-muted" />
                    </Link>
                  </li>
                );
              })}
            </ul>
          </section>
        )}
      </main>
    </>
  );
}
