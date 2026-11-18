"use client";
import { useEffect, useState } from "react";
import { useT } from "@/i18n/client";
import type { MessageKey } from "@/i18n";
import type { OutboxPiece } from "@/lib/outbox/db";
import { allPieces, discard, itemState, retryNow, startQueue, subscribe, uploadVideoNow, type QueueItemState } from "@/lib/outbox/queue";
import { btn, btnLink } from "./ui";

/** Header chip showing what's still uploading; opens a list with retry controls. */
export function QueueStatus({ userId }: { userId: string }) {
  const { t } = useT();
  const [items, setItems] = useState<OutboxPiece[]>([]);
  const [online, setOnline] = useState(true);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    startQueue(userId);
    const refresh = () => void allPieces().then((all) => setItems(all.filter((p) => p.userId === userId)));
    refresh();
    setOnline(navigator.onLine);
    const on = () => setOnline(navigator.onLine);
    window.addEventListener("online", on);
    window.addEventListener("offline", on);
    const unsub = subscribe(refresh);
    const tick = setInterval(refresh, 5000); // retry countdowns and Wi-Fi changes
    return () => {
      unsub();
      clearInterval(tick);
      window.removeEventListener("online", on);
      window.removeEventListener("offline", on);
    };
  }, [userId]);

  if (items.length === 0) return null;
  const states = items.map((p) => itemState(p, online));
  const n = (s: QueueItemState[]) => states.filter((x) => s.includes(x)).length;
  const problem = n(["needs_sign_in", "rejected"]);
  const active = n(["saving", "uploading", "retrying"]);
  const label = problem
    ? t("queue.problem", { count: problem })
    : !online
      ? t("queue.offline", { count: items.length })
      : active
        ? t("queue.uploading", { count: active })
        : t("queue.waitingWifi", { count: n(["waiting_wifi"]) });
  const tone = problem ? "border-danger text-danger" : !online || !active ? "border-warn text-warn" : "border-line text-ink";

  return (
    <div className="relative">
      <button
        type="button"
        aria-expanded={open}
        aria-controls="queue-panel"
        onClick={() => setOpen((o) => !o)}
        className={`inline-flex min-h-10 items-center gap-2 rounded-full border bg-surface px-3 text-[13px] font-medium ${tone}`}
      >
        {active > 0 && online && !problem && <span aria-hidden="true" className="inline-block size-2 animate-pulse rounded-full bg-gold" />}
        <span role="status">{label}</span>
      </button>
      {open && (
        <div id="queue-panel" className="fixed inset-x-4 top-16 z-40 max-h-[70vh] overflow-y-auto rounded-3xl border border-line bg-surface p-4 shadow-lift sm:absolute sm:inset-x-auto sm:end-0 sm:top-full sm:mt-2 sm:w-[22rem]">
          <p className="mb-2 font-semibold">{t("queue.title")}</p>
          <ul className="divide-y divide-line">
            {items.map((p, i) => {
              const s = states[i];
              return (
                <li key={p.id} className="space-y-1 py-2">
                  <p className="font-medium">
                    {p.fields.name || `${p.fields.karat}K ${t(`categories.${p.fields.category}` as MessageKey)}`}
                    <span dir="ltr" className="num ms-2 text-sm font-normal text-muted">{p.fields.gross_g} g</span>
                  </p>
                  <p className={"text-sm " + (s === "rejected" || s === "needs_sign_in" ? "text-danger" : "text-muted")}>
                    {t(`queue.state_${s}` as MessageKey)}
                    {p.sku && <span dir="ltr" className="num ms-2">{p.sku}</span>}
                  </p>
                  <div className="flex flex-wrap gap-x-4">
                    {(s === "retrying" || s === "needs_sign_in") && (
                      <button type="button" className={btnLink} onClick={() => void retryNow(p.id)}>{t("queue.retry")}</button>
                    )}
                    {s === "waiting_wifi" && (
                      <button type="button" className={btnLink} onClick={() => void uploadVideoNow(p.id)}>{t("queue.uploadVideoNow")}</button>
                    )}
                    {s === "rejected" && (
                      <button type="button" className={btnLink} onClick={() => window.confirm(t("queue.confirmDiscard")) && void discard(p.id)}>
                        {t("queue.discard")}
                      </button>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
          <button type="button" className={btn + " mt-2 w-full"} onClick={() => setOpen(false)}>{t("common.back")}</button>
        </div>
      )}
    </div>
  );
}
