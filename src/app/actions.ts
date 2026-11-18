"use server";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { LOCALE_COOKIE, isLocale } from "@/i18n";
import { supabaseServer } from "@/lib/supabase/server";
import { SHOP_COOKIE } from "@/lib/session";

const YEAR = 60 * 60 * 24 * 365;

export async function setLocale(locale: string) {
  if (!isLocale(locale)) return;
  (await cookies()).set(LOCALE_COOKIE, locale, { maxAge: YEAR, sameSite: "lax", path: "/" });
  const supabase = await supabaseServer();
  const { data } = await supabase.auth.getUser();
  if (data.user) await supabase.from("profiles").update({ ui_lang: locale }).eq("user_id", data.user.id);
  revalidatePath("/", "layout");
}

export async function setShop(shopId: string) {
  (await cookies()).set(SHOP_COOKIE, shopId, { maxAge: YEAR, sameSite: "lax", path: "/", httpOnly: true });
  revalidatePath("/", "layout");
}

export async function signOut() {
  const supabase = await supabaseServer();
  await supabase.auth.signOut();
  (await cookies()).delete(SHOP_COOKIE);
  redirect("/login");
}
