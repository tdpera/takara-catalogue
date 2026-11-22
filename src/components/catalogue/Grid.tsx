"use client";
/**
 * Catalogue grid with bulk select. Selection survives opening a piece and coming back
 * (sessionStorage, per shop); Share opens the share composer with the selected pieces.
 */
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { useT } from "@/i18n/client";
import type { MessageKey } from "@/i18n";
import type { Card } from "@/lib/catalogue";
import { formatGrams } from "@/lib/format";
import { SpinViewer } from "@/components/SpinViewer";
import { btn, btnPrimary } from "@/components/ui";
import { IconCheck, IconShare, IconTurn } from "@/components/icons";
import { TiltTile } from "@/components/TiltTile";
import { navigateWithMorph, vtReady } from "@/lib/view-transition";

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
  const router = useRouter();
  const tile = useRef<HTMLDivElement>(null);
  // Coming back from this piece's page: the big photo flies back into this tile.
  useEffect(() => vtReady(tile.current, c.id), [c.id]);
  const statusCls = c.status === "sold" ? "bg-ink text-paper" : "bg-paper/95 text-warn";
  // The first screenful arrives one after another; the rest appear as they scroll into view.
  const motion = index < 6 ? "stagger" : "reveal-scroll";
  return (
    <li style={{ "--i": index } as React.CSSProperties} className={`group relative ${motion}`}>
      <Link
        href={`/p/${c.id}`}
        onClick={(e) => navigateWithMorph(e, router, `/p/${c.id}`, tile.current)}
        className="block focus-visible:outline-3 focus-visible:outline-offset-4 focus-visible:outline-[var(--focus)]"
      >
        <TiltTile ref={tile} className={`relative aspect-square overflow-hidden bg-tile ${selected ? "outline outline-1 outline-offset-4 outline-ink" : "outline-transparent"}`}>
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
              className="tile-img photo-zoom img-in size-full object-cover"
            />
          ) : (
            <div className="flex size-full items-center justify-center p-2 text-center text-sm text-muted">{t("catalogue.noPhoto")}</div>
          )}
          {c.spin && <SpinViewer mode="card" src={c.spin.src} frames={c.spin.frames} cols={c.spin.cols} label="" className="object-cover" />}
          {c.spin && (
            <span className="caps pointer-events-none absolute end-2 top-2 inline-flex items-center gap-1 rounded-[2px] bg-paper/90 px-1.5 py-1 text-[10px] font-semibold text-ink backdrop-blur-sm">
              <IconTurn size={13} /> {t("catalogue.spin360")}
            </span>
          )}
          {c.status !== "in_stock" && (
            <span className={`caps pointer-events-none absolute bottom-2 start-2 rounded-[2px] px-2 py-1 text-[10px] font-semibold ${statusCls}`}>
              {t(`status.${c.status}`)}
            </span>
          )}
        </TiltTile>
        <div className="pt-3">
          <h2 className="line-clamp-2 font-display text-[16.5px] leading-snug [overflow-wrap:anywhere]">{c.name}</h2>
          <p className="mt-1 text-[12px] font-medium tracking-[0.05em] text-muted">
            <span dir="ltr" className="num font-medium">{c.karat}K · {formatGrams(c.gross_g)}</span>
            <span className="sr-only"> · {c.sku}</span>
          </p>
          {c.price ? (
            <p className="mt-1.5 text-[14.5px] font-semibold">
              <span dir="ltr" data-price className="num">{c.price}</span>
            </p>
          ) : (
            <p className="mt-1.5 text-sm text-muted">{t("catalogue.noPrice")}</p>
          )}
        </div>
      </Link>
      {/* Outside the link, so it isn't a control inside a control. */}
      <button
        type="button"
        aria-pressed={selected}
        aria-label={t("catalogue.select", { name: `${c.name} (${c.sku})` })}
        onClick={onToggle}
        className="absolute start-0.5 top-0.5 flex size-11 items-center justify-center rounded-full focus-visible:outline-3 focus-visible:outline-[var(--focus)]"
      >
        <span
          aria-hidden="true"
          className={`flex size-6.5 items-center justify-center rounded-full border transition-all duration-200 ${selected ? "scale-110 border-ink bg-ink text-paper" : "border-white/90 bg-black/15 text-transparent"}`}
        >
          <IconCheck size={14} className="stroke-[2.6]" />
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
      <ul className="grid grid-cols-2 gap-x-3.5 gap-y-7 sm:grid-cols-[repeat(auto-fill,minmax(13rem,1fr))] sm:gap-x-6 sm:gap-y-9">
        {cards.map((c, i) => (
          <PieceCard key={c.id} c={c} index={i} selected={sel.has(c.id)} onToggle={() => sel.toggle(c.id)} />
        ))}
      </ul>
      {sel.ids.length > 0 && (
        <div className="slide-up fixed inset-x-3 bottom-[calc(5rem+env(safe-area-inset-bottom))] z-20 rounded-[2px] border border-line bg-paper/95 px-4 py-3 shadow-lift backdrop-blur-md md:inset-x-0 md:bottom-0 md:rounded-none md:border-x-0 md:border-b-0 md:pb-[max(0.75rem,env(safe-area-inset-bottom))]">
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
