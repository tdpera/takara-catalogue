import { getT } from "@/i18n/server";
import { LanguagePicker } from "./LanguagePicker";
import { Logo } from "./icons";

/** Sign-in and welcome screens: the mark draws itself above the name, the form below a hairline. */
export async function AuthShell({ children }: { children: React.ReactNode }) {
  const { t } = await getT();
  return (
    <main id="main" className="relative mx-auto flex min-h-dvh max-w-md flex-col px-4 pt-4 pb-10">
      <div className="flex justify-end">
        <LanguagePicker compact />
      </div>
      <div className="mt-10 mb-9 flex flex-col items-center text-center">
        <Logo size={64} draw />
        <p className="wordmark stagger mt-6 font-display text-[2rem] leading-none font-medium" style={{ "--i": 2 } as React.CSSProperties}>
          {t("app.name")}
        </p>
        <div aria-hidden="true" className="gold-rule rule-in mt-6 w-11" />
        <p className="caps stagger mt-5 max-w-[16rem] text-[11px] leading-relaxed font-semibold text-muted" style={{ "--i": 4 } as React.CSSProperties}>
          {t("app.tagline")}
        </p>
      </div>
      <div className="stagger border-t border-line pt-6" style={{ "--i": 5 } as React.CSSProperties}>
        {children}
      </div>
    </main>
  );
}
