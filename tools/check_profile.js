// Self-checks for Your company (/profile, 2026-11-16, Inspyx 4; business setup phases 2b and 2c).
// NOTHING REAL IS ASKED OR CHANGED HERE. The sync function is a stand-in this test runs itself: rows newest-wins by
// updated_at, and a profile row the server's rules would refuse (profile_rules.ts) is kept out as "profile:" and
// the code. The pictures' store (phase 2c) is a stand-in too: files by name, its policies' shape and bound, a file
// there already answered as Storage does; a picture's row is kept only when its file is there (as "media:file").
// The sign-in in the browser is a made-up one that exists nowhere; any other request that tries to leave
// the site is stopped and counted as a failure. The browser runs in New York time.
// usage: node tools/serve.js &   then   node tools/check_profile.js
//        (in Safari's engine instead of Chrome's: BROWSER=webkit node tools/check_profile.js)
const playwright = require('playwright');
const engine = process.env.BROWSER === 'webkit' ? playwright.webkit : playwright.chromium;

const url = process.env.URL || 'http://localhost:4173/';
const HOME = new URL(url).origin;
const SERVER = 'https://btxlrfvqifnrnxffohsz.supabase.co';
const SYNC = '/functions/v1/sync';
const ME = '11111111-1111-4111-8111-111111111111';
const HOUR = 3600000, PHONE = 390, WIDE = 1280;
const kept = () => JSON.stringify({ access: 'test-access-1', renew: 'test-renew-1', ends: Date.now() + HOUR, id: ME, email: 'pat@example.com' });
let failed = 0;
const ok = (name, cond, extra) => { if (!cond) failed++; console.log((cond ? 'PASS  ' : 'FAIL  ') + name + (extra ? '  [' + extra + ']' : '')); };
const group = async (label, fn) => { try { await fn(); } catch (e) { ok(label + ': these checks could not run', false, String((e && e.message) || e).split('\n')[0]); } };

