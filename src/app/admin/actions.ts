"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireUser } from "@/lib/session";

const input = z.object({ shop: z.uuid(), status: z.enum(["active", "suspended"]) });

/**
 * Approve or decline a new shop, suspend or reactivate one. The database checks that the caller
 * is a Takara admin and logs the change; nothing is sent to the shop (contact them on WhatsApp).
 */
export async function setShopStatus(form: FormData): Promise<void> {
  const parsed = input.safeParse({ shop: form.get("shop"), status: form.get("status") });
  if (!parsed.success) return;
  const { supabase } = await requireUser();
  const { error } = await supabase.rpc("admin_set_shop_status", { p_shop: parsed.data.shop, p_status: parsed.data.status });
  if (error) throw error;
  revalidatePath("/admin");
  revalidatePath(`/admin/shops/${parsed.data.shop}`);
}
