"use client";
/**
 * Search box and filter chips. Everything is a URL, so it works without JavaScript (the search
 * is a plain GET form) and the back button undoes a filter. With JavaScript, typing searches
 * after a short pause and keeps the current results on screen until the new ones arrive.
 */
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { useT } from "@/i18n/client";
import { KARATS } from "@/lib/pricing";
import { CATEGORIES } from "@/lib/ai/shared";
import { cleanQuery, filterHref, STATUSES, type Filters as F } from "@/lib/catalogue-filters";
import { input } from "@/components/ui";
import { IconSearch } from "@/components/icons";

function Chip({ href, on, children }: { href: string; on: boolean; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      scroll={false}
      prefetch={false}
      aria-current={on ? "true" : undefined}
      className={`inline-flex min-h-10 shrink-0 items-center rounded-full border px-3.5 text-sm whitespace-nowrap transition-colors ${on ? "border-ink bg-ink font-semibold text-paper" : "border-line bg-surface hover:border-muted/60"}`}
    >
      {children}
    </Link>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div role="group" aria-label={label} className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4 pb-1">
      {children}
    </div>
  );
}

export function Filters({ f }: { f: F }) {
  const { t } = useT();
  const router = useRouter();
  const [q, setQ] = useState(f.q);
  const [pending, start] = useTransition();
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);

  // The search text we last put in the URL. When the URL catches up with it (results for an
  // earlier keystroke arriving on a slow connection), keep what's in the box: the user may have
  // typed more since. Only a change from elsewhere (back button, a chip, Clear) replaces it.
  const pushed = useRef<string | null>(null);
  useEffect(() => {
    if (pushed.current !== null && f.q === pushed.current) return;
    pushed.current = null;
    setQ(f.q);
  }, [f.q]);

  function search(value: string, now = false) {
    setQ(value);
    clearTimeout(timer.current);
    const go = () => {
      const clean = cleanQuery(value);
      if (clean === f.q) return;
      pushed.current = clean;
      start(() => router.replace(filterHref(f, { q: clean }), { scroll: false }));
    };
    if (now) go();
    else timer.current = setTimeout(go, 350);
  }

  return (
    <div className="space-y-2">
      <form
        role="search"
        action="/"
        method="get"
        onSubmit={(e) => {
          e.preventDefault();
          search(q, true);
        }}
        className="relative"
      >
        <label htmlFor="q" className="sr-only">{t("catalogue.searchLabel")}</label>
        <input
          id="q"
          name="q"
          type="search"
          enterKeyHint="search"
          autoComplete="off"
          maxLength={60}
          placeholder={t("catalogue.search")}
          className={input + " ps-10 pe-24"}
          value={q}
          onChange={(e) => search(e.target.value)}
        />
        <IconSearch size={18} className="pointer-events-none absolute start-3 top-1/2 -translate-y-1/2 text-muted" />
        {f.category && <input type="hidden" name="category" value={f.category} />}
        {f.karat && <input type="hidden" name="karat" value={f.karat} />}
        {f.status && <input type="hidden" name="status" value={f.status} />}
        <span role="status" className="pointer-events-none absolute end-3 top-1/2 -translate-y-1/2 text-sm text-muted">
          {pending ? t("catalogue.searching") : ""}
        </span>
      </form>
      <Row label={t("catalogue.filterCategory")}>
        <Chip href={filterHref(f, { category: null })} on={!f.category}>{t("catalogue.allCategories")}</Chip>
        {CATEGORIES.map((c) => (
          <Chip key={c} href={filterHref(f, { category: f.category === c ? null : c })} on={f.category === c}>
            {t(`categories.${c}`)}
          </Chip>
        ))}
      </Row>
      <div className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4 pb-1">
        <div role="group" aria-label={t("catalogue.filterKarat")} className="flex shrink-0 gap-2">
        <Chip href={filterHref(f, { karat: null })} on={!f.karat}>{t("catalogue.allKarats")}</Chip>
        {KARATS.map((k) => (
          <Chip key={k} href={filterHref(f, { karat: f.karat === k ? null : k })} on={f.karat === k}>
            <span dir="ltr" className="num">{k}K</span>
          </Chip>
        ))}
        </div>
        <span aria-hidden="true" className="mx-1 w-px shrink-0 self-stretch bg-line" />
        <div role="group" aria-label={t("catalogue.filterStatus")} className="flex shrink-0 gap-2">
        <Chip href={filterHref(f, { status: null })} on={!f.status}>{t("catalogue.allStatuses")}</Chip>
        {STATUSES.map((s) => (
          <Chip key={s} href={filterHref(f, { status: f.status === s ? null : s })} on={f.status === s}>
            {t(`status.${s}`)}
          </Chip>
        ))}
        </div>
      </div>
    </div>
  );
}
