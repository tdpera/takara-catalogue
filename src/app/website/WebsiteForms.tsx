"use client";
import { useActionState, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useT } from "@/i18n/client";
import { LOCALE_NAMES, LOCALES } from "@/i18n";
import type { PriceMode } from "@/lib/public-price";
import { btn, btnPrimary, card, errorText, hint, input, label } from "@/components/ui";
import { removeLogo, saveWebsite, uploadLogo, type WebsiteResult } from "./actions";

type Initial = {
  slug: string; published: boolean; price_mode: PriceMode; whatsapp: string; address: string;
  maps_url: string; hours: string; instagram: string; about: Record<string, string>;
};

export function WebsiteForm({ initial, origin, domain }: { initial: Initial; origin: string; domain: string }) {
  const { t } = useT();
  const [state, action, pending] = useActionState<WebsiteResult, FormData>(saveWebsite, null);
  const [slug, setSlug] = useState(initial.slug);
  const [mode, setMode] = useState<PriceMode>(initial.price_mode);
  const preview = domain ? `${slug || "…"}.${domain}` : `${origin.replace(/^https?:\/\//, "")}/site/${slug || "…"}`;
  const err = (f: string) => (state?.field === f && state.error ? <p role="alert" className={errorText + " mt-1.5"}>{t(state.error)}</p> : null);

  return (
    <form action={action} className="space-y-6">
      <section className={`${card} space-y-5`} aria-labelledby="addr-h">
        <h2 id="addr-h" className="eyebrow">{t("website.address")}</h2>
        <div>
          <label htmlFor="slug" className={label}>{t("website.slug")}</label>
          <input id="slug" name="slug" dir="ltr" className={input + " text-start lowercase"} value={slug} onChange={(e) => setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""))} minLength={3} maxLength={40} required aria-describedby="slug-hint" />
          <p id="slug-hint" className={hint}>
            {t("website.slugHint")} <span dir="ltr" className="font-semibold text-ink">{preview}</span>
          </p>
          {err("slug")}
        </div>
        <label className="flex min-h-12 cursor-pointer items-center gap-3">
          <input type="checkbox" name="published" defaultChecked={initial.published} className="size-5 accent-[var(--ink)]" />
          <span>
            <span className="block font-semibold">{t("website.published")}</span>
            <span className="block text-sm text-muted">{t("website.publishedHint")}</span>
          </span>
        </label>
      </section>

      <fieldset className={`${card} space-y-3`}>
        <legend className="eyebrow float-start mb-3 w-full">{t("website.prices")}</legend>
        {(["live", "from", "ask"] as const).map((m) => (
          <label key={m} className={`flex cursor-pointer gap-3 rounded-[2px] border p-3.5 transition-colors ${mode === m ? "border-ink" : "border-line hover:border-ink/40"}`}>
            <input type="radio" name="price_mode" value={m} checked={mode === m} onChange={() => setMode(m)} className="mt-1 size-4 accent-[var(--ink)]" />
            <span>
              <span className="block font-semibold">{t(`website.mode_${m}`)}</span>
              <span className="block text-sm text-muted">{t(`website.mode_${m}_hint`)}</span>
            </span>
          </label>
        ))}
      </fieldset>

      <section className={`${card} space-y-5`} aria-labelledby="contact-h">
        <h2 id="contact-h" className="eyebrow">{t("website.contact")}</h2>
        <div>
          <label htmlFor="whatsapp" className={label}>{t("website.whatsapp")}</label>
          <input id="whatsapp" name="whatsapp" type="tel" dir="ltr" inputMode="tel" autoComplete="tel" className={input + " text-start"} defaultValue={initial.whatsapp} aria-describedby="wa-hint" />
          <p id="wa-hint" className={hint}>{t("website.whatsappHint")}</p>
          {err("whatsapp")}
        </div>
        <div>
          <label htmlFor="address" className={label}>{t("website.shopAddress")}</label>
          <input id="address" name="address" className={input} defaultValue={initial.address} maxLength={200} autoComplete="street-address" />
        </div>
        <div>
          <label htmlFor="maps_url" className={label}>{t("website.maps")}</label>
          <input id="maps_url" name="maps_url" type="url" dir="ltr" className={input + " text-start"} defaultValue={initial.maps_url} maxLength={500} placeholder="https://maps.google.com/…" aria-describedby="maps-hint" />
          <p id="maps-hint" className={hint}>{t("website.mapsHint")}</p>
          {err("maps_url")}
        </div>
        <div>
          <label htmlFor="hours" className={label}>{t("website.hours")}</label>
          <input id="hours" name="hours" className={input} defaultValue={initial.hours} maxLength={200} placeholder={t("website.hoursPlaceholder")} />
        </div>
        <div>
          <label htmlFor="instagram" className={label}>{t("website.instagram")}</label>
          <input id="instagram" name="instagram" dir="ltr" className={input + " text-start"} defaultValue={initial.instagram} maxLength={40} placeholder="@" />
          {err("instagram")}
        </div>
      </section>

      <section className={`${card} space-y-5`} aria-labelledby="about-h">
        <div>
          <h2 id="about-h" className="eyebrow">{t("website.about")}</h2>
          <p className={hint}>{t("website.aboutHint")}</p>
        </div>
        {LOCALES.map((l) => (
          <div key={l}>
            <label htmlFor={`about_${l}`} className={label} lang={l}>{LOCALE_NAMES[l]}</label>
            <textarea id={`about_${l}`} name={`about_${l}`} lang={l} dir={l === "ar" ? "rtl" : "ltr"} rows={3} maxLength={600} defaultValue={initial.about[l] ?? ""} className={input + " min-h-24 py-3"} />
          </div>
        ))}
      </section>

      <div className="sticky bottom-[calc(5rem+env(safe-area-inset-bottom))] z-10 -mx-4 border-t border-line bg-paper/95 px-4 py-3 backdrop-blur-md md:bottom-0">
        <button type="submit" disabled={pending} className={btnPrimary + " w-full"}>{pending ? t("common.loading") : t("website.save")}</button>
        <p role="status" className={`mt-2 text-center text-sm empty:mt-0 ${state?.ok ? "text-live" : "text-danger"}`}>
          {state?.ok ? t("website.saved") : state?.error && !state.field ? t(state.error) : ""}
        </p>
      </div>
    </form>
  );
}

