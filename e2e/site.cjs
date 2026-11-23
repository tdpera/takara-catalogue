// Shop websites, trays, sold attribution, the monthly report and the Takara dashboard.
// Starts from the demo seed (a published website at "demo", trays, a second quieter shop).
const { sql, visible, until } = require('./lib.cjs');
const { chromium, devices } = require('playwright');
const { execFileSync } = require('child_process');
const path = require('path');
const OUT = process.argv[3];
const app = 'http://localhost:3000';
const site = 'http://demo.localhost:3000';
let n = 0;
const shot = (p, name, full = false) => p.screenshot({ path: `${OUT}/${String(++n).padStart(2, '0')}-${name}.png`, fullPage: full });
const check = (label, cond, extra = '') => { console.log((cond ? 'PASS ' : 'FAIL ') + label + (extra !== '' ? '  [' + extra + ']' : '')); if (!cond) process.exitCode = 1; };

async function login(page, local) {
  await page.goto(app + '/login');
  await page.getByLabel('Mobile number').fill(local);
  await page.getByRole('button', { name: 'Send code on WhatsApp' }).click();
  await page.getByLabel('6-digit code').fill('123456');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.waitForURL(u => !u.pathname.startsWith('/login'));
  await page.waitForLoadState('networkidle');
}
const go = async (p, url) => { await p.goto(url); await p.waitForLoadState('networkidle'); };
const html = async (p, url) => { await go(p, url); return p.content(); };

