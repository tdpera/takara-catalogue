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

/**
 * Maison header: the shop's name centred in spaced Bodoni capitals, the mark on one side and the
 * language switch on the other, then today's rates between two hairlines. Phones navigate with
 * the bottom tab bar; wider screens get a row of text links under the name.
 */
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
      <header className="relative z-30 bg-paper/95 backdrop-blur-md md:sticky md:top-0">
        <div className="mx-auto grid min-h-14 max-w-5xl grid-cols-[1fr_auto_1fr] items-center gap-2 px-4 pt-1.5">
          <div className="flex items-center">
            <Link href="/" className="-ms-1.5 flex size-11 items-center justify-center" aria-hidden="true" tabIndex={-1}>
              <Logo size={26} />
            </Link>
          </div>
          <div className="min-w-0 max-w-[62vw] text-center md:max-w-md">
            {memberships.length > 1 ? (
              <ShopSwitcher shops={memberships.map((m) => ({ id: m.shop_id, name: m.shop.name }))} current={current.shop_id} />
            ) : (
              <p className="wordmark truncate font-display text-[15px] font-medium">{current.shop.name}</p>
            )}
          </div>
          <div className="flex items-center justify-end gap-2">
            {/* Phones use the round Add button in the bottom tab bar instead. */}
            <span className="hidden md:block">
              <Link href="/add" className={btnGold + " min-h-10 px-4"}>
                <IconPlus size={15} className="stroke-[2.4]" /> {t("home.addPiece")}
              </Link>
            </span>
            <QueueStatus userId={user.id} />
            <LanguagePicker compact />
          </div>
        </div>
        <NavTabs />
        <RatesBanner shopId={current.shop_id} isAdmin={current.role !== "salesperson"} onRatesPage={onRatesPage} />
      </header>
      <BottomNav />
    </>
  );
}
