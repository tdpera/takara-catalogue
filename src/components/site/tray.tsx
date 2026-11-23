"use client";
/**
 * The visitor's tray on a shop website: like the trays staff bring out in the shop, a short list
 * of pieces to look at together. It lives in a cookie for that website only (piece ids, at most
 * 24), so the tray page can be drawn on the server; there's no account and nothing personal.
 */
import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useT } from "@/i18n/client";
import { IconCheck, IconPlus } from "@/components/icons";

const MAX = 24;
type Ctx = { ids: string[]; has: (id: string) => boolean; toggle: (id: string) => void; remove: (id: string) => void; clear: () => void };
const TrayCtx = createContext<Ctx | null>(null);

function read(name: string): string[] {
  const m = document.cookie.match(new RegExp(`(?:^|; )${name}=([^;]*)`));
  return m ? decodeURIComponent(m[1]).split(".").filter(Boolean).slice(0, MAX) : [];
}

export function TrayProvider({ cookie, path, initial, children }: { cookie: string; path: string; initial: string[]; children: React.ReactNode }) {
  const [ids, setIds] = useState<string[]>(initial);
  // Another tab may have changed it.
  useEffect(() => {
    const sync = () => setIds(read(cookie));
    window.addEventListener("focus", sync);
    return () => window.removeEventListener("focus", sync);
  }, [cookie]);
  const save = useCallback(
    (next: string[]) => {
      const list = next.slice(0, MAX);
      document.cookie = `${cookie}=${encodeURIComponent(list.join("."))}; path=${path}; max-age=${60 * 86400}; samesite=lax`;
      setIds(list);
    },
    [cookie, path],
  );
  const value: Ctx = {
    ids,
    has: (id) => ids.includes(id),
    toggle: (id) => save(ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]),
    remove: (id) => save(ids.filter((x) => x !== id)),
    clear: () => save([]),
  };
  return <TrayCtx.Provider value={value}>{children}</TrayCtx.Provider>;
}

export function useTray(): Ctx {
  const c = useContext(TrayCtx);
  if (!c) throw new Error("useTray outside TrayProvider");
  return c;
}

/** "Add to tray" on the piece page (wide) and on catalogue cards (round icon). */
export function AddToTray({ id, name, variant = "wide", disabled = false }: { id: string; name: string; variant?: "wide" | "icon"; disabled?: boolean }) {
  const { t } = useT();
  const tray = useTray();
  const on = tray.has(id);
  const full = !on && tray.ids.length >= MAX;
  if (variant === "icon") {
    return (
      <button
        type="button"
        aria-pressed={on}
        disabled={disabled || full}
        onClick={() => tray.toggle(id)}
        aria-label={on ? t("site.removeFromTrayNamed", { name }) : t("site.addToTrayNamed", { name })}
        className="absolute end-1 top-1 flex size-11 items-center justify-center rounded-full focus-visible:outline-3 focus-visible:outline-[var(--focus)] disabled:hidden"
      >
        <span aria-hidden="true" className={`flex size-8 items-center justify-center rounded-full border shadow-sm transition-all duration-200 ${on ? "scale-105 border-ink bg-ink text-paper" : "border-white/80 bg-paper/90 text-ink backdrop-blur-sm"}`}>
          {on ? <IconCheck size={15} className="stroke-[2.4]" /> : <IconPlus size={15} className="stroke-[2.2]" />}
        </span>
      </button>
    );
  }
  return (
    <button
      type="button"
      aria-pressed={on}
      disabled={disabled || full}
      onClick={() => tray.toggle(id)}
      className={`caps inline-flex min-h-12 flex-1 items-center justify-center gap-2 rounded-[2px] px-5 text-[12.5px] font-semibold transition duration-200 active:scale-[0.98] disabled:opacity-50 ${on ? "border border-ink bg-paper text-ink" : "bg-primary text-on-primary shadow-[inset_0_-2px_0_var(--gold-line)] hover:opacity-90"}`}
    >
      {on ? <IconCheck size={17} className="stroke-[2.4]" /> : <IconPlus size={17} className="stroke-[2.2]" />}
      {on ? t("site.inTray") : full ? t("site.trayFull") : t("site.addToTray")}
    </button>
  );
}

/** Tray link in the header, with how many pieces are in it. */
export function TrayLink({ href }: { href: string }) {
  const { t } = useT();
  const { ids } = useTray();
  return (
    <a href={href} className="caps relative inline-flex min-h-11 items-center gap-2 text-[12px] font-semibold">
      <TrayIcon />
      <span>{t("site.tray")}</span>
      <span aria-live="polite" className={`num inline-flex min-w-5 items-center justify-center rounded-full px-1.5 text-[11px] leading-5 ${ids.length ? "bg-ink text-paper" : "bg-tile text-muted"}`}>
        <span className="sr-only">{t("site.trayCount", { count: ids.length })}</span>
        <span aria-hidden="true">{ids.length}</span>
      </span>
    </a>
  );
}

export function TrayIcon({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
      <path d="M3 14h18l-1.5 5h-15z" />
      <path d="M6 14V8a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v6" />
      <path d="M9 10h6" />
    </svg>
  );
}

/** Remove one piece on the tray page (the page then redraws without it). */
export function RemoveFromTray({ id, name }: { id: string; name: string }) {
  const { t } = useT();
  const tray = useTray();
  const router = useRouter();
  return (
    <button type="button" onClick={() => { tray.remove(id); router.refresh(); }} className="min-h-11 text-sm font-semibold text-muted underline-offset-4 hover:text-ink hover:underline" aria-label={t("site.removeFromTrayNamed", { name })}>
      {t("site.removeFromTray")}
    </button>
  );
}
