import type { Metadata } from "next";
import { requireShop } from "@/lib/session";
import { getShopPricing } from "@/lib/shop-data";
import { loadClients, loadShareItems, parseIds } from "@/lib/share-data";
import { getT } from "@/i18n/server";
import { AppHeader } from "@/components/AppHeader";
import { ShareComposer } from "./ShareComposer";

export const metadata: Metadata = { title: "Share" };

export default async function SharePage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { memberships, current } = await requireShop();
  const { t } = await getT();
  const ids = parseIds((await searchParams).ids);
  const [all, clients, { vatEnabled }] = await Promise.all([
    loadShareItems(current.shop_id, ids),
    loadClients(current.shop_id),
    getShopPricing(current.shop_id),
  ]);
  // Sold pieces can't be offered; say how many were left out.
  const items = all.filter((i) => i.status !== "sold");
  return (
    <>
      <AppHeader memberships={memberships} current={current} />
      <main id="main" className="mx-auto max-w-3xl px-4 pt-4 pb-16">
        <h1 className="mb-4 font-display text-[2rem] leading-tight">{t("share.title")}</h1>
        <ShareComposer
          shopId={current.shop_id}
          shopName={current.shop.name}
          vat={vatEnabled}
          items={items}
          clients={clients}
          soldLeftOut={all.length - items.length}
        />
      </main>
    </>
  );
}
