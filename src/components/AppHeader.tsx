import Link from "next/link";
import { getT } from "@/i18n/server";
import { signOut } from "@/app/actions";
import type { Membership } from "@/lib/session";
import { LanguagePicker } from "./LanguagePicker";
import { ShopSwitcher } from "./ShopSwitcher";
import { btn } from "./ui";

export async function AppHeader({ memberships, current }: { memberships: Membership[]; current: Membership }) {
  const { t } = await getT();
  return (
    <header className="border-b border-line bg-surface">
      <div className="mx-auto flex max-w-5xl flex-wrap items-center gap-3 px-4 py-3">
        <Link href="/" className="me-auto min-w-0 truncate font-display text-xl">
          {current.shop.name}
        </Link>
        {memberships.length > 1 && (
          <ShopSwitcher shops={memberships.map((m) => ({ id: m.shop_id, name: m.shop.name }))} current={current.shop_id} />
        )}
        <nav aria-label={t("app.name")} className="flex items-center gap-2">
          <Link href="/" className={btn}>{t("nav.catalogue")}</Link>
          <Link href="/team" className={btn}>{t("nav.team")}</Link>
        </nav>
        <LanguagePicker />
        <form action={signOut}>
          <button className={btn}>{t("nav.signOut")}</button>
        </form>
      </div>
    </header>
  );
}
