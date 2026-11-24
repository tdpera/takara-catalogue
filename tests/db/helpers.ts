import { execSync } from "node:child_process";
import { randomInt } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

type LocalEnv = { url: string; anonKey: string; serviceKey: string };

let cached: LocalEnv | null = null;

/** Reads the local Supabase URL and keys, from env vars or `supabase status`. */
export function localEnv(): LocalEnv {
  if (cached) return cached;
  if (process.env.SUPABASE_TEST_URL && process.env.SUPABASE_TEST_ANON_KEY && process.env.SUPABASE_TEST_SERVICE_KEY) {
    cached = {
      url: process.env.SUPABASE_TEST_URL,
      anonKey: process.env.SUPABASE_TEST_ANON_KEY,
      serviceKey: process.env.SUPABASE_TEST_SERVICE_KEY,
    };
    return cached;
  }
  const out = execSync("npx supabase status -o env", { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
  const vars = Object.fromEntries(
    out
      .split("\n")
      .map((l) => l.match(/^([A-Z_]+)="?(.*?)"?$/))
      .filter((m): m is RegExpMatchArray => !!m)
      .map((m) => [m[1], m[2]]),
  );
  if (!vars.API_URL || !vars.ANON_KEY || !vars.SERVICE_ROLE_KEY) {
    throw new Error("Local Supabase is not running. Start it with `pnpm db:start`.");
  }
  cached = { url: vars.API_URL, anonKey: vars.ANON_KEY, serviceKey: vars.SERVICE_ROLE_KEY };
  return cached;
}

const noSession = { auth: { persistSession: false, autoRefreshToken: false } };

export function adminClient(): SupabaseClient {
  const e = localEnv();
  return createClient(e.url, e.serviceKey, noSession);
}

export function anonClient(): SupabaseClient {
  const e = localEnv();
  return createClient(e.url, e.anonKey, noSession);
}

/** A random UAE mobile number that won't clash with the fixed dev test numbers. */
export function randomPhone(): string {
  return "+9715" + String(randomInt(10_000_000, 99_999_999));
}

export type TestUser = { id: string; phone: string; db: SupabaseClient };

/**
 * Creates a confirmed phone user and returns a client signed in as them.
 * Tests sign in with a password so they don't depend on an SMS provider; the app itself uses OTP.
 */
export async function createUser(): Promise<TestUser> {
  const phone = randomPhone();
  const password = "test-" + randomInt(1e9, 9e9);
  const admin = adminClient();
  const { data, error } = await admin.auth.admin.createUser({ phone, password, phone_confirm: true });
  if (error || !data.user) throw error ?? new Error("createUser failed");
  const db = anonClient();
  const { error: signInError } = await db.auth.signInWithPassword({ phone, password });
  if (signInError) throw signInError;
  return { id: data.user.id, phone, db };
}

export async function deleteUsers(users: TestUser[]) {
  const admin = adminClient();
  await Promise.all(users.map((u) => admin.auth.admin.deleteUser(u.id)));
}

/** Throws if a Supabase call returned an error; returns its data. */
export function ok<T>(res: { data: T; error: unknown }): T {
  if (res.error) throw res.error;
  return res.data;
}

/**
 * Creates a shop as `u` (its owner) and approves it, as a Takara admin would: new shops start
 * waiting for approval and their staff can't use them until then.
 */
export async function createShop(u: TestUser, name: string): Promise<string> {
  const id = ok(await u.db.rpc("create_shop", { p_name: name })) as string;
  ok(await adminClient().from("shops").update({ status: "active" }).eq("id", id));
  return id;
}
