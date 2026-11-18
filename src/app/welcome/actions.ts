"use server";
import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { requireUser, SHOP_COOKIE } from "@/lib/session";
import { dbErrorKey } from "@/lib/db-errors";
import type { MessageKey } from "@/i18n";

export type FormState = { error?: MessageKey } | null;

export async function checkInvites() {
  const { supabase } = await requireUser();
  await supabase.rpc("accept_invites");
  redirect("/");
}

export async function createShop(_prev: FormState, form: FormData): Promise<FormState> {
  const name = String(form.get("name") ?? "").trim();
  const prefix = String(form.get("prefix") ?? "").trim().toUpperCase();
  if (!name || name.length > 80) return { error: "common.error" };
  if (prefix && !/^[A-Z0-9]{1,6}$/.test(prefix)) return { error: "welcome.invalidPrefix" };
  const { supabase } = await requireUser();
  const { data, error } = await supabase.rpc("create_shop", { p_name: name, p_sku_prefix: prefix || null });
  if (error) return { error: dbErrorKey(error) };
  (await cookies()).set(SHOP_COOKIE, data as string, { maxAge: 31536000, sameSite: "lax", path: "/", httpOnly: true });
  redirect("/");
}
