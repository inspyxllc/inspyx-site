// Self-checks for Bring in your template (/templates, T4, 2026-11-23, Inspyx Spex & Converter).
// NOTHING REAL IS ASKED OR CHANGED HERE. The Spex server is a stand-in this test plays itself (its /convert-ready and
// the convert protocol, as inspyx-mobile tool/web_convert/e2e/fake_relay.py): each line gets one mark (a line in
// capitals is a section, a short one an item, the rest a comment); the second reading of a batch reads one comment
// as an item, so the two readings disagree there and that line comes back marked to check. The sync function and
// the business-templates store are stand-ins too. The sign-in in the browser is a made-up one that exists nowhere;
// any other request that tries to leave the site is stopped and counted as a failure.
// usage: node tools/serve.js &   then   node tools/check_templates.js
//        (in Safari's engine instead of Chrome's: BROWSER=webkit node tools/check_templates.js)
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const playwright = require('playwright');
const engine = process.env.BROWSER === 'webkit' ? playwright.webkit : playwright.chromium;

const url = process.env.URL || 'http://localhost:4173/';
const HOME = new URL(url).origin;
const SERVER = 'https://btxlrfvqifnrnxffohsz.supabase.co';
const RELAY = 'chat---spex-relay-yu5bdad2fa-uc.a.run.app';
const ME = '11111111-1111-4111-8111-111111111111';
const HOUR = 3600000, PHONE = 390, WIDE = 1280;
const FILES = path.join(__dirname, 'fixtures', 'templates');
const kept = () => JSON.stringify({ access: 'test-access-1', renew: 'test-renew-1', ends: Date.now() + HOUR, id: ME, email: 'pat@example.com' });
let failed = 0;
const ok = (name, cond, extra) => { if (!cond) failed++; console.log((cond ? 'PASS  ' : 'FAIL  ') + name + (extra ? '  [' + extra + ']' : '')); };
const group = async (label, fn) => { try { await fn(); } catch (e) { ok(label + ': these checks could not run', false, String((e && e.message) || e).split('\n')[0]); } };

const PATH_WORDS = 'open Inspyx, tap the menu (\u2630) \u2192 Import \u2192 Convert my template.';
const SCAN = 'This PDF is a scan (pictures of pages). Convert it on your phone, where Inspyx reads scans: ' + PATH_WORDS;

function role(line) {
  const t = line.trim();
  if (!t) return 'X';
  if (t.toUpperCase() === t && /[A-Za-z]/.test(t)) return 'S';
  if (t.endsWith(':') || t.split(/\s+/).length <= 3) return 'I';
  return 'N';
}

/* The stand-ins: the relay (what it was asked), the sync function and the template store. */
function world(opts) {
  const o = Object.assign({ refuse: null, storeStatus: 200, skip: null, failConvert: false, slowPdf: false }, opts || {});
  const w = { asked: [], hellos: [], rows: new Map(), files: new Map(), pushes: [], stores: [], outside: [], readings: new Map() };
  w.o = o;
  return w;
}

