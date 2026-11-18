import { requireShop } from "@/lib/session";
import { getT } from "@/i18n/server";
import { AppHeader } from "@/components/AppHeader";
import { card } from "@/components/ui";

export default async function HomePage() {
  const { supabase, memberships, current } = await requireShop();
  const { t } = await getT();
  const { count } = await supabase.from("pieces").select("id", { count: "exact", head: true }).eq("shop_id", current.shop_id);
  return (
    <>
      <AppHeader memberships={memberships} current={current} />
      <main className="mx-auto max-w-5xl px-4 py-6">
        <section className={card}>
          <h1 className="text-xl font-semibold">{t("nav.catalogue")}</h1>
          <p className="mt-1 text-muted num">{t("home.pieces", { count: count ?? 0 })}</p>
          <p className="mt-3 text-muted">{t("home.comingSoon")}</p>
        </section>
      </main>
    </>
  );
}
