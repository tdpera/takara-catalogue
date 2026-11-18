"use client";
import { useActionState, useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useT } from "@/i18n/client";
import type { MessageKey } from "@/i18n";
import { KARATS, type Karat, type RateMap } from "@/lib/pricing";
import { bigChanges, checkRateSet, deriveFrom24, type RateFieldError } from "@/lib/rates";
import { formatNumber, formatRate } from "@/lib/format";
import { PriceBreakdown } from "@/components/PriceBreakdown";
import { btn, btnPrimary, errorText, hint, input, label } from "@/components/ui";
import { saveRates, saveSettings, type SettingsResult } from "./actions";

const FIELD_ERR: Record<RateFieldError, MessageKey> = { invalid: "rates.errInvalid", order: "rates.errOrder" };
type Values = Record<Karat, string>;
type Change = { karat: Karat; from: string; to: string; pct: string };

/** Today's rates: type 24K, derive the rest, check against the board, save. */
export function RatesForm({ initial, current }: { initial: Values; current: RateMap }) {
  const { t } = useT();
  const router = useRouter();
  const [values, setValues] = useState<Values>(initial);
  const [errors, setErrors] = useState<Partial<Record<Karat, RateFieldError>>>({});
  const [notice, setNotice] = useState<{ key: MessageKey; tone: "ok" | "err" } | null>(null);
  const [confirm, setConfirm] = useState<Change[] | null>(null);
  const [pending, start] = useTransition();
  const confirmRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (confirm) confirmRef.current?.focus();
  }, [confirm]);

  const set = (k: Karat, v: string) => {
    setValues((s) => ({ ...s, [k]: v }));
    setErrors((e) => ({ ...e, [k]: undefined }));
    setNotice(null);
    setConfirm(null);
  };

  function derive() {
    const d = deriveFrom24(values[24]);
    if (!d) {
      setErrors((e) => ({ ...e, 24: "invalid" }));
      setNotice({ key: "rates.deriveNeeds24", tone: "err" });
      return;
    }
    setValues((s) => ({ ...s, 22: d[22], 21: d[21], 18: d[18] }));
    setErrors({});
    setConfirm(null);
    setNotice({ key: "rates.deriveDone", tone: "ok" });
  }

  function submit(confirmed: boolean) {
    setNotice(null);
    const check = checkRateSet(values);
    if (!check.ok) {
      setErrors(check.errors);
      if (check.empty) setNotice({ key: "rates.errEmpty", tone: "err" });
      return;
    }
    if (!confirmed) {
      const big = bigChanges(check.values, current);
      if (big.length) {
        setConfirm(big.map((b) => ({ karat: b.karat, from: formatRate(b.from), to: formatRate(b.to), pct: formatNumber(b.pct.times(100), 1) })));
        return;
      }
    }
    start(async () => {
      const res = await saveRates(values);
      if ("ok" in res) {
        setConfirm(null);
        setNotice({ key: "rates.saved", tone: "ok" });
        router.refresh();
      } else if ("fieldErrors" in res) {
        setConfirm(null);
        setErrors(res.fieldErrors);
      } else {
        setConfirm(null);
        setNotice({ key: res.error, tone: "err" });
      }
    });
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        submit(false);
      }}
      noValidate
      className="space-y-4"
    >
      <p className={hint + " mt-0"}>{t("rates.todayHelp")}</p>
      {KARATS.map((k) => {
        const id = `rate-${k}`;
        const err = errors[k];
        const describedBy = [k === 14 ? `${id}-hint` : null, err ? `${id}-err` : null].filter(Boolean).join(" ") || undefined;
        return (
          <div key={k}>
            <div className="flex items-end gap-3">
              <div className="flex-1">
                <label htmlFor={id} className={label}>
                  {k}K <span className="font-normal text-muted">· {t("rates.perGram")}</span>
                </label>
                <input
                  id={id}
                  dir="ltr"
                  inputMode="decimal"
                  autoComplete="off"
                  className={input + " num text-start" + (err ? " border-danger" : "")}
                  value={values[k]}
                  onChange={(e) => set(k, e.target.value)}
                  aria-invalid={!!err}
                  aria-describedby={describedBy}
                />
              </div>
              {k === 24 && (
                <button type="button" className={btn} onClick={derive}>
                  {t("rates.derive")}
                </button>
              )}
            </div>
            {k === 14 && <p id={`${id}-hint`} className={hint}>{t("rates.rate14Hint")}</p>}
            {err && <p id={`${id}-err`} className={errorText + " mt-1"}>{t(FIELD_ERR[err])}</p>}
          </div>
        );
      })}

      <div aria-live="polite">
        {notice && <p className={notice.tone === "ok" ? "font-medium text-live" : errorText}>{t(notice.key)}</p>}
      </div>

      {confirm ? (
        <div ref={confirmRef} tabIndex={-1} role="alertdialog" aria-labelledby="confirm-title" aria-describedby="confirm-help" className="space-y-3 rounded-2xl border-2 border-warn bg-warn-soft p-4">
          <h3 id="confirm-title" className="font-semibold">{t("rates.confirmTitle")}</h3>
          <ul className="space-y-1">
            {confirm.map((c) => (
              <li key={c.karat} dir="ltr" className="num text-start">
                {t("rates.confirmLine", { karat: c.karat, from: c.from, to: c.to, pct: c.pct })}
              </li>
            ))}
          </ul>
          <p id="confirm-help" className="text-sm">{t("rates.confirmHelp")}</p>
          <div className="flex flex-wrap gap-3">
            <button type="button" className={btn} onClick={() => setConfirm(null)}>{t("rates.fixIt")}</button>
            <button type="button" className={btnPrimary} disabled={pending} onClick={() => submit(true)}>{t("rates.saveAnyway")}</button>
          </div>
        </div>
      ) : (
        <button className={btnPrimary + " w-full"} disabled={pending}>{t("rates.save")}</button>
      )}
    </form>
  );
}

