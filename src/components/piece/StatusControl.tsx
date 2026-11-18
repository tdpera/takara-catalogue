"use client";
import { useState, useTransition } from "react";
import { useT } from "@/i18n/client";
import type { MessageKey } from "@/i18n";
import { STATUSES, type Status } from "@/lib/catalogue-filters";
import { setStatus } from "@/app/p/[id]/actions";

const DOT: Record<Status, string> = { in_stock: "bg-live", reserved: "bg-warn", sold: "bg-muted" };

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
      <legend className="eyebrow mb-3">{t("piece.status")}</legend>
      <div className="flex gap-1 rounded-full border border-line bg-raised p-1">
        {STATUSES.map((s) => (
          <label key={s} className="relative flex-1">
            <input type="radio" name="status" className="peer sr-only" checked={value === s} onChange={() => choose(s)} />
            <span className="flex min-h-10 cursor-pointer items-center justify-center gap-2 rounded-full px-3 text-[15px] font-medium text-muted transition-colors peer-checked:bg-surface peer-checked:text-ink peer-checked:shadow-sm peer-focus-visible:outline-3 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-[var(--focus)]">
              <span aria-hidden="true" className={`size-2 rounded-full ${DOT[s]}`} />
              {t(`status.${s}`)}
            </span>
          </label>
        ))}
      </div>
      <p role="status" className={`mt-2 text-sm empty:mt-0 ${msg?.ok ? "text-live" : "text-danger"}`}>{msg ? t(msg.key) : ""}</p>
    </fieldset>
  );
}