(async () => {
  // The database was just reset and its services restart: give the seed a few tries.
  for (let i = 1; ; i++) {
    try {
      execFileSync('node', ['scripts/seed.mjs'], { cwd: path.join(__dirname, '..'), encoding: 'utf8', stdio: 'pipe' });
      break;
    } catch (e) {
      if (i >= 4) { console.log('FAIL demo seed  [' + String(e.stderr || e.message).slice(0, 400) + ']'); throw e; }
      await new Promise((r) => setTimeout(r, 4000));
    }
  }
  const shop = sql("select shop_id from shop_sites where slug='demo'");
  const pid = (sku) => sql(`select id from pieces where shop_id='${shop}' and sku='${sku}'`);
  const browser = await chromium.launch();
  const errors = [];

  // ---------- a customer on the shop's own address (no login)
  const cc = await browser.newContext({ ...devices['Pixel 5'] });
  const c = await cc.newPage();
  c.on('pageerror', (e) => errors.push('customer at ' + c.url() + ': ' + e.message.slice(0, 120)));
  const views0 = Number(sql(`select count(*) from site_views where shop_id='${shop}'`));
  await go(c, site + '/');
  check('a real visit is counted', await until(() => Number(sql(`select count(*) from site_views where shop_id='${shop}'`)) > views0));
  check('website home shows the shop', await visible(c.getByRole('heading', { name: 'Al Noor Jewellers (demo)' })));
  check("no Takara launch film on a shop's website", (await c.locator('.splash').count()) === 0);
  await shot(c, 'site-home', true);
  check('the website shows only the showcase, never the whole catalogue', (await c.locator('#showcase ul > li').count()) === 5 && !(await c.locator('main').innerText()).includes('Box link chain'));
  const askHref = await c.getByRole('link', { name: 'Ask for a tray' }).first().getAttribute('href');
  check('"Ask for a tray" opens WhatsApp to the shop with the request written', askHref.startsWith('https://wa.me/971500000001') && /send me a tray/.test(decodeURIComponent(askHref)));
  await go(c, site + '/collection');
  check('the old collection address goes to the showcase', c.url().endsWith('/#showcase'));
  await go(c, site + '/p/ANJ-0003');
  check("a piece that isn't in the showcase has no page", await visible(c.getByText("This piece isn't on the website.")));

  for (const u of ['/', '/p/ANJ-0002', '/visit']) {
    const h = await html(c, site + u);
    check(`no making charges or extras in ${u}`, !/making|extras_aed|stone_g/.test(h));
  }

  // Price on the website = price in the app.
  await go(c, site + '/p/ANJ-0002');
  const sitePrice = (await c.locator('main [data-price]').first().innerText()).trim();
  check('piece page: price, code and description', /^AED [\d,]+$/.test(sitePrice) && await visible(c.getByText('ANJ-0002').first()) && await visible(c.getByText('About this piece')));
  await shot(c, 'site-piece', true);

  // Price modes and stale rates.
  sql("update shop_sites set price_mode='from' where slug='demo'");
  await go(c, site + '/p/ANJ-0002');
  check('"from" mode shows only a starting price', /^From AED [\d,]+$/.test((await c.locator('main [data-price]').first().innerText()).trim()));
  sql("update shop_sites set price_mode='ask' where slug='demo'");
  await go(c, site + '/p/ANJ-0002');
  check('"ask" mode shows no price', (await c.locator('main [data-price]').first().innerText()).trim() === 'Ask for price' && !/AED \d/.test(await c.locator('main').innerText()));
  sql("update shop_sites set price_mode='live' where slug='demo'");
  sql(`update gold_rates set set_at = set_at - interval '5 days' where shop_id='${shop}'`);
  await go(c, site + '/p/ANJ-0002');
  check('rates older than 3 days: price hidden', (await c.locator('main [data-price]').first().innerText()).trim() === "Ask for today's price");
  sql(`update gold_rates set set_at = set_at + interval '5 days' where shop_id='${shop}'`);

  // A piece taken off the showcase disappears, and so do its images.
  const photo = sql(`select storage_path from piece_media where piece_id='${pid('ANJ-0005')}' and type='photo'`);
  const imgOk = await c.request.get(`${app}/site-img/demo/${photo}`);
  check('website images are served, cached', imgOk.status() === 200 && /max-age/.test(imgOk.headers()['cache-control'] ?? ''));
  const chainPhoto = sql(`select storage_path from piece_media where piece_id='${pid('ANJ-0003')}' and type='photo'`);
  check("images of pieces outside the showcase aren't served", (await c.request.get(`${app}/site-img/demo/${chainPhoto}`)).status() === 404);
  sql(`update pieces set on_website=false where id='${pid('ANJ-0005')}'`);
  await go(c, site + '/');
  check('a piece taken off the showcase is not listed', !(await c.locator('main').innerText()).includes('Floral jhumka earrings'));
  await go(c, site + '/p/ANJ-0005');
  check('and has no page', await visible(c.getByText("This piece isn't on the website.")));
  check("a hidden piece's image isn't served", (await c.request.get(`${app}/site-img/demo/${photo}?x=1`)).status() === 404);
  for (const bad of ['x/..%2F..%2Fetc%2Fpasswd', 'abc.png', `${shop}/logo-x.png`]) {
    const res = await c.request.get(`${app}/site-img/demo/${bad}`, { maxRedirects: 0 });
    const st = res.status();
    check(`a made-up image path is refused (${bad})`, [400, 404, 307].includes(st) && !(res.headers()['content-type'] ?? '').startsWith('image/'), String(st));
  }

  // The tray: add from the showcase, show in the shop, send on WhatsApp.
  await go(c, site + '/');
  await c.getByRole('button', { name: /^Add .* to your tray$/ }).nth(0).click();
  await c.getByRole('button', { name: /^Add .* to your tray$/ }).nth(0).click();
  check('tray count in the header', (await c.locator('header a[href="/tray"]').innerText()).includes('2'));
  await go(c, site + '/tray');
  check('tray page lists the pieces', (await c.locator('main ol > li').count()) === 2);
  await c.getByRole('button', { name: 'Show in the shop' }).click();
  await c.locator('[data-tray-code]').waitFor();
  const code = (await c.locator('[data-tray-code]').innerText()).trim();
  check('"Show in the shop" gives a 6-character code and a QR', /^[A-HJKMNP-Z2-9]{6}$/.test(code) && (await c.locator('[role=img] svg').count()) === 1, code);
  check('the tray is saved for the shop', sql(`select channel from site_trays where shop_id='${shop}' and code='${code}'`) === 'in_store');
  await shot(c, 'site-tray-code', true);
  let wa = null;
  await c.route(/wa\.me/, (r) => { wa = r.request().url(); r.abort(); });
  await go(c, site + '/tray');
  await c.getByRole('button', { name: 'Send on WhatsApp' }).click();
  await until(() => wa !== null);
  const text = wa ? new URL(wa).searchParams.get('text') : '';
  check('WhatsApp opens with the tray written out (the customer presses send)', wa?.startsWith('https://wa.me/971500000001') && text.includes(code) && /ANJ-\d{4}/.test(text), text.replace(/\n/g, ' / '));
  await go(c, site + '/t/' + code);
  check("the tray's own page shows the code and pieces", await visible(c.getByRole('heading', { name: code })) && (await c.locator('main ol > li').count()) === 2);

  // Path address, language, unknown shop.
  await go(c, app + '/site/demo');
  check('also served at /site/<slug>', await visible(c.getByRole('heading', { name: 'Al Noor Jewellers (demo)' })));
  await go(c, site + '/?lang=ar');
  check('Arabic, right to left, remembered', (await c.evaluate(() => document.documentElement.dir)) === 'rtl' && (await (await go(c, site + '/visit'), c.evaluate(() => document.documentElement.lang))) === 'ar');
  await shot(c, 'site-ar');
  await go(c, app + '/site/no-such-shop');
  check('unknown website: not found', await visible(c.getByText("This page doesn't exist.")));
  const bot = await browser.newContext({ userAgent: 'WhatsApp/2.24.25.76 A' });
  const v1 = Number(sql(`select count(*) from site_views where shop_id='${shop}'`));
  const r = await (await bot.newPage()).request.post(app + '/api/public/site/view', { headers: { origin: app, 'content-type': 'application/json' }, data: { slug: 'demo' } });
  check('link previews are not counted as visits', r.status() === 204 && Number(sql(`select count(*) from site_views where shop_id='${shop}'`)) === v1);

  // ---------- staff: open the tray, sell from it, record how a sale was found
  const oc = await browser.newContext({ ...devices['Pixel 5'] });
  await oc.addInitScript(() => { try { sessionStorage.setItem('souq.splash', '1'); } catch {} });
  const o = await oc.newPage();
  o.on('pageerror', (e) => errors.push('owner: ' + e.message));
  await login(o, '050 000 0001');
  check('Trays and Shop tabs on phones', (await o.locator('nav.bottom-nav').innerText()).includes('TRAYS') && (await o.locator('nav.bottom-nav').innerText()).includes('SHOP'));
  await go(o, app + '/trays?code=' + code.toLowerCase());
  check('typing the code opens the tray (any case)', /\/trays\/[0-9a-f-]{36}$/.test(o.url()));
  check('opening records the visit', sql(`select opened_at is not null from site_trays where code='${code}'`) === 't');
  await o.getByRole('button', { name: /^Mark .* as sold from this tray$/ }).first().click();
  await o.getByText('Sold from tray').first().waitFor();
  check('sold from a tray: recorded as found through the tray, with a value', /^tray \d+\.\d\d$/.test(sql(`select sold_via||' '||sold_value_aed from pieces where shop_id='${shop}' and sold_via='tray' and sold_at > now() - interval '5 minutes'`)));
  await shot(o, 'app-tray', true);
  await go(o, app + '/trays?code=ZZZZZZ');
  check('a wrong code says so', await visible(o.getByText('No tray with the code ZZZZZZ')));

  await go(o, app + '/p/' + pid('ANJ-0003'));
  await o.getByRole('radio', { name: 'Sold', exact: true }).evaluate((el) => el.click());
  await o.getByRole('checkbox', { name: /Walk-in/ }).evaluate((el) => el.click());
  check('"How did they find it?" right after Sold is saved', await until(() => sql(`select sold_via from pieces where id='${pid('ANJ-0003')}'`) === 'walk_in'));
  check('the sale records today\'s price', Number(sql(`select sold_value_aed from pieces where id='${pid('ANJ-0003')}'`)) > 0);
  await shot(o, 'app-sold-how', true);
  await o.getByRole('radio', { name: 'In stock', exact: true }).evaluate((el) => el.click());
  check('un-selling clears how and when', await until(() => sql(`select coalesce(sold_via,'-')||coalesce(sold_at::text,'-') from pieces where id='${pid('ANJ-0003')}'`) === '--'));
  await o.getByRole('switch', { name: 'In the website showcase' }).evaluate((el) => el.click());
  check('add a piece to the showcase from its page', await until(() => sql(`select on_website from pieces where id='${pid('ANJ-0003')}'`) === 't'));

  await go(o, app + '/website');
  await o.getByLabel('Opening hours').fill('Daily 10:00–22:00');
  await o.getByRole('button', { name: 'Save website' }).click();
  await o.getByText('Saved.').waitFor();
  await go(c, site + '/visit');
  check('website settings show on the website', await visible(c.getByText('Daily 10:00–22:00')));
  await go(o, app + '/website');
  await o.getByLabel('Address', { exact: true }).fill('admin');
  await o.getByRole('button', { name: 'Save website' }).click();
  check('reserved addresses are refused', await visible(o.getByText(/Use 3–40 lowercase/)));

  await go(o, app + '/report');
  await o.getByRole('heading', { name: 'Monthly report' }).waitFor();
  const rep = await o.locator('main').innerText();
  check('monthly report: website, trays and how buyers found what they bought', /website visitors/i.test(rep) && /tray code in the shop/i.test(rep) && /most-viewed pieces/i.test(rep));
  await shot(o, 'app-report', true);

  await go(o, app + '/admin');
  await o.getByRole('heading', { name: 'Shops' }).waitFor({ timeout: 15000 });
  const adm = await o.locator('main').innerText();
  check('Takara dashboard lists every shop with flags', adm.includes('Al Noor Jewellers (demo)') && adm.includes('Gold Line Jewellery (demo)') && /no website/i.test(adm) && /rates not updated/i.test(adm));
  await shot(o, 'admin', true);
  await o.getByRole('link', { name: 'Al Noor Jewellers (demo)' }).click();
  await o.waitForURL(/\/admin\/shops\//); await o.getByRole('heading', { name: 'Recent activity' }).waitFor({ timeout: 15000 });
  const detail = await o.content();
  check("shop detail: activity in plain words", detail.includes(`Staff opened tray ${code}`));
  check('the dashboard never shows client names or numbers', !detail.includes('Fatima') && !detail.includes('501234567') && !detail.includes('50 123 4567'));
  await shot(o, 'admin-shop', true);

  // ---------- a salesperson: no report, no website settings, no dashboard
  const sc = await browser.newContext({ ...devices['Pixel 5'] });
  await sc.addInitScript(() => { try { sessionStorage.setItem('souq.splash', '1'); } catch {} });
  const s = await sc.newPage();
  await login(s, '050 000 0002');
  await s.goto(app + '/report');
  check('salesperson: the report sends them to Shop', await until(() => new URL(s.url()).pathname === '/shop'));
  await s.goto(app + '/website');
  check('salesperson: website settings send them to Shop', await until(() => new URL(s.url()).pathname === '/shop'));
  await go(s, app + '/admin');
  check('salesperson: no Takara dashboard', await visible(s.getByText("This page doesn't exist.")));

  // ---------- the demo account
  await go(c, app + '/login');
  check('sign-in page offers the demo number and code', await visible(c.getByText('050 000 0001')) && await visible(c.getByRole('button', { name: 'Use the demo number' })));
  await go(s, app + '/shop');
  check("other accounts don't get the demo button", (await s.getByRole('button', { name: /demo shop/ }).count()) === 0);
  await go(o, app + '/shop');
  await o.getByRole('button', { name: 'Rebuild the demo shop' }).click();
  await o.waitForURL(app + '/', { timeout: 90000 });
  check('the demo account rebuilds the demo shop in one tap', await until(() => sql("select count(*) from pieces p join shops s on s.id = p.shop_id where s.name = 'Al Noor Jewellers (demo)'") === '10', 60000)
    && sql("select count(*) from shops where name = 'Al Noor Jewellers (demo)'") === '1' && sql("select count(*) from shop_sites where published") === '1');

  check('no page errors', errors.length === 0, errors.join(' | '));
  await browser.close();
})().catch((e) => { console.error(e); process.exit(1); });
