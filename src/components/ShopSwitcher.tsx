"use client";
import { useTransition } from "react";
import { useT } from "@/i18n/client";
import { setShop } from "@/app/actions";

export function ShopSwitcher({ shops, current }: { shops: { id: string; name: string }[]; current: string }) {
  const { t } = useT();
  const [pending, start] = useTransition();
  return (
    <select
      aria-label={t("nav.shop")}
      className="wordmark min-h-11 w-full max-w-64 cursor-pointer truncate rounded-[2px] border-0 bg-transparent px-2 text-center font-display text-[15px] font-medium [text-align-last:center] hover:bg-raised"
      value={current}
      disabled={pending}
      onChange={(e) => start(() => setShop(e.target.value))}
    >
      {shops.map((s) => (
        <option key={s.id} value={s.id}>{s.name}</option>
      ))}
    </select>
  );
}
