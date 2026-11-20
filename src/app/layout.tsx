import type { Metadata, Viewport } from "next";
import "./globals.css";
import { I18nProvider } from "@/i18n/client";
import { dirFor } from "@/i18n";
import { getLocale } from "@/i18n/server";
import { ServiceWorker } from "@/components/ServiceWorker";
import { SPLASH_SCRIPT, Splash } from "@/components/Splash";
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
