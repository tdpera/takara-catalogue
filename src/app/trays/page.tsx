import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { requireShop } from "@/lib/session";
import { getT } from "@/i18n/server";
import { formatDubaiDateTime } from "@/lib/format";
import { AppHeader } from "@/components/AppHeader";
import { btnPrimary, input } from "@/components/ui";
import { IconChat, IconChevron, IconTray, IconUsers } from "@/components/icons";
import { loadSentTrays } from "@/lib/sent-trays";
import { SharesList } from "@/app/shares/SharesList";

export const metadata: Metadata = { title: "Trays" };

type TrayRow = { id: string; code: string; piece_ids: string[]; channel: "whatsapp" | "in_store"; created_at: string; opened_at: string | null; share_id: string | null };

/**
 * Digital trays, both ways. Staff send customers trays of pieces they pick (select pieces in the
 * catalogue, then Send tray); customers answer with the pieces they'd like to see (or make a tray
 * from the website's showcase), shown in the shop as a code or QR, or sent on WhatsApp. Typing or
 * scanning the code here opens it and records the visit.
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
  const [{ data: trays }, sent] = await Promise.all([
    supabase.from("site_trays").select("id, code, piece_ids, channel, created_at, opened_at, share_id").eq("shop_id", current.shop_id).gte("created_at", since).order("created_at", { ascending: false }).limit(60).returns<TrayRow[]>(),
    loadSentTrays(supabase, current.shop_id),
  ]);
  const sentTo = new Map(sent.map((s) => [s.id, s.client]));
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

        <section aria-labelledby="in-h">
          <h2 id="in-h" className="eyebrow mb-2">{t("trays.choices")}</h2>
          {(trays ?? []).length === 0 ? (
            <p className="border-y border-line py-4 text-sm text-muted">{t("trays.noChoices")}</p>
          ) : (
            <ul className="divide-y divide-line border-y border-line">
              {(trays ?? []).map((x) => {
                const soldN = x.piece_ids.filter((id) => soldIds.has(id)).length;
                const replyTo = x.share_id ? sentTo.get(x.share_id) : undefined;
                return (
                  <li key={x.id}>
                    <Link href={`/trays/${x.id}`} className="flex min-h-16 items-center gap-4 py-3 hover:bg-surface">
                      <span className="flex size-10 shrink-0 items-center justify-center rounded-full border border-line">
                        {x.channel === "whatsapp" ? <IconChat size={18} /> : <IconTray size={18} />}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span dir="ltr" className="num block font-semibold tracking-[0.12em]">{x.code}</span>
                        <span className="block text-sm text-muted">
                          {x.share_id ? (replyTo ? t("trays.replyFrom", { name: replyTo }) : t("trays.replyToSent")) : t("trays.fromWebsite")} · {t(x.channel === "whatsapp" ? "trays.viaWhatsApp" : "trays.viaShop")} · {t("trays.pieces", { count: x.piece_ids.length })} · {formatDubaiDateTime(x.created_at, locale)}
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
          )}
        </section>

        <section aria-labelledby="sent-h" className="space-y-3">
          <div className="flex flex-wrap items-baseline justify-between gap-3">
            <h2 id="sent-h" className="eyebrow">{t("trays.sent")}</h2>
            <Link href="/clients" className="inline-flex min-h-11 items-center gap-1.5 text-sm font-semibold text-gold hover:underline">
              <IconUsers size={16} /> {t("nav.clients")}
            </Link>
          </div>
          {sent.length === 0 ? (
            <div className="border-y border-line py-4 text-sm text-muted">
              <p>{t("trays.noneSent")}</p>
              <Link href="/" className="mt-2 inline-flex min-h-11 items-center font-semibold text-gold hover:underline">{t("share.toCatalogue")}</Link>
            </div>
          ) : (
            <SharesList rows={sent} />
          )}
        </section>
      </main>
    </>
  );
}
