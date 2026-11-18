import { LOCALES, makeT } from "@/i18n";
import { Logo } from "@/components/icons";

/** Unknown link. Shown in all four languages, since we don't know the visitor's. */
export default function ShareNotFound() {
  return (
    <main id="main" className="mx-auto flex min-h-[70dvh] max-w-xl flex-col items-center justify-center gap-3 px-4 py-16 text-center">
      <Logo size={44} className="mb-2 opacity-80" />
      {LOCALES.map((l) =>
        l === "en" ? (
          <h1 key={l} lang={l} className="font-display text-2xl leading-snug">{makeT(l)("pub.notFound")}</h1>
        ) : (
          <p key={l} lang={l} dir={l === "ar" ? "rtl" : "ltr"} className="text-muted">{makeT(l)("pub.notFound")}</p>
        ),
      )}
    </main>
  );
}
