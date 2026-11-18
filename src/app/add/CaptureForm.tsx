"use client";
import { useEffect, useRef, useState } from "react";
import { useT } from "@/i18n/client";
import type { MessageKey } from "@/i18n";
import { KARATS, priceOf, type Karat, type PriceError, type RateMap } from "@/lib/pricing";
import { formatAED } from "@/lib/format";
import { compressPhoto, type CompressedPhoto } from "@/lib/capture/images";
import { extractSpin, SpinExtractError, videoContentType, videoExt, type Sprite } from "@/lib/capture/spin";
import { enqueue } from "@/lib/outbox/queue";
import type { OutboxMedia, OutboxPiece } from "@/lib/outbox/db";
import { nameFor } from "@/lib/outbox/policy";
import { SpinPreview } from "@/components/SpinPreview";
import { btn, btnPrimary, errorText, hint, input, label } from "@/components/ui";

const CATEGORIES = ["Bangle", "Ring", "Chain", "Necklace", "Earrings", "Pendant", "Bracelet", "Set", "Other"] as const;
type Category = (typeof CATEGORIES)[number];

const PRICE_ERR: Record<PriceError, MessageKey> = {
  invalid_karat: "add.chooseKarat",
  invalid_weight: "price.errWeight",
  stone_not_less_than_gross: "price.errStone",
  invalid_amount: "price.errAmount",
  no_rate: "price.errNoRate",
};

// Karat, category and making charge stay set between pieces: new stock often arrives in batches.
const STICKY = "souq.capture.sticky";
function loadSticky(): { karat?: Karat; category?: Category; making?: string } {
  try {
    return JSON.parse(localStorage.getItem(STICKY) || "{}");
  } catch {
    return {};
  }
}
function saveSticky(v: { karat: Karat | null; category: Category | null; making: string }) {
  try {
    localStorage.setItem(STICKY, JSON.stringify(v));
  } catch {}
}

type Photo = CompressedPhoto & { url: string };
type Spin = Sprite & { video: File; ext: string; url: string };

