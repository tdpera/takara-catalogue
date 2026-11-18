#!/usr/bin/env node
// Joins supabase/migrations/*.sql (in order) into supabase/setup.sql: one file to paste into the
// Supabase dashboard's SQL Editor when setting up a hosted project without the CLI.
// Run after changing a migration:  pnpm db:setup-sql
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const dir = "supabase/migrations";
const files = readdirSync(dir).filter((f) => f.endsWith(".sql")).sort();
const parts = files.map((f) => `-- ============================================================ ${f}\n\n${readFileSync(join(dir, f), "utf8").trim()}\n`);
const header = `-- Takara: full database setup for a NEW, empty Supabase project.
-- Generated from supabase/migrations by \`pnpm db:setup-sql\`; don't edit by hand.
--
-- How to use: Supabase dashboard -> SQL Editor -> New query -> paste this whole file -> Run.
-- Run it once only. It is all-or-nothing: if anything fails, nothing is changed.
-- For later changes, prefer \`supabase db push\` (see README, "Deploy").
-- Migrations included: ${files.join(", ")}
`;
// One transaction, so a failure part-way leaves the project untouched.
writeFileSync("supabase/setup.sql", [header, "begin;\n", ...parts, "commit;\n"].join("\n"));
console.log(`supabase/setup.sql: ${files.length} migrations`);
