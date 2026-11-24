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

/**
 * Signs up a new shop from the welcome form. New shops wait for Takara's approval: checks the
 * waiting screen, approves the shop in the database (as a Takara admin would) and opens the app.
 */
async function createShop(p, name, base = 'http://localhost:3000') {
  await p.getByLabel('Shop name').fill(name);
  await p.getByRole('button', { name: 'Create shop' }).click();
  await p.getByRole('heading', { name: `${name} is waiting for approval` }).waitFor({ timeout: 15000 });
  sql(`update shops set status = 'active' where name = '${name.replace(/'/g, "''")}' and status = 'pending'`);
  await p.getByRole('button', { name: 'Check again' }).click();
  await p.waitForURL(base + '/');
}

/** Reads the QR code in a PNG (in a blank page, with jsQR). Returns its text, or null. */
async function readQr(browser, file) {
  const page = await browser.newPage();
  await page.addScriptTag({ path: require.resolve('jsqr/dist/jsQR.js') });
  const src = 'data:image/png;base64,' + require('fs').readFileSync(file).toString('base64');
  const text = await page.evaluate(async (src) => {
    const img = new Image(); img.src = src; await img.decode();
    const c = document.createElement('canvas'); c.width = img.width; c.height = img.height;
    const x = c.getContext('2d'); x.drawImage(img, 0, 0);
    const d = x.getImageData(0, 0, c.width, c.height);
    return (window.jsQR(d.data, d.width, d.height) || {}).data || null;
  }, src);
  await page.close();
  return text;
}

module.exports.createShop = createShop;
module.exports.readQr = readQr;
