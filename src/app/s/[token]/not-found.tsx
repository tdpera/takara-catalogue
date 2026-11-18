import { LOCALES, makeT } from "@/i18n";

/** Unknown link. Shown in all four languages, since we don't know the visitor's. */
export default function ShareNotFound() {
  return (
    <main className="mx-auto max-w-xl space-y-3 px-4 py-16 text-center">
      {LOCALES.map((l) => (
        <p key={l} lang={l} dir={l === "ar" ? "rtl" : "ltr"} className={l === "en" ? "text-lg font-semibold" : "text-muted"}>
          {makeT(l)("pub.notFound")}
        </p>
      ))}
    </main>
  );
}
