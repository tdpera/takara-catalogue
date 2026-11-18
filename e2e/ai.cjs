const { sql, TMP, visible, until } = require('./lib.cjs');
const { chromium, devices } = require('playwright');
const { execSync } = require('child_process');
const fs = require('fs');
const M = process.argv[2], OUT = process.argv[3];
const DIR = TMP;
const base = 'http://localhost:3000';
const scenario = (s) => fs.writeFileSync(`${DIR}/scenario.txt`, s);
const mockLog = () => fs.existsSync(`${DIR}/mock-requests.jsonl`) ? fs.readFileSync(`${DIR}/mock-requests.jsonl`, 'utf8').trim().split('\n').filter(Boolean).map(JSON.parse) : [];
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
const photo = async (p) => {
  await p.locator('form[data-ready]').waitFor();
  return p.locator('input[type=file][accept="image/*"]').setInputFiles(`${M}/scale-photo-12mp.jpg`);
};
const status = (p) => p.locator('[role=status]').filter({ hasText: /./ }).first();
async function freshForm(p) { await p.goto(base + '/add'); await p.waitForLoadState('networkidle'); sql('delete from ai_requests'); }
async function aiOutcome(p, sc, text) {
  scenario(sc); await freshForm(p); await photo(p);
  await p.getByText(text).waitFor({ timeout: 20000 });
}

