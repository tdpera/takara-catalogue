import { requireShop, type Membership } from "@/lib/session";
import { QueueStatus } from "./QueueStatus";
import { LanguagePicker } from "./LanguagePicker";
import { NavTabs } from "./NavTabs";
import { RatesBanner } from "./RatesBanner";
import { ShopSwitcher } from "./ShopSwitcher";

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
    <>
      <header className="border-b border-line bg-surface">
        <div className="mx-auto flex max-w-5xl items-center gap-3 px-4 pt-3">
          {memberships.length > 1 ? (
            <div className="me-auto min-w-0">
              <ShopSwitcher shops={memberships.map((m) => ({ id: m.shop_id, name: m.shop.name }))} current={current.shop_id} />
            </div>
          ) : (
            <p className="me-auto min-w-0 truncate font-display text-xl">{current.shop.name}</p>
          )}
          <QueueStatus userId={user.id} />
          <LanguagePicker />
        </div>
        <NavTabs />
      </header>
      <RatesBanner shopId={current.shop_id} isAdmin={current.role !== "salesperson"} onRatesPage={onRatesPage} />
    </>
  );
}
