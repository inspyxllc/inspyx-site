// Self-checks for "Edit your templates": /template (2026-11-26, the web template editor, piece A).
// NOTHING REAL IS ASKED OR CHANGED HERE. The business sync function and the private store are stand-ins this test runs
// itself, with the live rules (the newest row wins; a file is named by its content and never written over). The
// sign-in in the browser is a made-up one that exists nowhere; any other request that tries to leave the site is
// stopped and counted as a failure.
// usage: node tools/serve.js <port> &   then   URL=http://localhost:<port>/ node tools/check_template_editor.js
//        (Safari's engine: BROWSER=webkit ...; SHOTS=<folder> for pictures, Chromium only)
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const playwright = require('playwright');
const engine = process.env.BROWSER === 'webkit' ? playwright.webkit : playwright.chromium;
const TS = require('../coming-soon/assets/template-save.js');
const TE = require('../coming-soon/assets/template-edit.js');

const url = process.env.URL || 'http://localhost:4173/';
const HOME = new URL(url).origin;
const SERVER = 'https://btxlrfvqifnrnxffohsz.supabase.co';
const ME = '11111111-1111-4111-8111-111111111111';
const HOUR = 3600000, PHONE = 390, WIDE = 1280;
const kept = () => JSON.stringify({ access: 'test-access-1', renew: 'test-renew-1', ends: Date.now() + HOUR, id: ME, email: 'pat@example.com' });
let failed = 0;
const ok = (name, cond, extra) => { if (!cond) failed++; console.log((cond ? 'PASS  ' : 'FAIL  ') + name + (extra ? '  [' + extra + ']' : '')); };
const group = async (label, fn) => { try { await fn(); } catch (e) { ok(label + ': these checks could not run', false, String((e && e.message) || e).split('\n')[0]); } };
const until = async (fn, ms) => { const end = Date.now() + (ms || 6000); for (;;) { try { if (await fn()) return true; } catch (e) { /* not yet */ } if (Date.now() > end) return false; await new Promise((r) => setTimeout(r, 60)); } };
const sha = (t) => crypto.createHash('sha256').update(Buffer.from(t, 'utf8')).digest('hex');
const digest = (t) => Promise.resolve(sha(t));

const COPY = JSON.parse(fs.readFileSync(path.join(__dirname, '../coming-soon/assets/template-copies/inspyx.walkthrough.json'), 'utf8'));
const MINE = 'inspector.my-walkthrough';
const V1 = TS.makeCopy(COPY, MINE, 'My Walkthrough');
const O1 = TE.outline(V1);
const STOP = O1.stops[0], ITEM = STOP.items[0];
const DEF = ITEM.lines.find((l) => l.kind === 'deficiency');

const rowOf = (id, name, text, at, source, base) => {
  const data = { id, ownerAccountId: ME, name, version: JSON.parse(text).templates[0].versions[0].version, source: source || 'copied',
    sha256: sha(text), byteLength: Buffer.byteLength(text), createdAt: at, updatedAt: at, deletedAt: null };
  if (base) data.base = base;
  return { kind: 'inspection_templates', id, updated_at: at, deleted_at: null, data };
};
const dflt = (templateId, at) => ({ kind: 'template_default', id: 'default', updated_at: at, deleted_at: null,
  data: { id: 'default', ownerAccountId: ME, templateId, updatedAt: at, deletedAt: null } });
const fileName = (row) => ME + '/' + row.id + '/' + row.data.sha256 + '.json';

/* The sync function: the newest row wins; each answer holds what changed after the point. */
function bizServer(rows0) {
  const held = new Map(), pushed = []; let seq = 0, down = false;
  for (const r of rows0 || []) held.set(r.kind + '/' + r.id, { row: r, seq: ++seq });
  const answer = (b) => {
    if (down) return null;
    const applied = [];
    for (const r of b.push || []) {
      pushed.push(r);
      const k = r.kind + '/' + r.id, h = held.get(k);
      if (h && h.row.updated_at >= r.updated_at) { applied.push({ kind: r.kind, id: r.id, applied: false }); continue; }
      held.set(k, { row: r, seq: ++seq }); applied.push({ kind: r.kind, id: r.id, applied: true });
    }
    const after = typeof b.after === 'number' ? b.after : 0;
    const rows = [...held.values()].filter((h) => h.seq > after).sort((x, y) => x.seq - y.seq).map((h) => h.row);
    return { rows, next: seq, more: false, skipped: [], applied };
  };
  return { answer, pushed, held, put(r) { held.set(r.kind + '/' + r.id, { row: r, seq: ++seq }); }, set down(v) { down = v; } };
}

