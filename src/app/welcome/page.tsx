import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getMemberships, requireUser } from "@/lib/session";
import { formatPhone } from "@/lib/phone";
import { getT } from "@/i18n/server";
import { AuthShell } from "@/components/AuthShell";
import { btn } from "@/components/ui";
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
    <AuthShell>
      <h1 className="font-display text-[1.6rem] leading-tight">{t("welcome.title")}</h1>
      <div className="mt-3 space-y-3">
        <p>{t("welcome.noShop", { phone: "\u2066" + phone + "\u2069" })}</p>
        <p className="text-muted">{t("welcome.askInvite")}</p>
        <form action={checkInvites}>
          <button className={btn}>{t("welcome.checkAgain")}</button>
        </form>
      </div>
      <div className="gold-rule my-6 opacity-50" />
      <section>
        <h2 className="font-display text-xl">{t("welcome.createTitle")}</h2>
        <CreateShopForm />
      </section>
    </AuthShell>
  );
}
