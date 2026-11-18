import type { Metadata, Viewport } from "next";
import "./globals.css";
import { I18nProvider } from "@/i18n/client";
import { dirFor } from "@/i18n";
import { getLocale } from "@/i18n/server";

export const metadata: Metadata = {
  title: { default: "Souq Catalogue", template: "%s · Souq Catalogue" },
  description: "Fast catalogues for gold and jewellery sellers.",
  applicationName: "Souq Catalogue",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f2f3f5" },
    { media: "(prefers-color-scheme: dark)", color: "#0f1115" },
  ],
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const locale = await getLocale();
  return (
    <html lang={locale} dir={dirFor(locale)}>
      <body className="min-h-dvh antialiased">
        <I18nProvider locale={locale}>{children}</I18nProvider>
      </body>
    </html>
  );
}