async function open(browser, o) {
  const ctx = await browser.newContext({ viewport: { width: o.w || WIDE, height: o.h || 900 }, locale: 'en-US' });
  await ctx.addInitScript((v) => { try { if (!sessionStorage.getItem('seeded')) { sessionStorage.setItem('seeded', '1'); localStorage.setItem('inspyx.signin', v); } } catch (e) { /* none */ } }, kept());
  const page = await ctx.newPage();
  page.setDefaultTimeout(8000);
  const errs = [], away = [], fileCalls = [], files = o.files;
  page.on('pageerror', (e) => errs.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource|net::ERR/.test(m.text())) errs.push(m.text()); });
  page.on('dialog', (d) => d.dismiss());
  await page.route((u) => !u.href.startsWith(HOME) && !u.href.startsWith('data:'), async (route) => {
    const req = route.request(), u = req.url(), cors = { 'access-control-allow-origin': '*' };
    if (u.startsWith(SERVER + '/functions/v1/sync')) {
      const a = o.biz.answer(JSON.parse(req.postData() || '{}'));
      return route.fulfill({ status: 200, contentType: 'application/json', headers: cors, body: JSON.stringify(a) });
    }
    if (u.startsWith(SERVER + '/storage/v1/object/')) {
      const tail = u.slice((SERVER + '/storage/v1/object/').length);
      if (req.method() === 'POST' && tail.indexOf('business-templates/') === 0) {
        const name = tail.slice('business-templates/'.length), body = req.postDataBuffer();
        fileCalls.push({ method: 'POST', name, bytes: body });
        if (files.has(name)) return route.fulfill({ status: 400, contentType: 'application/json', headers: cors, body: JSON.stringify({ statusCode: '409' }) });
        files.set(name, body);
        return route.fulfill({ status: 200, contentType: 'application/json', headers: cors, body: JSON.stringify({ Key: name }) });
      }
      if (req.method() === 'GET' && tail.indexOf('authenticated/business-templates/') === 0) {
        const name = tail.slice('authenticated/business-templates/'.length);
        fileCalls.push({ method: 'GET', name });
        if (!files.has(name)) return route.fulfill({ status: 400, contentType: 'application/json', headers: cors, body: JSON.stringify({ statusCode: '404' }) });
        return route.fulfill({ status: 200, contentType: 'application/json', headers: cors, body: files.get(name) });
      }
    }
    away.push(u); return route.abort();
  });
  await page.goto(url + 'template', { waitUntil: 'domcontentloaded' });
  return { ctx, page, errs, away, fileCalls };
}
const posts = (o) => o.fileCalls.filter((c) => c.method === 'POST');
const tplPushes = (b) => b.pushed.filter((r) => r.kind === 'inspection_templates');
const openStop = async (d) => { if (!(await d.evaluate((x) => x.open))) await d.locator('summary').click(); };
const said = async (page) => (await page.locator('[data-say]').textContent()).trim();

