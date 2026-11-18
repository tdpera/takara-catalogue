import type { Metadata } from "next";
import { requireShop } from "@/lib/session";
import { loadClients } from "@/lib/share-data";
import { formatPhone } from "@/lib/phone";
import { getT } from "@/i18n/server";
import { AppHeader } from "@/components/AppHeader";
import { ClientsManager } from "./ClientsManager";

export const metadata: Metadata = { title: "Clients" };

export default async function ClientsPage() {
  const { memberships, current } = await requireShop();
  const { t } = await getT();
  const clients = await loadClients(current.shop_id);
  return (
    <>
      <AppHeader memberships={memberships} current={current} />
      <main className="mx-auto max-w-3xl space-y-4 px-4 pt-4 pb-16">
        <h1 className="text-2xl font-semibold">{t("clients.title")}</h1>
        <p className="text-sm text-muted">{t("clients.private")}</p>
        <ClientsManager shopId={current.shop_id} initial={clients.map((c) => ({ ...c, phoneDisplay: c.phone ? formatPhone(c.phone) : null }))} />
      </main>
    </>
  );
}