function Chips<T extends string | number>({
  legend,
  options,
  value,
  onChange,
  render,
  name,
  invalid,
}: {
  legend: string;
  options: readonly T[];
  value: T | null;
  onChange: (v: T) => void;
  render: (v: T) => string;
  name: string;
  invalid?: boolean;
}) {
  return (
    <fieldset aria-invalid={invalid || undefined}>
      <legend className={label}>{legend}</legend>
      <div className="flex flex-wrap gap-2">
        {options.map((o) => (
          <label key={String(o)} className="relative">
            <input type="radio" name={name} className="peer sr-only" checked={value === o} onChange={() => onChange(o)} />
            <span className="inline-flex min-h-11 min-w-14 cursor-pointer items-center justify-center rounded-xl border border-line bg-surface px-3 font-medium peer-checked:border-gold peer-checked:bg-gold-soft peer-checked:font-semibold peer-focus-visible:outline-3 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-[var(--focus)]">
              {render(o)}
            </span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}

export function CaptureForm(props: { shopId: string; userId: string; rates: RateMap; vatEnabled: boolean; defaultMaking: string }) {
  const { t } = useT();
  const [photo, setPhoto] = useState<Photo | null>(null);
  const [photoBusy, setPhotoBusy] = useState(false);
  const [karat, setKarat] = useState<Karat | null>(null);
  const [category, setCategory] = useState<Category | null>(null);
  const [weight, setWeight] = useState("");
  const [stone, setStone] = useState("");
  const [making, setMaking] = useState(props.defaultMaking);
  const [flat, setFlat] = useState("");
  const [extras, setExtras] = useState("");
  const [name, setName] = useState("");
  const [spin, setSpin] = useState<Spin | null>(null);
  const [spinPct, setSpinPct] = useState<number | null>(null);
  const [error, setError] = useState<MessageKey | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [count, setCount] = useState(0);
  const [saving, setSaving] = useState(false);
  const [online, setOnline] = useState(true);
  const [tried, setTried] = useState(false);
  const readyAt = useRef(0);
  const weightRef = useRef<HTMLInputElement>(null);
  const photoBtnRef = useRef<HTMLLabelElement>(null);

  useEffect(() => {
    readyAt.current = performance.now();
    const s = loadSticky();
    if (s.karat && (KARATS as readonly number[]).includes(s.karat)) setKarat(s.karat);
    if (s.category && (CATEGORIES as readonly string[]).includes(s.category)) setCategory(s.category);
    if (s.making) setMaking(s.making);
    setOnline(navigator.onLine);
    const on = () => setOnline(true), off = () => setOnline(false);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    return () => {
      window.removeEventListener("online", on);
      window.removeEventListener("offline", off);
    };
  }, []);

  async function onPhoto(file: File | undefined) {
    if (!file) return;
    setError(null);
    setNotice(null);
    setPhotoBusy(true);
    try {
      const c = await compressPhoto(file);
      if (photo) URL.revokeObjectURL(photo.url);
      setPhoto({ ...c, url: URL.createObjectURL(c.full) });
      requestAnimationFrame(() => weightRef.current?.focus());
    } catch {
      setError("add.photoFailed");
    } finally {
      setPhotoBusy(false);
    }
  }

  async function onVideo(file: File | undefined) {
    if (!file) return;
    setError(null);
    setSpinPct(0);
    try {
      const s = await extractSpin(file, (f) => setSpinPct(Math.round(f * 100)));
      if (spin) URL.revokeObjectURL(spin.url);
      setSpin({ ...s, video: file, ext: videoExt(file)!, url: URL.createObjectURL(s.small) });
    } catch (e) {
      const code = e instanceof SpinExtractError ? e.code : "unreadable";
      setError(`add.spinErr_${code}` as MessageKey);
    } finally {
      setSpinPct(null);
    }
  }

  const piece = { karat: karat ?? 0, gross_g: weight, stone_g: stone, making_per_g: making, making_flat: flat, extras_aed: extras };
  const price = priceOf(piece, props.rates, props.vatEnabled);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setTried(true);
    setNotice(null);
    if (!photo) return setError("add.photoRequired");
    if (!karat) return setError("add.chooseKarat");
    if (!category) return setError("add.chooseCategory");
    if (!price.ok && price.error !== "no_rate") return setError(PRICE_ERR[price.error]);
    setError(null);
    setSaving(true);

    const pieceId = crypto.randomUUID();
    const media: OutboxMedia[] = [];
    const blobs: Record<string, Blob> = {};
    const photoId = crypto.randomUUID();
    blobs[`${photoId}/main`] = photo.full;
    blobs[`${photoId}/thumb`] = photo.thumb;
    media.push({ id: photoId, kind: "photo", status: "pending", mainKey: `${photoId}/main`, thumbKey: `${photoId}/thumb`, contentType: "image/jpeg", ext: "jpg", bytes: photo.full.size });
    if (spin) {
      const spinId = crypto.randomUUID();
      blobs[`${spinId}/main`] = spin.sprite;
      blobs[`${spinId}/thumb`] = spin.small;
      media.push({ id: spinId, kind: "spin", status: "pending", mainKey: `${spinId}/main`, thumbKey: `${spinId}/thumb`, contentType: "image/jpeg", ext: "jpg", bytes: spin.sprite.size, frames: spin.frames, cols: spin.cols, cell: spin.cell });
      const videoId = crypto.randomUUID();
      blobs[`${videoId}/main`] = spin.video;
      media.push({ id: videoId, kind: "video", status: "pending", mainKey: `${videoId}/main`, contentType: videoContentType(spin.ext), ext: spin.ext, bytes: spin.video.size });
    }
    const item: OutboxPiece = {
      id: pieceId,
      userId: props.userId,
      shopId: props.shopId,
      fields: { name: name.trim(), category, karat, gross_g: weight, stone_g: stone, making_per_g: making, making_flat: flat, extras_aed: extras },
      createdAt: Date.now(),
      captureMs: Math.round(performance.now() - readyAt.current),
      pieceSaved: false,
      media,
      attempts: 0,
      nextAttemptAt: 0,
    };
    try {
      await enqueue(item, blobs);
    } catch {
      setSaving(false);
      return setError("common.error");
    }
    saveSticky({ karat, category, making });

    // Ready for the next piece straight away.
    URL.revokeObjectURL(photo.url);
    if (spin) URL.revokeObjectURL(spin.url);
    setPhoto(null);
    setSpin(null);
    setWeight("");
    setStone("");
    setFlat("");
    setExtras("");
    setName("");
    setTried(false);
    setSaving(false);
    setCount((c) => c + 1);
    setNotice(t("add.saved"));
    readyAt.current = performance.now();
    window.scrollTo({ top: 0 });
    photoBtnRef.current?.focus();
  }

  const priceLine = !karat || weight.trim() === ""
    ? null
    : price.ok
      ? `${formatAED(price.price.totalWhole)}${props.vatEnabled ? " · " + t("price.priceInclVat") : ""}`
      : t(PRICE_ERR[price.error], { karat });

  return (
    <form onSubmit={save} noValidate className="space-y-5 pb-28">
      <div aria-live="polite" className="space-y-2">
        {!online && <p className="rounded-xl border border-warn bg-warn-soft p-3 text-sm">{t("add.offline")}</p>}
        {notice && (
          <p className="rounded-xl border border-live p-3 font-medium text-live">
            ✓ {notice} <span className="font-normal">({t("add.sessionCount", { count })})</span>
          </p>
        )}
      </div>

      {/* Photo */}
      <div>
        {photo ? (
          <div className="relative overflow-hidden rounded-2xl border border-line bg-surface">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={photo.url} alt="" className="aspect-square w-full object-contain" />
          </div>
        ) : null}
        <label
          ref={photoBtnRef}
          tabIndex={-1}
          className={
            photo
              ? btn + " mt-2 w-full cursor-pointer"
              : "flex aspect-[4/3] w-full cursor-pointer flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-gold bg-gold-soft p-4 text-center focus-within:outline-3 focus-within:outline-offset-2 focus-within:outline-[var(--focus)]"
          }
        >
          {!photo && <span aria-hidden="true" className="text-4xl">📷</span>}
          <span className={photo ? "" : "text-lg font-semibold"}>
            {photoBusy ? t("add.processing") : photo ? t("add.retake") : t("add.takePhoto")}
          </span>
          {!photo && <span className="text-sm text-muted">{t("add.photoHint")}</span>}
          <input
            type="file"
            accept="image/*"
            capture="environment"
            className="sr-only"
            disabled={photoBusy}
            onChange={(e) => {
              void onPhoto(e.target.files?.[0]);
              e.target.value = "";
            }}
          />
        </label>
      </div>

      <Chips name="karat" legend={t("add.karat")} options={KARATS} value={karat} onChange={setKarat} render={(k) => `${k}K`} invalid={tried && !karat} />
      <Chips name="category" legend={t("add.category")} options={CATEGORIES} value={category} onChange={setCategory} render={(c) => t(`categories.${c}`)} invalid={tried && !category} />

      <div>
        <label htmlFor="weight" className={label}>{t("add.weight")}</label>
        <input
          ref={weightRef}
          id="weight"
          dir="ltr"
          inputMode="decimal"
          autoComplete="off"
          enterKeyHint="done"
          className={input + " num text-start text-2xl"}
          value={weight}
          onChange={(e) => setWeight(e.target.value)}
          aria-describedby="weight-hint"
        />
        <p id="weight-hint" className={hint}>{t("add.weightHint")}</p>
      </div>

      {/* Spin */}
      <div className="rounded-2xl border border-line bg-surface p-3">
        <p className="font-medium">{t("add.spin")}</p>
        {spin ? (
          <div className="mt-2 space-y-2">
            <SpinPreview src={spin.url} frames={spin.frames} cols={spin.cols} label={t("add.spin")} />
            <p className="text-sm text-live">{t("add.spinReady", { seconds: Math.round(spin.durationS) })}</p>
            <button type="button" className={btn} onClick={() => { URL.revokeObjectURL(spin.url); setSpin(null); }}>{t("add.spinRemove")}</button>
          </div>
        ) : spinPct !== null ? (
          <p role="status" className="mt-2">{t("add.spinWorking", { pct: spinPct })}</p>
        ) : (
          <>
            <p className={hint}>{t("add.spinHint")}</p>
            <label className={btn + " mt-2 cursor-pointer focus-within:outline-3 focus-within:outline-offset-2 focus-within:outline-[var(--focus)]"}>
              {t("add.spinAdd")}
              <input
                type="file"
                accept="video/*"
                capture="environment"
                className="sr-only"
                onChange={(e) => {
                  void onVideo(e.target.files?.[0]);
                  e.target.value = "";
                }}
              />
            </label>
          </>
        )}
      </div>

      <details className="rounded-2xl border border-line bg-surface p-3">
        <summary className="min-h-11 cursor-pointer content-center font-medium">{t("add.more")}</summary>
        <div className="mt-3 grid gap-4 sm:grid-cols-2">
          {(
            [
              ["stone", stone, setStone, "price.stone", null],
              ["making", making, setMaking, "price.makingPerG", null],
              ["flat", flat, setFlat, "price.makingFlat", "price.makingFlatHint"],
              ["extras", extras, setExtras, "price.extras", "price.extrasHint"],
            ] as const
          ).map(([id, value, setter, lbl, hnt]) => (
            <div key={id}>
              <label htmlFor={`f-${id}`} className={label}>{t(lbl)}</label>
              <input id={`f-${id}`} dir="ltr" inputMode="decimal" autoComplete="off" className={input + " num text-start"} value={value} onChange={(e) => setter(e.target.value)} aria-describedby={hnt ? `f-${id}-hint` : undefined} />
              {hnt && <p id={`f-${id}-hint`} className={hint}>{t(hnt)}</p>}
            </div>
          ))}
          <div className="sm:col-span-2">
            <label htmlFor="f-name" className={label}>{t("add.name")}</label>
            <input id="f-name" className={input} maxLength={80} value={name} onChange={(e) => setName(e.target.value)} aria-describedby="f-name-hint" />
            <p id="f-name-hint" className={hint}>{t("add.nameHint", { example: karat && category ? nameFor(karat, category) : "22K Bangle" })}</p>
          </div>
        </div>
      </details>

      {/* Sticky save bar: price and Save always in reach of the thumb. */}
      <div className="fixed inset-x-0 bottom-0 z-10 border-t border-line bg-surface/95 px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] backdrop-blur">
        <div className="mx-auto max-w-3xl space-y-2">
          {error && <p role="alert" className={errorText}>{t(error, { karat: karat ?? "" })}</p>}
          <div className="flex items-center gap-3">
            <p className="num me-auto min-w-0 truncate font-semibold" dir="auto" aria-live="polite">{priceLine}</p>
            <button className={btnPrimary + " min-w-36"} disabled={saving || photoBusy || spinPct !== null}>
              {saving ? t("add.saving") : t("add.save")}
            </button>
          </div>
        </div>
      </div>
    </form>
  );
}
