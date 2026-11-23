/**
 * The Takara dashboard: for Takara's own team (platform_admins), not shop staff. Every shop's
 * activity and monthly report in one place. Anyone else gets "not found".
 */
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/session";
import { getT } from "@/i18n/server";
import { Logo } from "@/components/icons";
import { LanguagePicker } from "@/components/LanguagePicker";

export const metadata: Metadata = { title: "Dashboard", robots: { index: false, follow: false } };

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const { supabase } = await requireUser();
  const { data: ok } = await supabase.rpc("is_platform_admin");
  if (ok !== true) notFound();
  const { t } = await getT();
  return (
    <>
      <header className="border-b border-line bg-paper/95 backdrop-blur-md md:sticky md:top-0 md:z-30">
        <div className="mx-auto flex min-h-14 max-w-6xl items-center gap-3 px-4">
          <Link href="/admin" className="flex items-center gap-2.5">
            <Logo size={24} />
            <span className="wordmark font-display text-[15px] font-medium">Takara</span>
            <span className="caps text-[11px] font-semibold text-muted">{t("admin.title")}</span>
          </Link>
          <div className="ms-auto flex items-center gap-3">
            <Link href="/" className="caps text-[11px] font-semibold text-muted hover:text-ink">{t("admin.backToApp")}</Link>
            <LanguagePicker compact />
          </div>
        </div>
      </header>
      {children}
    </>
  );
}
