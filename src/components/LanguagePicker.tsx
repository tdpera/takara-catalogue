"use client";
import { useTransition } from "react";
import { LOCALES, LOCALE_NAMES, type Locale } from "@/i18n";
import { useT } from "@/i18n/client";
import { setLocale } from "@/app/actions";

export function LanguagePicker() {
  const { locale, t } = useT();
  const [pending, start] = useTransition();
  return (
    <label className="inline-flex items-center gap-2 text-sm">
      <span className="sr-only">{t("nav.language")}</span>
      <select
        className="min-h-11 rounded-full border border-line bg-paper px-3 text-ink"
        value={locale}
        disabled={pending}
        aria-label={t("nav.language")}
        onChange={(e) => start(() => setLocale(e.target.value as Locale))}
      >
        {LOCALES.map((l) => (
          <option key={l} value={l} lang={l}>
            {LOCALE_NAMES[l]}
          </option>
        ))}
      </select>
    </label>
  );
}