/** Picks an image, makes a 512 px square on the phone, and uploads that (small and fast). */
async function squareLogo(file: File): Promise<Blob> {
  const bmp = await createImageBitmap(file);
  const side = Math.min(bmp.width, bmp.height);
  const size = Math.min(512, side);
  const c = document.createElement("canvas");
  c.width = c.height = size;
  const ctx = c.getContext("2d")!;
  ctx.drawImage(bmp, (bmp.width - side) / 2, (bmp.height - side) / 2, side, side, 0, 0, size, size);
  bmp.close();
  const webp = await new Promise<Blob | null>((r) => c.toBlob(r, "image/webp", 0.9));
  if (webp && webp.type === "image/webp") return webp;
  return new Promise<Blob>((r, j) => c.toBlob((b) => (b ? r(b) : j(new Error("encode"))), "image/png"));
}

export function LogoForm({ url }: { url: string | null }) {
  const { t } = useT();
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);

  function pick(file: File | undefined) {
    if (!file) return;
    setMsg(null);
    start(async () => {
      try {
        const blob = await squareLogo(file);
        const fd = new FormData();
        fd.set("logo", new File([blob], blob.type === "image/webp" ? "logo.webp" : "logo.png", { type: blob.type }));
        const r = await uploadLogo(fd);
        if ("error" in r) setMsg(t(r.error));
        else router.refresh();
      } catch {
        setMsg(t("website.errLogo"));
      }
    });
  }

  return (
    <div className="flex flex-wrap items-center gap-4">
      <div className="flex size-20 items-center justify-center overflow-hidden rounded-full border border-line bg-tile">
        {url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={url} alt={t("website.logo")} className="size-full object-cover" />
        ) : (
          <span className="text-xs text-muted">{t("website.noLogo")}</span>
        )}
      </div>
      <div className="flex flex-wrap gap-2">
        <input ref={fileRef} type="file" accept="image/*" className="sr-only" id="logo-file" tabIndex={-1} aria-label={t("website.addLogo")} onChange={(e) => pick(e.target.files?.[0])} />
        <button type="button" className={btn} disabled={pending} onClick={() => fileRef.current?.click()}>
          {pending ? t("common.loading") : url ? t("website.changeLogo") : t("website.addLogo")}
        </button>
        {url && (
          <button type="button" className={btn} disabled={pending} onClick={() => start(async () => { const r = await removeLogo(); if ("error" in r) setMsg(t(r.error)); else router.refresh(); })}>
            {t("website.removeLogo")}
          </button>
        )}
      </div>
      {msg && <p role="alert" className={errorText + " basis-full"}>{msg}</p>}
    </div>
  );
}
