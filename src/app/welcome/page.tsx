import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getMemberships, requireUser } from "@/lib/session";
import { formatPhone } from "@/lib/phone";
import { getT } from "@/i18n/server";
import { AuthShell } from "@/components/AuthShell";
import { btn } from "@/components/ui";
import { checkInvites } from "./actions";
import { CreateShopForm } from "./CreateShopForm";
import { isDemoPhone } from "@/lib/demo";
import { DemoButton } from "@/components/DemoButton";
import { SignOutButton } from "@/components/SignOutButton";
import { formatDubaiDateTime } from "@/lib/format";
import { whatsappLink } from "@/lib/share-message";

type ShopRequest = { id: string; name: string; status: "pending" | "suspended"; role: string; created_at: string };

/** Takara's own WhatsApp number (TAKARA_WHATSAPP, e.g. +971501234567), for shops waiting or paused. */
function takaraNumber(): string | null {
  const n = process.env.TAKARA_WHATSAPP?.trim();
  return n && /^\+[1-9]\d{7,14}$/.test(n) ? n : null;
}

export const metadata: Metadata = { title: "Welcome" };
// Loading the demo shop draws and uploads its pictures (10-20 s).
export const maxDuration = 60;

export default async function WelcomePage() {
  const { supabase, user } = await requireUser();
  // Pick up any invite that arrived since sign-in.
  await supabase.rpc("accept_invites");
  if ((await getMemberships()).length > 0) redirect("/");
  const { t, locale } = await getT();
  const phone = user.phone ? formatPhone("+" + user.phone.replace(/^\+/, "")) : "";
  const isolated = "\u2066" + phone + "\u2069";
  // A shop that signed up and waits for Takara's approval, or one Takara has paused.
  const { data: reqs } = await supabase.rpc("my_shop_requests");
  const req = ((reqs ?? []) as ShopRequest[])[0];
  const takara = takaraNumber();
  const demo = isDemoPhone(user.phone) && (
    <section className="mt-4 space-y-2 rounded-[2px] border border-gold-line/60 bg-gold-soft/50 p-4">
      <h2 className="font-display text-xl">{t("demo.title")}</h2>
      <p className="text-[15px] text-muted">{t("demo.intro")}</p>
      <DemoButton />
    </section>
  );

  if (req) {
    const pending = req.status === "pending";
    const owner = req.role === "owner";
    return (
      <AuthShell>
        <h1 className="font-display text-[1.6rem] leading-tight">
          {t(pending ? "welcome.pendingTitle" : "welcome.suspendedTitle", { shop: req.name })}
        </h1>
        <div className="mt-3 space-y-3">
          <p>{pending ? (owner ? t("welcome.pendingBody", { phone: isolated }) : t("welcome.pendingStaff", { shop: req.name })) : t("welcome.suspendedBody")}</p>
          {pending && <p className="text-sm text-muted">{t("welcome.requested", { date: formatDubaiDateTime(req.created_at, locale) })}</p>}
          {takara && (
            <a
              href={whatsappLink(takara, t("welcome.takaraMessage", { shop: req.name, phone }))}
              target="_blank"
              rel="noopener"
              className="block font-semibold text-gold underline underline-offset-4"
            >
              {t("welcome.contactTakara")}
            </a>
          )}
          <form action={checkInvites}>
            <button className={btn}>{t("welcome.checkAgain")}</button>
          </form>
        </div>
        {demo}
        <div className="gold-rule my-6 opacity-50" />
        <SignOutButton userId={user.id} />
      </AuthShell>
    );
  }

  return (
    <AuthShell>
      <h1 className="font-display text-[1.6rem] leading-tight">{t("welcome.title")}</h1>
      {demo}
      <div className="mt-3 space-y-3">
        <p>{t("welcome.noShop", { phone: isolated })}</p>
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