async function open(browser, w, opts) {
  const o = Object.assign({ width: WIDE, save: false, calm: false }, opts || {});
  const ctx = await browser.newContext({ viewport: { width: o.width, height: 900 }, reducedMotion: o.calm ? 'reduce' : 'no-preference' });
  await ctx.addInitScript((s) => { try { localStorage.setItem('inspyx.signin', s); } catch (e) { /* none */ } }, kept());
  const page = await ctx.newPage();
  page.errors = [];
  page.on('console', (m) => { if (m.type() === 'error') page.errors.push(m.text()); });
  page.on('pageerror', (e) => page.errors.push(String(e)));
  await page.route('**/*', async (route) => {
    const req = route.request(), u = new URL(req.url());
    if (u.origin === HOME) {
      if (o.save && u.pathname === '/assets/templates.js') {
        const body = fs.readFileSync(path.join(__dirname, '..', 'coming-soon', 'assets', 'templates.js'), 'utf8').replace('var SAVE = false;', 'var SAVE = true;');
        return route.fulfill({ status: 200, contentType: 'text/javascript', body });
      }
      return route.continue();
    }
    if (u.origin === 'https://' + RELAY && u.pathname === '/convert-ready') {
      return route.fulfill({ status: 200, contentType: 'text/plain', headers: { 'Access-Control-Allow-Origin': HOME }, body: 'convert\n' });
    }
    if (u.origin === SERVER && u.pathname === '/functions/v1/sync') {
      if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: cors() });
      const b = JSON.parse(req.postData() || '{}');
      const skipped = [];
      for (const r of b.push || []) {
        w.pushes.push(r);
        if (w.o.skip) { skipped.push({ kind: r.kind, id: r.id, reason: w.o.skip }); continue; }
        if (!w.files.has(ME + '/' + r.id + '/' + r.data.sha256 + '.json')) { skipped.push({ kind: r.kind, id: r.id, reason: 'template:file' }); continue; }
        w.rows.set(r.kind + '/' + r.id, r);
      }
      return route.fulfill({ status: 200, contentType: 'application/json', headers: cors(), body: JSON.stringify({ rows: [...w.rows.values()], next: 'p1', more: false, skipped }) });
    }
    if (u.origin === SERVER && u.pathname.startsWith('/storage/v1/object/business-templates/')) {
      if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: cors() });
      const name = decodeURIComponent(u.pathname.slice('/storage/v1/object/business-templates/'.length));
      const body = req.postDataBuffer();
      w.stores.push({ name, type: req.headers()['content-type'], auth: req.headers()['authorization'], body });
      if (w.o.storeStatus !== 200) return route.fulfill({ status: w.o.storeStatus, contentType: 'application/json', headers: cors(), body: JSON.stringify({ statusCode: String(w.o.storeStatus) }) });
      w.files.set(name, body);
      return route.fulfill({ status: 200, contentType: 'application/json', headers: cors(), body: JSON.stringify({ Key: name }) });
    }
    w.outside.push(req.method() + ' ' + req.url());
    return route.abort();
  });
  await page.routeWebSocket('wss://' + RELAY + '/**', (ws) => {
    ws.onMessage((raw) => {
      const m = JSON.parse(String(raw));
      if (m.hello) {
        w.hellos.push(m.hello);
        ws.send(JSON.stringify({ relay: { status: 'admitted', mode: 'convert', model: 'fake' } }));
      } else if (m.convert) {
        const c = m.convert;
        if (w.o.failConvert) { ws.close(); return; }
        if (w.o.refuse) { ws.send(JSON.stringify({ relay: { status: 'convert', id: c.id, result: { error: 'no', code: w.o.refuse } } })); return; }
        w.asked.push(c);
        const key = c.first + ':' + c.lines.length, n = (w.readings.get(key) || 0) + 1;
        w.readings.set(key, n);
        const marks = c.lines.map((l, i) => {
          let r = role(l);
          // The second reading reads the first comment of the batch as an item: the readings disagree there.
          if (n === 2 && r === 'N' && i === c.lines.findIndex((x) => role(x) === 'N')) r = 'I';
          return [c.first + i, r];
        });
        const answer = JSON.stringify({ relay: { status: 'convert', id: c.id, result: { marks, refused: 0 } } });
        // The PDF's batches come back late when asked, so a later, quicker file is done first.
        if (w.o.slowPdf && c.lines.some((l) => /EQUIPMENT/.test(l))) setTimeout(() => ws.send(answer), 2500); else ws.send(answer);
      }
    });
  });
  await page.goto(url + 'templates');
  return { ctx, page };
}
const cors = () => ({ 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*', 'Access-Control-Allow-Methods': 'POST, GET, OPTIONS' });

async function drop(page, file) {
  await page.setInputFiles('[data-pick]', path.join(FILES, file));
}
const shown = (page, sel) => page.locator(sel).first().isVisible();
const settled = (page) => page.waitForFunction(() => {
  const busy = [...document.querySelectorAll('[data-st]')].some((p) => !p.hidden);
  return !busy;
}, null, { timeout: 30000 });

(async () => {
  const browser = await engine.launch();

  await group('the page', async () => {
    const w = world(); const { ctx, page } = await open(browser, w);
    await page.waitForSelector('[data-drop]');
    ok('the page opens signed in, at /templates, under its own rule', (await page.title()).includes('Templates'));
    ok('its one line says what it is for', (await page.locator('.tpl-lede').innerText()).startsWith('Drop the template you use now'));
    ok('the how-to shows three steps beside the moving stage', (await page.locator('.tpl-steps li').count()) === 3 && await shown(page, '.tpl-stage'));
    const moving = await page.evaluate(() => getComputedStyle(document.querySelector('.tpl-finger')).animationName);
    ok('the finger moves (it drags the file in)', moving === 'tpl-finger', moving);
    ok('the converter loaded from this site', await page.evaluate(() => !!window.inspyxConvert && typeof window.inspyxPdfItems === 'function'));
    ok('nothing left the site and no error showed', w.outside.length === 0 && page.errors.length === 0, (w.outside.concat(page.errors)).join(' | '));
    await ctx.close();
  });

  await group('less motion', async () => {
    const w = world(); const { ctx, page } = await open(browser, w, { calm: true });
    await page.waitForSelector('[data-drop]');
    const st = await page.evaluate(() => ({ a: getComputedStyle(document.querySelector('.tpl-finger')).animationName, r: getComputedStyle(document.querySelector('.tpl-ready')).opacity }));
    ok('with less motion asked, the stage rests on its last frame: the template ready', st.a === 'none' && st.r === '1', JSON.stringify(st));
    await ctx.close();
  });

  await group('a template converts, with its preview', async () => {
    const w = world(); const { ctx, page } = await open(browser, w);
    await page.waitForSelector('[data-drop]');
    await drop(page, 'roof.txt');
    await page.waitForSelector('.tpl-card', { timeout: 30000 });
    const card = page.locator('.tpl-card').first();
    ok('the template is named for the file, tidied ("roof" -> "Roof")', (await card.locator('[data-name]').innerText()) === 'Roof', await card.locator('[data-name]').innerText());
    ok('its summary is the phone\'s', /^2 sections, \d+ items?, \d+ comments?$/.test(await card.locator('[data-summary]').innerText()), await card.locator('[data-summary]').innerText());
    const secs = await card.locator('[data-sections] li strong').allInnerTexts();
    ok('each section shows, with its items', secs.length === 2 && secs[0].startsWith('ROOF') && secs[1].startsWith('PLUMBING') && (await card.locator('[data-sections] li span').first().innerText()).includes('Shingles'), secs.join(' / '));
    // Every item shows, however many: never cut off at two lines (Codex on #69).
    const cut = await card.locator('[data-sections] li span').evaluateAll((els) => els.filter((e) => { const st = getComputedStyle(e); return (st.webkitLineClamp && st.webkitLineClamp !== 'none') || st.overflow === 'hidden' || e.scrollHeight > e.clientHeight + 1; }).length);
    ok('each section\'s item list shows in full', cut === 0, String(cut));
    const dotLine = await card.locator('[data-dot-lines] li').first().innerText().catch(() => '');
    ok('the lines to check show, in plain words: what it went in as and where', await card.locator('[data-dots]').isVisible() &&
      dotLine === '\u25CF Line 3: \u201cThe shingles are worn and near the end of their life.\u201d went in as a comment under ROOF \u203a Shingles. Inspyx wasn\'t sure, so check it\'s right.', dotLine);
    ok('no engineer words: no "readings", no "Information"', !/reading|Information/.test(await card.innerText()));
    ok('a section holding such a line says how many', (await card.locator('.tpl-dot').count()) >= 1);
    ok('the lines went to the Spex server as the website, signed in', w.hellos.length > 0 && w.hellos.every((h) => h.client === 'inspyx-web-convert' && h.access_token === 'test-access-1'));
    ok('with adding not yet on, nothing is offered to add, and it says so', !(await card.locator('[data-add]').isVisible()) && (await card.locator('[data-saved]').innerText()).startsWith('Adding from the website comes next'));
    ok('and nothing was stored or synced', w.stores.length === 0 && w.pushes.length === 0);
    ok('the page\'s own script never held the sign-in', !fs.readFileSync(path.join(__dirname, '..', 'coming-soon', 'assets', 'templates.js'), 'utf8').match(/\.access\b|access_token|Bearer/));
    ok('nothing left the site and no error showed', w.outside.length === 0 && page.errors.length === 0, (w.outside.concat(page.errors)).join(' | '));
    await ctx.close();
  });

  await group('a PDF table converts', async () => {
    const w = world(); const { ctx, page } = await open(browser, w);
    await page.waitForSelector('[data-drop]');
    await drop(page, 'equipment-table.pdf');
    await page.waitForSelector('.tpl-card', { timeout: 60000 });
    ok('a real PDF is read by the app\'s own reader and converts', (await page.locator('.tpl-card [data-sections] li').count()) >= 1);
    ok('its lines went to the server', w.asked.length > 0);
    await ctx.close();
  });

  await group('what is converted on the phone', async () => {
    const w = world(); const { ctx, page } = await open(browser, w);
    await page.waitForSelector('[data-drop]');
    await drop(page, 'scan.pdf'); await settled(page);
    ok('a scanned PDF: his words, convert it on the phone', (await page.locator('[data-v="scanned"]').isVisible()) && (await page.locator('[data-v="scanned"]').innerText()) === SCAN);
    await drop(page, 'old.rtf'); await settled(page);
    ok('an RTF file: convert it on the phone, with where to tap', await page.locator('[data-v="rtf"]').isVisible() && (await page.locator('[data-v="rtf"]').innerText()).endsWith(PATH_WORDS) && !(await page.locator('[data-v="scanned"]').isVisible()));
    await drop(page, 'archive.zip'); await settled(page);
    ok('a kind of file Inspyx can\'t convert says the kinds it can', await page.locator('[data-v="unsupported"]').isVisible());
    ok('none of them was sent anywhere', w.hellos.length === 0 && w.asked.length === 0 && w.outside.length === 0);
    await ctx.close();
  });

  await group('the server says no, or goes away', async () => {
    let w = world({ refuse: 'convert-allowance' }); let o = await open(browser, w);
    await o.page.waitForSelector('[data-drop]');
    await drop(o.page, 'roof.txt'); await settled(o.page);
    ok('the month\'s allowance used: the app\'s own words', await o.page.locator('[data-v="refused"]').isVisible() && (await o.page.locator('[data-refused]').innerText()) === "You've converted a lot of templates this month. The converter is back on the 1st, or send us the file and we move it for you.", await o.page.locator('[data-refused]').innerText());
    await o.ctx.close();
    w = world({ failConvert: true }); o = await open(browser, w);
    await o.page.waitForSelector('[data-drop]');
    await drop(o.page, 'roof.txt'); await settled(o.page);
    ok('a dropped connection says check your connection', await o.page.locator('[data-v="failed"], [data-v="refused"]').first().isVisible());
    await o.ctx.close();
  });

  await group('a second file while the first converts', async () => {
    const w = world({ slowPdf: true }); const { ctx, page } = await open(browser, w);
    await page.waitForSelector('[data-drop]');
    await page.evaluate(() => { document.querySelector('[data-pick]').disabled = false; });
    await drop(page, 'equipment-table.pdf');
    await page.evaluate(() => { document.querySelector('[data-pick]').disabled = false; });
    await drop(page, 'roof.txt');
    await page.waitForSelector('.tpl-card', { timeout: 60000 });
    await page.waitForTimeout(7000);
    const names = await page.locator('.tpl-card [data-name]').allInnerTexts();
    ok('only the latest file\'s template shows', names.length === 1 && names[0] === 'Roof', names.join(','));
    await ctx.close();
  });

  await group('adding (switched on, as after the app\'s template sync)', async () => {
    const w = world(); const { ctx, page } = await open(browser, w, { save: true });
    await page.waitForSelector('[data-drop]');
    await drop(page, 'roof.txt');
    await page.waitForSelector('.tpl-card [data-add]', { state: 'visible', timeout: 30000 });
    const manifest = await page.evaluate(() => null);
    await page.click('.tpl-card [data-add]');
    await page.waitForFunction(() => document.querySelector('.tpl-card [data-saved]').textContent.length > 0, null, { timeout: 15000 });
    const said = await page.locator('.tpl-card [data-saved]').innerText();
    ok('it says the phone\'s "Added"', said === 'Added "Roof". Choose it when you start a new inspection.', said);
    const f = w.stores[0], r = w.pushes[0];
    const sha = f ? crypto.createHash('sha256').update(f.body).digest('hex') : '';
    ok('the file went first, to the inspector\'s own folder, named by its content', !!f && f.name === ME + '/' + (r && r.id) + '/' + sha + '.json' && f.type === 'application/json' && w.stores.length === 1, f && f.name);
    ok('the file is the app\'s own template file, under the name shown', !!f && JSON.parse(f.body.toString('utf8')).templates[0].id === (r && r.id) && JSON.parse(f.body.toString('utf8')).templates[0].name === 'Roof');
    ok('then its row, as the phone sends one', !!r && r.kind === 'inspection_templates' && /^inspector\.[a-z0-9]+(-[a-z0-9]+)*$/.test(r.id) && r.data.ownerAccountId === ME && r.data.source === 'converted' &&
      r.data.sha256 === sha && r.data.byteLength === f.body.length && r.data.createdAt === r.data.updatedAt && r.updated_at === r.data.updatedAt && r.data.deletedAt === null && r.deleted_at === null &&
      typeof r.data.version === 'string' && r.data.name === 'Roof' && !('base' in r.data), r && JSON.stringify(r.data));
    ok('the row was kept', w.rows.has('inspection_templates/' + (r && r.id)));
    ok('the button can\'t add it twice', await page.locator('.tpl-card [data-add]').isDisabled());
    // The same file again: already added, nothing sent.
    await page.click('.tpl-again');
    await drop(page, 'roof.txt');
    await page.waitForSelector('.tpl-card [data-add]', { state: 'visible', timeout: 30000 });
    await page.click('.tpl-card [data-add]');
    await page.waitForFunction(() => document.querySelector('.tpl-card [data-saved]').textContent.length > 0, null, { timeout: 15000 });
    ok('the same template again: "already added", and nothing more is sent', (await page.locator('.tpl-card [data-saved]').innerText()).startsWith('"Roof" was already added') && w.stores.length === 1 && w.pushes.length === 1);
    ok('nothing left the site and no error showed', w.outside.length === 0 && page.errors.length === 0, (w.outside.concat(page.errors)).join(' | '));
    await ctx.close();
  });

  await group('adding fails safely', async () => {
    let w = world({ storeStatus: 403 }); let o = await open(browser, w, { save: true });
    await o.page.waitForSelector('[data-drop]');
    await drop(o.page, 'roof.txt');
    await o.page.waitForSelector('.tpl-card [data-add]', { state: 'visible', timeout: 30000 });
    await o.page.click('.tpl-card [data-add]');
    await o.page.waitForFunction(() => document.querySelector('.tpl-card [data-saved]').textContent.length > 0, null, { timeout: 15000 });
    ok('the store refuses the file (his folder full): it says so, and no row goes', (await o.page.locator('.tpl-card [data-saved]').innerText()).startsWith('Your templates are full') && w.pushes.length === 0);
    await o.ctx.close();
    w = world({ skip: 'template:name' }); o = await open(browser, w, { save: true });
    await o.page.waitForSelector('[data-drop]');
    await drop(o.page, 'roof.txt');
    await o.page.waitForSelector('.tpl-card [data-add]', { state: 'visible', timeout: 30000 });
    await o.page.click('.tpl-card [data-add]');
    await o.page.waitForFunction(() => document.querySelector('.tpl-card [data-saved]').textContent.length > 0, null, { timeout: 15000 });
    ok('the server keeps the row out: "couldn\'t be added", and it can be tried again', (await o.page.locator('.tpl-card [data-saved]').innerText()) === "The template couldn't be added. Nothing changed." && !(await o.page.locator('.tpl-card [data-add]').isDisabled()));
    await o.ctx.close();
  });

  await group('renaming', async () => {
    const w = world(); const { ctx, page } = await open(browser, w, { save: true });
    await page.waitForSelector('[data-drop]');
    await drop(page, 'roof.txt');
    await page.waitForSelector('.tpl-card [data-add]', { state: 'visible', timeout: 30000 });
    await page.click('.tpl-card [data-rename]');
    await page.fill('.tpl-card [data-name-edit]', '  Roof and attic   check ');
    await page.keyboard.press('Enter');
    ok('the pencil renames the template (spaces tidied)', (await page.locator('.tpl-card [data-name]').innerText()) === 'Roof and attic check');
    await page.click('.tpl-card [data-rename]'); await page.fill('.tpl-card [data-name-edit]', 'Something else'); await page.keyboard.press('Escape');
    ok('Esc keeps the name it had', (await page.locator('.tpl-card [data-name]').innerText()) === 'Roof and attic check');
    await page.click('.tpl-card [data-rename]'); await page.fill('.tpl-card [data-name-edit]', '   '); await page.keyboard.press('Enter');
    ok('an empty name is never kept', (await page.locator('.tpl-card [data-name]').innerText()) === 'Roof and attic check');
    await page.click('.tpl-card [data-add]');
    await page.waitForFunction(() => document.querySelector('.tpl-card [data-saved]').textContent.length > 0, null, { timeout: 15000 });
    const f = w.stores[0], r = w.pushes[0];
    ok('the new name goes in the row and in the file', !!r && r.data.name === 'Roof and attic check' && JSON.parse(f.body.toString('utf8')).templates[0].name === 'Roof and attic check' &&
      r.data.sha256 === crypto.createHash('sha256').update(f.body).digest('hex'));
    await ctx.close();
  });

  await group('on a touch screen', async () => {
    const w = world();
    const ctx = await browser.newContext({ viewport: { width: PHONE, height: 844 }, hasTouch: true, isMobile: process.env.BROWSER !== 'webkit' ? true : true });
    await ctx.addInitScript((s) => { try { localStorage.setItem('inspyx.signin', s); } catch (e) { /* none */ } }, kept());
    const page = await ctx.newPage();
    await page.route('**/*', (r) => new URL(r.request().url()).origin === HOME ? r.continue() : r.abort());
    await page.goto(url + 'templates');
    await page.waitForSelector('[data-drop]');
    const said = await page.evaluate(() => [...document.querySelectorAll('.on-touch, .on-mouse')].filter((e) => e.offsetParent !== null).map((e) => e.textContent.trim()));
    ok('nobody is asked to drag on a phone: "Tap to pick your template\'s file", in the steps and the box',
      said.includes('Tap to pick your template\'s file.') && said.includes('Tap to pick your template\'s file') && !said.some((t) => /Drag|Drop/.test(t)), said.join(' | '));
    await ctx.close();
  });

  await group('on a phone', async () => {
    const w = world(); const { ctx, page } = await open(browser, w, { width: PHONE });
    await page.waitForSelector('[data-drop]');
    await drop(page, 'roof.txt');
    await page.waitForSelector('.tpl-card', { timeout: 30000 });
    const wide = await page.evaluate(() => document.documentElement.scrollWidth);
    ok('nothing is wider than the phone', wide <= PHONE, String(wide));
    await ctx.close();
  });

  await browser.close();
  console.log(failed ? '\n' + failed + ' FAILED' : '\nALL PASS');
  process.exit(failed ? 1 : 0);
})();
