// Types for demo-shop.mjs, so the app can import it.
import type { SupabaseClient } from "@supabase/supabase-js";

export const DEMO_SHOP_NAME: string;
export const RATE24: number;
export const RATES: Record<string, string>;
export const PIECES: { art: string; name: string; category: string; karat: number; gross_g: string; status?: string; spin?: boolean }[];
export function removeShopFiles(db: SupabaseClient, shopId: string): Promise<void>;
export function removeOldShop(db: SupabaseClient, name: string, ownerId: string): Promise<void>;
export function loadDemoShop(
  db: SupabaseClient,
  opts: { ownerId: string; ownerPhone: string; salesId?: string | null; log?: (line: string) => void },
): Promise<{ shopId: string; slug: string; token: string; trays: string[] }>;
