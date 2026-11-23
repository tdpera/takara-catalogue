"use client";
import { useRef, useState, useTransition } from "react";
import { useT } from "@/i18n/client";
import type { MessageKey } from "@/i18n";
import { STATUSES, type Status } from "@/lib/catalogue-filters";
import { setSoldVia, setStatus } from "@/app/p/[id]/actions";

const DOT: Record<Status, string> = { in_stock: "bg-live", reserved: "bg-warn", sold: "bg-muted" };
const VIA = ["walk_in", "website", "tray", "whatsapp_link", "returning_client"] as const;
type Via = (typeof VIA)[number];

/**
 * In stock / reserved / sold. Any member of the shop can change it. Once sold, one tap answers
 * "How did they find it?" (walk-in, website, tray, WhatsApp link, returning client), which feeds
 * the monthly report. A likely answer is marked (the piece was in a recent tray or share link).
 */
export function StatusControl({ pieceId, status, soldVia = null, suggestion = null }: { pieceId: string; status: Status; soldVia?: Via | null; suggestion?: Via | null }) {
  const { t } = useT();
  const [value, setValue] = useState<Status>(status);
  const [via, setVia] = useState<Via | null>(soldVia);
  const [msg, setMsg] = useState<{ key: MessageKey; ok: boolean } | null>(null);
  const [pending, start] = useTransition();
  // A tap on "How did they find it?" right after "Sold" waits for the sale to be saved first.
  const saving = useRef<Promise<unknown>>(Promise.resolve());

  function choose(next: Status) {
    if (next === value || pending) return;
    const before = value;
    setValue(next);
    setMsg(null);
    if (next !== "sold") setVia(null);
    start(async () => {
      const call = setStatus(pieceId, next);
      saving.current = call;
      const r = await call;
      if (r.ok) setMsg({ key: next === "sold" ? "sold.askHow" : "piece.statusSaved", ok: true });
      else {
        setValue(before);
        setMsg({ key: "piece.statusFailed", ok: false });
      }
    });
  }

  function chooseVia(next: Via) {
    const before = via;
    const target = next === via ? null : next;
    setVia(target);
    start(async () => {
      await saving.current;
      const r = await setSoldVia(pieceId, target);
      if (r.ok) setMsg({ key: "piece.statusSaved", ok: true });
      else {
        setVia(before);
        setMsg({ key: "piece.statusFailed", ok: false });
      }
    });
  }

  return (
    <div aria-busy={pending}>
      <fieldset>
        <legend className="eyebrow mb-3">{t("piece.status")}</legend>
        <div className="flex gap-0.5 rounded-[2px] border border-line p-0.5">
          {STATUSES.map((s) => (
            <label key={s} className="relative flex-1">
              <input type="radio" name="status" className="peer sr-only" checked={value === s} onChange={() => choose(s)} />
              <span className="flex min-h-10 cursor-pointer items-center justify-center gap-2 rounded-[1px] px-3 text-[14px] font-medium text-muted transition-colors duration-200 hover:text-ink peer-checked:bg-ink peer-checked:text-paper peer-focus-visible:outline-3 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-[var(--focus)]">
                <span aria-hidden="true" className={`size-2 rounded-full ${DOT[s]}`} />
                {t(`status.${s}`)}
              </span>
            </label>
          ))}
        </div>
      </fieldset>
      {value === "sold" && (
        <fieldset className="pop-in mt-4">
          <legend className="mb-2 text-sm font-semibold">{t("sold.how")}</legend>
          <div className="flex flex-wrap gap-2">
            {VIA.map((v) => (
              <label key={v} className="relative">
                <input type="checkbox" className="peer sr-only" checked={via === v} onChange={() => chooseVia(v)} />
                <span className="inline-flex min-h-10 cursor-pointer items-center gap-1.5 rounded-[2px] border border-line bg-surface px-3 text-[14px] font-medium transition-colors hover:border-ink/40 peer-checked:border-ink peer-checked:bg-ink peer-checked:text-paper peer-focus-visible:outline-3 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-[var(--focus)]">
                  {t(`sold.via_${v}`)}
                  {suggestion === v && via !== v && <span className="caps text-[9px] font-bold text-gold">{t("sold.likely")}</span>}
                </span>
              </label>
            ))}
          </div>
        </fieldset>
      )}
      <p role="status" className={`mt-2 text-sm empty:mt-0 ${msg?.ok ? "text-live" : "text-danger"}`}>{msg ? t(msg.key) : ""}</p>
    </div>
  );
}
