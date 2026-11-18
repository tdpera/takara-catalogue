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
import { LOCALE_NAMES } from "@/i18n";
import { CATEGORIES, DESC_LANGS, type Category, type DescLang, type Descriptions, type AiSuggestions } from "@/lib/ai/shared";
import { requestAiFill, type AiFillError } from "@/lib/ai/client";

// Fields AI fill can suggest. A field the salesperson has edited for this piece is never overwritten.
type AiField = "name" | "karat" | "category" | "weight" | "descriptions";
type AiState =
  | { state: "idle" }
  | { state: "working" }
  | { state: "done"; filled: AiField[]; missing: AiField[] }
  | { state: "error"; error: AiFillError; retryAfterS?: number };
const AI_PREF = "souq.capture.ai";
// Errors where trying again soon may help.
const AI_RETRYABLE: AiFillError[] = ["busy", "timeout", "invalid_output", "error", "rate_limited", "unreadable"];
const AI_ERR_KEY: Partial<Record<AiFillError, MessageKey>> = {
  rate_limited: "ai.err_rate_limited",
  quota: "ai.err_quota",
  unreadable: "ai.err_unreadable",
  no_jewellery: "ai.err_no_jewellery",
  refused: "ai.err_refused",
  invalid_output: "ai.err_invalid_output",
  busy: "ai.err_busy",
  timeout: "ai.err_timeout",
  offline: "ai.err_offline",
  not_configured: "ai.err_not_configured",
  auth: "ai.err_auth",
};

