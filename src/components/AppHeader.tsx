import Link from "next/link";
import { getT } from "@/i18n/server";
import { requireShop, type Membership } from "@/lib/session";
import { QueueStatus } from "./QueueStatus";
import { LanguagePicker } from "./LanguagePicker";
import { BottomNav, NavTabs } from "./NavTabs";
import { RatesBanner } from "./RatesBanner";
import { ShopSwitcher } from "./ShopSwitcher";
import { IconPlus, Logo } from "./icons";
import { btnGold } from "./ui";

/** Compact top bar, the rate ticker, and navigation (bottom tab bar on phones). */
export async function AppHeader({
  memberships,
  current,
  onRatesPage = false,
}: {
  memberships: Membership[];
  current: Membership;
  onRatesPage?: boolean;
}) {
  const { user } = await requireShop();
  const { t } = await getT();
  return (
    <>
      <header className="md:sticky md:top-0 md:z-30">
        <div className="border-b border-line/80 bg-surface/95 backdrop-blur-md">
          <div className="mx-auto flex min-h-14 max-w-5xl items-center gap-2.5 px-4 py-2">
            <Link href="/" className="shrink-0 rounded-full" aria-hidden="true" tabIndex={-1}>
              <Logo size={28} />
            </Link>
            {memberships.length > 1 ? (
              <div className="me-auto min-w-0">
                <ShopSwitcher shops={memberships.map((m) => ({ id: m.shop_id, name: m.shop.name }))} current={current.shop_id} />
              </div>
            ) : (
              <p className="me-auto min-w-0 truncate font-display text-[1.3rem] leading-tight">{current.shop.name}</p>
            )}
            <NavTabs />
            {/* Phones use the gold button in the bottom tab bar instead. */}
            <span className="hidden md:block">
              <Link href="/add" className={btnGold + " min-h-10 px-4 text-sm"}>
                <IconPlus size={16} className="stroke-[2.6]" /> {t("home.addPiece")}
              </Link>
            </span>
            <QueueStatus userId={user.id} />
            <LanguagePicker compact />
          </div>
        </div>
        <RatesBanner shopId={current.shop_id} isAdmin={current.role !== "salesperson"} onRatesPage={onRatesPage} />
      </header>
      <BottomNav />
    </>
  );
}
