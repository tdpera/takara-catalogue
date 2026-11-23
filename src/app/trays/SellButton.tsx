"use client";
import { useState, useTransition } from "react";
import { useT } from "@/i18n/client";
import { btn } from "@/components/ui";
import { sellFromTray } from "./actions";

export function SellButton({ trayId, pieceId, name }: { trayId: string; pieceId: string; name: string }) {
  const { t } = useT();
  const [pending, start] = useTransition();
  const [failed, setFailed] = useState(false);
  return (
    <div className="text-end">
      <button
        type="button"
        className={btn + " min-h-10 px-3.5"}
        disabled={pending}
        aria-label={t("trays.markSoldNamed", { name })}
        onClick={() => start(async () => { const r = await sellFromTray(trayId, pieceId); setFailed("error" in r); })}
      >
        {pending ? t("common.loading") : t("trays.markSold")}
      </button>
      {failed && <p role="alert" className="mt-1 text-xs text-danger">{t("common.error")}</p>}
    </div>
  );
}
