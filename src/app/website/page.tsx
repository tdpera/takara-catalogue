import type { Metadata } from "next";
import { redirect } from "next/navigation";
import QRCode from "qrcode";
import { requireShop } from "@/lib/session";
import { getT } from "@/i18n/server";
import { siteAddress, suggestSlug } from "@/lib/site-host";
import { appOrigin } from "@/lib/site-origin";
import { formatPhone } from "@/lib/phone";
import { AppHeader } from "@/components/AppHeader";
import { card } from "@/components/ui";
import type { PriceMode } from "@/lib/public-price";
import { LogoForm, WebsiteForm } from "./WebsiteForms";

export const metadata: Metadata = { title: "Website" };

type SiteRow = {
  slug: string; published: boolean; price_mode: PriceMode; whatsapp: string | null; address: string | null;
  maps_url: string | null; hours: string | null; instagram: string | null; about: Record<string, string>;
};

/** The shop's website: address, prices, contact details, introduction and logo. */
export default async function WebsitePage() {
  const { supabase, memberships, current, isAdmin } = await requireShop();
  if (!isAdmin) redirect("/shop");
  const { t } = await getT();
  const [{ data: site }, { data: shop }, { count: showcased }] = await Promise.all([
    supabase.from("shop_sites").select("slug, published, price_mode, whatsapp, address, maps_url, hours, instagram, about").eq("shop_id", current.shop_id).maybeSingle<SiteRow>(),
    supabase.from("shops").select("logo_path").eq("id", current.shop_id).single<{ logo_path: string | null }>(),
    supabase.from("pieces").select("id", { count: "exact", head: true }).eq("shop_id", current.shop_id).eq("on_website", true).neq("status", "sold"),
  ]);
  let logoUrl: string | null = null;
  if (shop?.logo_path) {
    const { data } = await supabase.storage.from("branding").createSignedUrl(shop.logo_path, 3600);
    logoUrl = data?.signedUrl ?? null;
  }
  const origin = await appOrigin();
  const address = site ? siteAddress(site.slug, origin) : null;
  // A QR for the shop window: walk-ins scan it and browse the collection.
  const qr = site?.published && address ? await QRCode.toString(address, { type: "svg", margin: 1, color: { dark: "#16130f", light: "#ffffff" } }) : null;

  return (
    <>
      <AppHeader memberships={memberships} current={current} />
      <main id="main" className="mx-auto max-w-3xl space-y-6 px-4 py-6 pb-28">
        <div>
          <h1 className="font-display text-[2rem] leading-tight">{t("website.title")}</h1>
          <p className="mt-2 text-muted">{t("website.intro")}</p>
        </div>

        {site?.published && address && (
          <section className={`${card} flex flex-wrap items-center gap-5`}>
            <div className="min-w-0 flex-1">
              <p className="eyebrow text-live!">{t("website.live")}</p>
              <a href={address} target="_blank" rel="noopener" className="mt-2 block font-display text-[1.3rem] leading-tight [overflow-wrap:anywhere] hover:underline" dir="ltr">
                {address.replace(/^https?:\/\//, "")}
              </a>
              <p className="mt-2 text-sm text-muted">{t("website.qrHint")}</p>
              <p className="mt-2 text-sm text-muted">{t("website.showcaseCount", { count: showcased ?? 0 })}</p>
            </div>
            {qr && (
              // Our own server drew this QR code (it holds the website's address).
              <div className="w-32 shrink-0 bg-white p-1.5 [&_svg]:h-auto [&_svg]:w-full" role="img" aria-label={t("website.qrLabel")} dangerouslySetInnerHTML={{ __html: qr }} />
            )}
          </section>
        )}

        <section className={card} aria-labelledby="logo-h">
          <h2 id="logo-h" className="eyebrow mb-3">{t("website.logo")}</h2>
          <LogoForm url={logoUrl} />
        </section>

        <WebsiteForm
          origin={origin}
          domain={process.env.NEXT_PUBLIC_SITE_DOMAIN ?? ""}
          initial={{
            slug: site?.slug ?? suggestSlug(current.shop.name),
            published: site?.published ?? false,
            price_mode: site?.price_mode ?? "live",
            whatsapp: site?.whatsapp ? formatPhone(site.whatsapp) : "",
            address: site?.address ?? "",
            maps_url: site?.maps_url ?? "",
            hours: site?.hours ?? "",
            instagram: site?.instagram ?? "",
            about: site?.about ?? {},
          }}
        />
      </main>
    </>
  );
}
