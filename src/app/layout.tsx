import type { Metadata, Viewport } from "next";
import { headers } from "next/headers";
import "./globals.css";
import { I18nProvider } from "@/i18n/client";
import { dirFor, isLocale } from "@/i18n";
import { getLocale } from "@/i18n/server";
import { ServiceWorker } from "@/components/ServiceWorker";
import { SPLASH_RUN, SPLASH_SCRIPT, Splash } from "@/components/Splash";
import { makeT } from "@/i18n";
import { display, sans } from "./fonts";

export const metadata: Metadata = {
  title: { default: "Takara", template: "%s · Takara" },
  description: "Fast catalogues for gold and jewellery sellers.",
  applicationName: "Takara",
  appleWebApp: { capable: true, title: "Takara", statusBarStyle: "default" },
  icons: { icon: "/icons/icon-192.png", apple: "/icons/apple-touch-icon.png" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#fbf9f5" },
    { media: "(prefers-color-scheme: dark)", color: "#100e0b" },
  ],
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  // Shop websites (set by middleware): the shop's page, in the visitor's language, without
  // Takara's launch film or the app's offline service worker.
  const h = await headers();
  const siteLang = h.get("x-site-slug") ? h.get("x-site-lang") : null;
  if (siteLang !== null) {
    const lang = isLocale(siteLang) ? siteLang : "en";
    return (
      <html lang={lang} dir={dirFor(lang)} className={`${display.variable} ${sans.variable}`}>
        <body className="min-h-dvh antialiased">
          <a
            href="#main"
            className="sr-only z-50 rounded-xl bg-ink px-4 py-3 font-semibold text-paper focus:not-sr-only focus:fixed focus:start-3 focus:top-3"
          >
            {makeT(lang)("common.skip")}
          </a>
          {children}
        </body>
      </html>
    );
  }
  const locale = await getLocale();
  const t = makeT(locale);
  return (
    // suppressHydrationWarning: the splash script may add data-splash to <html> before React loads.
    <html lang={locale} dir={dirFor(locale)} className={`${display.variable} ${sans.variable}`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: SPLASH_SCRIPT }} />
      </head>
      <body className="min-h-dvh antialiased">
        <Splash name={t("app.name")} tagline={t("app.tagline")} city={t("app.city")} />
        <script dangerouslySetInnerHTML={{ __html: SPLASH_RUN }} />
        <a
          href="#main"
          className="sr-only z-50 rounded-xl bg-ink px-4 py-3 font-semibold text-paper focus:not-sr-only focus:fixed focus:start-3 focus:top-3"
        >
          {t("common.skip")}
        </a>
        <I18nProvider locale={locale}>{children}</I18nProvider>
        <ServiceWorker />
      </body>
    </html>
  );
}
