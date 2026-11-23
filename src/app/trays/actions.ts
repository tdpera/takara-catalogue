"use server";
/**
 * Selling a piece from a customer's tray. Records it as sold, found through the website tray,
 * at today's price (worked out here with the shop's rates, so it matches every screen).
 */
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireShop } from "@/lib/session";
import { soldValue } from "@/lib/sold";
import type { MessageKey } from "@/i18n";

export async function sellFromTray(trayId: string, pieceId: string): Promise<{ ok: true } | { error: MessageKey }> {
  if (!z.uuid().safeParse(trayId).success || !z.uuid().safeParse(pieceId).success) return { error: "common.error" };
  const { supabase } = await requireShop();
  const value = await soldValue(supabase, pieceId);
  const { error } = await supabase.rpc("set_piece_status", { p_piece: pieceId, p_status: "sold", p_sold_via: "tray", p_sold_value: value, p_tray: trayId });
  if (error) return { error: error.code === "42501" ? "common.notAllowed" : "common.error" };
  revalidatePath(`/trays/${trayId}`);
  revalidatePath("/trays");
  revalidatePath("/");
  revalidatePath(`/p/${pieceId}`);
  return { ok: true };
}
