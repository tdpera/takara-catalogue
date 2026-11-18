"use client";
import { useRef, useState } from "react";
import { useT } from "@/i18n/client";
import type { Spin } from "@/lib/catalogue";
import { SpinViewer } from "@/components/SpinViewer";
import { IconTurn } from "@/components/icons";

/** Big spin viewer and the photo, as tabs (the spin first when there is one). */
export function PieceMedia({ name, photo, spin }: { name: string; photo: { full: string; thumb: string | null } | null; spin: Spin | null }) {
  const { t } = useT();
  const [tab, setTab] = useState<"spin" | "photo">(spin ? "spin" : "photo");
  const tabs = useRef<(HTMLButtonElement | null)[]>([]);
  const list = (spin ? ["spin", "photo"] : ["photo"]) as ("spin" | "photo")[];

  const frame = (
    <div className="relative -mx-4 aspect-square overflow-hidden bg-raised md:mx-auto md:w-full md:max-w-[34rem] md:rounded-3xl md:border md:border-line/70 md:shadow-card">
      {tab === "spin" && spin ? (
        <>
          {photo?.thumb && (
            // Shown until the sprite has loaded.
            // eslint-disable-next-line @next/next/no-img-element
            <img src={photo.thumb} alt="" className="absolute inset-0 size-full object-cover" />
          )}
          <SpinViewer
            mode="full"
            src={spin.src}
            frames={spin.frames}
            cols={spin.cols}
            label={t("piece.spinLabel", { name })}
            frameText={(n, total) => t("piece.frame", { n, total })}
          />
          <span aria-hidden="true" className="pointer-events-none absolute bottom-3 left-1/2 inline-flex -translate-x-1/2 items-center gap-1.5 rounded-full bg-black/65 px-3 py-1 text-xs text-white backdrop-blur-sm">
            <IconTurn size={14} /> {t("piece.dragHint")}
          </span>
        </>
      ) : photo ? (
        // Full photo, shown as taken (only resized on the phone).
        // eslint-disable-next-line @next/next/no-img-element
        <img src={photo.full} alt={t("piece.photoAlt", { name })} width={1600} height={1600} fetchPriority="high" className="size-full object-contain" />
      ) : (
        <p className="flex size-full items-center justify-center p-4 text-center text-muted">{t("piece.noMedia")}</p>
      )}
    </div>
  );

  if (list.length === 1) return frame;
  return (
    <div className="space-y-3">
      <div role="tablist" aria-label={t("piece.mediaTabs")} className="mx-auto flex w-fit gap-1 rounded-full border border-line bg-raised p-1">
        {list.map((k, i) => (
          <button
            key={k}
            ref={(b) => {
              tabs.current[i] = b;
            }}
            role="tab"
            id={`media-tab-${k}`}
            aria-selected={tab === k}
            aria-controls="media-panel"
            tabIndex={tab === k ? 0 : -1}
            onClick={() => setTab(k)}
            onKeyDown={(e) => {
              if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
              const next = (i + 1) % list.length;
              setTab(list[next]);
              tabs.current[next]?.focus();
              e.preventDefault();
            }}
            className={`min-h-9 rounded-full px-5 text-sm font-medium transition-colors ${tab === k ? "bg-surface text-ink shadow-sm" : "text-muted hover:text-ink"}`}
          >
            {k === "spin" ? t("piece.spinTab") : t("piece.photoTab")}
          </button>
        ))}
      </div>
      <div role="tabpanel" id="media-panel" aria-labelledby={`media-tab-${tab}`}>
        {frame}
      </div>
    </div>
  );
}
