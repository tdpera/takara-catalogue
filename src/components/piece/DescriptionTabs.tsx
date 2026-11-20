"use client";
import { useRef, useState } from "react";
import { useT } from "@/i18n/client";
import { LOCALE_NAMES } from "@/i18n";
import { DESC_LANGS, type DescLang, type Descriptions } from "@/lib/ai/shared";

/** Description in each language, as tabs. Opens on the interface language when it has text. */
export function DescriptionTabs({ descriptions }: { descriptions: Descriptions }) {
  const { t, locale } = useT();
  const first = (descriptions[locale as DescLang] ? locale : DESC_LANGS.find((l) => descriptions[l]) ?? locale) as DescLang;
  const [lang, setLang] = useState<DescLang>(first);
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const text = descriptions[lang];
  return (
    <div>
      <div role="tablist" aria-label={t("piece.descLangs")} className="no-scrollbar mb-4 flex gap-6 overflow-x-auto border-b border-line">
        {DESC_LANGS.map((l, i) => (
          <button
            key={l}
            ref={(b) => {
              refs.current[i] = b;
            }}
            role="tab"
            id={`desc-tab-${l}`}
            aria-selected={lang === l}
            aria-controls="desc-panel"
            tabIndex={lang === l ? 0 : -1}
            lang={l}
            onClick={() => setLang(l)}
            onKeyDown={(e) => {
              const d = e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : e.key === "Home" ? -i : e.key === "End" ? DESC_LANGS.length - 1 - i : 0;
              if (!d) return;
              const n = (i + d + DESC_LANGS.length) % DESC_LANGS.length;
              setLang(DESC_LANGS[n]);
              refs.current[n]?.focus();
              e.preventDefault();
            }}
            className={`tab-line flush min-h-11 text-[14px] whitespace-nowrap transition-colors duration-200 ${lang === l ? "font-semibold text-ink" : "text-muted hover:text-ink"}`}
          >
            {LOCALE_NAMES[l]}
          </button>
        ))}
      </div>
      <div role="tabpanel" id="desc-panel" aria-labelledby={`desc-tab-${lang}`} tabIndex={0}>
        {text ? (
          <p lang={lang} dir={lang === "ar" ? "rtl" : "ltr"} className="pop-in max-w-prose text-start text-[1.05rem] leading-relaxed whitespace-pre-wrap">
            {text}
          </p>
        ) : (
          <p className="text-muted">{t("piece.noDescription")}</p>
        )}
      </div>
    </div>
  );
}
