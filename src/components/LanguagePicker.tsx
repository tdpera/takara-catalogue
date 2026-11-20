"use client";
import { useTransition } from "react";
import { LOCALES, LOCALE_NAMES, type Locale } from "@/i18n";
import { useT } from "@/i18n/client";
import { setLocale } from "@/app/actions";
import { IconGlobe } from "./icons";

const SHORT: Record<Locale, string> = { en: "EN", ar: "عربي", hi: "हिंदी", ml: "മല" };

/**
 * Language switch. "compact" shows a globe and a short code; the native select sits invisibly on
 * top, so the phone's own picker opens and screen readers announce a normal select.
 */
export function LanguagePicker({ compact = false }: { compact?: boolean }) {
  const { locale, t } = useT();
  const [pending, start] = useTransition();
  const select = (
    <select
      className={
        compact
          ? "absolute inset-0 cursor-pointer appearance-none opacity-0"
          : "min-h-11 rounded-[2px] border border-line bg-surface px-4 text-ink"
      }
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
  );
  if (!compact) return select;
  return (
    <span className="relative inline-flex min-h-10 items-center gap-1.5 rounded-[2px] px-2 text-[12px] font-semibold text-ink transition-colors focus-within:outline-3 focus-within:outline-offset-2 focus-within:outline-[var(--focus)] hover:bg-raised">
      <IconGlobe size={16} className="text-muted" />
      <span aria-hidden="true" lang={locale}>{SHORT[locale]}</span>
      {select}
    </span>
  );
}
