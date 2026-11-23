import type { Translate } from "@/i18n";
import { Logo } from "./icons";

const REPO = "https://github.com/tdpera/takara-catalogue/blob/main/";

/** Shown instead of the app while the database is missing an update (see lib/schema.ts). */
export function DatabaseUpdate({ file, t }: { file: string; t: Translate }) {
  return (
    <main id="main" className="mx-auto max-w-xl space-y-5 px-5 py-16">
      <Logo size={36} />
      <h1 className="font-display text-[2rem] leading-tight">{t("dbUpdate.title")}</h1>
      <p className="text-[16px] text-muted">{t("dbUpdate.visitors")}</p>
      <section className="space-y-3 rounded-[2px] border border-line bg-surface p-5">
        <h2 className="eyebrow">{t("dbUpdate.forOwner")}</h2>
        <ol className="list-decimal space-y-2 ps-5 text-[15px]">
          <li>
            {t("dbUpdate.step1")}{" "}
            <a href={REPO + file} className="font-semibold text-gold underline underline-offset-4" target="_blank" rel="noopener" dir="ltr">{file.split("/").pop()}</a>
          </li>
          <li>{t("dbUpdate.step2")}</li>
          <li>{t("dbUpdate.step3")}</li>
        </ol>
      </section>
    </main>
  );
}
