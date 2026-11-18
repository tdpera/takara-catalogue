import { getT } from "@/i18n/server";
import { LanguagePicker } from "./LanguagePicker";
import { Logo } from "./icons";

/** Sign-in and welcome screens: the brand up top, the form in a card. */
export async function AuthShell({ children }: { children: React.ReactNode }) {
  const { t } = await getT();
  return (
    <div className="relative min-h-dvh overflow-hidden">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 top-0 h-80 bg-[radial-gradient(ellipse_at_top,var(--gold-soft),transparent_70%)]"
      />
      <main id="main" className="relative mx-auto flex min-h-dvh max-w-md flex-col px-4 pt-4 pb-10">
        <div className="flex justify-end">
          <LanguagePicker />
        </div>
        <div className="mt-8 mb-8 flex flex-col items-center text-center">
          <Logo size={60} />
          <p className="mt-3 font-display text-[2.25rem] leading-tight">{t("app.name")}</p>
          <p className="mt-1 max-w-xs text-muted">{t("app.tagline")}</p>
          <div className="gold-rule mt-6 w-40 opacity-70" />
        </div>
        <div className="rounded-3xl border border-line bg-surface p-5 shadow-card">{children}</div>
      </main>
    </div>
  );
}
