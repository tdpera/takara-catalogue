import "server-only";
import { cache } from "react";
import { supabaseServer } from "./supabase/server";
import { toRateMap, type Rate, type RateMap } from "./pricing";

export type ShopPricing = { rates: RateMap; vatEnabled: boolean; defaultMakingPerG: number };

/** Current rates and pricing settings for a shop, read once per request (RLS applies). */
export const getShopPricing = cache(async (shopId: string): Promise<ShopPricing> => {
  const supabase = await supabaseServer();
  const [rates, shop] = await Promise.all([
    supabase.from("current_gold_rates").select("karat, aed_per_g, set_at").eq("shop_id", shopId).returns<Rate[]>(),
    supabase.from("shops").select("vat_enabled, default_making_per_g").eq("id", shopId).single<{ vat_enabled: boolean; default_making_per_g: number }>(),
  ]);
  if (rates.error) throw rates.error;
  if (shop.error) throw shop.error;
  return { rates: toRateMap(rates.data), vatEnabled: shop.data.vat_enabled, defaultMakingPerG: shop.data.default_making_per_g };
});
