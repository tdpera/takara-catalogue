"use client";
/**
 * On a Digital tray the shop sent: the customer ticks the pieces they'd like to see, then sends
 * their choice back on WhatsApp (the message is written for them; they press send) or shows a
 * code and QR in the shop. Either way the choice is saved for the shop's Trays tab.
 */
import { createContext, useContext, useEffect, useState } from "react";
import { useT } from "@/i18n/client";
import { IconChat, IconCheck, IconTray } from "@/components/icons";

type Ctx = { chosen: string[]; toggle: (id: string) => void };
const ChooseCtx = createContext<Ctx | null>(null);

export function ChooserProvider({ children }: { children: React.ReactNode }) {
  const [chosen, setChosen] = useState<string[]>([]);
  // Photos aren't for saving: no long-press menu or right-click on them (a light deterrent;
  // screenshots can't be stopped, which is why trays carry the shop's name over each photo).
  useEffect(() => {
    const block = (e: Event) => {
      if ((e.target as HTMLElement | null)?.closest?.("[data-protect]")) e.preventDefault();
    };
    document.addEventListener("contextmenu", block);
    document.addEventListener("dragstart", block);
    return () => {
      document.removeEventListener("contextmenu", block);
      document.removeEventListener("dragstart", block);
    };
  }, []);
  return (
    <ChooseCtx.Provider value={{ chosen, toggle: (id) => setChosen((c) => (c.includes(id) ? c.filter((x) => x !== id) : [...c, id])) }}>
      {children}
    </ChooseCtx.Provider>
  );
}

function useChooser() {
  const c = useContext(ChooseCtx);
  if (!c) throw new Error("useChooser outside ChooserProvider");
  return c;
}

/** "I'd like to see this" on one piece. */
export function ChooseToggle({ id, name }: { id: string; name: string }) {
  const { t } = useT();
  const { chosen, toggle } = useChooser();
  const on = chosen.includes(id);
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={() => toggle(id)}
      aria-label={t("pub.chooseNamed", { name })}
      className={`caps mt-3 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-[2px] border px-4 text-[12px] font-semibold transition-colors duration-200 ${on ? "border-ink bg-ink text-paper" : "border-ink/25 hover:border-ink"}`}
    >
      {on ? <IconCheck size={16} className="stroke-[2.4]" /> : <IconTray size={16} />}
      {on ? t("pub.chosen") : t("pub.choose")}
    </button>
  );
}

type Saved = { code: string; qr: string; whatsapp: string | null };

/** The bar at the bottom once something is chosen: send the choice, or show it in the shop. */
export function ChooseBar({ token, lang, canWhatsApp }: { token: string; lang: string; canWhatsApp: boolean }) {
  const { t } = useT();
  const { chosen } = useChooser();
  const [busy, setBusy] = useState<null | "whatsapp" | "in_store">(null);
  const [error, setError] = useState(false);
  const [shown, setShown] = useState<Saved | null>(null);

  async function save(channel: "whatsapp" | "in_store"): Promise<Saved | null> {
    setBusy(channel);
    setError(false);
    try {
      const r = await fetch("/api/public/share-tray", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ token, ids: chosen, channel, lang }),
      });
      const j = (await r.json()) as { ok: boolean } & Partial<Saved>;
      if (!r.ok || !j.ok || !j.code) throw new Error();
      return { code: j.code, qr: j.qr ?? "", whatsapp: j.whatsapp ?? null };
    } catch {
      setError(true);
      return null;
    } finally {
      setBusy(null);
    }
  }

  if (shown) {
    return (
      <div className="fixed inset-0 z-40 flex items-end justify-center bg-black/40 p-3 sm:items-center" role="dialog" aria-modal="true" aria-labelledby="code-h">
        <section className="pop-in w-full max-w-sm rounded-[2px] bg-surface p-6 text-center shadow-lift">
          <h2 id="code-h" className="eyebrow">{t("pub.codeTitle")}</h2>
          <p dir="ltr" data-tray-code className="num mt-3 font-display text-[3rem] leading-none font-medium tracking-[0.18em]">{shown.code}</p>
          {/* Our own server drew this QR code (it opens the choice in the shop's Takara app). */}
          <div className="mx-auto mt-5 w-44 max-w-full bg-white p-2 [&_svg]:h-auto [&_svg]:w-full" role="img" aria-label={t("site.qrLabel")} dangerouslySetInnerHTML={{ __html: shown.qr }} />
          <p className="mx-auto mt-4 text-[15px] text-muted">{t("pub.codeHint")}</p>
          <button type="button" autoFocus onClick={() => setShown(null)} className="caps mt-4 inline-flex min-h-11 items-center rounded-[2px] border border-ink/25 px-5 text-[12px] font-semibold hover:border-ink">
            {t("common.back")}
          </button>
        </section>
      </div>
    );
  }

  if (chosen.length === 0) return null;
  return (
    <div className="slide-up fixed inset-x-0 bottom-0 z-30 border-t border-line bg-paper/95 px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] shadow-lift backdrop-blur-md">
      <div className="mx-auto flex max-w-3xl flex-wrap items-center gap-2.5">
        <p className="me-auto font-medium" aria-live="polite">{t("pub.chosenCount", { count: chosen.length })}</p>
        {canWhatsApp && (
          <button
            type="button"
            disabled={!!busy}
            onClick={async () => {
              const s = await save("whatsapp");
              if (s?.whatsapp) window.location.href = s.whatsapp;
            }}
            className="caps inline-flex min-h-11 items-center justify-center gap-2 rounded-[2px] bg-[#1f6f4a] px-4 text-[12px] font-semibold text-white hover:opacity-90 disabled:opacity-50"
          >
            <IconChat size={17} /> {busy === "whatsapp" ? t("common.loading") : t("pub.sendChoice")}
          </button>
        )}
        <button
          type="button"
          disabled={!!busy}
          onClick={async () => {
            const s = await save("in_store");
            if (s) setShown(s);
          }}
          className="caps inline-flex min-h-11 items-center justify-center gap-2 rounded-[2px] bg-primary px-4 text-[12px] font-semibold text-on-primary shadow-[inset_0_-2px_0_var(--gold-line)] hover:opacity-90 disabled:opacity-50"
        >
          <IconTray size={17} /> {busy === "in_store" ? t("common.loading") : t("pub.showInShop")}
        </button>
        {error && <p role="alert" className="basis-full text-sm font-medium text-danger">{t("site.trayFailed")}</p>}
      </div>
    </div>
  );
}

/** The shop's name faintly across a photo: copies of the design carry where they came from. */
export function Watermark({ text }: { text: string }) {
  return (
    <span aria-hidden="true" className="pointer-events-none absolute inset-0 flex select-none flex-col items-center justify-center gap-10 overflow-hidden">
      {[0, 1, 2].map((i) => (
        <span key={i} className="-rotate-[24deg] font-display text-[clamp(14px,4.2vw,22px)] font-medium tracking-[0.3em] whitespace-nowrap text-white/45 [text-shadow:0_1px_2px_rgb(0_0_0/0.25)]">
          {text.toUpperCase()}
        </span>
      ))}
    </span>
  );
}