(async () => {
  const browser = await engine.launch();
  const SHOTS = process.env.SHOTS;

  for (const [label, w] of [['wide', WIDE], ['phone', PHONE]]) {
    await group('open, find, change and save, ' + label, async () => {
      const r1 = rowOf(MINE, 'My Walkthrough', V1, 1000);
      const biz = bizServer([r1, dflt(MINE, 1000)]), files = new Map([[fileName(r1), Buffer.from(V1)]]);
      const o = await open(browser, { w, biz, files });
      const { page } = o;
      await page.waitForSelector('[data-mine] .te-card');
      ok(label + ': the page says what it is for in one line, with its how-to in three steps, each with a tip by the finger',
        (await page.locator('.te-lede').isVisible()) && (await page.locator('.te-how-step').count()) === 3 && (await page.locator('.te-how-tip').count()) === 3);
      const mineCards = await page.locator('[data-mine] .te-card').allTextContents(), oursCards = await page.locator('[data-ours] .te-card').allTextContents();
      ok(label + ': his own copy is listed with its version and as the one new inspections use; Inspyx’s beside it',
        mineCards.length === 1 && /My Walkthrough/.test(mineCards[0]) && /Version 1/.test(mineCards[0]) && /Used for new inspections/.test(mineCards[0]) &&
        oursCards.length === 1 && /Walkthrough/.test(oursCards[0]) && /From Inspyx/.test(oursCards[0]) && !/Used/.test(oursCards[0]), JSON.stringify([mineCards, oursCards]));

      // Inspyx's: read only, with its copy button.
      await page.locator('[data-open="ours"]').click();
      await until(async () => await page.locator('[data-ro]').isVisible());
      ok(label + ': Inspyx’s opens read only: every field locked, “Make your own copy” offered, nothing written',
        (await page.locator('[data-edit] [data-k]:not([disabled])').count()) === 0 && await page.locator('[data-copy]').isVisible() && posts(o).length === 0 && biz.pushed.length === 0);

      // His: every stop, find.
      await page.locator('[data-open="' + MINE + '"]').click();
      await until(async () => !(await page.locator('[data-ro]').isVisible()) && (await page.locator('[data-name]').inputValue()) === 'My Walkthrough');
      if (w === PHONE) ok(label + ': opening one takes him down to it', await until(async () => (await page.locator('[data-edit]').boundingBox()).y < 200));
      ok(label + ': his opens: every stop of the walk, each with its items; its name editable; “Used for new inspections” shown',
        (await page.locator('.te-stop').count()) === O1.stops.length && await page.locator('[data-used]').isVisible() && !(await page.locator('[data-use]').isVisible()),
        String(await page.locator('.te-stop').count()));
      await page.fill('[data-find]', 'drainage');
      const found = (await page.locator('[data-found]').textContent()).trim();
      const shownItems = await page.locator('.te-item:visible').count();
      ok(label + ': Find narrows to the items whose words match, says how many, and opens their stops', /^\d+ match(es)?$/.test(found) && shownItems >= 1 &&
        shownItems === parseInt(found, 10) && shownItems < O1.stops.reduce((n, s) => n + s.items.length, 0), found + ' / ' + shownItems);
      await page.fill('[data-find]', '');

      // Change: the template's name, a stop, an item, a finding (words, category, what to do).
      const stopBox = page.locator('.te-stop').first();
      await openStop(stopBox);
      await page.fill('[data-name]', 'Oak Street Walkthrough');
      await stopBox.locator('[data-k*="\\"op\\":\\"stop\\""]').fill('Outside, all around');
      const item = stopBox.locator('[data-item="' + ITEM.ref + '"]');
      await item.locator('[data-k*="\\"op\\":\\"item\\""]').fill('Grading and drainage');
      const line = (f) => item.locator('[data-k*="\\"kind\\":\\"deficiency\\",\\"position\\":' + DEF.position + ',\\"f\\":\\"' + f + '\\""]');
      await line('text').fill('Soil slopes toward the house on the [side] side.');
      await line('rating').selectOption('safety');
      await line('recommendation').fill('Have a grading contractor correct the slope.');
      ok(label + ': every box of words shows all its words (none cut off)', await item.evaluate((it) =>
        [].every.call(it.querySelectorAll('textarea'), (t) => t.scrollHeight <= t.clientHeight + 2)));
      ok(label + ': each change is marked, and the bar counts them', (await page.locator('[data-count]').textContent()).trim() === '6 changes' &&
        (await page.locator('.is-changed').count()) === 6, (await page.locator('[data-count]').textContent()).trim());
      if (SHOTS) {
        await item.scrollIntoViewIfNeeded();
        await page.screenshot({ path: path.join(SHOTS, 'te-edit-' + label + '.png'), fullPage: false });
        await page.screenshot({ path: path.join(SHOTS, 'te-top-' + label + '.png'), fullPage: false, clip: { x: 0, y: 0, width: w, height: 900 } });
      }
      await page.locator('[data-save]').click();
      await until(async () => /^Saved/.test(await said(page)));
      const want = TE.apply(V1, [{ op: 'template', name: 'Oak Street Walkthrough' }, { op: 'stop', ref: STOP.ref, name: 'Outside, all around' },
        { op: 'item', ref: ITEM.ref, label: 'Grading and drainage' }, { op: 'line', item: ITEM.ref, kind: 'deficiency', position: DEF.position,
          text: 'Soil slopes toward the house on the [side] side.', rating: 'safety', recommendation: 'Have a grading contractor correct the slope.' }]);
      const pushed = tplPushes(biz), up = posts(o);
      ok(label + ': Save writes the file the phone’s rules make (version 2), then its row: his name, its base the version it was made from',
        up.length === 1 && up[0].bytes.toString('utf8') === want.text && pushed.length === 1 && pushed[0].data.version === '2' &&
        pushed[0].data.name === 'Oak Street Walkthrough' && pushed[0].data.source === 'copied' && pushed[0].data.sha256 === sha(want.text) &&
        pushed[0].data.base === await TS.contentKey(V1, digest) && biz.pushed.filter((r) => r.kind === 'template_default').length === 0,
        JSON.stringify(pushed.map((r) => [r.data.version, r.data.name])));
      ok(label + ': it says so, the bar goes, and the list shows the new version and name', await said(page) === 'Saved as version 2. New inspections start from it.' &&
        !(await page.locator('[data-bar]').isVisible()) && /Oak Street Walkthrough/.test(await page.locator('[data-mine] .te-card').first().textContent()) &&
        /Version 2/.test(await page.locator('[data-mine] .te-card').first().textContent()));
      if (SHOTS) { await page.locator('[data-say]').scrollIntoViewIfNeeded(); await page.screenshot({ path: path.join(SHOTS, 'te-saved-' + label + '.png'), fullPage: false }); }
      ok(label + ': no errors, nothing else leaves the site' + (w === PHONE ? ', nothing off the side' : ''), o.errs.length === 0 && o.away.length === 0 &&
        (w !== PHONE || await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)), JSON.stringify([o.errs, o.away]));
      await o.ctx.close();
    });
  }

  await group('changed on the phone meanwhile; the feed down; an emptied name', async () => {
    const r1 = rowOf(MINE, 'My Walkthrough', V1, 1000);
    const biz = bizServer([r1, dflt(MINE, 1000)]), files = new Map([[fileName(r1), Buffer.from(V1)]]);
    const o = await open(browser, { w: WIDE, biz, files });
    const { page } = o;
    await page.waitForSelector('[data-open="' + MINE + '"]');
    await page.locator('[data-open="' + MINE + '"]').click();
    await until(async () => (await page.locator('.te-stop').count()) > 0);
    const stopBox = page.locator('.te-stop').first();
    await openStop(stopBox);
    await stopBox.locator('[data-k*="\\"op\\":\\"stop\\""]').fill('Outside, all around');
    // The phone saves version 2 meanwhile (another item renamed).
    const other = O1.stops[1].items[0];
    const v2 = TE.apply(V1, [{ op: 'item', ref: other.ref, label: 'Changed on the phone' }]);
    const r2 = rowOf(MINE, 'My Walkthrough', v2.text, 2000, 'copied', await TS.contentKey(V1, digest));
    files.set(fileName(r2), Buffer.from(v2.text)); biz.put(r2);
    await page.locator('[data-save]').click();
    await until(async () => /^Saved/.test(await said(page)));
    const last = tplPushes(biz).pop(), text = last ? files.get(fileName(last)).toString('utf8') : '';
    const out = text ? TE.outline(text) : null;
    ok('changed on the phone meanwhile: his change goes on top of the phone’s, as version 3, both kept, its base the phone’s',
      !!out && out.version === '3' && out.stops[0].name === 'Outside, all around' && out.stops[1].items[0].label === 'Changed on the phone' &&
      last.data.base === await TS.contentKey(v2.text, digest), out ? out.version : 'none');

    ok('after a save, the stop he had open is still open', await stopBox.evaluate((x) => x.open));
    // The feed down: nothing written.
    await stopBox.locator('[data-k*="\\"op\\":\\"stop\\""]').fill('Outside');
    const before = [posts(o).length, biz.pushed.length];
    biz.down = true;
    await page.locator('[data-save]').click();
    ok('the feed down at Save: it says it didn’t go through, and writes nothing', await until(async () => await said(page) === 'That didn’t go through. Try again.') &&
      posts(o).length === before[0] && biz.pushed.length === before[1]);
    biz.down = false;

    // An emptied name: said, nothing written.
    await stopBox.locator('[data-k*="\\"op\\":\\"stop\\""]').fill('   ');
    await page.locator('[data-save]').click();
    ok('an emptied name: it says every part needs one, and writes nothing', await until(async () => await said(page) === 'Every stop, item and comment needs a name.') &&
      posts(o).length === before[0] && biz.pushed.length === before[1]);
    await page.locator('[data-discard]').click();
    ok('Discard puts every field back', !(await page.locator('[data-bar]').isVisible()) && (await page.locator('.is-changed').count()) === 0);
    await o.ctx.close();
  });

  for (const [what, picked, makesDefault] of [['new inspections start from ours: his copy becomes the one they start from', 'inspyx.walkthrough', true],
    ['a default he picked himself is kept', 'inspector.converted-one', false], ['no default at all: his copy becomes it', null, true]]) {
    await group('make your own copy: ' + what, async () => {
      const conv = rowOf('inspector.converted-one', 'Converted one', V1.split(MINE).join('inspector.converted-one').split('"My Walkthrough"').join('"Converted one"'), 800, 'converted');
      const biz = bizServer(picked ? [dflt(picked, 900)].concat(picked === 'inspector.converted-one' ? [conv] : []) : []), files = new Map();
      const o = await open(browser, { w: WIDE, biz, files });
      const { page } = o;
      await page.waitForSelector('[data-open="ours"]');
      if (picked !== 'inspector.converted-one') ok('no own template yet: it says so, and how to get one', await page.locator('[data-mine-none]').isVisible());
      await page.locator('[data-open="ours"]').click();
      await until(async () => await page.locator('[data-copy]').isVisible());
      await page.locator('[data-copy]').click();
      await until(async () => /^Your own copy is made/.test(await said(page)));
      const p = tplPushes(biz), d = biz.pushed.filter((r) => r.kind === 'template_default');
      ok('make your own copy (' + what + '): the phone’s copy, as version 1, then it opens to change', p.length === 1 && p[0].id === MINE && p[0].data.version === '1' &&
        posts(o)[0].bytes.toString('utf8') === V1 && !p[0].data.base && !(await page.locator('[data-ro]').isVisible()) &&
        (await page.locator('[data-edit] [data-k]:not([disabled])').count()) > 0 &&
        (makesDefault ? d.length === 1 && d[0].data.templateId === MINE && await said(page) ===
          'Your own copy is made, and new inspections now start from it. Change anything; Save makes its next version.'
          : d.length === 0 && await said(page) === 'Your own copy is made. Change anything; Save makes its next version.'),
        JSON.stringify([p.map((x) => x.id), d.map((x) => x.data.templateId), await said(page)]));
      if (!makesDefault) {
        await page.locator('[data-use]').click();
        await until(async () => /^New inspections now start from/.test(await said(page)));
        const d2 = biz.pushed.filter((r) => r.kind === 'template_default');
        ok('“Use for new inspections” makes it the one they start from, and says so', d2.length === 1 && d2[0].data.templateId === MINE && d2[0].updated_at > 900 &&
          await said(page) === 'New inspections now start from “My Walkthrough”, instead of “Converted one”.' && await page.locator('[data-used]').isVisible(), await said(page));
      }
      ok('no errors, nothing else leaves the site', o.errs.length === 0 && o.away.length === 0, JSON.stringify([o.errs, o.away]));
      await o.ctx.close();
    });
  }

  // His design bar (the lead, 2026-11-26): measured at 375, 393 and 430 wide, and in large text, with real long names.
  const LONG = 'Smith & Daughters Home Inspection — Full Residential Walkthrough with Pool, Spa and Outbuildings';
  const longText = TE.apply(V1, [{ op: 'template', name: LONG }, { op: 'stop', ref: STOP.ref, name: 'Mechanical closet, water heater, air handler and condensate drain' },
    { op: 'item', ref: ITEM.ref, label: 'Grading, drainage, downspout extensions and splash blocks along the foundation' }]).text;
  for (const w of [375, 393, 430]) for (const big of [false, true]) {
    await group('measured at ' + w + (big ? ', large text' : ''), async () => {
      const r = rowOf(MINE, LONG, longText, 1000);
      const biz = bizServer([r, dflt(MINE, 1000)]), files = new Map([[fileName(r), Buffer.from(longText)]]);
      const o = await open(browser, { w, h: 812, biz, files });
      const { page } = o;
      // Large text: the page drawn a third bigger, as a phone's larger text setting does.
      if (big) await page.evaluate(() => { document.documentElement.style.zoom = '1.35'; });
      await page.waitForSelector('[data-open="' + MINE + '"]');
      await page.locator('[data-open="' + MINE + '"]').click();
      await until(async () => (await page.locator('.te-stop').count()) > 0);
      const first = page.locator('.te-stop').first();
      await openStop(first);
      await first.locator('[data-k*="\\"op\\":\\"stop\\""]').fill('Mechanical closet, water heater, air handler and condensate drain, renamed');
      const at = w + (big ? ' large' : '');
      const fit = await page.evaluate(() => {
        const cut = [].filter.call(document.querySelectorAll('.te-card b, .te-stop > summary b, .te-lede, .te-how-step, .te-say, .te-how-tip, .te-acts, .te-bar'), (e) => e.offsetParent && e.scrollWidth > e.clientWidth + 1)
          .map((e) => e.className + ':' + e.scrollWidth + '>' + e.clientWidth);
        const wide = [].filter.call(document.querySelectorAll('main *'), (e) => e.getBoundingClientRect().right > document.documentElement.clientWidth + 1 && e.offsetParent)
          .slice(0, 4).map((e) => e.tagName + '.' + e.className + ':' + Math.round(e.getBoundingClientRect().right));
        return { ok: document.documentElement.scrollWidth <= document.documentElement.clientWidth && !cut.length && !wide.length, cut, wide };
      });
      ok(at + ': nothing off the side; no long name cut off (cards, stop titles, tips, the bar)', fit.ok, JSON.stringify([fit.cut, fit.wide]));
      // The last field of the open stop, focused: above the bar, never under it.
      const last = first.locator('[data-k]').last();
      await last.focus();
      await page.keyboard.press('End');
      await page.waitForTimeout(300);
      const clear = await page.evaluate(() => {
        const bar = document.querySelector('[data-bar]').getBoundingClientRect(), f = document.activeElement.getBoundingClientRect();
        return { ok: f.bottom <= bar.top + 1, f: Math.round(f.bottom), bar: Math.round(bar.top) };
      });
      ok(at + ': a focused field is never under the changes bar', clear.ok, JSON.stringify(clear));
      await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
      await page.waitForTimeout(200);
      const end = await page.evaluate(() => {
        const bar = document.querySelector('[data-bar]').getBoundingClientRect();
        const fields = [].filter.call(document.querySelectorAll('.te-stop[open] [data-k]'), (x) => x.offsetParent);
        const f = fields[fields.length - 1].getBoundingClientRect();
        return { ok: f.bottom <= bar.top + 1, f: Math.round(f.bottom), bar: Math.round(bar.top) };
      });
      ok(at + ': scrolled to the end, the last field sits above the bar', end.ok, JSON.stringify(end));
      if (SHOTS && w === 393) await page.screenshot({ path: path.join(SHOTS, 'te-measure-' + w + (big ? '-large' : '') + '.png') });
      ok(at + ': no errors', o.errs.length === 0 && o.away.length === 0, JSON.stringify([o.errs, o.away]));
      await o.ctx.close();
    });
  }

  await browser.close();
  console.log(failed ? failed + ' FAILED' : 'ALL PASS');
  process.exit(failed ? 1 : 0);
})();
