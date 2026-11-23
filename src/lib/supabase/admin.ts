import "server-only";
/**
 * Service-role client. Used for exactly three things:
 * - Digital trays (share links) and shop websites, for visitors with no login: calling the
 *   functions only the server may call because they return making charges for pricing
 *   (get_share, create_tray_from_share, get_site, list_site_pieces, create_tray...), signing the
 *   images get_share returned, and reading the images site_media_bucket allows;
 * - loading the demo shop for the demo account (lib/demo.ts), which writes demo rows and files.
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

export function mediaSigner(bucket: "media" | "branding" = "media") {
  return {
    async sign(paths: string[], ttlS: number): Promise<Map<string, string>> {
      const list = [...new Set(paths.filter(Boolean))];
      if (list.length === 0) return new Map();
      const { data, error } = await client().storage.from(bucket).createSignedUrls(list, ttlS);
      if (error) throw error;
      return new Map((data ?? []).flatMap((d) => (d.path && d.signedUrl ? [[d.path, d.signedUrl] as const] : [])));
    },
  };
}

type SiteFn =
  | "get_site" | "list_site_pieces" | "get_site_piece" | "site_pieces" | "site_sitemap" | "site_media_bucket"
  | "create_tray" | "get_tray" | "record_site_view" | "get_share" | "create_tray_from_share";

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

/** The demo loader only (see lib/demo.ts). */
export function demoDb(): SupabaseClient {
  return client();
}
