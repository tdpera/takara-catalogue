"use client";
import { createContext, useContext, useMemo } from "react";
import { makeT, type Locale, type Translate } from ".";

const Ctx = createContext<{ locale: Locale; t: Translate } | null>(null);

export function I18nProvider({ locale, children }: { locale: Locale; children: React.ReactNode }) {
  const value = useMemo(() => ({ locale, t: makeT(locale) }), [locale]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useT() {
  const v = useContext(Ctx);
  if (!v) throw new Error("useT must be used inside I18nProvider");
  return v;
}