const T = new Date('2026-11-16T12:00:00-05:00').getTime();
const SPACE = new Set([0x09, 0x0a, 0x0b, 0x0c, 0x0d, 0x20, 0x85, 0xa0, 0x1680, 0x2000, 0x2001, 0x2002, 0x2003, 0x2004, 0x2005, 0x2006, 0x2007, 0x2008, 0x2009, 0x200a, 0x2028, 0x2029, 0x202f, 0x205f, 0x3000, 0xfeff]);
const trimmed = (s) => s.length > 0 && !SPACE.has(s.charCodeAt(0)) && !SPACE.has(s.charCodeAt(s.length - 1));
/* The server's rules for the profile row (profile_rules.ts), as far as this page can break them. */
function profileProblem(r) {
  const d = r.data;
  if (d.id !== 'profile' || d.deletedAt != null) return 'profile';
  for (const [f, code, cap] of [['inspectorName', 'inspector_name', 200], ['licenseNumber', 'license_number', 200], ['companyName', 'company_name', 200], ['companyPhone', 'company_phone', 200], ['companyEmail', 'company_email', 254], ['secondInspectorName', 'second_inspector_name', 200]]) {
    const v = d[f];
    if (v == null) continue;
    if (typeof v !== 'string' || !trimmed(v) || Array.from(v).length > cap) return code;
    if (f === 'companyEmail' && !/^[^\s@]+@[^\s@.]+(\.[^\s@.]+)+$/.test(v)) return code;
  }
  if (d.associationNumbers != null && !(Array.isArray(d.associationNumbers) && d.associationNumbers.length <= 20)) return 'association_numbers';
  return null;
}
/* The server's rules for a picture's row (media_rules.ts). */
function mediaProblem(r) {
  const d = r.data;
  if (!['headshot', 'logo', 'signature'].includes(d.id)) return 'media';
  if (d.deletedAt != null) return null;
  if (!['jpeg', 'png'].includes(d.format)) return 'format';
  if (!/^[0-9a-f]{64}$/.test(d.sha256 || '')) return 'sha256';
  if (!Number.isInteger(d.byteLength) || d.byteLength < 1 || d.byteLength > 2097152) return 'byte_length';
  return null;
}
const sha256 = (buf) => require('crypto').createHash('sha256').update(buf).digest('hex');
const nameOf = (kind, sha, format) => ME + '/' + kind + '/' + sha + '.' + (format === 'jpeg' ? 'jpg' : 'png');
/* An image's size from its own header: a PNG's IHDR (and whether it keeps transparency), a JPEG's frame. */
function sizeOf(buf) {
  if (buf.slice(0, 8).toString('hex') === '89504e470d0a1a0a') return { type: 'png', w: buf.readUInt32BE(16), h: buf.readUInt32BE(20), alpha: buf[25] === 6 || buf[25] === 4 };
  if (buf[0] === 0xff && buf[1] === 0xd8) {
    for (let i = 2; i < buf.length - 9;) {
      if (buf[i] !== 0xff) { i++; continue; }
      const m = buf[i + 1], len = buf.readUInt16BE(i + 2);
      if (m >= 0xc0 && m <= 0xc3) return { type: 'jpeg', h: buf.readUInt16BE(i + 5), w: buf.readUInt16BE(i + 7), alpha: false };
      i += 2 + len;
    }
  }
  return null;
}
function server() {
  const held = new Map(); let tick = 0;
  const files = new Map();   // the pictures' store: name -> { bytes, type }
  const changedAt = () => new Date(Date.UTC(2026, 10, 16, 12) + (++tick)).toISOString();
  const put = (r) => held.set(r.kind + '/' + r.id, Object.assign({}, r, { changed_at: changedAt() }));
  const o = { held, put, refuse: null, files };
  o.push = (rows) => {
    const skipped = [], applied = [];
    for (const r of rows) {
      if (r.kind === 'inspector_media') {
        const why = (o.refuse && o.refuse(r)) || mediaProblem(r);
        if (why) { skipped.push({ kind: r.kind, id: r.id, reason: 'media:' + why }); continue; }
        const f = r.deleted_at === null ? files.get(nameOf(r.id, r.data.sha256, r.data.format)) : true;
        if (!f || (f !== true && f.bytes.length !== r.data.byteLength)) { skipped.push({ kind: r.kind, id: r.id, reason: 'media:file' }); continue; }
        const h = held.get(r.kind + '/' + r.id);
        if (h && !(r.updated_at > h.updated_at)) { applied.push({ kind: r.kind, id: r.id, applied: false }); continue; }
        put(r); applied.push({ kind: r.kind, id: r.id, applied: true });
        continue;
      }
      const why = (o.refuse && o.refuse(r)) || profileProblem(r);
      if (why) { skipped.push({ kind: r.kind, id: r.id, reason: 'profile:' + why }); continue; }
      const h = held.get(r.kind + '/' + r.id);
      if (h && !(r.updated_at > h.updated_at)) { applied.push({ kind: r.kind, id: r.id, applied: false }); continue; }
      put(r); applied.push({ kind: r.kind, id: r.id, applied: true });
    }
    return { skipped, applied };
  };
  o.profile = (at, extra) => {
    const data = Object.assign({ id: 'profile', ownerAccountId: ME, inspectorName: 'Pat Rivera', licenseNumber: 'HI18352', companyName: 'Rivera Home Inspections',
      companyPhone: '(555) 010-0199', companyEmail: 'pat@example.com', associationNumbers: ['ASHI 12345'], secondInspectorName: 'Sam Lee', updatedAt: at, deletedAt: null }, extra || {});
    put({ kind: 'inspector_profile', id: 'profile', updated_at: data.updatedAt, deleted_at: null, data });
  };
  o.value = () => (held.get('inspector_profile/profile') || {}).data;
  /* A picture held on the server: its file and its row. */
  o.picture = (kind, bytes, format, at) => {
    const sha = sha256(bytes);
    files.set(nameOf(kind, sha, format), { bytes, type: format === 'jpeg' ? 'image/jpeg' : 'image/png' });
    put({ kind: 'inspector_media', id: kind, updated_at: at, deleted_at: null, data: { id: kind, ownerAccountId: ME, format, sha256: sha, byteLength: bytes.length, updatedAt: at, deletedAt: null } });
  };
  o.pic = (kind) => (held.get('inspector_media/' + kind) || {}).data;
  return o;
}

