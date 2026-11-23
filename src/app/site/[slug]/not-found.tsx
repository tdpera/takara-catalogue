import { headers } from "next/headers";
import { isLocale, makeT } from "@/i18n";

/** A piece or tray that isn't on the website (any more), inside the shop's own header and footer. */
export default async function SiteNotFound() {
  const h = await headers();
  const slug = h.get("x-site-slug") ?? "";
  const lang = h.get("x-site-lang");
  const t = makeT(isLocale(lang) ? lang : "en");
  const base = h.get("x-site-host") === slug ? "" : `/site/${slug}`;
  return (
    <main id="main" className="mx-auto max-w-xl space-y-4 px-4 py-20 text-center">
      <h1 className="font-display text-[2rem] leading-tight">{t("site.notFound")}</h1>
      <a href={`${base}/#showcase`} className="caps inline-flex min-h-11 items-center rounded-[2px] bg-primary px-5 text-[12.5px] font-semibold text-on-primary">
        {t("site.browse")}
      </a>
    </main>
  );
}
