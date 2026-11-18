import type { Metadata } from "next";
import { headers } from "next/headers";
import { requireShop, type Role } from "@/lib/session";
import { formatPhone } from "@/lib/phone";
import { getT } from "@/i18n/server";
import { AppHeader } from "@/components/AppHeader";
import { card } from "@/components/ui";
import { SignOutButton } from "@/components/SignOutButton";
import { InviteForm, MemberActions, NameForm, PendingInvite } from "./TeamForms";
import { Avatar } from "@/components/Avatar";

export const metadata: Metadata = { title: "Team" };

type MemberRow = { user_id: string; role: Role; created_at: string };
type ProfileRow = { user_id: string; display_name: string | null; phone: string | null };
type InviteRow = { id: string; phone: string; role: Role; created_at: string };

const ROLE_ORDER: Record<Role, number> = { owner: 0, manager: 1, salesperson: 2 };

export default async function TeamPage() {
  const { supabase, user, memberships, current } = await requireShop();
  const { t } = await getT();
  const myRole = current.role;
  const isOwner = myRole === "owner";
  const isAdmin = myRole !== "salesperson";

  const { data: members } = await supabase
    .from("shop_members")
    .select("user_id, role, created_at")
    .eq("shop_id", current.shop_id)
    .returns<MemberRow[]>();
  const ids = (members ?? []).map((m) => m.user_id);
  const { data: profiles } = await supabase.from("profiles").select("user_id, display_name, phone").in("user_id", ids).returns<ProfileRow[]>();
  const byId = new Map((profiles ?? []).map((p) => [p.user_id, p]));
  const sorted = [...(members ?? [])].sort((a, b) => ROLE_ORDER[a.role] - ROLE_ORDER[b.role] || a.created_at.localeCompare(b.created_at));

  const { data: invites } = isAdmin
    ? await supabase.from("shop_invites").select("id, phone, role, created_at").eq("shop_id", current.shop_id).is("accepted_at", null).order("created_at").returns<InviteRow[]>()
    : { data: [] as InviteRow[] };

  const h = await headers();
  const appUrl = process.env.NEXT_PUBLIC_SITE_URL ?? `${h.get("x-forwarded-proto") ?? "http"}://${h.get("host")}`;
  const me = byId.get(user.id);
  const invitableRoles: Role[] = isOwner ? ["salesperson", "manager", "owner"] : ["salesperson"];

  return (
    <>
      <AppHeader memberships={memberships} current={current} />
      <main id="main" className="mx-auto max-w-3xl space-y-6 px-4 py-6">
        <h1 className="font-display text-[2rem] leading-tight">{t("team.title")}</h1>

        <section className={card}>
          <NameForm initial={me?.display_name ?? ""} />
        </section>

        <section className={card} aria-labelledby="members-h">
          <h2 id="members-h" className="eyebrow">{t("team.members")}</h2>
          <ul className="mt-2 divide-y divide-line">
            {sorted.map((m) => {
              const p = byId.get(m.user_id);
              const name = p?.display_name || t("team.noName");
              const self = m.user_id === user.id;
              const canRemove = self || isOwner || (isAdmin && m.role === "salesperson");
              return (
                <li key={m.user_id} className="flex flex-wrap items-center gap-x-3 gap-y-2 py-3.5">
                  <Avatar name={p?.display_name} />
                  <div className="me-auto min-w-0">
                    <p className="font-medium">
                      {name} {self && <span className="text-muted">({t("team.you")})</span>}
                    </p>
                    <p className="text-sm text-muted">
                      {p?.phone && <span dir="ltr" className="num">{formatPhone(p.phone)}</span>}
                      {p?.phone && " · "}
                      {t(`roles.${m.role}`)}
                    </p>
                  </div>
                  <MemberActions
                    userId={m.user_id}
                    name={name}
                    shopName={current.shop.name}
                    role={m.role}
                    self={self}
                    canChangeRole={isOwner}
                    canRemove={canRemove}
                  />
                </li>
              );
            })}
          </ul>
        </section>

        {isAdmin && (
          <section className={card} aria-labelledby="invite-h">
            <h2 id="invite-h" className="font-display text-xl">{t("team.invite")}</h2>
            <InviteForm roles={invitableRoles} />
            {(invites ?? []).length > 0 && (
              <>
                <h3 className="mt-6 font-semibold">{t("team.pending")}</h3>
                <ul className="mt-2 divide-y divide-line">
                  {(invites ?? []).map((i) => (
                    <PendingInvite
                      key={i.id}
                      id={i.id}
                      phone={i.phone}
                      display={formatPhone(i.phone)}
                      role={i.role}
                      canCancel={isOwner || i.role === "salesperson"}
                      message={t("team.inviteMessage", { shop: current.shop.name, url: appUrl + "/login" })}
                    />
                  ))}
                </ul>
              </>
            )}
          </section>
        )}

        <SignOutButton userId={user.id} />
      </main>
    </>
  );
}