export function SettingsForm({ making, vat }: { making: string; vat: boolean }) {
  const { t } = useT();
  const [state, action, pending] = useActionState<SettingsResult, FormData>(saveSettings, null);
  return (
    <form action={action} className="space-y-4">
      <div>
        <label htmlFor="making" className={label}>{t("rates.defaultMaking")}</label>
        <input id="making" name="making" dir="ltr" inputMode="decimal" defaultValue={making} className={input + " num text-start"} aria-describedby="making-hint" />
        <p id="making-hint" className={hint}>{t("rates.defaultMakingHint")}</p>
      </div>
      <label className="flex min-h-11 items-start gap-3">
        <input type="checkbox" name="vat" defaultChecked={vat} className="mt-1 size-5" aria-describedby="vat-hint" />
        <span>
          <span className="block font-medium">{t("rates.vat")}</span>
          <span id="vat-hint" className="block text-sm text-muted">{t("rates.vatHint")}</span>
        </span>
      </label>
      <div aria-live="polite">
        {state?.ok && <p className="font-medium text-live">{t("rates.settingsSaved")}</p>}
        {state?.error && <p className={errorText}>{t(state.error)}</p>}
      </div>
      <button className={btn} disabled={pending}>{t("common.save")}</button>
    </form>
  );
}

/** Quote a price from the current rates without saving anything. */
export function PriceCalculator({ rates, vatEnabled, defaultMaking }: { rates: RateMap; vatEnabled: boolean; defaultMaking: string }) {
  const { t } = useT();
  const firstKarat = ([22, 24, 21, 18, 14] as Karat[]).find((k) => rates[k]) ?? 22;
  const [karat, setKarat] = useState<Karat>(firstKarat);
  const [f, setF] = useState({ gross: "", stone: "", making: defaultMaking, flat: "", extras: "" });
  const field = (key: keyof typeof f, labelKey: MessageKey, hintKey?: MessageKey) => (
    <div>
      <label htmlFor={`calc-${key}`} className={label}>{t(labelKey)}</label>
      <input
        id={`calc-${key}`}
        dir="ltr"
        inputMode="decimal"
        autoComplete="off"
        className={input + " num text-start"}
        value={f[key]}
        onChange={(e) => setF((s) => ({ ...s, [key]: e.target.value }))}
        aria-describedby={hintKey ? `calc-${key}-hint` : undefined}
      />
      {hintKey && <p id={`calc-${key}-hint`} className={hint}>{t(hintKey)}</p>}
    </div>
  );

  return (
    <div className="space-y-4">
      <p className={hint + " mt-0"}>{t("price.calculatorHelp")}</p>
      <fieldset>
        <legend className={label}>{t("price.karat")}</legend>
        <div className="flex flex-wrap gap-2">
          {KARATS.map((k) => (
            <label key={k} className="relative">
              <input type="radio" name="calc-karat" value={k} checked={karat === k} onChange={() => setKarat(k)} className="peer sr-only" />
              <span className="inline-flex min-h-11 min-w-14 cursor-pointer items-center justify-center rounded-xl border border-line px-3 font-medium peer-checked:border-gold peer-checked:bg-gold-soft peer-focus-visible:outline-3 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-[var(--focus)]">
                {k}K
              </span>
            </label>
          ))}
        </div>
      </fieldset>
      <div className="grid gap-4 sm:grid-cols-2">
        {field("gross", "price.gross")}
        {field("stone", "price.stone")}
        {field("making", "price.makingPerG")}
        {field("flat", "price.makingFlat", "price.makingFlatHint")}
        {field("extras", "price.extras", "price.extrasHint")}
      </div>
      {f.gross.trim() !== "" && (
        <div className="rounded-xl border border-line bg-paper px-3 py-1">
          <PriceBreakdown
            piece={{ karat, gross_g: f.gross, stone_g: f.stone, making_per_g: f.making, making_flat: f.flat, extras_aed: f.extras }}
            rates={rates}
            vatEnabled={vatEnabled}
          />
        </div>
      )}
    </div>
  );
}
