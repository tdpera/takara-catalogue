const { sql, TMP } = require('./lib.cjs');
const { chromium, devices } = require('playwright');
const { execSync } = require('child_process');
const fs = require('fs');
const M = process.argv[2], OUT = process.argv[3];
const DIR = TMP;
const base = 'http://localhost:3000';
const scenario = (s) => fs.writeFileSync(`${DIR}/scenario.txt`, s);
const mockLog = () => fs.readFileSync(`${DIR}/mock-requests.jsonl`, 'utf8').trim().split('\n').map(JSON.parse);
let n = 0;
const shot = (p, name, full = false) => p.screenshot({ path: `${OUT}/${String(++n).padStart(2, '0')}-${name}.png`, fullPage: full });
const check = (label, cond, extra = '') => { console.log((cond ? 'PASS ' : 'FAIL ') + label + (extra !== '' ? '  [' + extra + ']' : '')); if (!cond) process.exitCode = 1; };
const radio = (p, name) => p.getByRole('radio', { name, exact: true }).evaluate((el) => el.click());
scenario('ok');

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
async function capture(p, { karat, category, weight, video, name }) {
  await p.goto(base + '/add'); await p.waitForLoadState('networkidle');
  await p.locator('input[type=file][accept="image/*"]').setInputFiles(`${M}/scale-photo-12mp.jpg`);
  await p.getByText(/Filled from the photo/).waitFor({ timeout: 20000 });
  await radio(p, karat); await radio(p, category);
  await p.getByLabel(/Gross weight/).fill(weight);
  await p.locator('#f-name').evaluate((el) => (el.closest('details').open = true));
  await p.locator('#f-name').fill(name);
  if (video) {
    await p.locator('input[type=file][accept="video/*"]').setInputFiles(video);
    await p.getByText('Spin ready').waitFor({ timeout: 60000 });
  }
  await p.getByRole('button', { name: 'Save piece' }).click();
  await p.getByText('Saved. It uploads').waitFor();
}

