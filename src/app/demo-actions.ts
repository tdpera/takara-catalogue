"use server";
/**
 * "Load the demo shop", for the demo account only: builds (or rebuilds) the demo shop with its
 * pictures, rates, website, sent tray and customer trays, and opens it. Runs on the server with
 * the service role (lib/supabase/admin.ts), because it writes pictures and demo history that the
 * app's own screens don't create. Takes about 10-20 seconds.
 */
import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { requireUser, SHOP_COOKIE } from "@/lib/session";
import { isDemoPhone } from "@/lib/demo";
import { demoDb } from "@/lib/supabase/admin";
import { loadDemoShop } from "../../scripts/demo-shop.mjs";
import type { MessageKey } from "@/i18n";

export async function loadDemo(): Promise<{ ok: true } | { error: MessageKey }> {
  const { user } = await requireUser();
  if (!isDemoPhone(user.phone)) return { error: "common.notAllowed" };
  try {
    const r = await loadDemoShop(demoDb(), { ownerId: user.id, ownerPhone: "+" + (user.phone ?? "").replace(/\D/g, "") });
    (await cookies()).set(SHOP_COOKIE, r.shopId, { maxAge: 31536000, sameSite: "lax", path: "/", httpOnly: true });
  } catch (e) {
    console.error("[demo]", e instanceof Error ? e.message : e);
    return { error: "demo.failed" };
  }
  revalidatePath("/", "layout");
  return { ok: true };
}
