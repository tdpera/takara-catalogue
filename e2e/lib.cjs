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
