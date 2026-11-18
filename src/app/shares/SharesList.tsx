"use client";
import { useState, useTransition } from "react";
import { useT } from "@/i18n/client";
import { formatDubaiDateTime } from "@/lib/format";
import { btn } from "@/components/ui";
import { revokeShare } from "@/app/share/actions";

export type ShareRow = {
  id: string;
  url: string;
  pieces: number;
  client: string | null;
  createdAt: string;
  expiresAt: string;
  state: "active" | "expired" | "revoked";
  views: number;
  lastView: string | null;
};

function Row({ r }: { r: ShareRow }) {
  const { t, locale } = useT();
  const [state, setState] = useState(r.state);
  const [copied, setCopied] = useState(false);
  const [pending, start] = useTransition();
  const when = (iso: string) => formatDubaiDateTime(iso, locale);
  const opened =
    r.views === 0 ? t("shares.notOpened") : r.views === 1 ? t("shares.openedOnce", { date: when(r.lastView!) }) : t("shares.opened", { count: r.views, date: when(r.lastView!) });
  return (
    <li className="space-y-2 rounded-2xl border border-line bg-surface p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="font-semibold">{r.client ?? t("shares.noClient")}</p>
        <p className="text-sm text-muted">{t("shares.pieces", { count: r.pieces })}</p>
      </div>
      <p className={`font-medium ${r.views > 0 ? "text-live" : "text-muted"}`}>
        <span aria-hidden="true">{r.views > 0 ? "● " : "○ "}</span>
        {opened}
      </p>
      <p className="text-sm text-muted">
        {t("shares.created", { date: when(r.createdAt) })} ·{" "}
        {state === "revoked" ? t("shares.revoked") : state === "expired" ? t("shares.expired") : t("shares.expires", { date: when(r.expiresAt) })}
      </p>
      {state === "active" && (
        <div className="flex flex-wrap gap-2 pt-1">
          <button
            type="button"
            className={btn}
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(r.url);
                setCopied(true);
                setTimeout(() => setCopied(false), 2000);
              } catch {}
            }}
          >
            {copied ? t("share.copied") : t("share.copy")}
          </button>
          <a href={r.url} target="_blank" rel="noopener noreferrer" className={btn}>{t("share.openLink")}</a>
          <button
            type="button"
            className={btn + " text-danger"}
            disabled={pending}
            onClick={() => {
              if (!window.confirm(t("shares.confirmRevoke"))) return;
              start(async () => {
                const res = await revokeShare(r.id);
                if (res.ok) setState("revoked");
              });
            }}
          >
            {t("shares.revoke")}
          </button>
        </div>
      )}
    </li>
  );
}

export function SharesList({ rows }: { rows: ShareRow[] }) {
  return (
    <ul className="space-y-3">
      {rows.map((r) => (
        <Row key={r.id} r={r} />
      ))}
    </ul>
  );
}
