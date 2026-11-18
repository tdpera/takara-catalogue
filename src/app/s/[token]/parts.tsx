"use client";
import { useEffect } from "react";
import { useT } from "@/i18n/client";
import { SpinViewer } from "@/components/SpinViewer";
import { IconTurn } from "@/components/icons";

/** Records the visit once the page is actually shown in a browser (link previews don't run this). */
export function ViewBeacon({ token }: { token: string }) {
  useEffect(() => {
    let sent = false;
    const send = () => {
      if (sent || document.visibilityState !== "visible") return;
      sent = true;
      void fetch("/api/public/share-view", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ token }),
        keepalive: true,
      }).catch(() => {});
    };
    send();
    document.addEventListener("visibilitychange", send);
    return () => document.removeEventListener("visibilitychange", send);
  }, [token]);
  return null;
}

export function PublicSpin({ name, src, frames, cols, poster }: { name: string; src: string; frames: number; cols: number; poster: string | null }) {
  const { t } = useT();
  return (
    <div className="relative aspect-square overflow-hidden bg-paper">
      {poster && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={poster} alt="" loading="lazy" className="absolute inset-0 size-full object-cover" />
      )}
      <SpinViewer mode="full" src={src} frames={frames} cols={cols} label={t("piece.spinLabel", { name })} frameText={(n, total) => t("piece.frame", { n, total })} />
      <span aria-hidden="true" className="pointer-events-none absolute bottom-3 left-1/2 inline-flex -translate-x-1/2 items-center gap-1.5 rounded-full bg-black/65 px-3 py-1 text-xs text-white backdrop-blur-sm">
        <IconTurn size={14} /> {t("piece.dragHint")}
      </span>
    </div>
  );
}
