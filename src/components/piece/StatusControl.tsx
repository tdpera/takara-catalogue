"use client";
import { useState, useTransition } from "react";
import { useT } from "@/i18n/client";
import type { MessageKey } from "@/i18n";
import { STATUSES, type Status } from "@/lib/catalogue-filters";
import { setStatus } from "@/app/p/[id]/actions";

/** In stock / reserved / sold. Any member of the shop can change it. */
export function StatusControl({ pieceId, status }: { pieceId: string; status: Status }) {
  const { t } = useT();
  const [value, setValue] = useState<Status>(status);
  const [msg, setMsg] = useState<{ key: MessageKey; ok: boolean } | null>(null);
  const [pending, start] = useTransition();

  function choose(next: Status) {
    if (next === value || pending) return;
    const before = value;
    setValue(next);
    setMsg(null);
    start(async () => {
      const r = await setStatus(pieceId, next);
      if (r.ok) setMsg({ key: "piece.statusSaved", ok: true });
      else {
        setValue(before);
        setMsg({ key: "piece.statusFailed", ok: false });
      }
    });
  }

  return (
    <fieldset aria-busy={pending}>
      <legend className="mb-2 text-sm font-medium">{t("piece.status")}</legend>
      <div className="flex flex-wrap gap-2">
        {STATUSES.map((s) => (
          <label key={s} className="relative">
            <input type="radio" name="status" className="peer sr-only" checked={value === s} onChange={() => choose(s)} />
            <span className="inline-flex min-h-11 cursor-pointer items-center rounded-xl border border-line bg-surface px-4 font-medium peer-checked:border-gold peer-checked:bg-gold-soft peer-checked:font-semibold peer-focus-visible:outline-3 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-[var(--focus)]">
              {t(`status.${s}`)}
            </span>
          </label>
        ))}
      </div>
      <p role="status" className={`mt-2 text-sm empty:mt-0 ${msg?.ok ? "text-live" : "text-danger"}`}>{msg ? t(msg.key) : ""}</p>
    </fieldset>
  );
}
