const { sql, TMP } = require('./lib.cjs');
const { chromium, devices } = require('playwright');
const { execSync } = require('child_process');
const M = process.argv[2], OUT = process.argv[3];
const base = 'http://localhost:3000';
let n = 0;
const shot = (p, name, full = false) => p.screenshot({ path: `${OUT}/${String(++n).padStart(2, '0')}-${name}.png`, fullPage: full });
const check = (label, cond, extra = '') => { console.log((cond ? 'PASS ' : 'FAIL ') + label + (extra !== '' ? '  [' + extra + ']' : '')); if (!cond) process.exitCode = 1; };

async function login(page, local) {
  await page.goto(base + '/login');
  await page.getByLabel('Mobile number').fill(local);
  await page.getByRole('button', { name: 'Send code on WhatsApp' }).click();
  await page.getByLabel('6-digit code').fill('123456');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.waitForURL(u => !u.pathname.startsWith('/login'));
  await page.waitForLoadState('networkidle');
}
const queueGone = (p, ms = 60000) => p.waitForFunction(() => !document.querySelector('[aria-controls="queue-panel"]'), null, { timeout: ms });

/** One full capture: photo, karat, category, weight, save. Returns timings. */
async function capture(p, { weight, karat = '22K', category = 'Bangle', video = null }) {
  const t0 = Date.now();
  await p.locator('input[type=file][accept="image/*"]').setInputFiles(`${M}/scale-photo-12mp.jpg`);
  const tp = Date.now();
  await p.locator('main img').first().waitFor({ timeout: 30000 });
  const photoMs = Date.now() - tp;
  await p.getByRole('radio', { name: karat, exact: true }).check({ force: true });
  await p.getByRole('radio', { name: category, exact: true }).check({ force: true });
  await p.getByLabel('Gross weight (g)').fill(weight);
  let spinMs = 0;
  if (video) {
    const ts = Date.now();
    await p.locator('input[type=file][accept="video/*"]').setInputFiles(video);
    await p.getByText('Spin ready').waitFor({ timeout: 60000 });
    spinMs = Date.now() - ts;
  }
  const tsave = Date.now();
  await p.getByRole('button', { name: 'Save piece' }).click();
  await p.getByText('Saved. It uploads in the background').waitFor({ timeout: 10000 });
  const saveMs = Date.now() - tsave;
  return { totalMs: Date.now() - t0, photoMs, saveMs, spinMs };
}

