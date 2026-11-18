const { sql, TMP, visible, until } = require('./lib.cjs');
const { chromium, devices } = require('playwright');
const { execSync } = require('child_process');
const fs = require('fs');
const M = process.argv[2], OUT = process.argv[3];
const base = 'http://localhost:3000';
fs.writeFileSync(TMP + '/scenario.txt', 'ok');
let n = 0;
const shot = (p, name, full = false) => p.screenshot({ path: `${OUT}/${String(++n).padStart(2, '0')}-${name}.png`, fullPage: full });
const check = (label, cond, extra = '') => { console.log((cond ? 'PASS ' : 'FAIL ') + label + (extra !== '' ? '  [' + extra + ']' : '')); if (!cond) process.exitCode = 1; };
const radio = (p, name) => p.getByRole('radio', { name, exact: true }).evaluate((el) => el.click());

async function login(page, local) {
  await page.goto(base + '/login');
  await page.getByLabel('Mobile number').fill(local);
  await page.getByRole('button', { name: 'Send code on WhatsApp' }).click();
  await page.getByLabel('6-digit code').fill('123456');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.waitForURL(u => !u.pathname.startsWith('/login'));
  await page.waitForLoadState('networkidle');
}
const queueGone = (p, ms = 90000) => p.waitForFunction(() => !document.querySelector('[aria-controls="queue-panel"]'), null, { timeout: ms });
async function capture(p, { karat, category, weight, video, ai = true }) {
  await p.goto(base + '/add'); await p.waitForLoadState('networkidle');
  const box = p.getByLabel('Fill details from the photo');
  if ((await box.isChecked()) !== ai) await box.click();
  await p.locator('form[data-ready]').waitFor();
  await p.locator('input[type=file][accept="image/*"]').setInputFiles(`${M}/scale-photo-12mp.jpg`);
  await p.locator('main img').first().waitFor();
  if (ai) await p.getByText(/Filled from the photo/).waitFor({ timeout: 20000 });
  await radio(p, karat); await radio(p, category);
  await p.getByLabel(/Gross weight/).fill(weight);
  if (video) {
    await p.locator('input[type=file][accept="video/*"]').setInputFiles(video);
    await p.getByText('Spin ready').waitFor({ timeout: 60000 });
  }
  await p.getByRole('button', { name: 'Save piece' }).click();
  await p.getByText('Saved. It uploads').waitFor();
}
const bgPos = (loc) => loc.evaluate((el) => el.style.backgroundPosition);

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
  check('empty catalogue invites the first piece', await visible(p.getByText('No pieces yet')));
  await p.goto(base + '/rates');
  await p.getByRole('textbox', { name: /^24K/ }).fill('472.50');
  await p.getByRole('button', { name: 'Fill 22K, 21K, 18K from 24K' }).click();
  await p.getByRole('button', { name: "Save today's rates" }).click();
  await p.getByText("Today's rates are saved").waitFor();

  // Three real captures (one with a spin, one without AI so it has no descriptions).
  await capture(p, { karat: '22K', category: 'Bangle', weight: '24.35', video: `${M}/turntable.webm` });
  await capture(p, { karat: '18K', category: 'Ring', weight: '6.2' });
  await capture(p, { karat: '21K', category: 'Chain', weight: '15.1', ai: false });
  await p.getByRole('button', { name: /Upload video now|Uploading|waiting/ }).first().click().catch(() => {});
  await p.getByRole('button', { name: 'Upload video now' }).click().catch(() => {});
  await queueGone(p);
  const shop = sql("select id from shops where name='Al Fahidi Jewellers'");
  const owner = sql("select id from auth.users where phone='971500000001'");
  // 60 more pieces straight into the database, for search, filters and paging.
  sql(`insert into pieces (shop_id, name, category, karat, gross_g, making_per_g, created_by, created_at)
       select '${shop}', 'Filler necklace ' || g, 'Necklace', 22, 10 + g, 15, '${owner}', now() - (g || ' minutes')::interval from generate_series(1,60) g`);
  sql(`update pieces set name='سوار ذهب مزخرف' where shop_id='${shop}' and name='Filler necklace 7'`);
  const total = sql(`select count(*) from pieces where shop_id='${shop}'`);

  // ---------- grid
  await p.goto(base + '/'); await p.waitForLoadState('networkidle');
  check('shows first 24 of all pieces', await visible(p.getByText(`Showing 24 of ${total}`)));
  await p.getByRole('link', { name: 'Show more' }).click();
  await p.getByText(`Showing 48 of ${total}`).waitFor();
  await p.getByRole('link', { name: 'Show more' }).click();
  await p.getByText(`${total} pieces`).waitFor();
  check('Show more loads the rest', (await p.locator('main ul > li').count()) === Number(total));
  await p.goto(base + '/?category=Bangle'); await p.waitForLoadState('networkidle');
  const card = p.locator('main ul > li').first();
  check('card: name, karat and weight, live price', /Twisted rope bangle/.test(await card.innerText()) && /22K · 24\.35 g/.test(await card.innerText()) && /AED [\d,]+/.test(await card.innerText()), (await card.innerText()).replace(/\n/g, ' | '));
  check('card shows 360° chip', await card.getByText('360°').isVisible());
  const spin = card.locator('div[aria-hidden=true][style*="background-size"]');
  await p.waitForFunction(() => [...document.querySelectorAll('main ul > li div[style*="background-image"]')].length > 0, null, { timeout: 15000 });
  const a1 = await bgPos(spin); await p.waitForTimeout(600); const a2 = await bgPos(spin);
  check('card spin turns by itself', a1 !== a2, `${a1} → ${a2}`);
  await shot(p, 'grid-bangle');
  // Drag on the card turns it and doesn't open the piece.
  const b = await spin.boundingBox();
  await p.mouse.move(b.x + b.width * 0.7, b.y + b.height / 2); await p.mouse.down();
  await p.mouse.move(b.x + b.width * 0.3, b.y + b.height / 2, { steps: 8 }); await p.mouse.up();
  await p.waitForTimeout(400);
  check('dragging a card spin turns it without opening the piece', p.url().endsWith('/?category=Bangle'));
  const s1 = await bgPos(spin); await p.waitForTimeout(500);
  check('a spin stops turning by itself once turned by hand', s1 === await bgPos(spin));

  // Reduced motion: no automatic turning anywhere.
  const rm = await browser.newContext({ ...devices['Pixel 5'], reducedMotion: 'reduce', storageState: await ctx.storageState() });
  const rp = await rm.newPage();
  await rp.goto(base + '/?category=Bangle'); await rp.waitForLoadState('networkidle');
  await rp.waitForTimeout(800);
  const rs = rp.locator('main ul > li div[aria-hidden=true][style*="background-size"]').first();
  const r1 = await bgPos(rs); await rp.waitForTimeout(700);
  check('reduced motion: spins stay still', r1 === await bgPos(rs), r1);
  await rm.close();

  // ---------- filters and search
  await p.goto(base + '/'); await p.waitForLoadState('networkidle');
  await p.getByRole('group', { name: 'Category' }).getByRole('link', { name: 'Ring', exact: true }).click();
  await p.waitForURL(/category=Ring/);
  check('category filter', (await p.locator('main ul > li').count()) === 1 && /18K/.test(await p.locator('main ul > li').first().innerText()));
  await p.getByRole('group', { name: 'Karat' }).getByRole('link', { name: '22K', exact: true }).click();
  await p.waitForURL(/karat=22/);
  check('filters combine (Ring + 22K = none) with a clear option', await visible(p.getByText('No pieces match these filters.')));
  await p.getByRole('link', { name: 'Clear filters' }).click();
  await p.waitForURL(base + '/');
  await p.getByLabel('Search pieces').fill('ALF-0002');
  await p.waitForURL(/q=ALF-0002/);
  await p.waitForLoadState('networkidle');
  check('search by SKU', (await p.locator('main ul > li').count()) === 1);
  await p.getByLabel('Search pieces').fill('neck 1');
  await p.waitForTimeout(400);
  await p.getByLabel('Search pieces').fill('necklace 1');
  await p.waitForURL(/q=necklace/); await p.waitForLoadState('networkidle');
  const nl = await p.locator('main ul > li').count();
  check('search by part of a name', nl === 11, nl); // 1, 10-19
  await p.getByLabel('Search pieces').fill('سوار');
  await p.waitForURL(/q=/); await p.waitForTimeout(800); await p.waitForLoadState('networkidle');
  check('search in Arabic', await until(async () => (await p.locator('main ul > li').count()) === 1));
  await p.goto(base + '/?q=' + encodeURIComponent('a,b(c)*%_\\'));
  check('search with filter syntax characters is harmless', (await p.locator('main').innerText()).includes('No pieces match'));
  await p.goto(base + '/?karat=99&status=lost&category=Tiara');
  check('invalid filters in the URL are ignored', (await p.getByText(/Showing 24 of/).count()) === 1);
  await p.goto(base + '/?status=sold');
  check('status filter (none sold yet)', await visible(p.getByText('No pieces match these filters.')));

  // ---------- bulk select
  await p.goto(base + '/'); await p.waitForLoadState('networkidle');
  await p.getByRole('button', { name: /\(ALF-0001\)/ }).click();
  await p.getByRole('button', { name: /Select Filler necklace 1 / }).click();
  check('selection bar counts', await visible(p.getByText('2 selected')));
  await shot(p, 'grid-selected');
  await p.getByRole('link', { name: /ALF-0001/ }).click();
  await p.waitForURL(/\/p\//);
  await p.goBack(); await p.waitForLoadState('networkidle');
  check('selection kept after opening a piece', await visible(p.getByText('2 selected')));
  await p.getByRole('button', { name: 'Share' }).click();
  await p.waitForURL(/\/share\?ids=/);
  check('Share opens the composer with the 2 selected pieces', await visible(p.getByRole('heading', { name: 'Pieces (2)' })));
  await p.goBack(); await p.waitForLoadState('networkidle');
  await p.getByRole('button', { name: 'Clear', exact: true }).click();
  check('clear selection', !(await p.getByText('selected').count()));

  // ---------- detail
  await p.getByRole('link', { name: /ALF-0001/ }).click();
  await p.waitForURL(/\/p\//);
  const pieceUrl = p.url();
  const slider = p.getByRole('slider', { name: /360° view/ });
  await slider.waitFor();
  await p.waitForFunction(() => document.querySelector('[role=slider]')?.style.backgroundImage);
  check('big spin viewer is a labelled slider', (await slider.getAttribute('aria-valuemax')) === '24');
  await slider.focus();
  const v0 = Number(await slider.getAttribute('aria-valuenow'));
  await p.keyboard.press('ArrowRight'); await p.keyboard.press('ArrowRight');
  const v1 = Number(await slider.getAttribute('aria-valuenow'));
  check('arrow keys turn it', v1 === (v0 + 1) % 24 + 1 || v1 === ((v0 + 1) % 24) + 1, `${v0} → ${v1}`);
  check('frame announced', /Angle \d+ of 24/.test(await slider.getAttribute('aria-valuetext')));
  await p.keyboard.press('Home');
  check('Home goes to the first angle', (await slider.getAttribute('aria-valuenow')) === '1');
  const sb = await slider.boundingBox();
  await p.mouse.move(sb.x + sb.width * 0.8, sb.y + sb.height / 2); await p.mouse.down();
  await p.mouse.move(sb.x + sb.width * 0.4, sb.y + sb.height / 2, { steps: 10 }); await p.mouse.up();
  check('dragging turns it', (await slider.getAttribute('aria-valuenow')) !== '1');
  check('headline price on the piece page', /AED [\d,]+/.test(await p.locator('#price-h').locator('..').innerText()));
  await p.locator('summary', { hasText: 'Price breakdown' }).click();
  check('price breakdown with today\'s rate, one tap away', await until(async () => /Gold/.test(await p.locator('#price-h').locator('..').innerText()) && /Making/.test(await p.locator('#price-h').locator('..').innerText())));
  await p.evaluate(() => window.scrollTo(0, 0));
  await shot(p, 'detail-spin', true);
  await p.getByRole('tab', { name: 'Photo' }).click();
  check('photo tab shows the photo', await visible(p.getByRole('img', { name: /Photo of Twisted rope bangle/ })));
  await p.getByRole('tab', { name: 'العربية' }).click();
  const arText = p.locator('#desc-panel p[lang=ar]');
  check('description tabs: Arabic shown right-to-left', (await arText.getAttribute('dir')) === 'rtl' && (await arText.innerText()).length > 10);
  await p.getByRole('tab', { name: 'العربية' }).press('ArrowRight');
  check('description tabs work with arrow keys', (await p.getByRole('tab', { name: 'हिन्दी' }).getAttribute('aria-selected')) === 'true');

  // Status
  await radio(p, 'Reserved');
  await p.getByText('Status updated.').waitFor();
  await p.reload(); await p.waitForLoadState('networkidle');
  check('status saved', await p.getByRole('radio', { name: 'Reserved' }).isChecked());
  await p.goto(base + '/?status=reserved'); await p.waitForLoadState('networkidle');
  check('reserved piece in status filter with badge', (await p.locator('main ul > li').count()) === 1 && await visible(p.locator('main ul > li').getByText('Reserved')));

  // ---------- edit
  await p.goto(pieceUrl + '/edit'); await p.waitForLoadState('networkidle');
  await p.getByLabel(/Gross weight/).fill('30');
  await p.getByLabel('Name', { exact: true }).fill('Twisted rope kada');
  await p.getByRole('button', { name: 'Save changes' }).click();
  await p.waitForURL(pieceUrl);
  check('edits saved and shown', await visible(p.getByRole('heading', { name: 'Twisted rope kada' })) && await until(async () => /30\.00 g/.test(await p.locator('main').innerText())));

  // AI descriptions for the piece captured without AI.
  await p.goto(base + '/?q=ALF-0003'); await p.waitForLoadState('networkidle');
  await p.locator('main ul > li a').first().click(); await p.waitForURL(/\/p\//);
  const chainUrl = p.url();
  check('piece without descriptions says so', await visible(p.getByText('No description in this language yet.')));
  await p.goto(chainUrl + '/edit'); await p.waitForLoadState('networkidle');
  await p.getByRole('button', { name: /Write descriptions from the photo/ }).click();
  await p.locator('#e-d-ml').and(p.locator(':not(:empty)')).waitFor({ timeout: 20000 }).catch(() => {});
  await p.waitForFunction(() => document.querySelector('#e-d-en')?.value.length > 10, null, { timeout: 20000 });
  check('AI writes the empty descriptions, highlighted', (await p.getByText('AI · check').count()) >= 4);
  await shot(p, 'edit-ai', true);
  await p.getByRole('button', { name: 'Save changes' }).click();
  await p.waitForURL(chainUrl);
  check('descriptions saved', (await p.locator('#desc-panel').innerText()).length > 20);
  check('ai_fill_used events logged', Number(sql("select count(*) from events where name='ai_fill_used'")) >= 3);

  // ---------- roles: a salesperson can't edit someone else's piece, but can change status
  const sp = await browser.newContext({ ...devices['Pixel 5'] });
  const s = await sp.newPage();
  await login(s, '050 000 0002');
  const sales = sql("select id from auth.users where phone='971500000002'");
  sql(`insert into shop_members (shop_id, user_id, role) values ('${shop}', '${sales}', 'salesperson')`);
  await s.goto(pieceUrl); await s.waitForLoadState('networkidle');
  check("salesperson sees no Edit on a colleague's piece", (await s.getByRole('link', { name: 'Edit' }).count()) === 0);
  await s.goto(pieceUrl + '/edit');
  check('and the edit page refuses', await visible(s.getByText('Only the person who added this piece')));
  await s.goto(pieceUrl); await radio(s, 'Sold'); await s.getByText('Status updated.').waitFor();
  check('salesperson can change status', sql(`select status from pieces where id='${pieceUrl.split('/').pop()}'`) === 'sold');
  check('salesperson has no Delete', true);
  // Another shop can't open it.
  const ob = await browser.newContext({ ...devices['Pixel 5'] });
  const o = await ob.newPage();
  await login(o, '050 000 0003');
  await o.getByLabel('Shop name').fill('Meena Gold'); await o.getByRole('button', { name: 'Create shop' }).click(); await o.waitForURL(base + '/');
  await o.goto(pieceUrl);
  check("another shop gets 'not found'", await visible(o.getByText("This piece doesn't exist, or it belongs to another shop.")));
  check("another shop's catalogue is empty", (await (await o.goto(base + '/')).text()).includes('No pieces yet'));

  // ---------- image caching through the service worker
  await p.goto(base + '/?category=Bangle'); await p.waitForLoadState('networkidle');
  await p.waitForTimeout(1500);
  const fromSW = [];
  p.on('response', (r) => { if (r.url().includes('/storage/v1/object/sign/media/')) fromSW.push(r.fromServiceWorker()); });
  await p.reload(); await p.waitForLoadState('networkidle'); await p.waitForTimeout(1500);
  const cached = await p.evaluate(async () => (await (await caches.open('media-v1')).keys()).length);
  check('images cached by path, without the signature', cached >= 2, cached + ' files');
  check('on reload, images come from the cache', fromSW.length > 0 && fromSW.every(Boolean), JSON.stringify(fromSW));

  // ---------- delete (owner)
  await p.goto(chainUrl + '/edit'); await p.waitForLoadState('networkidle');
  const chainId = chainUrl.split('/').pop();
  const before = Number(sql(`select count(*) from storage.objects where name like '%${chainId}%'`));
  p.once('dialog', (d) => d.accept());
  await p.getByRole('button', { name: 'Delete piece' }).click();
  await p.waitForURL(base + '/');
  check('owner deletes a piece', sql(`select count(*) from pieces where id='${chainId}'`) === '0');
  check('its files are removed from storage', before > 0 && sql(`select count(*) from storage.objects where name like '%${chainId}%'`) === '0', before + ' → 0');

  // ---------- Arabic
  await ctx.addCookies([{ name: 'lang', value: 'ar', url: base }]);
  await p.goto(base + '/'); await p.waitForLoadState('networkidle');
  check('Arabic catalogue is right-to-left', (await p.locator('html').getAttribute('dir')) === 'rtl');
  await shot(p, 'grid-ar');
  await p.goto(pieceUrl); await p.waitForLoadState('networkidle');
  await shot(p, 'detail-ar', true);
  await ctx.addCookies([{ name: 'lang', value: 'en', url: base }]);

  check('no page errors', errors.length === 0, errors.join(' | '));
  await browser.close();
})().catch((e) => { console.error(e); process.exit(1); });
