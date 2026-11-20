"use client";
import { useState, useTransition } from "react";
import { useT } from "@/i18n/client";
import { formatDubaiDateTime } from "@/lib/format";
import { btn } from "@/components/ui";
import { revokeShare } from "@/app/share/actions";
import { Avatar } from "@/components/Avatar";

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
    <li className="space-y-3 rounded-3xl bg-surface p-4 shadow-card ring-1 ring-line/70">
      <div className="flex items-center gap-3">
        <Avatar name={r.client} size={44} />
        <div className="me-auto min-w-0">
          <p className="truncate font-semibold">{r.client ?? t("shares.noClient")}</p>
          <p className="text-sm text-muted">{t("shares.pieces", { count: r.pieces })}</p>
        </div>
      </div>
      <p className={`flex w-fit items-center gap-2 rounded-[2px] px-2.5 py-1 text-sm font-medium ${r.views > 0 ? "bg-live/10 text-live" : "bg-raised text-muted"}`}>
        <span aria-hidden="true" className={`size-2.5 shrink-0 rounded-full ${r.views > 0 ? "bg-live shadow-[0_0_0_3px] shadow-live/20" : "border-2 border-muted"}`} />
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