function AiBadge({ show }: { show: boolean }) {
  const { t } = useT();
  if (!show) return null;
  return <span className="ms-2 inline-block rounded-full border border-warn bg-warn-soft px-2 py-0.5 align-middle text-xs font-semibold text-warn">{t("ai.badge")}</span>;
}

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
  ai,
}: {
  legend: string;
  options: readonly T[];
  value: T | null;
  onChange: (v: T) => void;
  render: (v: T) => string;
  name: string;
  invalid?: boolean;
  ai?: boolean;
}) {
  return (
    <fieldset aria-invalid={invalid || undefined}>
      <legend className={label}>{legend}<AiBadge show={!!ai} /></legend>
      <div className="flex flex-wrap gap-2">
        {options.map((o) => (
          <label key={String(o)} className="relative">
            <input type="radio" name={name} className="peer sr-only" checked={value === o} onChange={() => onChange(o)} />
            <span className={`inline-flex min-h-11 min-w-14 cursor-pointer items-center justify-center rounded-xl border border-line bg-surface px-3 font-medium peer-checked:font-semibold ${ai ? "peer-checked:border-2 peer-checked:border-warn peer-checked:bg-warn-soft" : "peer-checked:border-gold peer-checked:bg-gold-soft"} peer-focus-visible:outline-3 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-[var(--focus)]`}>
              {render(o)}
            </span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}

function cleanDescs(d: Descriptions): Descriptions | undefined {
  const out: Descriptions = {};
  for (const l of DESC_LANGS) if (d[l]?.trim()) out[l] = d[l]!.trim();
  return Object.keys(out).length ? out : undefined;
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
  const [descs, setDescs] = useState<Descriptions>({});
  const [aiOn, setAiOn] = useState(true);
  const [ai, setAi] = useState<AiState>({ state: "idle" });
  const [aiFields, setAiFields] = useState<Set<AiField>>(new Set());
  const touched = useRef(new Set<AiField>());
  // The phone's id for the piece being captured; a new photo gets a new id. AI replies for an
  // older id are ignored here (the server still attaches late descriptions to a saved piece).
  const pieceId = useRef<string | null>(null);
  const aiAbort = useRef<AbortController | null>(null);
  const readyAt = useRef(0);
  const weightRef = useRef<HTMLInputElement>(null);
  const photoBtnRef = useRef<HTMLLabelElement>(null);

  useEffect(() => {
    readyAt.current = performance.now();
    const s = loadSticky();
    if (s.karat && (KARATS as readonly number[]).includes(s.karat)) setKarat(s.karat);
    if (s.category && (CATEGORIES as readonly string[]).includes(s.category)) setCategory(s.category);
    if (s.making) setMaking(s.making);
    try {
      setAiOn(localStorage.getItem(AI_PREF) !== "off");
    } catch {}
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
      pieceId.current = crypto.randomUUID();
      requestAnimationFrame(() => weightRef.current?.focus());
      if (aiOn) void runAi(c.full);
      else setAi({ state: "idle" });
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

  /** Marks a field as the salesperson's own: AI won't change it, and its AI highlight goes. */
  function own(field: AiField) {
    touched.current.add(field);
    setAiFields((prev) => {
      if (!prev.has(field)) return prev;
      const next = new Set(prev);
      next.delete(field);
      return next;
    });
  }

  async function runAi(image: Blob) {
    const id = pieceId.current;
    if (!id) return;
    aiAbort.current?.abort();
    const ctrl = new AbortController();
    aiAbort.current = ctrl;
    setAi({ state: "working" });
    let r;
    try {
      r = await requestAiFill(image, props.shopId, id, ctrl.signal);
    } catch {
      return; // cancelled by a newer photo
    }
    if (pieceId.current !== id) return; // saved or retaken meanwhile
    if (!r.ok) return setAi({ state: "error", error: r.error, retryAfterS: r.retryAfterS });
    applyAi(r.suggestions);
  }

  function applyAi(s: AiSuggestions) {
    const mine = touched.current;
    const filled: AiField[] = [];
    const fill = (field: AiField, ok: boolean, apply: () => void) => {
      if (!ok || mine.has(field)) return;
      apply();
      filled.push(field);
    };
    fill("karat", !!s.karat, () => setKarat(s.karat));
    fill("category", true, () => setCategory(s.category));
    fill("weight", !!s.weight_g, () => setWeight(s.weight_g!));
    fill("name", !!s.name, () => setName(s.name!));
    fill("descriptions", Object.keys(s.descriptions).length > 0, () => setDescs(s.descriptions));
    setAiFields(new Set(filled));
    // What's left for the salesperson. Karat and weight matter most: they set the price.
    const missing = (["karat", "weight", "name", "descriptions"] as AiField[]).filter((f) => !filled.includes(f) && !mine.has(f));
    setAi({ state: "done", filled, missing });
  }

  function setAiPref(on: boolean) {
    setAiOn(on);
    try {
      localStorage.setItem(AI_PREF, on ? "on" : "off");
    } catch {}
    if (on && photo && ai.state === "idle") void runAi(photo.full);
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

    const id = pieceId.current ?? crypto.randomUUID();
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
      id,
      userId: props.userId,
      shopId: props.shopId,
      fields: { name: name.trim(), category, karat, gross_g: weight, stone_g: stone, making_per_g: making, making_flat: flat, extras_aed: extras, descriptions: cleanDescs(descs) },
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
    setDescs({});
    // Don't abort a running AI request: the server attaches its descriptions to this piece.
    pieceId.current = null;
    aiAbort.current = null;
    touched.current = new Set();
    setAiFields(new Set());
    setAi({ state: "idle" });
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

      {/* AI fill */}
      <div className="space-y-2">
        <label className="flex min-h-11 items-start gap-3">
          <input type="checkbox" className="mt-1 size-5 shrink-0 accent-[var(--gold)]" checked={aiOn} onChange={(e) => setAiPref(e.target.checked)} aria-describedby="ai-hint" />
          <span>
            <span className="font-medium">{t("ai.toggle")}</span>
            <span id="ai-hint" className="block text-sm text-muted">{t("ai.toggleHint")}</span>
          </span>
        </label>
        <div role="status" aria-live="polite">
          {ai.state === "working" && (
            <p className="flex items-center gap-2 rounded-xl border border-line bg-surface p-3">
              <span aria-hidden="true" className="size-4 animate-spin rounded-full border-2 border-gold border-t-transparent motion-reduce:animate-none" />
              {t("ai.working")}
            </p>
          )}
          {ai.state === "done" && (
            <div className="space-y-1 rounded-xl border border-warn bg-warn-soft p-3 text-sm">
              {ai.filled.length > 0 ? (
                <p className="font-medium">{t("ai.filled", { fields: ai.filled.map((f) => t(`ai.field_${f}`)).join(t("ai.listSep")) })}</p>
              ) : (
                <p className="font-medium">{t("ai.nothing")}</p>
              )}
              {ai.filled.length > 0 && ai.missing.length > 0 && (
                <p>{t("ai.typeByHand", { fields: ai.missing.map((f) => t(`ai.field_${f}`)).join(t("ai.listSep")) })}</p>
              )}
            </div>
          )}
          {ai.state === "error" && (
            <p className="rounded-xl border border-warn bg-warn-soft p-3 text-sm">{t(AI_ERR_KEY[ai.error] ?? "ai.err_error", { seconds: ai.retryAfterS ?? 60 })}</p>
          )}
        </div>
        {photo && ai.state !== "working" && (ai.state === "idle" ? !aiOn : ai.state === "error" && AI_RETRYABLE.includes(ai.error)) && (
          <button type="button" className={btn} onClick={() => void runAi(photo.full)}>
            <span aria-hidden="true">✨</span> {t("ai.run")}
          </button>
        )}
      </div>

      <Chips name="karat" legend={t("add.karat")} options={KARATS} value={karat} onChange={(k) => (own("karat"), setKarat(k))} render={(k) => `${k}K`} invalid={tried && !karat} ai={aiFields.has("karat")} />
      <Chips name="category" legend={t("add.category")} options={CATEGORIES} value={category} onChange={(c) => (own("category"), setCategory(c))} render={(c) => t(`categories.${c}`)} invalid={tried && !category} ai={aiFields.has("category")} />

      <div>
        <label htmlFor="weight" className={label}>{t("add.weight")}<AiBadge show={aiFields.has("weight")} /></label>
        <input
          ref={weightRef}
          id="weight"
          dir="ltr"
          inputMode="decimal"
          autoComplete="off"
          enterKeyHint="done"
          className={input + " num text-start text-2xl" + (aiFields.has("weight") ? " border-2 border-warn bg-warn-soft" : "")}
          value={weight}
          onChange={(e) => (own("weight"), setWeight(e.target.value))}
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

      <details className="rounded-2xl border border-line bg-surface p-3" open={aiFields.has("name") || undefined}>
        <summary className="min-h-11 cursor-pointer content-center font-medium">
          {t("add.more")}
          <AiBadge show={aiFields.has("name")} />
        </summary>
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
            <label htmlFor="f-name" className={label}>{t("add.name")}<AiBadge show={aiFields.has("name")} /></label>
            <input id="f-name" className={input + (aiFields.has("name") ? " border-2 border-warn bg-warn-soft" : "")} maxLength={80} value={name} onChange={(e) => (own("name"), setName(e.target.value))} aria-describedby="f-name-hint" />
            <p id="f-name-hint" className={hint}>{t("add.nameHint", { example: karat && category ? nameFor(karat, category) : "22K Bangle" })}</p>
          </div>
        </div>
      </details>

      <details className="rounded-2xl border border-line bg-surface p-3" open={aiFields.has("descriptions") || undefined}>
        <summary className="min-h-11 cursor-pointer content-center font-medium">
          {t("ai.descriptions")}
          <AiBadge show={aiFields.has("descriptions")} />
        </summary>
        <p className={hint}>{t("ai.descHint")}</p>
        <div className="mt-3 grid gap-4">
          {DESC_LANGS.map((l: DescLang) => (
            <div key={l}>
              <label htmlFor={`d-${l}`} className={label}>{LOCALE_NAMES[l]}</label>
              <textarea
                id={`d-${l}`}
                lang={l}
                dir={l === "ar" ? "rtl" : "ltr"}
                rows={3}
                maxLength={600}
                className={input + " py-2" + (aiFields.has("descriptions") && descs[l] ? " border-2 border-warn bg-warn-soft" : "")}
                value={descs[l] ?? ""}
                onChange={(e) => (own("descriptions"), setDescs((d) => ({ ...d, [l]: e.target.value })))}
              />
            </div>
          ))}
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
