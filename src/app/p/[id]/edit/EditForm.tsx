"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { useT } from "@/i18n/client";
import { LOCALE_NAMES, type MessageKey } from "@/i18n";
import { KARATS, type Karat, type RateMap } from "@/lib/pricing";
import { CATEGORIES, DESC_LANGS, type Category, type Descriptions } from "@/lib/ai/shared";
import { requestAiFill, type AiFillError } from "@/lib/ai/client";
import { PriceBreakdown } from "@/components/PriceBreakdown";
import { AiBadge, Chips } from "@/components/form-bits";
import { btn, btnPrimary, errorText, hint, input, label } from "@/components/ui";
import { deletePiece, updatePiece } from "../actions";
import { IconSparkles } from "@/components/icons";

type Initial = {
  id: string;
  sku: string;
  name: string;
  category: Category;
  karat: Karat;
  gross_g: string;
  stone_g: string;
  making_per_g: string;
  making_flat: string;
  extras_aed: string;
  descriptions: Descriptions;
};

const AI_ERR: Partial<Record<AiFillError, MessageKey>> = {
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

export function EditForm(props: { initial: Initial; shopId: string; canDelete: boolean; rates: RateMap; vatEnabled: boolean; photoUrl: string | null }) {
  const { t } = useT();
  const router = useRouter();
  const i = props.initial;
  const [v, setV] = useState({ ...i });
  const [descs, setDescs] = useState<Descriptions>(i.descriptions);
  const [aiLangs, setAiLangs] = useState<Set<string>>(new Set());
  const [ai, setAi] = useState<{ busy: boolean; msg: string | null }>({ busy: false, msg: null });
  const [error, setError] = useState<MessageKey | null>(null);
  const [pending, start] = useTransition();
  const set = (k: keyof Initial) => (e: React.ChangeEvent<HTMLInputElement>) => setV((x) => ({ ...x, [k]: e.target.value }));

  async function aiDescriptions() {
    if (!props.photoUrl) return;
    const empty = DESC_LANGS.filter((l) => !descs[l]?.trim());
    if (empty.length === 0) return setAi({ busy: false, msg: t("edit.aiDescNone") });
    setAi({ busy: true, msg: null });
    try {
      const img = await fetch(props.photoUrl).then((r) => (r.ok ? r.blob() : Promise.reject(new Error(String(r.status)))));
      const r = await requestAiFill(img, props.shopId, i.id);
      if (!r.ok) return setAi({ busy: false, msg: t(AI_ERR[r.error] ?? "ai.err_error", { seconds: r.retryAfterS ?? 60 }) });
      const filled = empty.filter((l) => r.suggestions.descriptions[l]);
      setDescs((d) => {
        const next = { ...d };
        for (const l of filled) next[l] = r.suggestions.descriptions[l];
        return next;
      });
      setAiLangs(new Set(filled));
      setAi({ busy: false, msg: filled.length ? null : t("ai.nothing") });
    } catch {
      setAi({ busy: false, msg: t("ai.err_error") });
    }
  }

  function save(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    start(async () => {
      const r = await updatePiece({ ...v, descriptions: descs });
      if (r.ok) {
        router.push(`/p/${i.id}`);
        router.refresh();
      } else setError(r.error === "not_allowed" ? "edit.notAllowed" : r.error === "auth" ? "ai.err_auth" : "edit.failed");
    });
  }

  function remove() {
    if (!window.confirm(t("edit.confirmDelete", { sku: i.sku }))) return;
    setError(null);
    start(async () => {
      const r = await deletePiece(i.id);
      if (r.ok) {
        router.push("/");
        router.refresh();
      } else setError(r.error === "not_allowed" ? "edit.notAllowed" : "edit.deleteFailed");
    });
  }

  const num = (id: keyof Initial, lbl: MessageKey, hnt?: MessageKey) => (
    <div>
      <label htmlFor={`e-${id}`} className={label}>{t(lbl)}</label>
      <input
        id={`e-${id}`}
        dir="ltr"
        inputMode="decimal"
        autoComplete="off"
        className={input + " num text-start"}
        value={v[id] as string}
        onChange={set(id)}
        aria-describedby={hnt ? `e-${id}-hint` : undefined}
      />
      {hnt && <p id={`e-${id}-hint`} className={hint}>{t(hnt)}</p>}
    </div>
  );

  return (
    <form onSubmit={save} noValidate className="space-y-5">
      <div>
        <label htmlFor="e-name" className={label}>{t("edit.name")}</label>
        <input id="e-name" className={input} maxLength={80} required value={v.name} onChange={set("name")} />
      </div>
      <Chips name="karat" legend={t("add.karat")} options={KARATS} value={v.karat} onChange={(k) => setV((x) => ({ ...x, karat: k }))} render={(k) => `${k}K`} />
      <Chips name="category" legend={t("add.category")} options={CATEGORIES} value={v.category} onChange={(c) => setV((x) => ({ ...x, category: c }))} render={(c) => t(`categories.${c}`)} />
      <div className="grid gap-4 sm:grid-cols-2">
        {num("gross_g", "add.weight")}
        {num("stone_g", "price.stone")}
        {num("making_per_g", "price.makingPerG")}
        {num("making_flat", "price.makingFlat", "price.makingFlatHint")}
        {num("extras_aed", "price.extras", "price.extrasHint")}
      </div>

      <section aria-labelledby="e-price" className="rounded-3xl bg-surface p-4 shadow-card ring-1 ring-line/70">
        <h2 id="e-price" className="eyebrow mb-3">{t("piece.price")}</h2>
        <PriceBreakdown piece={v} rates={props.rates} vatEnabled={props.vatEnabled} />
      </section>

      <section aria-labelledby="e-desc" className="space-y-3 rounded-3xl bg-surface p-4 shadow-card ring-1 ring-line/70">
        <h2 id="e-desc" className="eyebrow">
          {t("ai.descriptions")}
          <AiBadge show={aiLangs.size > 0} />
        </h2>
        {props.photoUrl && (
          <div>
            <button type="button" className={btn} disabled={ai.busy} onClick={() => void aiDescriptions()}>
              <IconSparkles size={18} className="text-gold" /> {ai.busy ? t("ai.working") : t("edit.aiDesc")}
            </button>
            <p className={hint}>{t("edit.aiDescHint")}</p>
            <p role="status" className="mt-1 text-sm">{ai.msg ?? ""}</p>
          </div>
        )}
        {DESC_LANGS.map((l) => (
          <div key={l}>
            <label htmlFor={`e-d-${l}`} className={label}>
              {LOCALE_NAMES[l]}
              <AiBadge show={aiLangs.has(l)} />
            </label>
            <textarea
              id={`e-d-${l}`}
              lang={l}
              dir={l === "ar" ? "rtl" : "ltr"}
              rows={3}
              maxLength={600}
              className={input + " py-2" + (aiLangs.has(l) ? " border-2 border-warn bg-warn-soft" : "")}
              value={descs[l] ?? ""}
              onChange={(e) => {
                const val = e.target.value;
                setDescs((d) => ({ ...d, [l]: val }));
                setAiLangs((s) => {
                  const n = new Set(s);
                  n.delete(l);
                  return n;
                });
              }}
            />
          </div>
        ))}
      </section>

      {props.canDelete && (
        <button type="button" className={btn + " border-danger text-danger"} disabled={pending} onClick={remove}>
          {t("edit.delete")}
        </button>
      )}

      <div className="fixed inset-x-0 bottom-0 z-10 border-t border-line bg-surface/95 px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] shadow-[0_-10px_30px_rgb(0_0_0/0.06)] backdrop-blur-md">
        <div className="mx-auto max-w-3xl space-y-2">
          {error && <p role="alert" className={errorText}>{t(error)}</p>}
          <div className="flex justify-end gap-3">
            <Link href={`/p/${i.id}`} className={btn}>{t("edit.cancel")}</Link>
            <button className={btnPrimary + " min-w-36"} disabled={pending}>{pending ? t("edit.saving") : t("edit.save")}</button>
          </div>
        </div>
      </div>
    </form>
  );
}