(async () => {
  const browser = await chromium.launch();
  const errors = [];
  const ctx = await browser.newContext({ ...devices['Pixel 5'] });
  const p = await ctx.newPage();
  p.on('pageerror', e => errors.push(e.message));
  const bodies = [];
  p.on('response', async (r) => { try { if (/javascript|html|json/.test(r.headers()['content-type'] || '')) bodies.push(await r.text()); } catch {} });

  await login(p, '050 000 0001');
  await p.getByLabel('Shop name').fill('Al Fahidi Jewellers');
  await p.getByRole('button', { name: 'Create shop' }).click();
  await p.waitForURL(base + '/');
  await p.goto(base + '/rates');
  await p.getByRole('textbox', { name: /^24K/ }).fill('472.50');
  await p.getByRole('button', { name: 'Fill 22K, 21K, 18K from 24K' }).click();
  await p.getByRole('button', { name: "Save today's rates" }).click();
  await p.getByText("Today's rates are saved").waitFor();

  // 1. Full fill.
  scenario('ok'); await freshForm(p);
  const t0 = Date.now();
  await photo(p);
  await p.getByText('Reading the photo…').waitFor({ timeout: 10000 });
  await p.getByText(/Filled from the photo:/).waitFor({ timeout: 20000 });
  const aiMs = Date.now() - t0;
  const msg = await status(p).innerText();
  check('all fields filled and listed', /karat, category, weight, name, descriptions/.test(msg), msg.replace(/\n/g, ' '));
  check('no "type by hand" line when everything was read', !/Type by hand/.test(msg));
  check('weight from scale, decimals as displayed', await p.getByLabel(/Gross weight/).inputValue() === '24.350');
  check('karat from stamp', await p.getByRole('radio', { name: '22K', exact: true }).isChecked());
  check('category', await p.getByRole('radio', { name: 'Bangle', exact: true }).isChecked());
  check('name with karat removed', await p.locator('#f-name').inputValue() === 'Twisted rope bangle', await p.locator('#f-name').inputValue());
  const badges = await p.getByText('AI · check').count();
  check('AI fields highlighted (karat, category, weight, name, descriptions)', badges === 6, badges);
  check('AI-filled name is visible (More details opened)', await visible(p.locator('#f-name')));
  check('descriptions open with 4 languages', (await p.locator('#d-ar').inputValue()).length > 10 && (await p.locator('#d-ml').inputValue()).length > 10);
  check('Arabic description is right-to-left', await p.locator('#d-ar').getAttribute('dir') === 'rtl');
  check('price shown from AI weight', /AED/.test(await p.locator('form p.tabular-nums').last().innerText()));
  await p.getByLabel(/Gross weight/).scrollIntoViewIfNeeded();
  await p.evaluate(() => window.scrollTo(0, 0));
  await shot(p, 'ai-filled', true);
  await p.getByLabel(/Gross weight/).fill('24.35');
  check('editing a field confirms it (badge gone)', await p.getByText('AI · check').count() === 5);
  await p.getByRole('button', { name: 'Save piece' }).click();
  await p.getByText('Saved. It uploads').waitFor();
  check('form resets AI state after save', await p.getByText('AI · check').count() === 0 && !(await p.getByText(/Filled from the photo/).count()));
  await queueGone(p);
  const row = sql("select name||'|'||karat||'|'||gross_g||'|'||(descriptions ? 'en')||'|'||(descriptions ? 'ml') from pieces order by created_at desc limit 1");
  check('saved piece has AI name, edited weight, descriptions', row === 'Twisted rope bangle|22|24.350|true|true', row);
  const ar = sql("select status||'|'||model||'|'||input_tokens||'|'||output_tokens||'|'||(duration_ms>0)||'|'||(piece_id = (select id from pieces order by created_at desc limit 1)) from ai_requests");
  check('request logged with model, tokens, piece id', ar === 'ok|claude-opus-5-5|1750|420|true|true', ar);
  const last = mockLog().pop();
  check('API key sent server-side', last.hasKey === true || (last.auth || []).length > 0, JSON.stringify(last.auth));
  check('model claude-opus-5-5 with fallbacks "default" and the fallback beta', last.model === 'claude-opus-5-5' && last.fallbacks === 'default' && /server-side-fallback-2026-07-01/.test(last.beta), JSON.stringify({ f: last.fallbacks, b: last.beta }));
  check('structured output (json_schema), effort low', last.format === 'json_schema' && last.effort === 'low');
  check('photo sent as compressed JPEG (not the 12 MP original)', last.imageType === 'image/jpeg' && last.imageB64Len < 1_000_000, last.imageB64Len);
  check('fill time with mock (photo prep + round trip)', aiMs < 8000, aiMs + ' ms');

  // 2. Nothing readable on scale or stamp.
  scenario('no_scale'); await freshForm(p); await photo(p);
  await p.getByText(/Filled from the photo:/).waitFor({ timeout: 20000 });
  const msg2 = await status(p).innerText();
  check('says which fields to type by hand', /Type by hand: karat, weight/.test(msg2), msg2.replace(/\n/g, ' '));
  check('weight left empty', await p.getByLabel(/Gross weight/).inputValue() === '');
  await shot(p, 'ai-partial');

  // 3. Weight that doesn't match the display, description with a number.
  scenario('bad_weight'); await freshForm(p); await photo(p);
  await p.getByText(/Filled from the photo:/).waitFor({ timeout: 20000 });
  check('mismatched weight dropped', await p.getByLabel(/Gross weight/).inputValue() === '');
  check('English description with a number dropped, others kept', await p.locator('#d-en').inputValue() === '' && (await p.locator('#d-hi').inputValue()).length > 0);

  // 4. Typed fields are never overwritten.
  scenario('slow'); await freshForm(p); await photo(p);
  await p.getByLabel(/Gross weight/).fill('19.9');
  await p.getByRole('radio', { name: '18K', exact: true }).evaluate((el) => el.click());
  await p.getByText(/Filled from the photo:/).waitFor({ timeout: 20000 });
  check('typed weight kept', await p.getByLabel(/Gross weight/).inputValue() === '19.9');
  check('chosen karat kept', await p.getByRole('radio', { name: '18K', exact: true }).isChecked());
  const msg4 = await status(p).innerText();
  check('only untouched fields reported as filled', /Filled from the photo: category, name, descriptions/.test(msg4), msg4.replace(/\n/g, ' '));

  // 5. Save before the AI replies: descriptions still reach the piece.
  scenario('slow'); await freshForm(p); await photo(p);
  await p.getByRole('radio', { name: '22K', exact: true }).evaluate((el) => el.click());
  await p.getByRole('radio', { name: 'Ring', exact: true }).evaluate((el) => el.click());
  await p.getByLabel(/Gross weight/).fill('5.2');
  await p.getByRole('button', { name: 'Save piece' }).click();
  await p.getByText('Saved. It uploads').waitFor();
  check('saved while AI still working', sql("select count(*) from ai_requests where status='pending'") === '1');
  await queueGone(p);
  await p.waitForTimeout(4000);
  const late = sql("select category||'|'||gross_g||'|'||(descriptions ? 'en') from pieces order by created_at desc limit 1");
  check('late AI reply adds descriptions only (not karat/weight/category)', late === 'Ring|5.200|true', late);
  check('late reply did not touch the next piece form', await p.getByText('AI · check').count() === 0);

  // 6. Error paths, each with a specific message.
  await aiOutcome(p, 'blurry', 'The photo is too blurry or dark to read.');
  check('unreadable photo: message + retry button', await visible(p.getByRole('button', { name: /Fill from photo/ })));
  await shot(p, 'ai-unreadable');
  await aiOutcome(p, 'refusal', 'The AI declined this photo.');
  check('refusal: specific message', true);
  await aiOutcome(p, 'bad_json', "The AI's reply couldn't be used.");
  check('broken JSON: specific message', sql("select status from ai_requests") === 'invalid_output');
  await aiOutcome(p, 'rate', 'The AI service is busy.');
  check('Claude 429: busy message, logged', sql("select status from ai_requests") === 'busy');
  await aiOutcome(p, 'overloaded', 'The AI service is busy.');
  check('Claude 529: busy message', true);
  await aiOutcome(p, 'badkey', "AI fill isn't set up for this app yet.");
  check('rejected API key: not-set-up message', true);

  // 7. Our own rate limit.
  scenario('ok'); await freshForm(p);
  const uid = sql("select id from auth.users where phone='971500000001'");
  const shop = sql("select shop_id from shop_members where user_id='" + uid + "'");
  sql(`insert into ai_requests (shop_id, user_id) select '${shop}', '${uid}' from generate_series(1,12)`);
  const before = mockLog().length;
  await photo(p);
  await p.getByText(/Too many AI requests. Try again in \d+ seconds/).waitFor({ timeout: 15000 });
  check('per-person limit: message with wait time, Claude not called', mockLog().length === before);
  await shot(p, 'ai-rate-limited');
  sql('delete from ai_requests');

  // 8. Toggle off: no automatic call; button runs it; preference remembered.
  await freshForm(p);
  await p.getByLabel('Fill details from the photo').uncheck();
  const b2 = mockLog().length;
  await photo(p);
  await p.locator('main img').first().waitFor();
  await p.waitForTimeout(1500);
  check('toggle off: no automatic AI call', mockLog().length === b2);
  await p.getByRole('button', { name: /Fill from photo/ }).click();
  await p.getByText(/Filled from the photo:/).waitFor({ timeout: 20000 });
  check('button runs AI fill on demand', mockLog().length === b2 + 1);
  await p.reload(); await p.waitForLoadState('networkidle');
  check('toggle preference remembered', !(await p.getByLabel('Fill details from the photo').isChecked()));
  await p.getByLabel('Fill details from the photo').check();

  // 9. Offline.
  await freshForm(p);
  await ctx.setOffline(true);
  await photo(p);
  await p.getByText("You're offline, so filling from the photo won't run.").waitFor({ timeout: 15000 });
  check('offline: says AI fill won\'t run', true);
  await ctx.setOffline(false);

  // 10. Arabic, right-to-left.
  scenario('ok'); await freshForm(p);
  await ctx.addCookies([{ name: 'lang', value: 'ar', url: base }]);
  await p.reload(); await p.waitForLoadState('networkidle');
  await photo(p);
  await p.getByText(/تمت التعبئة من الصورة/).waitFor({ timeout: 20000 });
  check('Arabic UI shows AI result', true);
  await shot(p, 'ai-filled-ar', true);
  await ctx.addCookies([{ name: 'lang', value: 'en', url: base }]);

  // 11. The route's own checks.
  const api = ctx.request;
  const anon = await (await chromium.launch()).newContext();
  const r401 = await anon.request.post(base + '/api/ai/fill', { multipart: { shopId: shop, pieceId: uid, image: { name: 'x.jpg', mimeType: 'image/jpeg', buffer: fs.readFileSync(`${M}/scale-photo-12mp.jpg`) } } });
  check('signed out: 401 JSON', r401.status() === 401 && (await r401.json()).error === 'auth');
  const rOrigin = await api.post(base + '/api/ai/fill', { headers: { origin: 'https://evil.example' }, multipart: { shopId: shop, pieceId: uid } });
  check('other origin: 403', rOrigin.status() === 403);
  const rType = await api.post(base + '/api/ai/fill', { multipart: { shopId: shop, pieceId: uid, image: { name: 'x.jpg', mimeType: 'image/jpeg', buffer: Buffer.from('<html>not an image</html>') } } });
  check('not an image: 400', rType.status() === 400);
  const otherShop = sql("insert into shops (name, sku_prefix) values ('Other shop','OTH') returning id").split('\n')[0];
  const rShop = await api.post(base + '/api/ai/fill', { multipart: { shopId: otherShop, pieceId: uid, image: { name: 'x.jpg', mimeType: 'image/jpeg', buffer: fs.readFileSync(`${M}/scale-photo-12mp.jpg`).subarray(0, 3_000_000) } } });
  check("another shop's id: 403", rShop.status() === 403, rShop.status());

  check('API key never reached the browser', !bodies.some((b) => b.includes('sk-ant-test-dummy')), bodies.length + ' responses scanned');
  check('no page errors', errors.length === 0, errors.join(' | '));
  await browser.close();
  process.exit();
})();
