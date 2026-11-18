import type { Metadata } from "next";
import { requireShop } from "@/lib/session";
import { getShopPricing } from "@/lib/shop-data";
import { toDec } from "@/lib/pricing";
import { getT } from "@/i18n/server";
import { AppHeader } from "@/components/AppHeader";
import { CaptureForm } from "./CaptureForm";

export const metadata: Metadata = { title: "Add piece" };

export default async function AddPage() {
  const { user, memberships, current } = await requireShop();
  const { t } = await getT();
  const { rates, vatEnabled, defaultMakingPerG } = await getShopPricing(current.shop_id);
  const making = toDec(defaultMakingPerG);
  return (
    <>
      <AppHeader memberships={memberships} current={current} />
      <main id="main" className="mx-auto max-w-3xl px-4 py-4">
        <h1 className="mb-4 font-display text-[2rem] leading-tight">{t("add.title")}</h1>
        <CaptureForm
          shopId={current.shop_id}
          userId={user.id}
          rates={rates}
          vatEnabled={vatEnabled}
          defaultMaking={making && making.gt(0) ? making.toFixed(Math.max(2, Math.min(4, making.dp()))) : ""}
        />
      </main>
    </>
  );
}
