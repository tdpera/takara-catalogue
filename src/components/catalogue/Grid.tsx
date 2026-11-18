"use client";
/**
 * Catalogue grid with bulk select. Selection survives opening a piece and coming back
 * (sessionStorage, per shop); Share opens the share composer with the selected pieces.
 */
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useT } from "@/i18n/client";
import type { MessageKey } from "@/i18n";
import type { Card } from "@/lib/catalogue";
import { formatGrams } from "@/lib/format";
import { SpinViewer } from "@/components/SpinViewer";
import { btn, btnPrimary } from "@/components/ui";
import { IconCheck, IconShare, IconTurn } from "@/components/icons";

const KEY = (shop: string) => `souq.selection.${shop}`;

function useSelection(shopId: string) {
  const [ids, setIds] = useState<string[]>([]);
  useEffect(() => {
    try {
      const raw = JSON.parse(sessionStorage.getItem(KEY(shopId)) || "[]");
      if (Array.isArray(raw)) setIds(raw.filter((x) => typeof x === "string").slice(0, 200));
    } catch {}
  }, [shopId]);
  const save = (next: string[]) => {
    setIds(next);
    try {
      sessionStorage.setItem(KEY(shopId), JSON.stringify(next));
    } catch {}
  };
  return {
    ids,
    has: (id: string) => ids.includes(id),
    toggle: (id: string) => save(ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]),
    clear: () => save([]),
  };
}

function PieceCard({ c, index, selected, onToggle }: { c: Card; index: number; selected: boolean; onToggle: () => void }) {
  const { t } = useT();
  const statusCls = c.status === "sold" ? "bg-ink text-paper" : "bg-warn-soft text-warn border border-warn";
  return (
    <li
      className={`group relative overflow-hidden rounded-2xl border bg-surface shadow-card transition duration-200 hover:shadow-lift motion-safe:hover:-translate-y-0.5 ${selected ? "border-gold ring-2 ring-gold" : "border-line"}`}
    >
      <Link href={`/p/${c.id}`} className="block focus-visible:outline-3 focus-visible:outline-offset-[-3px] focus-visible:outline-[var(--focus)]">
        <div className="relative aspect-square bg-paper">
          {c.photo ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={c.photo}
              alt=""
              width={480}
              height={480}
              loading={index < 4 ? "eager" : "lazy"}
              fetchPriority={index < 2 ? "high" : undefined}
              decoding="async"
              draggable={false}
              className="size-full object-cover"
            />
          ) : (
            <div className="flex size-full items-center justify-center p-2 text-center text-sm text-muted">{t("catalogue.noPhoto")}</div>
          )}
          {c.spin && <SpinViewer mode="card" src={c.spin.src} frames={c.spin.frames} cols={c.spin.cols} label="" className="object-cover" />}
          {c.spin && (
            <span className="pointer-events-none absolute end-2 top-2 inline-flex items-center gap-1 rounded-full bg-black/65 px-2 py-0.5 text-xs font-semibold text-white backdrop-blur-sm">
              <IconTurn size={14} /> {t("catalogue.spin360")}
            </span>
          )}
          {c.status !== "in_stock" && (
            <span className={`pointer-events-none absolute bottom-2 start-2 rounded-full px-2 py-0.5 text-xs font-semibold ${statusCls}`}>
              {t(`status.${c.status}`)}
            </span>
          )}
        </div>
        <div className="space-y-0.5 px-3 pt-2.5 pb-3">
          <h2 className="line-clamp-2 text-[15px] leading-snug font-semibold [overflow-wrap:anywhere]">{c.name}</h2>
          <p className="text-xs text-muted">
            <span dir="ltr" className="num">{c.karat}K · {formatGrams(c.gross_g)}</span>
            <span className="sr-only"> · {c.sku}</span>
          </p>
          {c.price ? (
            <p className="pt-1 font-display text-[1.35rem] leading-tight text-gold">
              <span dir="ltr">{c.price}</span>
            </p>
          ) : (
            <p className="pt-1 text-sm text-muted">{t("catalogue.noPrice")}</p>
          )}
        </div>
      </Link>
      {/* Outside the link, so it isn't a control inside a control. */}
      <button
        type="button"
        aria-pressed={selected}
        aria-label={t("catalogue.select", { name: `${c.name} (${c.sku})` })}
        onClick={onToggle}
        className={`absolute start-1 top-1 flex size-11 items-center justify-center rounded-full focus-visible:outline-3 focus-visible:outline-[var(--focus)]`}
      >
        <span
          aria-hidden="true"
          className={`flex size-7 items-center justify-center rounded-full border-2 shadow transition-colors ${selected ? "border-gold bg-gold text-white" : "border-white bg-black/25 text-transparent"}`}
        >
          <IconCheck size={16} className="stroke-[2.6]" />
        </span>
      </button>
    </li>
  );
}

export function Grid({ shopId, cards }: { shopId: string; cards: Card[] }) {
  const { t } = useT();
  const sel = useSelection(shopId);
  const router = useRouter();
  const [note, setNote] = useState<MessageKey | null>(null);
  return (
    <>
      <ul className="grid grid-cols-2 gap-3 sm:grid-cols-[repeat(auto-fill,minmax(13rem,1fr))] sm:gap-4">
        {cards.map((c, i) => (
          <PieceCard key={c.id} c={c} index={i} selected={sel.has(c.id)} onToggle={() => sel.toggle(c.id)} />
        ))}
      </ul>
      {sel.ids.length > 0 && (
        <div className="fixed inset-x-0 bottom-0 z-20 border-t border-line bg-surface/95 px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] shadow-[0_-8px_24px_rgb(0_0_0/0.08)] backdrop-blur">
          <div className="mx-auto flex max-w-5xl flex-wrap items-center gap-3">
            <p className="me-auto font-medium" aria-live="polite">{t("catalogue.selected", { count: sel.ids.length })}</p>
            <button type="button" className={btn} onClick={() => { sel.clear(); setNote(null); }}>
              {t("catalogue.clearSelection")}
            </button>
            <button type="button" className={btnPrimary} onClick={() => {
                if (sel.ids.length > 24) return setNote("share.tooMany");
                router.push(`/share?ids=${sel.ids.join(",")}`);
              }}>
              <IconShare size={18} /> {t("catalogue.share")}
            </button>
            {note && <p role="status" className="basis-full text-sm text-muted">{t(note)}</p>}
          </div>
        </div>
      )}
    </>
  );
}
