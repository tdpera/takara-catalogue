import Link from "next/link";
import { requireShop, type Membership } from "@/lib/session";
import { QueueStatus } from "./QueueStatus";
import { LanguagePicker } from "./LanguagePicker";
import { NavTabs } from "./NavTabs";
import { RatesBanner } from "./RatesBanner";
import { ShopSwitcher } from "./ShopSwitcher";
import { Logo } from "./icons";

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
  return (
    <header className="border-b border-line bg-surface md:sticky md:top-0 md:z-30 md:bg-surface/90 md:backdrop-blur-md">
      <div className="mx-auto max-w-5xl px-4">
        <div className="flex items-center gap-2.5 pt-3 pb-2">
          <Link href="/" className="shrink-0 rounded-full" aria-hidden="true" tabIndex={-1}>
            <Logo size={30} />
          </Link>
          {memberships.length > 1 ? (
            <div className="me-auto min-w-0">
              <ShopSwitcher shops={memberships.map((m) => ({ id: m.shop_id, name: m.shop.name }))} current={current.shop_id} />
            </div>
          ) : (
            <p className="me-auto line-clamp-2 min-w-0 font-display text-[1.35rem] leading-[1.15] [overflow-wrap:anywhere]">{current.shop.name}</p>
          )}
          <QueueStatus userId={user.id} />
          <LanguagePicker />
        </div>
        <RatesBanner shopId={current.shop_id} isAdmin={current.role !== "salesperson"} onRatesPage={onRatesPage} />
      </div>
      <div className="gold-rule opacity-40" />
      <NavTabs />
    </header>
  );
}
