import "server-only";
/**
 * Is the database up to date with this version of the app? Checked once per server start (and
 * again on each request until it is). When a migration hasn't been run yet, the app shows which
 * update file to paste into the Supabase SQL Editor, instead of a generic error.
 */
import { createClient } from "@supabase/supabase-js";
import { SUPABASE_ANON_KEY, SUPABASE_URL } from "./supabase/env";

export const REQUIRED_SCHEMA = 2026112601;
/** Each file brings the database from where it is to the latest version (see scripts/build-setup-sql.mjs). */
export const UPDATE_FILES = {
  /** Before shop websites (setup.sql from before 24 Nov 2026). */
  all: "supabase/updates/update-websites-and-trays.sql",
  /** Websites, but not Digital trays (no schema_version yet). */
  fromWebsites: "supabase/updates/update-digital-trays.sql",
  /** Digital trays, but not shop approval. */
  latest: "supabase/updates/update-shop-approval.sql",
} as const;

export type SchemaState = { ok: true } | { ok: false; file: (typeof UPDATE_FILES)[keyof typeof UPDATE_FILES] };

let upToDate = false;

export async function schemaState(): Promise<SchemaState> {
  if (upToDate) return { ok: true };
  try {
    const db = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
    const { data, error } = await db.rpc("schema_version");
    if (!error && Number(data) >= REQUIRED_SCHEMA) {
      upToDate = true;
      return { ok: true };
    }
    // An older version number: only the latest update is missing.
    if (!error) return { ok: false, file: UPDATE_FILES.latest };
    // Any other problem (network, outage) isn't ours to explain here: let the page try.
    if (error.code !== "PGRST202" && error.code !== "42883") return { ok: true };
    // Was the websites update run? Visitors can't read shop_sites, so "permission denied" means
    // the table is there; "not found" means it isn't.
    const probe = await db.from("shop_sites").select("shop_id").limit(1);
    const websites = !probe.error || probe.error.code === "42501";
    return { ok: false, file: websites ? UPDATE_FILES.fromWebsites : UPDATE_FILES.all };
  } catch {
    return { ok: true };
  }
}
