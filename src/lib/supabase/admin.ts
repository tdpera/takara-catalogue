import "server-only";
/**
 * Service-role client. Used for exactly two things, both for visitors with no login:
 * - signing image URLs for the public share page (what to sign comes from get_share(token));
 * - shop websites: calling the website functions (get_site, list_site_pieces, create_tray...),
 *   which only the service role may call because they return making charges for pricing, and
 *   reading the images those functions allow (site_media_bucket).
 * Never use this for anything else.
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { SUPABASE_URL } from "./env";

let admin: SupabaseClient | null = null;

function client(): SupabaseClient {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) throw new Error("SUPABASE_SERVICE_ROLE_KEY is not set (needed for share links and shop websites).");
  admin ??= createClient(SUPABASE_URL, key, { auth: { persistSession: false, autoRefreshToken: false } });
  return admin;
}

export function mediaSigner() {
  return {
    async sign(paths: string[], ttlS: number): Promise<Map<string, string>> {
      const list = [...new Set(paths.filter(Boolean))];
      if (list.length === 0) return new Map();
      const { data, error } = await client().storage.from("media").createSignedUrls(list, ttlS);
      if (error) throw error;
      return new Map((data ?? []).flatMap((d) => (d.path && d.signedUrl ? [[d.path, d.signedUrl] as const] : [])));
    },
  };
}

type SiteFn = "get_site" | "list_site_pieces" | "get_site_piece" | "site_pieces" | "site_sitemap" | "site_media_bucket" | "create_tray" | "get_tray" | "record_site_view";

/** Website functions and the files they allow. Server only (see above). */
export function siteDb() {
  return {
    async rpc<T>(fn: SiteFn, args: Record<string, unknown>): Promise<T | null> {
      const { data, error } = await client().rpc(fn, args);
      if (error) throw error;
      return (data as T | null) ?? null;
    },
    async download(bucket: "media" | "branding", path: string): Promise<Blob | null> {
      const { data, error } = await client().storage.from(bucket).download(path);
      if (error) return null;
      return data;
    },
  };
}
