#!/usr/bin/env node
// Demo data: the demo shop (scripts/demo-shop.mjs), with its owner and salesperson.
//
//   pnpm seed                          local Supabase; owner 050 000 0001, salesperson 050 000 0002
//   pnpm seed --owner +971501234567    make that phone number the demo shop's owner
//   pnpm seed --remote                 required when the Supabase URL isn't local
//   pnpm seed --admin +971501234567    also make that number a Takara admin (the /admin dashboard)
// Locally the demo owner is a Takara admin too, and a second, quieter shop is added so the
// dashboard has more than one shop to compare.
//
// Running it again replaces the previous demo shop (same name and owner) and its files.
// Needs NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (read from .env.local).
import { readFileSync, existsSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { addPieces, DEMO_SHOP_NAME, loadDemoShop, PIECES, RATES, removeOldShop } from "./demo-shop.mjs";

// ------------------------------------------------------------------ settings

function loadEnv(file) {
  if (!existsSync(file)) return;
  for (const line of readFileSync(file, "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (m && !(m[1] in process.env)) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
}
loadEnv(".env.local");
loadEnv(".env");

const args = process.argv.slice(2);
const arg = (name) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};
const URL_ = process.env.NEXT_PUBLIC_SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const SITE = (process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000").replace(/\/$/, "");
if (!URL_ || !KEY) {
  console.error("Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (in .env.local). `pnpm db:start` prints both.");
  process.exit(1);
}
const local = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?/.test(URL_);
if (!local && !args.includes("--remote")) {
  console.error(`${URL_} is not a local Supabase. Add --remote if you really want demo data there.`);
  process.exit(1);
}
const E164 = /^\+[1-9]\d{7,14}$/;
const OWNER_PHONE = arg("--owner") || "+971500000001";
const SALES_PHONE = arg("--salesperson") || (arg("--owner") ? null : "+971500000002");
for (const p of [OWNER_PHONE, SALES_PHONE].filter(Boolean)) {
  if (!E164.test(p)) {
    console.error(`${p} isn't a phone number in international format, e.g. +971501234567.`);
    process.exit(1);
  }
}

const db = createClient(URL_, KEY, { auth: { persistSession: false, autoRefreshToken: false } });

const must = (res, what) => {
  if (res.error) {
    console.error(`Failed to ${what}:`, res.error.message);
    process.exit(1);
  }
  return res.data;
};

// ------------------------------------------------------------------ helpers

async function userFor(phone) {
  const bare = phone.replace(/^\+/, "");
  // listUsers has no phone filter; demo projects are small, so page through.
  for (let page = 1; page < 50; page++) {
    const { data, error } = await db.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw error;
    const hit = data.users.find((u) => u.phone === bare || u.phone === phone);
    if (hit) return hit.id;
    if (data.users.length < 200) break;
  }
  const res = must(await db.auth.admin.createUser({ phone, phone_confirm: true }), `create user ${phone}`);
  return res.user.id;
}

// ------------------------------------------------------------------ seed

const ownerId = await userFor(OWNER_PHONE);
const salesId = SALES_PHONE ? await userFor(SALES_PHONE) : null;

const demo = await loadDemoShop(db, { ownerId, ownerPhone: OWNER_PHONE, salesId, log: (l) => console.log(l) });

// Takara admins: the demo owner when local, and anyone given with --admin.
const ADMIN_PHONE = arg("--admin");
if (ADMIN_PHONE && !E164.test(ADMIN_PHONE)) {
  console.error(`${ADMIN_PHONE} isn't a phone number in international format, e.g. +971501234567.`);
  process.exit(1);
}
const admins = [...new Set([local ? ownerId : null, ADMIN_PHONE ? await userFor(ADMIN_PHONE) : null].filter(Boolean))];
if (admins.length) must(await db.from("platform_admins").upsert(admins.map((user_id) => ({ user_id }))), "add Takara admins");

// Locally, a second, quieter shop so the dashboard has something to compare: no website yet,
// rates not updated for 9 days, nothing added for almost two weeks.
const SECOND_NAME = "Gold Line Jewellery (demo)";
if (local) {
  const secondOwner = await userFor("+971500000003");
  await removeOldShop(db, SECOND_NAME, secondOwner);
  const second = must(
    await db.from("shops").insert({ name: SECOND_NAME, sku_prefix: "GLJ", default_making_per_g: 15, vat_enabled: true, created_by: secondOwner, status: "active", is_demo: true }).select("id").single(),
    "create second shop",
  );
  must(await db.from("shop_members").insert({ shop_id: second.id, user_id: secondOwner, role: "owner" }), "add second owner");
  must(await db.from("gold_rates").insert(Object.entries(RATES).map(([karat, aed]) => ({ shop_id: second.id, karat: Number(karat), aed_per_g: aed, set_by: secondOwner, set_at: new Date(Date.now() - 9 * 86400 * 1000).toISOString() }))), "set second rates");
  console.log(`\nSecond demo shop "${SECOND_NAME}":`);
  await addPieces(db, second.id, PIECES.filter((p) => ["chain", "baby-bangle", "bracelet", "pendant"].includes(p.art)).map((p) => ({ ...p, spin: false, status: undefined })), { owner: secondOwner, ageH: 80, log: (l) => console.log(l) });

  // And a shop that has just signed up, waiting for Takara's approval.
  const PENDING_NAME = "Pearl Souq Jewellers";
  const pendingOwner = await userFor("+971500000004");
  must(await db.from("profiles").update({ display_name: "Rashid" }).eq("user_id", pendingOwner), "name the waiting owner");
  await removeOldShop(db, PENDING_NAME, pendingOwner);
  const pending = must(
    await db.from("shops").insert({ name: PENDING_NAME, sku_prefix: "PSJ", created_by: pendingOwner, created_at: new Date(Date.now() - 3 * 3600 * 1000).toISOString() }).select("id").single(),
    "create waiting shop",
  );
  must(await db.from("shop_members").insert({ shop_id: pending.id, user_id: pendingOwner, role: "owner" }), "add waiting owner");
  console.log(`\nShop waiting for approval: "${PENDING_NAME}" (050 000 0004, code 123456)`);
}

console.log(`\nDemo shop "${DEMO_SHOP_NAME}" is ready: ${PIECES.length} pieces, today's rates (24K AED ${RATES[24]}), a client, a Digital tray sent to her, a website and 3 customer trays.`);
console.log(`Owner:       ${OWNER_PHONE}${local && OWNER_PHONE === "+971500000001" ? "  (sign in with 050 000 0001, code 123456)" : ""}`);
if (SALES_PHONE) console.log(`Salesperson: ${SALES_PHONE}${local && SALES_PHONE === "+971500000002" ? "  (050 000 0002, code 123456)" : ""}`);
console.log(`Sent tray:   ${SITE}/s/${demo.token}`);
console.log(`Website:     ${SITE}/site/${demo.slug}${local ? `  (or http://${demo.slug}.localhost:3000)` : ""}`);
console.log(`Trays:       ${demo.trays.join(", ")}`);
if (admins.length) console.log(`Takara dashboard: ${SITE}/admin`);