(async () => {
  const browser = await chromium.launch();
  const errors = [];
  const ctx = await browser.newContext({ ...devices['Pixel 5'], acceptDownloads: true });
  const p = await ctx.newPage();
  p.on('pageerror', e => errors.push('owner: ' + e.message));

  await login(p, '050 000 0001');
  await p.getByLabel('Shop name').fill('Al Fahidi Jewellers');
  await p.getByRole('button', { name: 'Create shop' }).click();
  await p.waitForURL(base + '/');
  await p.goto(base + '/rates');
  await p.getByRole('textbox', { name: /^24K/ }).fill('472.50');
  await p.getByRole('button', { name: 'Fill 22K, 21K, 18K from 24K' }).click();
  await p.getByRole('button', { name: "Save today's rates" }).click();
  await p.getByText("Today's rates are saved").waitFor();

  await capture(p, { karat: '22K', category: 'Bangle', weight: '24.35', name: 'Rope bangle', video: `${M}/turntable.webm` });
  await capture(p, { karat: '18K', category: 'Earrings', weight: '8.1', name: 'Jhumka earrings' });
  await capture(p, { karat: '21K', category: 'Chain', weight: '15.1', name: 'Box chain' });
  await p.getByRole('button', { name: 'Upload video now' }).click().catch(() => {});
  await queueGone(p);
  sql("update pieces set status='sold' where name='Box chain'");

  // ---------- compose
  await p.goto(base + '/'); await p.waitForLoadState('networkidle');
  const cardPrice = async (name) => (await p.locator('main ul > li', { hasText: name }).locator('p.num').last().innerText()).trim();
  const bangleCatalogue = await cardPrice('Rope bangle');
  const earCatalogue = await cardPrice('Jhumka earrings');
  for (const nm of ['Rope bangle', 'Jhumka earrings', 'Box chain']) await p.getByRole('button', { name: new RegExp(`Select ${nm}`) }).click();
  await p.getByRole('button', { name: 'Share' }).click();
  await p.waitForURL(/\/share\?ids=/);
  check('Share opens the composer with the selection', await p.getByRole('heading', { name: 'Pieces (2)' }).isVisible());
  check('sold pieces are left out, and it says so', await p.getByText('Sold pieces left out: 1.').isVisible());
  const msg = () => p.locator('#sh-message').inputValue();
  let m = await msg();
  check('English template lists karat, weight and the catalogue price', m.includes(`1. Rope bangle: 22K, 24.35 g, ${bangleCatalogue}`) && m.includes(`2. Jhumka earrings: 18K, 8.10 g, ${earCatalogue}`), m.split('\n')[2]);
  check("template says prices follow today's rate and are confirmed in store", m.includes("follow today's gold rate and are confirmed in store"));
  check('template ends with the shop name', m.trim().endsWith('Al Fahidi Jewellers'));

  // New client inline
  await p.locator('#sh-client-select').selectOption('__new');
  await p.getByLabel('Name', { exact: true }).fill('Fatima Al Mansoori');
  await p.getByLabel('WhatsApp number (optional)').fill('abc');
  await p.getByLabel('Language for messages').selectOption('ar');
  await p.getByLabel('Notes and preferences (optional)').fill('Likes light pieces for daily wear');
  await p.getByRole('button', { name: 'Save client' }).click();
  check('invalid phone number is explained', await p.getByText('Enter a valid mobile number').waitFor({ timeout: 10000 }).then(() => true, () => false));
  await p.getByLabel('WhatsApp number (optional)').fill('050 123 4567');
  await p.getByRole('button', { name: 'Save client' }).click();
  await p.getByText('Messages written with AI for this client are in العربية.').waitFor();
  m = await msg();
  check('message greets the client by first name', m.startsWith('Hello Fatima, here are the pieces we talked about:'));

  // Write with AI (Arabic)
  await p.getByRole('button', { name: 'Write with AI' }).click();
  await p.getByText(/Written in العربية/).waitFor({ timeout: 20000 });
  m = await msg();
  check('AI message is in Arabic', m.startsWith('مرحبًا فاطمة'));
  check('figures inserted unchanged from the catalogue', m.includes(`1. Rope bangle: 22K, 24.35 g, ${bangleCatalogue}`) && m.includes(`2. Jhumka earrings: 18K, 8.10 g, ${earCatalogue}`));
  check('price note in Arabic, from our fixed text', m.includes('الأسعار شاملة ضريبة القيمة المضافة'));
  const facts = mockLog().filter((x) => x.kind === 'message').pop().facts;
  check('the AI is given no prices, weights or karats', !/AED|\d+\.\d+ g|\d{2}K/.test(facts), facts.replace(/\n/g, ' | '));
  check("the AI gets the client's first name and notes, not the full name or phone", facts.includes('Client first name: Fatima') && !facts.includes('Mansoori') && !facts.includes('4567') && facts.includes('Likes light'));
  await shot(p, 'composer-ai', true);
  scenario('msg_digits');
  await p.getByRole('button', { name: 'Write with AI' }).click();
  await p.getByText("The AI's message couldn't be used").waitFor({ timeout: 20000 });
  check('AI text containing numbers is rejected (after one retry), message kept', (await msg()) === m);
  check('logged as an invalid message request', sql("select status||'|'||kind from ai_requests order by created_at desc limit 1") === 'invalid_output|message');
  scenario('ok');

  // Create link
  await p.getByRole('button', { name: 'Create share link' }).click();
  await p.getByText(/Link ready. It works until/).waitFor();
  const link = await p.locator('#sh-link').inputValue();
  check('link is /s/ + 22-character token', /^http:\/\/localhost:3000\/s\/[A-Za-z0-9_-]{22}$/.test(link), link);
  const token = link.split('/').pop();
  const row = sql(`select cardinality(piece_ids)||'|'||(client_id is not null)||'|'||(message like 'مرحبًا%')||'|'||round(extract(epoch from expires_at-created_at)/86400) from shares where public_token='${token}'`);
  check('share saved: 2 pieces, client, message, 7 days', row === '2|true|true|7', row);
  const ev = sql("select props::text from events where name='share_created'");
  check('share_created event', /"pieces": 2/.test(ev) && /"ai_message": true/.test(ev) && /"has_client": true/.test(ev), ev);
  const wa = await p.getByRole('link', { name: 'Send on WhatsApp' }).getAttribute('href');
  const waText = decodeURIComponent(wa.split('?text=')[1]);
  check("WhatsApp link opens the client's chat", wa.startsWith('https://wa.me/971501234567?text='));
  check('WhatsApp text = message + labelled link', waText.startsWith('مرحبًا فاطمة') && waText.endsWith(`شاهد القطع بعرض 360°:\n${link}`));
  check('nothing sent automatically: WhatsApp is a link the salesperson taps', (await p.getByRole('link', { name: 'Send on WhatsApp' }).getAttribute('target')) === '_blank');

  // Image
  const dl = p.waitForEvent('download');
  await p.getByRole('button', { name: 'Save catalogue image' }).click();
  const d = await dl;
  const file = `${OUT}/catalogue-image.png`;
  await d.saveAs(file);
  const buf = fs.readFileSync(file);
  const w = buf.readUInt32BE(16), h = buf.readUInt32BE(20);
  check('catalogue image is a 1080 px wide PNG', buf.slice(1, 4).toString() === 'PNG' && w === 1080, `${w}×${h}, ${Math.round(buf.length / 1024)} KB`);
  await shot(p, 'composer-link', true);

  // ---------- the client opens the link (no login)
  const cc = await browser.newContext({ ...devices['Pixel 5'] });
  const c = await cc.newPage();
  c.on('pageerror', e => errors.push('client: ' + e.message));
  await c.goto(link); await c.waitForLoadState('networkidle');
  check("opens in the client's language (Arabic, right-to-left)", (await c.locator('[dir=rtl][lang=ar]').count()) > 0 && await c.getByRole('heading', { name: 'مختارة لك' }).isVisible());
  check('shop name and both pieces, in order', await c.getByText('Al Fahidi Jewellers').first().isVisible() && (await c.locator('main ul > li h2').allInnerTexts()).join('|') === 'Rope bangle|Jhumka earrings');
  const pubPrice = (await c.locator('main ul > li').first().locator('span.num.text-xl').innerText()).trim();
  check('live price matches the catalogue', pubPrice === bangleCatalogue, pubPrice);
  check('spin viewer for the piece with a spin', await c.getByRole('slider').first().isVisible());
  const html = await c.content();
  check('no client name, phone or message on the page', !html.includes('Fatima') && !html.includes('4567') && !html.includes('مرحبًا'));
  check('not indexed by search engines', /<meta name="robots" content="noindex, nofollow/.test(html));
  await c.waitForTimeout(1500);
  const shareId = sql(`select id from shares where public_token='${token}'`);
  check('the visit is recorded', sql(`select count(*) from share_views where share_id='${shareId}'`) === '1');
  await c.reload(); await c.waitForLoadState('networkidle'); await c.waitForTimeout(1000);
  check('reloading within 30 minutes counts once', sql(`select count(*) from share_views where share_id='${shareId}'`) === '1');
  check('share_viewed event', sql(`select count(*) from events where name='share_viewed' and props->>'share_id'='${shareId}'`) === '1');
  await shot(c, 'public-ar', true);
  await c.goto(link + '?lang=en'); await c.waitForLoadState('networkidle');
  check('client can switch language', await c.getByRole('heading', { name: 'Selected for you' }).isVisible());

  // Link preview robot and the salesperson: not counted
  const bot = await browser.newContext({ userAgent: 'WhatsApp/2.24.25.76 A' });
  const b = await bot.newPage(); await b.goto(link); await b.waitForTimeout(1500);
  const r = await b.request.post(base + '/api/public/share-view', { headers: { origin: base, 'content-type': 'application/json' }, data: { token } });
  check('WhatsApp link preview not counted as opened', r.status() === 204 && sql(`select count(*) from share_views where share_id='${shareId}'`) === '1');
  await p.goto(link); await p.waitForLoadState('networkidle'); await p.waitForTimeout(1500);
  check("salesperson opening their own link isn't counted", sql(`select count(*) from share_views where share_id='${shareId}'`) === '1');

  // Prices are live; sold shows as sold
  await p.goto(base + '/rates');
  await p.getByRole('textbox', { name: /^24K/ }).fill('480.00');
  await p.getByRole('button', { name: 'Fill 22K, 21K, 18K from 24K' }).click();
  await p.getByRole('button', { name: "Save today's rates" }).click();
  await p.getByText("Today's rates are saved").waitFor();
  sql("update pieces set status='sold' where name='Jhumka earrings'");
  await c.goto(link + '?lang=en'); await c.waitForLoadState('networkidle');
  const pub2 = (await c.locator('main ul > li').first().locator('span.num.text-xl').innerText()).trim();
  check('price follows the new gold rate', pub2 !== bangleCatalogue, `${bangleCatalogue} → ${pub2}`);
  check('a piece sold since shows as Sold, without a price', await c.locator('main ul > li').nth(1).getByText('Sold').isVisible());

  // ---------- shares list
  await p.goto(base + '/shares'); await p.waitForLoadState('networkidle');
  const card = p.locator('main li').first();
  check('shares list shows the client and that it was opened', /Fatima Al Mansoori/.test(await card.innerText()) && /Opened once/.test(await card.innerText()), (await card.innerText()).replace(/\n/g, ' | '));
  await shot(p, 'shares-list');
  p.once('dialog', (dlg) => dlg.accept());
  await card.getByRole('button', { name: 'Turn off link' }).click();
  await card.getByText('Link turned off').waitFor();
  await c.goto(link); await c.waitForLoadState('networkidle');
  check('a turned-off link shows only "expired"', await c.getByText('This link has expired.').isVisible() && !(await c.content()).includes('Rope bangle'));
  await c.goto(base + '/s/' + 'A'.repeat(22));
  check('unknown link: not found, in all four languages', await c.getByText("This link doesn't exist.").isVisible() && await c.getByText('هذا الرابط غير موجود.').isVisible());

  // ---------- clients
  await p.goto(base + '/clients'); await p.waitForLoadState('networkidle');
  check('client listed with formatted number and language', /\+971 50 123 4567/.test(await p.locator('main').innerText()) && /العربية/.test(await p.locator('main').innerText()));
  await p.getByRole('button', { name: 'Edit' }).click();
  await p.getByLabel('Notes and preferences (optional)').fill('Prefers 22K bangles');
  await p.getByRole('button', { name: 'Save client' }).click();
  await p.getByText('Prefers 22K bangles').waitFor();
  check('client preferences edited', sql("select preferences from clients") === 'Prefers 22K bangles');
  const sp = await browser.newContext({ ...devices['Pixel 5'] });
  const s = await sp.newPage();
  await login(s, '050 000 0002');
  const sales = sql("select id from auth.users where phone='971500000002'");
  const shop = sql("select id from shops where name='Al Fahidi Jewellers'");
  sql(`insert into shop_members (shop_id, user_id, role) values ('${shop}', '${sales}', 'salesperson')`);
  await s.goto(base + '/clients'); await s.waitForLoadState('networkidle');
  check("a colleague doesn't see your clients", await s.getByText('No clients yet').isVisible());
  await s.goto(base + '/shares'); await s.waitForLoadState('networkidle');
  check("a colleague doesn't see your shares", await s.getByText('No shares yet').isVisible());

  check('no page errors', errors.length === 0, errors.join(' | '));
  await browser.close();
})().catch((e) => { console.error(e); process.exit(1); });
