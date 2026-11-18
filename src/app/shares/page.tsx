import type { Metadata } from "next";
import Link from "next/link";
import { requireShop } from "@/lib/session";
import { getT } from "@/i18n/server";
import { AppHeader } from "@/components/AppHeader";
import { btn, btnLink } from "@/components/ui";
import { SharesList, type ShareRow } from "./SharesList";
import { EmptyState } from "@/components/EmptyState";

export const metadata: Metadata = { title: "Shares" };

async function siteUrl(): Promise<string> {
  if (process.env.NEXT_PUBLIC_SITE_URL) return process.env.NEXT_PUBLIC_SITE_URL.replace(/\/$/, "");
  const { headers } = await import("next/headers");
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  return `${h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https")}://${host}`;
}

/** The salesperson's own shares, newest first, with when each was opened. */
export default async function SharesPage() {
  const { supabase, memberships, current } = await requireShop();
  const { t } = await getT();
  const { data, error } = await supabase
    .from("shares")
    .select("id, public_token, piece_ids, expires_at, revoked_at, created_at, client:clients(name, phone), share_views(viewed_at)")
    .eq("shop_id", current.shop_id)
    .order("created_at", { ascending: false })
    .limit(100)
    .returns<
      {
        id: string; public_token: string; piece_ids: string[]; expires_at: string; revoked_at: string | null; created_at: string;
        client: { name: string; phone: string | null } | null; share_views: { viewed_at: string }[];
      }[]
    >();
  if (error) throw error;
  const base = await siteUrl();
  const rows: ShareRow[] = (data ?? []).map((s) => {
    const views = s.share_views.map((v) => v.viewed_at).sort();
    return {
      id: s.id,
      url: `${base}/s/${s.public_token}`,
      pieces: s.piece_ids.length,
      client: s.client?.name ?? null,
      createdAt: s.created_at,
      expiresAt: s.expires_at,
      state: s.revoked_at ? "revoked" : new Date(s.expires_at) <= new Date() ? "expired" : "active",
      views: views.length,
      lastView: views.at(-1) ?? null,
    };
  });

  return (
    <>
      <AppHeader memberships={memberships} current={current} />
      <main id="main" className="mx-auto max-w-3xl space-y-4 px-4 pt-4 pb-16">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="font-display text-[1.75rem] leading-tight">{t("shares.title")}</h1>
          <Link href="/clients" className={btn}>{t("shares.clients")}</Link>
        </div>
        {rows.length === 0 ? (
          <EmptyState title={t("shares.empty")} action={<Link href="/" className={btnLink}>{t("share.toCatalogue")}</Link>} />
        ) : (
          <SharesList rows={rows} />
        )}
      </main>
    </>
  );
}
