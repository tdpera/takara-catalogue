import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { supabaseServer } from "./supabase/server";

export type Role = "owner" | "manager" | "salesperson";
export type Membership = { shop_id: string; role: Role; shop: { id: string; name: string; sku_prefix: string } };
export const SHOP_COOKIE = "shop";

/** Signed-in user or redirect to /login. Cached per request. */
export const requireUser = cache(async () => {
  const supabase = await supabaseServer();
  const { data } = await supabase.auth.getUser();
  if (!data.user) redirect("/login");
  return { supabase, user: data.user };
});

export const getMemberships = cache(async () => {
  const { supabase, user } = await requireUser();
  const { data, error } = await supabase
    .from("shop_members")
    .select("shop_id, role, shop:shops!inner(id, name, sku_prefix)")
    .eq("user_id", user.id)
    .order("created_at");
  if (error) throw error;
  return (data ?? []) as unknown as Membership[];
});

/** The shop the user is working in (cookie), falling back to their first shop. Redirects to /welcome if none. */
export const requireShop = cache(async () => {
  const { supabase, user } = await requireUser();
  const memberships = await getMemberships();
  if (memberships.length === 0) redirect("/welcome");
  const wanted = (await cookies()).get(SHOP_COOKIE)?.value;
  const current = memberships.find((m) => m.shop_id === wanted) ?? memberships[0];
  return { supabase, user, memberships, current, isAdmin: current.role !== "salesperson" };
});
