"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useT } from "@/i18n/client";
import type { MessageKey } from "@/i18n";
import { btnGold } from "./ui";
import { loadDemo } from "@/app/demo-actions";

/** For the demo account: builds the demo shop, then opens its catalogue. */
export function DemoButton({ label = "demo.load" }: { label?: MessageKey }) {
  const { t } = useT();
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<MessageKey | null>(null);
  return (
    <div className="space-y-2">
      <button
        type="button"
        disabled={pending}
        className={btnGold + " w-full min-h-12"}
        onClick={() =>
          start(async () => {
            setError(null);
            const r = await loadDemo();
            if ("error" in r) return setError(r.error);
            router.push("/");
            router.refresh();
          })
        }
      >
        {pending ? t("demo.loading") : t(label)}
      </button>
      <p role="status" className="text-sm text-muted">{pending ? t("demo.loadingHint") : ""}</p>
      {error && <p role="alert" className="text-sm font-medium text-danger">{t(error)}</p>}
    </div>
  );
}
