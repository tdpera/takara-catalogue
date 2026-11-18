import type { Metadata, Viewport } from "next";
import "./globals.css";
import { I18nProvider } from "@/i18n/client";
import { dirFor } from "@/i18n";
import { getLocale } from "@/i18n/server";
import { ServiceWorker } from "@/components/ServiceWorker";
import { makeT } from "@/i18n";
import { display, mono } from "./fonts";

export const metadata: Metadata = {
  title: { default: "Souq Catalogue", template: "%s · Souq Catalogue" },
  description: "Fast catalogues for gold and jewellery sellers.",
  applicationName: "Souq Catalogue",
  appleWebApp: { capable: true, title: "Souq", statusBarStyle: "default" },
  icons: { icon: "/icons/icon-192.png", apple: "/icons/apple-touch-icon.png" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f6f4ef" },
    { media: "(prefers-color-scheme: dark)", color: "#0f0e0c" },
  ],
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const locale = await getLocale();
  return (
    <html lang={locale} dir={dirFor(locale)} className={`${display.variable} ${mono.variable}`}>
      <body className="min-h-dvh antialiased">
        <a
          href="#main"
          className="sr-only z-50 rounded-xl bg-ink px-4 py-3 font-semibold text-paper focus:not-sr-only focus:fixed focus:start-3 focus:top-3"
        >
          {makeT(locale)("common.skip")}
        </a>
        <I18nProvider locale={locale}>{children}</I18nProvider>
        <ServiceWorker />
      </body>
    </html>
  );
}
