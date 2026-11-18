"use server";
import { revalidatePath } from "next/cache";
import { requireShop } from "@/lib/session";
import { checkRateSet, type RateFieldError } from "@/lib/rates";
import { KARATS, toDec, type Karat } from "@/lib/pricing";
import { dbErrorKey } from "@/lib/db-errors";
import type { MessageKey } from "@/i18n";

export type SaveRatesResult = { ok: true } | { error: MessageKey } | { fieldErrors: Partial<Record<Karat, RateFieldError>> };

/** Saves a new set of rates. Every value is re-checked here; the browser's checks are only for speed. */
export async function saveRates(input: Partial<Record<Karat, string>>): Promise<SaveRatesResult> {
  const { supabase, user, current, isAdmin } = await requireShop();
  if (!isAdmin) return { error: "common.notAllowed" };
  const clean: Partial<Record<Karat, string>> = {};
  for (const k of KARATS) if (typeof input?.[k] === "string") clean[k] = input[k];
  const check = checkRateSet(clean);
  if (!check.ok) return check.empty ? { error: "rates.errEmpty" } : { fieldErrors: check.errors };

  const rows = KARATS.filter((k) => check.values[k]).map((k) => ({
    shop_id: current.shop_id,
    karat: k,
    aed_per_g: check.values[k]!.toString(),
    set_by: user.id,
  }));
  const { error } = await supabase.from("gold_rates").insert(rows);
  if (error) return { error: dbErrorKey(error) };
  revalidatePath("/", "layout");
  return { ok: true };
}

export type SettingsResult = { ok?: boolean; error?: MessageKey } | null;

export async function saveSettings(_prev: SettingsResult, form: FormData): Promise<SettingsResult> {
  const { supabase, current, isAdmin } = await requireShop();
  if (!isAdmin) return { error: "common.notAllowed" };
  const raw = String(form.get("making") ?? "").trim();
  const making = raw === "" ? toDec("0") : toDec(raw);
  if (!making || making.isneg() || making.gte(100000) || making.dp() > 4) return { error: "price.errAmount" };
  const { error } = await supabase
    .from("shops")
    .update({ default_making_per_g: making.toString(), vat_enabled: form.get("vat") === "on" })
    .eq("id", current.shop_id);
  if (error) return { error: dbErrorKey(error) };
  revalidatePath("/", "layout");
  return { ok: true };
}
