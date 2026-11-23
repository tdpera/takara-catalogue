"use client";
/**
 * The two things a visitor can do with their tray: send it to the shop on WhatsApp (WhatsApp
 * opens with the message written; they press send) or show it in the shop (a big code and a QR
 * that staff scan). Both save the tray as a code first, so the shop sees it in Takara.
 */
import { useState } from "react";
import { useT } from "@/i18n/client";
import { IconChat } from "@/components/icons";
import { TrayIcon, useTray } from "./tray";

type Saved = { code: string; whatsapp: string | null; qr: string; trayUrl: string };

export function TrayActions({ slug, lang, hasWhatsApp }: { slug: string; lang: string; hasWhatsApp: boolean }) {
  const { t } = useT();
  const tray = useTray();
  const [busy, setBusy] = useState<null | "whatsapp" | "in_store">(null);
  const [error, setError] = useState(false);
  const [shown, setShown] = useState<Saved | null>(null);

  async function save(channel: "whatsapp" | "in_store"): Promise<Saved | null> {
    setBusy(channel);
    setError(false);
    try {
      const r = await fetch("/api/public/site/tray", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ slug, ids: tray.ids, channel, lang }),
      });
      const j = (await r.json()) as { ok: boolean } & Partial<Saved>;
      if (!r.ok || !j.ok || !j.code) throw new Error();
      return { code: j.code, whatsapp: j.whatsapp ?? null, qr: j.qr ?? "", trayUrl: j.trayUrl ?? "" };
    } catch {
      setError(true);
      return null;
    } finally {
      setBusy(null);
    }
  }

  if (shown) {
    return (
      <section aria-labelledby="code-h" className="pop-in rounded-[2px] border border-gold-line/60 bg-surface p-6 text-center">
        <h2 id="code-h" className="eyebrow">{t("site.trayCodeTitle")}</h2>
        <p dir="ltr" data-tray-code className="num mt-3 font-display text-[3rem] leading-none font-medium tracking-[0.18em]">{shown.code}</p>
        {/* Our own server drew this QR code (it holds the staff link for this tray). */}
        <div className="mx-auto mt-5 w-48 max-w-full bg-white p-2 [&_svg]:h-auto [&_svg]:w-full" role="img" aria-label={t("site.qrLabel")} dangerouslySetInnerHTML={{ __html: shown.qr }} />
        <p className="mx-auto mt-4 max-w-sm text-[15px] text-muted">{t("site.trayCodeHint")}</p>
        <button type="button" onClick={() => setShown(null)} className="mt-3 min-h-11 text-sm font-semibold text-muted underline underline-offset-4 hover:text-ink">
          {t("common.back")}
        </button>
      </section>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-col gap-2.5 sm:flex-row">
        {hasWhatsApp && (
          <button
            type="button"
            disabled={!!busy || tray.ids.length === 0}
            onClick={async () => {
              const s = await save("whatsapp");
              if (s?.whatsapp) window.location.href = s.whatsapp;
            }}
            className="caps inline-flex min-h-12 flex-1 items-center justify-center gap-2 rounded-[2px] bg-[#1f6f4a] px-5 text-[12.5px] font-semibold text-white transition hover:opacity-90 active:scale-[0.98] disabled:opacity-50"
          >
            <IconChat size={18} /> {busy === "whatsapp" ? t("common.loading") : t("site.sendWhatsApp")}
          </button>
        )}
        <button
          type="button"
          disabled={!!busy || tray.ids.length === 0}
          onClick={async () => {
            const s = await save("in_store");
            if (s) setShown(s);
          }}
          className="caps inline-flex min-h-12 flex-1 items-center justify-center gap-2 rounded-[2px] bg-primary px-5 text-[12.5px] font-semibold text-on-primary shadow-[inset_0_-2px_0_var(--gold-line)] transition hover:opacity-90 active:scale-[0.98] disabled:opacity-50"
        >
          <TrayIcon /> {busy === "in_store" ? t("common.loading") : t("site.showInStore")}
        </button>
      </div>
      {!hasWhatsApp && <p className="text-sm text-muted">{t("site.noWhatsApp")}</p>}
      {error && <p role="alert" className="text-sm font-medium text-danger">{t("site.trayFailed")}</p>}
    </div>
  );
}
