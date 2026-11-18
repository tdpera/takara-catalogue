"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { requireShop, SHOP_COOKIE, type Role } from "@/lib/session";
import { dbErrorKey } from "@/lib/db-errors";
import { toE164 } from "@/lib/phone";
import type { MessageKey } from "@/i18n";

export type ActionResult = { error?: MessageKey; ok?: boolean } | null;
const ROLES: Role[] = ["owner", "manager", "salesperson"];

export async function inviteMember(_prev: ActionResult, form: FormData): Promise<ActionResult> {
  const phone = toE164(String(form.get("phone") ?? ""));
  const role = String(form.get("role")) as Role;
  if (!phone) return { error: "login.invalidPhone" };
  if (!ROLES.includes(role)) return { error: "common.error" };
  const { supabase, current } = await requireShop();
  const { error } = await supabase.rpc("invite_member", { p_shop: current.shop_id, p_phone: phone, p_role: role });
  if (error) return { error: dbErrorKey(error) };
  revalidatePath("/team");
  return { ok: true };
}

export async function cancelInvite(inviteId: string): Promise<ActionResult> {
  const { supabase } = await requireShop();
  const { error } = await supabase.rpc("cancel_invite", { p_invite: inviteId });
  if (error) return { error: dbErrorKey(error) };
  revalidatePath("/team");
  return { ok: true };
}

export async function setRole(userId: string, role: Role): Promise<ActionResult> {
  if (!ROLES.includes(role)) return { error: "common.error" };
  const { supabase, current } = await requireShop();
  const { error } = await supabase.rpc("set_member_role", { p_shop: current.shop_id, p_user: userId, p_role: role });
  if (error) return { error: dbErrorKey(error) };
  revalidatePath("/team");
  return { ok: true };
}

export async function removeMember(userId: string): Promise<ActionResult> {
  const { supabase, user, current } = await requireShop();
  const { error } = await supabase.rpc("remove_member", { p_shop: current.shop_id, p_user: userId });
  if (error) return { error: dbErrorKey(error) };
  if (userId === user.id) {
    (await cookies()).delete(SHOP_COOKIE);
    redirect("/");
  }
  revalidatePath("/team");
  return { ok: true };
}

export async function updateMyName(_prev: ActionResult, form: FormData): Promise<ActionResult> {
  const name = String(form.get("name") ?? "").trim().slice(0, 40);
  const { supabase, user } = await requireShop();
  const { error } = await supabase.from("profiles").update({ display_name: name || null }).eq("user_id", user.id);
  if (error) return { error: dbErrorKey(error) };
  revalidatePath("/team");
  return { ok: true };
}