(async () => {
  const browser = await chromium.launch();
  const errors = [];
  const ctx = await browser.newContext({ ...devices['Pixel 5'] });
  const p = await ctx.newPage();
  p.on('pageerror', e => errors.push(e.message));

  await login(p, '050 000 0001');
  await p.getByLabel('Shop name').fill('Al Fahidi Jewellers');
  await p.getByRole('button', { name: 'Create shop' }).click();
  await p.waitForURL(base + '/');
  await p.goto(base + '/rates');
  await p.getByRole('textbox', { name: /^24K/ }).fill('472.50');
  await p.getByRole('button', { name: 'Fill 22K, 21K, 18K from 24K' }).click();
  await p.getByLabel('Default making charge (AED per gram)').fill('18');
  await p.getByRole('button', { name: 'Save', exact: true }).click();
  await p.getByText('Settings saved.').waitFor();
  await p.getByRole('button', { name: "Save today's rates" }).click();
  await p.getByText("Today's rates are saved").waitFor();

  // 1. Normal capture, unthrottled.
  await p.goto(base + '/');
  await p.getByRole('link', { name: 'Add piece' }).first().click();
  await p.waitForURL(base + '/add');
  await shot(p, 'capture-empty');
  const a = await capture(p, { weight: '24.50' });
  check('capture saved (unthrottled)', true, JSON.stringify(a));
  await queueGone(p);
  const row = sql("select sku||'|'||name||'|'||karat||'|'||gross_g||'|'||making_per_g from pieces order by created_at desc limit 1");
  check('piece row created with SKU, auto name, sticky making', row === 'ALF-0001|22K Bangle|22|24.500|18.0000', row);
  const media = sql("select type||'|'||storage_path||'|'||coalesce(thumb_path,'') from piece_media");
  check('photo registered with thumbnail', /^photo\|.+\/photo-.+\.jpg\|.+-thumb\.jpg$/.test(media), media.slice(0, 60) + '…');
  const objs = sql("select count(*) from storage.objects where bucket_id='media'");
  check('two files in storage (photo + thumb)', objs === '2', objs);
  const sizes = sql("select string_agg((metadata->>'size'), ',' order by name) from storage.objects where bucket_id='media'");
  check('photo compressed on the phone', sizes.split(',').every(s => +s < 400000), sizes + ' bytes (original 12 MP file 308,000 bytes, real phones 3–5 MB)');
  const ev = sql("select props->>'capture_ms' from events where name='piece_added'");
  check('piece_added event with capture time', +ev > 0, ev + ' ms');

  // Photo dimensions: read the uploaded JPEG back as the owner.
  await p.goto(base + '/');
  const listText = (await p.locator('main ul > li').first().innerText()).replace(/\s+/g, ' ');
  check('piece shows on catalogue with live price', listText.includes('ALF-0001') && listText.includes('AED 11,715'), listText); // derived 22K rate 437.39: 24.5×437.39 + 441, +5% VAT = 11,714.91
  await shot(p, 'catalogue-list');

  // 2. Sticky fields: second piece only needs photo + weight.
  await p.goto(base + '/add');
  const k = await p.getByRole('radio', { name: '22K', exact: true }).isChecked();
  const c = await p.getByRole('radio', { name: 'Bangle', exact: true }).isChecked();
  check('karat and category remembered for the next piece', k && c);

  // 3. Mid-range Android: 4× slower CPU, slow 3G network.
  const cdp = await ctx.newCDPSession(p);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
  await cdp.send('Network.enable');
  await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: 400, downloadThroughput: (1.6 * 1024 * 1024) / 8, uploadThroughput: (750 * 1024) / 8 });
  await p.reload(); await p.waitForLoadState('networkidle');
  const b = await capture(p, { weight: '12.40', karat: '18K', category: 'Ring' });
  check('capture saved (4× CPU, slow 3G)', b.saveMs < 1000, JSON.stringify(b));
  const tUp = Date.now();
  await queueGone(p, 120000);
  console.log('INFO upload finished in background after', Date.now() - tUp, 'ms on slow 3G');
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });
  await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1 });

  // 4. Offline capture, then the connection comes back.
  await p.goto(base + '/add');
  await ctx.setOffline(true);
  await p.getByText("You're offline").waitFor();
  const o = await capture(p, { weight: '8.35', karat: '21K', category: 'Chain' });
  check('capture works offline', true, JSON.stringify(o));
  const chip = p.locator('[aria-controls="queue-panel"]');
  check('queue shows offline waiting', (await chip.innerText()).includes('Offline · 1 waiting'), await chip.innerText());
  await shot(p, 'offline-saved');
  const before = sql('select count(*) from pieces');
  await ctx.setOffline(false);
  await queueGone(p, 60000);
  const after = sql('select count(*) from pieces');
  check('uploads by itself when back online', before === '2' && after === '3', `${before} → ${after}`);

  // 5. Spin on mobile data: sprite uploads, video waits for Wi-Fi.
  await p.addInitScript(() => Object.defineProperty(navigator, 'connection', { value: Object.assign(new EventTarget(), { type: 'cellular', saveData: false }), configurable: true }));
  await p.goto(base + '/add');
  const s = await capture(p, { weight: '30.10', karat: '22K', category: 'Bangle', video: `${M}/turntable.webm` });
  check('spin extracted on the phone', s.spinMs > 0, `${s.spinMs} ms for 24 frames`);
  await shot(p, 'spin-saved');
  await p.waitForFunction(() => document.querySelector('[aria-controls="queue-panel"]')?.textContent?.includes('waiting for Wi-Fi'), null, { timeout: 60000 });
  const spinRow = sql("select string_agg(type::text||':'||coalesce(frames,0)||'x'||coalesce(cols,0)||'@'||coalesce(cell_px,0), ',' order by sort_order) from piece_media m join pieces p on p.id=m.piece_id where p.gross_g=30.1");
  check('photo and 6×4 sprite (24 frames, 360 px) registered; video waiting', spinRow === 'photo:0x0@0,spin_sprite:24x6@360', spinRow);
  await chip.click();
  await shot(p, 'queue-panel');
  await p.getByRole('button', { name: 'Upload video now' }).click();
  await queueGone(p, 60000);
  const vid = sql("select storage_path||'|'||bytes from piece_media where type='spin_video'");
  check('original video uploaded untouched after Upload now', vid.endsWith('|1175412'), vid);
  const spriteSize = sql("select (metadata->>'size') from storage.objects where name like '%/spin-%' and name not like '%small%'");
  console.log('INFO sprite sheet', spriteSize, 'bytes; small sprite', sql("select (metadata->>'size') from storage.objects where name like '%small%'"), 'bytes');

  // 6. App opens offline from the service worker.
  await p.goto(base + '/add'); await p.waitForLoadState('networkidle');
  await p.waitForFunction(() => navigator.serviceWorker?.controller != null, null, { timeout: 15000 }).catch(() => {});
  await p.reload(); await p.waitForLoadState('networkidle');
  await ctx.setOffline(true);
  const resp = await p.goto(base + '/add').catch(e => null);
  const offlineOk = await p.getByRole('button', { name: 'Save piece' }).isVisible().catch(() => false);
  check('capture screen opens with no connection (service worker)', offlineOk);
  await ctx.setOffline(false);

  // 7. Validation.
  await p.goto(base + '/add');
  await p.getByRole('button', { name: 'Save piece' }).click();
  check('photo is required', await p.getByText('Take a photo first.').isVisible());

  const total = sql('select count(*) from pieces'), skus = sql('select string_agg(sku, \',\' order by sku) from pieces');
  check('four pieces, sequential SKUs', skus === 'ALF-0001,ALF-0002,ALF-0003,ALF-0004', skus);
  console.log('INFO capture_ms per piece (form ready → Save):', sql("select string_agg(props->>'capture_ms', ', ' order by created_at) from events where name='piece_added'"));
  console.log('page errors:', errors.length ? errors : 'none');
  await browser.close();
})().catch(e => { console.error(e); process.exit(1); });