async function open(browser, o) {
  const ctx = await browser.newContext({ viewport: { width: o.w || WIDE, height: 900 }, locale: 'en-US', timezoneId: 'America/New_York' });
  const store = o.store === undefined ? kept() : o.store;
  await ctx.addInitScript((v) => { try { if (!sessionStorage.getItem('seeded')) { sessionStorage.setItem('seeded', '1'); if (v === null) localStorage.removeItem('inspyx.signin'); else localStorage.setItem('inspyx.signin', v); } } catch (e) { /* none */ } }, store);
  // Every page copy let go is noted, to check none is kept past its picture or the page.
  await ctx.addInitScript(() => { window.__revoked = []; const let_ = URL.revokeObjectURL.bind(URL); URL.revokeObjectURL = (u) => { window.__revoked.push(u); let_(u); }; });
  // hugePng: every PNG made comes out over the report's 2 MB, as a logo too detailed to print would.
  if (o.hugePng) await ctx.addInitScript(() => { const make = HTMLCanvasElement.prototype.toBlob; HTMLCanvasElement.prototype.toBlob = function (cb, type, q) { if (type === 'image/png') { cb(new Blob([new Uint8Array(2097153)], { type: 'image/png' })); return; } make.call(this, cb, type, q); }; });
  const page = await ctx.newPage();
  page.setDefaultTimeout(8000);
  const s = o.server, errs = [], away = [], calls = [], storeCalls = [], order = [];   // order: 'file' and 'row', as they came
  page.on('pageerror', (e) => errs.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource|net::ERR/.test(m.text())) errs.push(m.text()); });
  // A copy held in the page (blob:) is the page's own: WebKit routes it too, and it must load.
  await page.route((u) => !u.href.startsWith(HOME) && !u.href.startsWith('data:') && !u.href.startsWith('blob:'), async (route) => {
    const req = route.request(), u = req.url();
    // The pictures' store: added under the sign-in (never over another), read under the sign-in.
    const ADD = SERVER + '/storage/v1/object/business-media/', READ = SERVER + '/storage/v1/object/authenticated/business-media/';
    if (u.startsWith(ADD) || u.startsWith(READ)) {
      const name = decodeURIComponent(u.startsWith(ADD) ? u.slice(ADD.length) : u.slice(READ.length));
      const call = { method: req.method(), name, headers: req.headers(), bytes: req.postDataBuffer() };
      storeCalls.push(call);
      if (call.method === 'POST') order.push('file');
      if (o.storeDown && o.storeDown(call)) return route.abort('failed');
      const json = (status, body) => route.fulfill({ status, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(body) });
      if (call.headers.authorization !== 'Bearer test-access-1') return json(400, { statusCode: '403', error: 'Unauthorized' });
      if (call.method === 'GET') {
        const f = s.files.get(name);
        if (!f) return json(400, { statusCode: '404', error: 'not_found', message: 'Object not found' });
        return route.fulfill({ status: 200, contentType: f.type, headers: { 'access-control-allow-origin': '*' }, body: f.bytes });
      }
      // As the policies: the own folder, the shape, at most 30; as the store: 2 MB, JPEG or PNG; a file there already.
      const mine = [...s.files.keys()].filter((n) => n.startsWith(ME + '/')).length;
      if (o.storeRefuse || !new RegExp('^' + ME + '/(headshot|logo|signature)/[0-9a-f]{64}\\.(jpg|png)$').test(name) || mine >= 30) return json(400, { statusCode: '403', error: 'Unauthorized', message: 'new row violates row-level security policy' });
      if (!['image/jpeg', 'image/png'].includes(call.headers['content-type'])) return json(400, { statusCode: '415', error: 'invalid_mime_type' });
      if (call.bytes.length > 2097152) return json(400, { statusCode: '413', error: 'Payload too large' });
      if (s.files.has(name)) return json(400, { statusCode: '409', error: 'Duplicate', message: 'The resource already exists' });
      s.files.set(name, { bytes: call.bytes, type: call.headers['content-type'] });
      return json(200, { Key: 'business-media/' + name });
    }
    if (!u.startsWith(SERVER + SYNC)) { away.push(u); return route.abort(); }
    const body = JSON.parse(req.postData() || '{}');
    calls.push({ headers: req.headers(), body });
    if ((body.push || []).some((r) => r.kind === 'inspector_media' && r.deleted_at === null)) order.push('row');
    if (o.down && o.down()) return route.abort('failed');
    const { skipped, applied } = s.push(body.push || []);
    const after = body.after ? body.after.at : '';
    const rows = [...s.held.values()].filter((r) => r.changed_at > after).sort((a, b) => (a.changed_at < b.changed_at ? -1 : 1));
    const page_ = rows.slice(0, body.limit || 200);
    const last = page_[page_.length - 1];
    return route.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify({
      applied, skipped, rows: page_, next: last ? { at: last.changed_at, kind: last.kind, id: last.id } : body.after || null, more: rows.length > page_.length }) });
  });
  const res = await page.goto(url + 'profile', { waitUntil: 'load' });
  await page.waitForTimeout(400);
  return { ctx, page, errs, away, calls, storeCalls, order, res };
}

// What a person sees: innerText leaves out hidden parts (a dialog's other titles, a button's second press) and keeps
// the break between side-by-side parts (an add-on's name and its fee), which textContent would glue together.
const vis = (page, sel) => page.evaluate((q) => [...document.querySelectorAll(q)].filter((e) => !e.hidden && e.getClientRects().length > 0).map((e) => e.innerText.replace(/\s+/g, ' ').trim()), sel);
const until = async (fn, ms) => { const end = Date.now() + (ms || 4000); for (;;) { if (await fn()) return true; if (Date.now() > end) return false; await new Promise((r) => setTimeout(r, 50)); } };
const pushed = (calls) => calls.flatMap((c) => c.body.push || []);

