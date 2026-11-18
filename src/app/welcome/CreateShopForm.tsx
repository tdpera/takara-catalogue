"use client";
import { useActionState } from "react";
import { useT } from "@/i18n/client";
import { btnPrimary, errorText, hint, input, label } from "@/components/ui";
import { createShop, type FormState } from "./actions";

export function CreateShopForm() {
  const { t } = useT();
  const [state, action, pending] = useActionState<FormState, FormData>(createShop, null);
  return (
    <form action={action} className="mt-3 space-y-4">
      <div>
        <label htmlFor="name" className={label}>{t("welcome.shopName")}</label>
        <input id="name" name="name" className={input} maxLength={80} required autoComplete="organization" />
      </div>
      <div>
        <label htmlFor="prefix" className={label}>{t("welcome.skuPrefix")}</label>
        <input
          id="prefix"
          name="prefix"
          dir="ltr"
          className={input + " uppercase text-start"}
          maxLength={6}
          pattern="[A-Za-z0-9]{1,6}"
          autoCapitalize="characters"
          aria-describedby="prefix-hint"
        />
        <p id="prefix-hint" className={hint}>{t("welcome.skuPrefixHint")}</p>
      </div>
      {state?.error && <p role="alert" className={errorText}>{t(state.error)}</p>}
      <button className={btnPrimary + " w-full"} disabled={pending}>{t("welcome.create")}</button>
    </form>
  );
}
