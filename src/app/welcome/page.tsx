import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getMemberships, requireUser } from "@/lib/session";
import { formatPhone } from "@/lib/phone";
import { getT } from "@/i18n/server";
import { LanguagePicker } from "@/components/LanguagePicker";
import { btn, card } from "@/components/ui";
import { checkInvites } from "./actions";
import { CreateShopForm } from "./CreateShopForm";

export const metadata: Metadata = { title: "Welcome" };

export default async function WelcomePage() {
  const { supabase, user } = await requireUser();
  // Pick up any invite that arrived since sign-in.
  await supabase.rpc("accept_invites");
  if ((await getMemberships()).length > 0) redirect("/");
  const { t } = await getT();
  const phone = user.phone ? formatPhone("+" + user.phone.replace(/^\+/, "")) : "";
  return (
    <main className="mx-auto max-w-md space-y-6 px-4 py-6">
      <div className="flex items-center justify-between gap-3">
        <h1 className="font-display text-2xl">{t("welcome.title")}</h1>
        <LanguagePicker />
      </div>
      <section className={card + " space-y-3"}>
        <p>{t("welcome.noShop", { phone: "⁦" + phone + "⁩" })}</p>
        <p className="text-muted">{t("welcome.askInvite")}</p>
        <form action={checkInvites}>
          <button className={btn}>{t("welcome.checkAgain")}</button>
        </form>
      </section>
      <section className={card}>
        <h2 className="text-lg font-semibold">{t("welcome.createTitle")}</h2>
        <CreateShopForm />
      </section>
    </main>
  );
}