(async () => {
  const browser = await engine.launch();
  console.log('browser: ' + engine.name() + ' ' + browser.version());
  const F = '[data-form]';
  const val = (page, name) => page.inputValue(F + ' input[name="' + name + '"]');
  const saveAndWait = async (page, words) => { await page.click(F + ' button[type="submit"]'); return until(async () => (await vis(page, '[data-say]')).join() === words); };

  await group('signed out', async () => {
    const s = server(); s.profile(T);
    const { page, ctx, calls } = await open(browser, { server: s, store: null });
    ok('signed out: the page sends the visitor to sign in and asks nothing of the server', await until(async () => new URL(page.url()).pathname === '/signin') && calls.length === 0);
    await ctx.close();
  });

  await group('the profile', async () => {
    const s = server(); s.profile(T);
    // Another account's row, as a broken server might answer it (kept apart from this account's).
    s.held.set('other/inspector_profile/profile', { kind: 'inspector_profile', id: 'profile', updated_at: T + 9, deleted_at: null, changed_at: '2026-11-16T12:00:00.500Z', data: { id: 'profile', ownerAccountId: '99999999-9999-4999-8999-999999999999', inspectorName: 'Someone else', updatedAt: T + 9, deletedAt: null } });
    const { page, ctx, errs, away, calls, res } = await open(browser, { server: s });
    ok('opens with no errors, asks only the sync function, as the signed-in inspector, sending nothing', errs.length === 0 && away.length === 0 && calls.length >= 1 && calls.every((c) => c.headers.authorization === 'Bearer test-access-1' && (c.body.push || []).length === 0), errs.concat(away).join(' | '));
    const csp = res.headers()['content-security-policy'] || '';
    ok('served with the signed-in pages\' rule (no live socket), plus pictures held in the page (img-src blob:)', /img-src 'self' blob:; connect-src https:\/\/btxlrfvqifnrnxffohsz\.supabase\.co;/.test(csp) && !/wss:/.test(csp) && res.headers()['cache-control'] === 'no-store', csp.slice(0, 120));
    ok('the form holds the profile, never another account\'s', await val(page, 'inspectorName') === 'Pat Rivera' && await val(page, 'licenseNumber') === 'HI18352' && await val(page, 'companyName') === 'Rivera Home Inspections' && await val(page, 'companyPhone') === '(555) 010-0199' && await val(page, 'companyEmail') === 'pat@example.com');
    ok('with a name and a license, nothing is said to be needed', (await vis(page, '[data-need-line]')).length === 0);
    ok('the caps every place keeps: 200 characters, the email 254', await page.evaluate(() => ['inspectorName', 'licenseNumber', 'companyName', 'companyPhone'].every((n) => document.querySelector('input[name="' + n + '"]').maxLength === 200) && document.querySelector('input[name="companyEmail"]').maxLength === 254));
    ok('nothing runs off the side of the screen', await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth));
    await ctx.close();
  });

  await group('nothing yet', async () => {
    const { page, ctx } = await open(browser, { server: server() });
    ok('an empty form that says what reports need', (await vis(page, '[data-need-line]')).join() === 'Your reports need your name and your license number.' && await val(page, 'inspectorName') === '');
    await page.fill(F + ' input[name="inspectorName"]', 'Pat');
    ok('as it is typed, the line follows', (await vis(page, '[data-need-line]')).join() === 'Your reports need your license number.');
    await ctx.close();
  });

  await group('saving', async () => {
    const s = server();
    const ahead = Date.now() + 3 * HOUR;
    s.profile(ahead);
    const { page, ctx, calls } = await open(browser, { server: s });
    await page.fill(F + ' input[name="inspectorName"]', '  Pat Rivera Jr.\u0085 ');
    await page.fill(F + ' input[name="companyName"]', '   ');
    await page.fill(F + ' input[name="companyPhone"]', '7543645501');
    await page.locator(F + ' input[name="companyPhone"]').blur();
    ok('the phone number is tidied as the phone tidies it', await val(page, 'companyPhone') === '(754) 364-5501');
    const before = calls.length;
    ok('saved: it says so', await saveAndWait(page, 'Saved.'));
    const sent = pushed(calls.slice(before));
    const d = sent.length === 1 ? sent[0].data : {};
    ok('the row as the phone writes it: trimmed as Dart trims (U+0085 too), an empty field as none, id "profile", not deleted', sent.length === 1 && sent[0].kind === 'inspector_profile' && sent[0].id === 'profile' && d.inspectorName === 'Pat Rivera Jr.' && d.companyName === null && d.companyPhone === '(754) 364-5501' && d.deletedAt === null && d.ownerAccountId === ME, JSON.stringify(d).slice(0, 220));
    ok('what this page doesn\'t show goes back as it was: association numbers and the second inspector', JSON.stringify(d.associationNumbers) === '["ASHI 12345"]' && d.secondInspectorName === 'Sam Lee');
    ok('a change time just past a phone clock running ahead', d.updatedAt === ahead + 1 && sent[0].updated_at === ahead + 1);
    ok('the server holds it', s.value().inspectorName === 'Pat Rivera Jr.');
    await ctx.close();
  });

  await group('the email', async () => {
    const s = server(); s.profile(T);
    const { page, ctx, calls } = await open(browser, { server: s });
    await page.fill(F + ' input[name="companyEmail"]', 'pat@example');
    const before = calls.length;
    await page.click(F + ' button[type="submit"]');
    ok('one that doesn\'t look complete: the phone\'s words, and nothing sent', (await vis(page, F + ' [data-problem]')).join() === 'The company email doesn\'t look complete (like name@company.com).' && pushed(calls.slice(before)).length === 0);
    await page.fill(F + ' input[name="companyEmail"]', 'pat@example.com');
    const savedOk = await saveAndWait(page, 'Saved.');
    ok('fixed, it saves, and the problem is gone', savedOk && (await vis(page, F + ' [data-problem]')).length === 0, JSON.stringify([await vis(page, '[data-say]'), await vis(page, F + ' [data-problem]')]));
    await page.fill(F + ' input[name="companyEmail"]', '');
    ok('an empty email is fine: none', await saveAndWait(page, 'Saved.') && s.value().companyEmail === null);
    await ctx.close();
  });

  await group('changed elsewhere', async () => {
    const s = server(); s.profile(T);
    const { page, ctx, calls } = await open(browser, { server: s });
    s.profile(T + 500, { inspectorName: 'From the phone' });
    await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
    ok('not being typed in, the form shows a phone change on coming back into view', await until(async () => await val(page, 'inspectorName') === 'From the phone'));
    await page.fill(F + ' input[name="companyName"]', 'Typed here');
    s.profile(T + 900, { inspectorName: 'From the phone again' });
    await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
    await page.waitForTimeout(400);
    ok('being typed in, it is never refilled under the typing', await val(page, 'companyName') === 'Typed here' && await val(page, 'inspectorName') === 'From the phone');
    const before = calls.length;
    await page.click(F + ' button[type="submit"]');
    ok('a save over a change made elsewhere is refused once, and says so', await until(async () => (await vis(page, '[data-say]')).join() === 'These details were changed somewhere else since this page showed them, so nothing was saved. Save again to keep what you see here.') && pushed(calls.slice(before)).length === 0);
    ok('saving again keeps what is on screen, after the newer change', await saveAndWait(page, 'Saved.') && s.value().companyName === 'Typed here' && s.value().updatedAt > T + 900);
    await ctx.close();
  });

  await group('the server\'s word and no connection', async () => {
    const s = server(); s.profile(T);
    let down = false;
    const { page, ctx } = await open(browser, { server: s, down: () => down });
    s.refuse = () => 'inspector_name';
    await page.fill(F + ' input[name="inspectorName"]', 'Pat');
    ok('a change the server keeps out: says Inspyx couldn\'t keep it', await saveAndWait(page, 'Inspyx couldn’t keep that change. Check it and try again.'));
    s.refuse = null; down = true;
    ok('a save that can\'t go: says so', await saveAndWait(page, 'That couldn’t be saved. Check your connection and try again.'));
    await ctx.close();
    const first = await open(browser, { server: s, down: () => true });
    ok('nothing loaded: it says the details couldn\'t be read, and keeps trying', (await vis(first.page, '[data-state]')).join().startsWith('Your company details couldn’t be read.') && (await vis(first.page, '[data-live]')).join() === 'Can\'t reach Inspyx right now. Trying again.');
    await first.ctx.close();
  });

  await group('on a phone', async () => {
    const s = server(); s.profile(T);
    const { page, ctx } = await open(browser, { server: s, w: PHONE });
    ok('the form fits', await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth));
    await page.fill(F + ' input[name="companyName"]', 'From a phone');
    ok('and saves', await saveAndWait(page, 'Saved.'));
    await ctx.close();
  });

  // ---- the photo, logo and signature (phase 2c) ----
  // Test images, made in the browser: a wide photo, a logo that keeps its see-through parts, and a file that isn't a picture.
  const maker = await browser.newPage();
  const made = await maker.evaluate(() => {
    const draw = (w, h, see) => { const c = document.createElement('canvas'); c.width = w; c.height = h; const g = c.getContext('2d');
      if (!see) { g.fillStyle = '#2a6fdb'; g.fillRect(0, 0, w, h); } g.fillStyle = '#f2b705'; g.beginPath(); g.arc(w / 2, h / 2, Math.min(w, h) / 3, 0, Math.PI * 2); g.fill();
      return c.toDataURL('image/png').split(',')[1]; };
    return { photo: draw(1500, 900, false), logo: draw(1600, 1200, true), small: draw(120, 80, false) };
  });
  await maker.close();
  const PHOTO = Buffer.from(made.photo, 'base64'), LOGO = Buffer.from(made.logo, 'base64'), SMALL = Buffer.from(made.small, 'base64');
  const PICS = '[data-pics]';
  const row = (kind) => PICS + ' [data-pic="' + kind + '"]';
  const choose = async (page, kind, file) => {
    const [chooser] = await Promise.all([page.waitForEvent('filechooser'), page.click(row(kind) + ' [data-change]')]);
    await chooser.setFiles(file);
  };
  const picSay = (page) => vis(page, '[data-psay]');
  const shownImg = (page, kind) => page.evaluate((q) => { const i = document.querySelector(q + ' [data-img]'); return !i.hidden && i.complete && i.naturalWidth > 0 ? i.src : null; }, row(kind));

  await group('pictures: none yet', async () => {
    const { page, ctx, storeCalls } = await open(browser, { server: server() });
    ok('the section shows the phone\'s three, in its order and words, each with Add and nothing to remove',
      (await vis(page, PICS + ' .prf-pic-name')).join('|') === 'Your photo|Company logo|Your signature' &&
      (await vis(page, PICS + ' .prf-pic-where')).join('|') === 'On the cover, beside your name|At the top of the cover|At the end of every report' &&
      (await vis(page, PICS + ' [data-change]')).join('|') === 'Add|Add|Add' && (await vis(page, PICS + ' [data-remove]')).length === 0 &&
      (await vis(page, PICS + ' h2')).join() === 'On your reports');
    ok('with none held, the store is never asked', storeCalls.length === 0);
    await ctx.close();
  });

  await group('pictures: shown from copies held in the page', async () => {
    const s = server(); s.profile(T); s.picture('logo', SMALL, 'png', T + 1);
    s.picture('headshot', Buffer.from('not a picture at all'), 'jpeg', T + 2);
    const { page, ctx, errs, storeCalls } = await open(browser, { server: s });
    await until(async () => !!(await shownImg(page, 'logo')));
    const src = await shownImg(page, 'logo');
    ok('a held picture shows, from a copy in the page (blob:), read through the sign-in from its own name', !!src && src.startsWith('blob:') &&
      storeCalls.some((c) => c.method === 'GET' && c.name === nameOf('logo', sha256(SMALL), 'png') && c.headers.authorization === 'Bearer test-access-1'), String(src));
    ok('its row says Change and Remove; the others Add', (await vis(page, row('logo') + ' [data-change]')).join() === 'Change' && (await vis(page, row('logo') + ' [data-remove]')).join() === 'Remove' && (await vis(page, row('signature') + ' [data-change]')).join() === 'Add');
    ok('every store call is in this account\'s own folder', storeCalls.every((c) => c.name.startsWith(ME + '/')));
    // The sign-in itself never reaches another folder, another store, or a name not of the store's shape.
    const asked = storeCalls.length;
    const refused = await page.evaluate((other) => Promise.all([
      InspyxAuth.picture('read', other + '/logo/' + 'a'.repeat(64) + '.png'),
      InspyxAuth.picture('read', '../backups/x'),
      InspyxAuth.picture('add', document.querySelector('[data-pic]') ? 'x' : 'x', new Blob(['x'], { type: 'image/png' })),
      InspyxAuth.picture('add', '11111111-1111-4111-8111-111111111111/logo/' + 'a'.repeat(64) + '.png', new Blob(['x'], { type: 'image/gif' })),
    ].map((p) => p.then(() => 'asked', (e) => e && e.kind))), '99999999-9999-4999-8999-999999999999');
    ok('the sign-in never asks for another account\'s folder, another store, a name not of the shape, or a type not a picture', refused.every((k) => k === 'malformed') && storeCalls.length === asked, refused.join());
    ok('no errors', errs.length === 0, errs.join(' | '));
    await ctx.close();
  });

  await group('pictures: a photo, as the phone makes it', async () => {
    const s = server(); s.profile(T);
    const { page, ctx, calls, storeCalls, order } = await open(browser, { server: s });
    await choose(page, 'headshot', { name: 'me.png', mimeType: 'image/png', buffer: PHOTO });
    const said = await until(async () => (await picSay(page)).join() === 'Saved.', 8000);
    const add = storeCalls.find((c) => c.method === 'POST'), dims = add && sizeOf(add.bytes);
    ok('a chosen photo is saved', said, (await picSay(page)).join());
    ok('as a JPEG at most 600 pixels on its long side, named by its content in its own folder, never over another',
      !!dims && dims.type === 'jpeg' && Math.max(dims.w, dims.h) === 600 && add.headers['content-type'] === 'image/jpeg' && add.headers['x-upsert'] === 'false' &&
      add.name === nameOf('headshot', sha256(add.bytes), 'jpeg'), JSON.stringify(dims) + ' ' + (add && add.name));
    const r = pushed(calls).find((x) => x.kind === 'inspector_media');
    ok('then its row: the file it names, its size, a time past the last', !!r && r.id === 'headshot' && r.data.sha256 === sha256(add.bytes) && r.data.byteLength === add.bytes.length && r.data.format === 'jpeg' && r.deleted_at === null && r.data.ownerAccountId === ME && r.updated_at === r.data.updatedAt);
    ok('the file went before the row, and the row once', order.join() === 'file,row' && s.pic('headshot') && s.pic('headshot').sha256 === sha256(add.bytes), order.join());
    await until(async () => !!(await shownImg(page, 'headshot')));
    ok('and it shows', !!(await shownImg(page, 'headshot')));
    await ctx.close();
  });

  await group('pictures: a logo keeps its see-through parts; a changed one lets go of the old copy', async () => {
    const s = server(); s.profile(T); s.picture('logo', SMALL, 'png', T + 1);
    const { page, ctx, storeCalls } = await open(browser, { server: s });
    await until(async () => !!(await shownImg(page, 'logo')));
    const before = await shownImg(page, 'logo');
    await choose(page, 'logo', { name: 'logo.png', mimeType: 'image/png', buffer: LOGO });
    await until(async () => (await picSay(page)).join() === 'Saved.', 8000);
    const add = storeCalls.find((c) => c.method === 'POST'), dims = add && sizeOf(add.bytes);
    ok('a PNG at most 1000 pixels, still see-through', !!dims && dims.type === 'png' && Math.max(dims.w, dims.h) === 1000 && dims.alpha && add.headers['content-type'] === 'image/png', JSON.stringify(dims));
    await until(async () => { const now = await shownImg(page, 'logo'); return !!now && now !== before; });
    ok('the old copy is let go once the new one shows', (await page.evaluate(() => window.__revoked)).includes(before));
    await ctx.close();
  });

  await group('pictures: what can\'t be saved is said, and nothing half-saved', async () => {
    const s = server(); s.profile(T);
    let a = await open(browser, { server: s });
    await choose(a.page, 'logo', { name: 'x.png', mimeType: 'image/png', buffer: Buffer.from('this is not a picture') });
    ok('a file that isn\'t a picture: the phone\'s words, nothing sent', await until(async () => (await picSay(a.page)).join() === 'That picture couldn\'t be read. Try another one.') && a.storeCalls.length === 0 && !pushed(a.calls).some((x) => x.kind === 'inspector_media'));
    await a.ctx.close();
    a = await open(browser, { server: s, hugePng: true });
    await choose(a.page, 'logo', { name: 'big.png', mimeType: 'image/png', buffer: LOGO });
    ok('a logo too detailed to print even small: the phone\'s words, nothing sent', await until(async () => (await picSay(a.page)).join() === 'That logo is too detailed to print. Try a simpler version.', 8000) && a.storeCalls.length === 0);
    await a.ctx.close();
    a = await open(browser, { server: s, storeRefuse: true });
    await choose(a.page, 'logo', { name: 'logo.png', mimeType: 'image/png', buffer: SMALL });
    ok('the store refusing it: Inspyx couldn\'t keep it, and no row goes', await until(async () => (await picSay(a.page)).join() === 'Inspyx couldn’t keep that change. Check it and try again.', 8000) && !pushed(a.calls).some((x) => x.kind === 'inspector_media'));
    await a.ctx.close();
    a = await open(browser, { server: s, storeDown: () => true });
    await choose(a.page, 'logo', { name: 'logo.png', mimeType: 'image/png', buffer: SMALL });
    ok('no connection to the store: says so, and no row goes', await until(async () => (await picSay(a.page)).join() === 'That couldn’t be saved. Check your connection and try again.', 8000) && !pushed(a.calls).some((x) => x.kind === 'inspector_media'));
    await a.ctx.close();
    s.refuse = (r) => (r.kind === 'inspector_media' ? 'file' : null);
    a = await open(browser, { server: s });
    await choose(a.page, 'logo', { name: 'logo.png', mimeType: 'image/png', buffer: SMALL });
    ok('the server keeping the row out: Inspyx couldn\'t keep it', await until(async () => (await picSay(a.page)).join() === 'Inspyx couldn’t keep that change. Check it and try again.', 8000));
    await a.ctx.close();
    s.refuse = null;
  });

  await group('pictures: a file there already counts as saved', async () => {
    const s = server(); s.profile(T);
    const { page, ctx, storeCalls } = await open(browser, { server: s });
    // The same picture saved twice: the second add finds its file there.
    await choose(page, 'logo', { name: 'logo.png', mimeType: 'image/png', buffer: SMALL });
    await until(async () => (await picSay(page)).join() === 'Saved.', 8000);
    const first = s.pic('logo');
    await page.evaluate(() => { document.querySelector('[data-psay="saved"]').hidden = true; });
    s.put({ kind: 'inspector_media', id: 'logo', updated_at: first.updatedAt, deleted_at: first.updatedAt, data: Object.assign({}, first, { deletedAt: first.updatedAt, format: null, sha256: null, byteLength: null }) });
    await choose(page, 'logo', { name: 'logo.png', mimeType: 'image/png', buffer: SMALL });
    ok('saved again over Storage\'s "already there"', await until(async () => (await picSay(page)).join() === 'Saved.', 8000) && storeCalls.filter((c) => c.method === 'POST').length === 2 && s.pic('logo').deletedAt === null);
    await ctx.close();
  });

  await group('pictures: the signature pad', async () => {
    const s = server(); s.profile(T);
    const { page, ctx, calls, storeCalls } = await open(browser, { server: s });
    await page.click(row('signature') + ' [data-change]');
    const pad = await page.$('[data-pad]'), box = await pad.boundingBox();
    const state = () => page.evaluate(() => [document.querySelector('[data-sign-save]').disabled, document.querySelector('[data-sign-clear]').disabled]);
    ok('it opens with the help line, Save and Clear resting until something is drawn', (await vis(page, '[data-sign] p')).join() === 'Sign once with your mouse or finger. Your signature goes at the end of every report.' && JSON.stringify(await state()) === '[true,true]');
    const stroke = async () => { await page.mouse.move(box.x + 20, box.y + 100); await page.mouse.down(); for (let i = 1; i <= 10; i++) await page.mouse.move(box.x + 20 + i * 20, box.y + 100 - (i % 2) * 30); await page.mouse.up(); };
    await stroke();
    ok('drawn: Save and Clear come on', JSON.stringify(await state()) === '[false,false]');
    await page.click('[data-sign-clear]');
    ok('cleared: they rest again', JSON.stringify(await state()) === '[true,true]');
    await stroke();
    await page.click('[data-sign-save]');
    await until(async () => (await picSay(page)).join() === 'Saved.', 8000);
    const add = storeCalls.find((c) => c.method === 'POST'), dims = add && sizeOf(add.bytes);
    ok('saved as the phone keeps it: a PNG three times the pad\'s size', !!dims && dims.type === 'png' && dims.w === Math.ceil(box.width * 3) && dims.h === Math.ceil(box.height * 3), JSON.stringify(dims) + ' pad ' + box.width + 'x' + box.height);
    ok('its row follows', pushed(calls).some((x) => x.kind === 'inspector_media' && x.id === 'signature' && x.data.sha256 === sha256(add.bytes)));
    await page.click(row('signature') + ' [data-change]');
    await page.click('[data-sign-cancel]');
    ok('Cancel closes the pad and sends nothing more', storeCalls.filter((c) => c.method === 'POST').length === 1 && !(await page.evaluate(() => document.querySelector('[data-sign]').open)));
    await ctx.close();
  });

  await group('pictures: removing one, and one changed elsewhere', async () => {
    const s = server(); s.profile(T); s.picture('logo', SMALL, 'png', T + 1);
    const { page, ctx, calls } = await open(browser, { server: s });
    await until(async () => !!(await shownImg(page, 'logo')));
    const before = await shownImg(page, 'logo');
    await page.click(row('logo') + ' [data-remove]');
    ok('removing: says so, the row marked removed, the picture gone from the page and its copy let go',
      await until(async () => (await picSay(page)).join() === 'Removed.') && s.pic('logo').deletedAt != null && s.pic('logo').sha256 === null &&
      (await vis(page, row('logo') + ' [data-change]')).join() === 'Add' && !(await shownImg(page, 'logo')) && (await page.evaluate(() => window.__revoked)).includes(before));
    ok('the removal goes after the last change', pushed(calls).some((x) => x.kind === 'inspector_media' && x.deleted_at !== null && x.updated_at > T + 1));
    // The phone puts a new logo up meanwhile: it shows when the page comes back into view.
    s.picture('logo', LOGO, 'png', Date.now() + 5000);
    await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
    ok('a picture changed on the phone shows when the page comes back into view', await until(async () => !!(await shownImg(page, 'logo')), 6000));
    const now = await shownImg(page, 'logo');
    await page.evaluate(() => window.dispatchEvent(new Event('pagehide')));
    ok('leaving the page lets go of every copy it holds', (await page.evaluate(() => window.__revoked)).includes(now));
    await ctx.close();
  });

  await group('pictures: on a phone', async () => {
    const s = server(); s.profile(T); s.picture('logo', SMALL, 'png', T + 1);
    const { page, ctx } = await open(browser, { server: s, w: PHONE });
    ok('the pictures fit, nothing runs off the side', await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth));
    ok('every picture button is big enough to tap', await page.evaluate(() => [...document.querySelectorAll('[data-pics] button')].filter((b) => !b.hidden && b.getClientRects().length).every((b) => b.getBoundingClientRect().height >= 44)));
    await page.click(row('signature') + ' [data-change]');
    const fits = await page.evaluate(() => { const d = document.querySelector('[data-sign]').getBoundingClientRect(), b = document.querySelector('[data-sign-cancel]').getBoundingClientRect(); return d.left >= 0 && d.right <= window.innerWidth && b.bottom <= window.innerHeight; });
    ok('the pad fits the screen, its buttons in reach', fits);
    await ctx.close();
  });

  await group('the page says no words', async () => {
    const fs = require('fs'), pathm = require('path');
    const code = fs.readFileSync(pathm.join(__dirname, '..', 'coming-soon', 'assets', 'profile.js'), 'utf8');
    // Each string literal on its own (never two read as one); one holding three or more plain words is a sentence.
    const bare = code.replace(/\/\*[\s\S]*?\*\/|(^|[^:'"])\/\/.*$/gm, '$1');
    const literals = bare.match(/'(?:[^'\\\n]|\\.)*'|"(?:[^"\\\n]|\\.)*"|`(?:[^`\\]|\\.)*`/g) || [];
    const sentences = literals.map((l) => l.slice(1, -1)).filter((t) => /^[A-Za-z]/.test(t) && t.split(' ').filter((w) => /^[A-Za-z’']+[.,!?:;]?$/.test(w)).length >= 3);
    ok('the script says no words: every sentence is in the page', sentences.length === 0, sentences.slice(0, 3).join(' | '));
  });

  await browser.close();
  console.log(failed ? '\n' + failed + ' CHECK(S) FAILED' : '\nall checks passed');
  process.exit(failed ? 1 : 0);
})();
