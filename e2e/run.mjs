#!/usr/bin/env node
// Browser end-to-end suites, run against a production build with a stand-in for the Claude API.
//
//   pnpm db:start            once (local Supabase in Docker)
//   pnpm e2e --yes           build, start the app on :3000, run every suite
//   pnpm e2e --yes share     run one suite (capture, ai, catalogue, share, site)
//   pnpm e2e --yes --no-build
//
// WARNING: resets the LOCAL database before each suite (that's what --yes confirms).
import { spawn, spawnSync } from "node:child_process";
import { mkdirSync, writeFileSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..");
const tmp = join(here, ".tmp");
const args = process.argv.slice(2);
const ALL = ["capture", "ai", "catalogue", "share", "site"];
const suites = args.filter((a) => ALL.includes(a));

if (!args.includes("--yes")) {
  console.error("This resets your local Supabase database before each suite. Run `pnpm e2e --yes` to confirm.");
  process.exit(1);
}

rmSync(tmp, { recursive: true, force: true });
mkdirSync(join(tmp, "out"), { recursive: true });
writeFileSync(join(tmp, "scenario.txt"), "ok");
const env = {
  ...process.env,
  E2E_TMP: tmp,
  ANTHROPIC_BASE_URL: "http://127.0.0.1:4010",
  ANTHROPIC_API_KEY: "sk-ant-e2e-placeholder",
  PORT: "3000",
};

const run = (cmd, a, opts = {}) => {
  const r = spawnSync(cmd, a, { cwd: root, env, stdio: "inherit", ...opts });
  if (r.status !== 0) throw new Error(`${cmd} ${a.join(" ")} failed`);
};

if (!args.includes("--no-build")) run("pnpm", ["build"]);
const mock = spawn("node", [join(here, "mock-claude.cjs")], { cwd: root, env, stdio: "ignore" });
const app = spawn("pnpm", ["start"], { cwd: root, env, stdio: "ignore", detached: true });
const stop = () => {
  mock.kill();
  try {
    process.kill(-app.pid);
  } catch {}
};
process.on("exit", stop);
process.on("SIGINT", () => process.exit(130));

// Wait for the app.
for (let i = 0; ; i++) {
  try {
    const r = await fetch("http://localhost:3000/login");
    if (r.ok) break;
  } catch {}
  if (i > 60) throw new Error("The app didn't start on :3000 (is something else using the port?)");
  await new Promise((r) => setTimeout(r, 1000));
}

let pass = 0, fail = 0;
for (const s of suites.length ? suites : ALL) {
  console.log(`\n== ${s}`);
  run("pnpm", ["-s", "db:reset"], { stdio: "ignore" });
  const out = join(tmp, "out", s);
  mkdirSync(out, { recursive: true });
  const r = spawnSync("node", [join(here, `${s}.cjs`), join(here, "fixtures"), out], { cwd: root, env, encoding: "utf8", timeout: 15 * 60_000 });
  const text = (r.stdout ?? "") + (r.stderr ?? "");
  process.stdout.write(text);
  pass += (text.match(/^PASS /gm) ?? []).length;
  fail += (text.match(/^FAIL /gm) ?? []).length + (r.status === 0 ? 0 : 1);
}
console.log(`\n${pass} checks passed, ${fail} failed. Screenshots: e2e/.tmp/out/`);
process.exit(fail ? 1 : 0);
