// Shared helpers for the browser suites.
const { execFileSync } = require('child_process');
const path = require('path');

const DB_CONTAINER = process.env.E2E_DB_CONTAINER || 'supabase_db_souq-catalogue';
const TMP = process.env.E2E_TMP || path.join(__dirname, '.tmp');

/** Runs SQL in the local Supabase database (through Docker, so psql needn't be installed). */
function sql(q) {
  return execFileSync('docker', ['exec', DB_CONTAINER, 'psql', '-U', 'postgres', '-tA', '-c', q], { encoding: 'utf8' }).trim();
}

module.exports = { sql, TMP };

/** True once the locator is visible (pages stream in after a loading skeleton). */
async function visible(locator, timeout = 10000) {
  return locator.first().waitFor({ state: 'visible', timeout }).then(() => true, () => false);
}

/** True once fn() returns true, polling (for counts and states that settle after loading). */
async function until(fn, timeout = 10000) {
  const end = Date.now() + timeout;
  for (;;) {
    try { if (await fn()) return true; } catch {}
    if (Date.now() > end) return false;
    await new Promise((r) => setTimeout(r, 150));
  }
}

module.exports.visible = visible;
module.exports.until = until;
