"use client";
import { useState, useTransition } from "react";
import { useT } from "@/i18n/client";
import type { MessageKey } from "@/i18n";
import { setOnWebsite } from "@/app/website/actions";
import { IconGlobe } from "@/components/icons";

/** Whether this piece is in the website's showcase (owners and managers can change it; at most 12). */
export function WebsiteToggle({ pieceId, on, canChange, url }: { pieceId: string; on: boolean; canChange: boolean; url: string | null }) {
  const { t } = useT();
  const [value, setValue] = useState(on);
  const [failed, setFailed] = useState<MessageKey | null>(null);
  const [pending, start] = useTransition();
  return (
    <div className="space-y-2">
      <label className={`flex items-center gap-3 ${canChange ? "cursor-pointer" : ""}`}>
        <IconGlobe size={20} className="text-muted" />
        <span className="flex-1">
          <span className="block font-semibold">{t("website.onWebsite")}</span>
          <span className="block text-sm text-muted">{t(value ? "website.onWebsiteYes" : "website.onWebsiteNo")}</span>
        </span>
        {canChange && (
          <input
            type="checkbox"
            role="switch"
            checked={value}
            disabled={pending}
            aria-label={t("website.onWebsite")}
            onChange={(e) => {
              const next = e.target.checked;
              setValue(next);
              setFailed(null);
              start(async () => {
                const r = await setOnWebsite([pieceId], next);
                if ("error" in r) { setValue(!next); setFailed(r.error); }
              });
            }}
            className="size-5 accent-[var(--ink)]"
          />
        )}
      </label>
      {url && value && <a href={url} target="_blank" rel="noopener" className="inline-flex min-h-11 items-center text-sm font-semibold text-gold hover:underline">{t("website.viewOnWebsite")}</a>}
      {failed && <p role="alert" className="text-sm text-danger">{t(failed)}</p>}
    </div>
  );
}
