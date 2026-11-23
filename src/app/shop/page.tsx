import type { Metadata } from "next";
import Link from "next/link";
import { headers } from "next/headers";
import { requireShop } from "@/lib/session";
import { getT } from "@/i18n/server";
import { siteAddress } from "@/lib/site-host";
import { AppHeader } from "@/components/AppHeader";
import { SignOutButton } from "@/components/SignOutButton";
import { IconChart, IconChevron, IconCoins, IconGlobe, IconUsers, Logo } from "@/components/icons";

export const metadata: Metadata = { title: "Shop" };

/** Everything about running the shop: rates, website, monthly report, team. */
export default async function ShopPage() {
  const { supabase, user, memberships, current } = await requireShop();
  const { t } = await getT();
  const isOwner = current.role === "owner";
  const isAdmin = current.role !== "salesperson";
  const [{ data: site }, { data: platformAdmin }] = await Promise.all([
    supabase.from("shop_sites").select("slug, published").eq("shop_id", current.shop_id).maybeSingle<{ slug: string; published: boolean }>(),
    supabase.rpc("is_platform_admin"),
  ]);
  const h = await headers();
  const origin = process.env.NEXT_PUBLIC_SITE_URL ?? `${h.get("x-forwarded-proto") ?? "http"}://${h.get("host")}`;

  const items = [
    { href: "/rates", Icon: IconCoins, title: t("nav.rates"), text: t("shop.ratesText"), show: true },
    {
      href: "/website",
      Icon: IconGlobe,
      title: t("shop.website"),
      text: site?.published ? t("shop.websiteLive", { address: siteAddress(site.slug, origin).replace(/^https?:\/\//, "") }) : t("shop.websiteOff"),
      show: isAdmin,
    },
    { href: "/report", Icon: IconChart, title: t("shop.report"), text: t("shop.reportText"), show: isOwner },
    { href: "/team", Icon: IconUsers, title: t("nav.team"), text: t("shop.teamText"), show: true },
    { href: "/admin", Icon: Logo, title: t("shop.dashboard"), text: t("shop.dashboardText"), show: platformAdmin === true },
  ].filter((i) => i.show);

  return (
    <>
      <AppHeader memberships={memberships} current={current} />
      <main id="main" className="mx-auto max-w-3xl space-y-6 px-4 py-6 pb-28">
        <h1 className="font-display text-[2rem] leading-tight">{current.shop.name}</h1>
        <ul className="divide-y divide-line border-y border-line">
          {items.map(({ href, Icon, title, text }) => (
            <li key={href}>
              <Link href={href} className="flex min-h-18 items-center gap-4 py-4 transition-colors hover:bg-surface">
                <span className="flex size-11 shrink-0 items-center justify-center rounded-full border border-line text-ink">
                  <Icon size={21} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block font-display text-[1.25rem] leading-tight">{title}</span>
                  <span className="mt-0.5 block text-sm text-muted [overflow-wrap:anywhere]">{text}</span>
                </span>
                <IconChevron size={18} className="text-muted" />
              </Link>
            </li>
          ))}
        </ul>
        <SignOutButton userId={user.id} />
      </main>
    </>
  );
}
