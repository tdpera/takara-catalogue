import "server-only";
/**
 * Service-role client, used for exactly one thing: signing image URLs for the public share
 * page, whose visitors have no login. What to sign comes from get_share(token), which only
 * returns files of pieces in a valid share. Never use this for reads or writes of data.
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { SUPABASE_URL } from "./env";

let admin: SupabaseClient | null = null;

export function mediaSigner() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) throw new Error("SUPABASE_SERVICE_ROLE_KEY is not set (needed for share links).");
  admin ??= createClient(SUPABASE_URL, key, { auth: { persistSession: false, autoRefreshToken: false } });
  return {
    async sign(paths: string[], ttlS: number): Promise<Map<string, string>> {
      const list = [...new Set(paths.filter(Boolean))];
      if (list.length === 0) return new Map();
      const { data, error } = await admin!.storage.from("media").createSignedUrls(list, ttlS);
      if (error) throw error;
      return new Map((data ?? []).flatMap((d) => (d.path && d.signedUrl ? [[d.path, d.signedUrl] as const] : [])));
    },
  };
}
