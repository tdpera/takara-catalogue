/**
 * A shop's website: a customer-facing, read-only copy of its catalogue. No buying, paying or
 * reserving here; customers collect pieces in a tray and send it on WhatsApp or show it in the
 * shop. Served at <slug>.<domain> (middleware rewrites to here) or at /site/<slug>.
 */
import type { Metadata } from "next";
import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import { getSite, parseTray, siteContext, trayCookie } from "@/lib/site-data";
import { siteOrigin } from "@/lib/site-origin";
import { I18nProvider } from "@/i18n/client";
import { makeT } from "@/i18n";
import { TrayProvider } from "@/components/site/tray";
import { SiteFooter, SiteHeader } from "@/components/site/parts";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const site = await getSite(slug);
  if (!site) return { title: { absolute: "Not found" }, robots: { index: false } };
  const { locale } = await siteContext(slug);
  const origin = await siteOrigin(slug);
  return {
    metadataBase: new URL(origin + "/"),
    title: { default: site.name, template: `%s · ${site.name}` },
    description: site.about[locale] ?? site.about.en ?? makeT(locale)("site.defaultAbout", { shop: site.name }),
    applicationName: site.name,
    appleWebApp: { capable: false, title: site.name },
    icons: site.logo ? { icon: site.logo, apple: site.logo } : undefined,
    openGraph: { siteName: site.name, type: "website" },
  };
}

export default async function SiteLayout({ children, params }: { children: React.ReactNode; params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const site = await getSite(slug);
  if (!site) notFound();
  const { base, locale, onOwnHost, path } = await siteContext(slug);
  const t = makeT(locale);
  const initial = parseTray((await cookies()).get(trayCookie(slug))?.value);
  return (
    <I18nProvider locale={locale}>
      <TrayProvider cookie={trayCookie(slug)} path={onOwnHost ? "/" : `/site/${slug}`} initial={initial}>
        <div className="flex min-h-dvh flex-col bg-paper">
          <SiteHeader site={site} base={base} path={path} t={t} />
          <div className="flex-1">{children}</div>
          <SiteFooter site={site} base={base} locale={locale} t={t} />
        </div>
      </TrayProvider>
    </I18nProvider>
  );
}
