// Self-checks for repair requests (2026-11-24, his list item 11): the builder on a report page (/r) and the shared
// document (/repair). NOTHING REAL IS ASKED: the report function is a stand-in this test runs itself, with the
// server's rules (README "Repair requests" in the app repo): every finding checked against the report, the total
// worked out by the stand-in, a save from a page older than the report refused, a share frozen under its own key.
// The report is tools/repair_sample.json (made with the app repo's own view code from made-up findings).
// usage: node tools/serve.js &   then   node tools/check_repair.js   (BROWSER=webkit for Safari's engine; SHOTS=<dir>)
const fs = require('fs');
const path = require('path');
const playwright = require('playwright');
const engine = process.env.BROWSER === 'webkit' ? playwright.webkit : playwright.chromium;

const url = process.env.URL || 'http://localhost:4173/';
const HOME = new URL(url).origin;
const API = 'https://btxlrfvqifnrnxffohsz.supabase.co/functions/v1/report';
const KEY = 'AbCdEfGhIjKlMnOpQrStUv', AGENT = 'ZyXwVuTsRqPoNmLkJiHgFe', LOCKED = 'LoCkEdLoCkEdLoCkEdLoCk';
const SETTLE_MS = 700;   // repair.js waits this long after a change before it saves
const SAMPLE = JSON.parse(fs.readFileSync(path.join(__dirname, 'repair_sample.json'), 'utf8'));
const FINDINGS = new Set();
SAMPLE.report.sections.forEach((s) => s.items.forEach((i) => i.findings.forEach((f) => FINDINGS.add(f.id))));
let failed = 0;
const ok = (name, cond, extra) => { if (!cond) failed++; console.log((cond ? 'PASS  ' : 'FAIL  ') + name + (extra ? '  [' + extra + ']' : '')); };
const group = async (label, fn) => { try { await fn(); } catch (e) { ok(label + ': these checks could not run', false, String((e && e.message) || e).split('\n')[0]); } };
const until = async (fn, ms) => { const end = Date.now() + (ms || 4000); for (;;) { if (await fn()) return true; if (Date.now() > end) return false; await new Promise((r) => setTimeout(r, 50)); } };

/* The report function, as far as these pages reach it. */
function server() {
  const s = { saves: [], requests: {}, shares: {}, version: SAMPLE.published_at, changed: false, docKeys: 0, saveDelay: 0, failSaves: 0, dropSaves: 0 };
  s.answer = (body) => {
    if (body.repair_doc) { const d = s.shares[body.repair_doc]; return d ? [200, { state: 'repair_doc', doc: d, created_at: 1 }] : [404, { state: 'gone' }]; }
    if (body.key === LOCKED) return body.repair ? [403, { state: 'locked' }] : [200, Object.assign({}, SAMPLE, { published_at: s.version })];
    if (body.key !== KEY && body.key !== AGENT) return [404, { state: 'gone' }];
    const role = body.key === AGENT ? 'agent' : 'client';
    if (!body.repair) return [200, Object.assign({}, SAMPLE, { published_at: s.version })];
    const held = s.requests[body.key] || { items: [], note: '' };
    const total = (items) => items.reduce((n, i) => n + (i.ask === 'credit' ? i.cents : 0), 0);
    if (body.repair === 'get') return [200, { state: 'repair', role, items: held.items, note: held.note, total_cents: total(held.items), missing: [], updated_at: null, shares: 0 }];
    if (body.repair === 'save') {
      s.saves.push(body);
      if (s.failSaves > 0) { s.failSaves--; return [503, { error: 'database' }]; }
      if (s.changed || body.version !== s.version) return [409, { error: 'report_changed' }];
      for (const i of body.items) {
        if (!FINDINGS.has(i.finding)) return [400, { error: 'finding' }];
        if (i.ask === 'credit' && !(Number.isSafeInteger(i.cents) && i.cents >= 0 && i.cents <= 100000000)) return [400, { error: 'amount' }];
      }
      s.requests[body.key] = { items: body.items.map((i) => ({ finding: i.finding, ask: i.ask, cents: i.ask === 'credit' ? i.cents : null, note: i.note || '' })), note: body.note || '' };
      return [200, { state: 'saved', role, total_cents: total(body.items), updated_at: Date.now() }];
    }
    if (body.repair === 'share') {
      if (!held.items.length) return [409, { error: 'empty' }];
      const docKey = ('Doc' + String(++s.docKeys).padStart(19, '0')).slice(0, 22);
      const byId = {};
      SAMPLE.report.sections.forEach((sec) => sec.items.forEach((it) => it.findings.forEach((f) => { byId[f.id] = f; })));
      s.shares[docKey] = {
        format: 1, role, address: SAMPLE.report.cover.address, locality: SAMPLE.report.cover.locality,
        inspected: SAMPLE.report.cover.inspected_day, company: SAMPLE.report.cover.inspector.company, report: 'ABCD1234',
        items: held.items.map((i) => ({ number: byId[i.finding].number, title: byId[i.finding].title, place: byId[i.finding].place, category: byId[i.finding].category, recommendation: byId[i.finding].recommendation, ask: i.ask, cents: i.cents, note: i.note })),
        note: held.note, total_cents: total(held.items),
      };
      return [200, { state: 'shared', key: docKey, created_at: 1, total_cents: total(held.items) }];
    }
    return [400, { error: 'repair' }];
  };
  return s;
}

async function open(browser, o) {
  const ctx = await browser.newContext({ viewport: { width: o.w || 1280, height: 900 }, locale: 'en-US' });
  const page = await ctx.newPage();
  page.setDefaultTimeout(8000);
  const errs = [], away = [], asked = [];
  page.on('pageerror', (e) => errs.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource|net::ERR/.test(m.text())) errs.push(m.text()); });
  await page.route((u) => !u.href.startsWith(HOME) && !u.href.startsWith('data:'), async (route) => {
    const req = route.request(), u = req.url();
    if (u === API && req.method() === 'POST') {
      const body = JSON.parse(req.postData() || '{}');
      asked.push(body);
      // A slow save is kept when it is answered, as a real one: never before.
      if (body.repair === 'save' && o.server.saveDelay) await new Promise((r) => setTimeout(r, o.server.saveDelay));
      if (body.repair === 'save' && o.server.dropSaves > 0) { o.server.dropSaves--; o.server.saves.push(body); return route.abort('failed'); }
      if (body.repair === 'share' && o.server.dropShares > 0) { o.server.dropShares--; return route.abort('failed'); }
      const [status, json] = o.server.answer(body);
      return route.fulfill({ status, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(json) });
    }
    away.push(u); return route.abort();
  });
  const res = await page.goto(url + (o.at || ('r#' + (o.key || KEY))), { waitUntil: 'load' });
  return { ctx, page, errs, away, asked, res };
}

const shot = async (page, sel, name) => {
  if (!process.env.SHOTS) return;
  await page.waitForTimeout(350);
  const target = sel ? page.locator(sel).first() : page;
  await target.screenshot({ path: path.join(process.env.SHOTS, name + '.png') });
};

(async () => {
  const browser = await engine.launch();
  console.log('browser: ' + engine.name() + ' ' + browser.version());

  for (const [label, w] of [['wide', 1280], ['phone', 390]]) {
    await group('build and share, ' + label, async () => {
      const s = server();
      const { page, ctx, errs, away, asked } = await open(browser, { server: s, w });
      ok(label + ': each finding offers "Add to repair request"; the bar waits for one',
        await until(async () => (await page.locator('[data-rr-add]').count()) === FINDINGS.size) &&
        (await page.locator('[data-rr-add]').first().textContent()) === 'Add to repair request' && !(await page.locator('[data-rr-bar]').isVisible()));
      ok(label + ': it asked for what this link already holds, with the link\'s own key', asked.some((b) => b.key === KEY && b.repair === 'get'));
      await page.locator('[data-rr-add="C1.1"]').click();
      await page.locator('[data-rr-add="C2.1"]').click();
      ok(label + ': picked, each says so, and the bar counts them with the total', (await page.locator('[data-rr-add="C1.1"]').getAttribute('aria-pressed')) === 'true' &&
        /2 findings/.test(await page.locator('[data-rr-bar]').textContent()) && /Total credit requested: \$0\.00/.test(await page.locator('[data-rr-bar]').textContent()));
      await shot(page, null, label + '-1-picked');
      await page.locator('[data-rr-open]').click();
      const item = page.locator('[data-rr-item="C1.1"]');
      await item.locator('[data-rr-ask="credit"]').click();
      await page.locator('[data-rr-amount="C1.1"]').fill('1,250');
      await page.locator('[data-rr-note="C1.1"]').fill('Per roofer’s quote');
      ok(label + ': a credit\'s amount adds to the total at once', (await page.locator('[data-rr-total] strong').textContent()) === '$1,250.00');
      ok(label + ': the amount box says dollars: a "$" the person never types', (await page.locator('[data-rr-item="C1.1"] .rr-cur').textContent()) === '$' &&
        (await page.locator('[data-rr-amount="C1.1"]').inputValue()) === '1,250');
      ok(label + ': the sheet has its how-to, in three steps', await page.locator('.rr-how').isVisible() && (await page.locator('.rr-how-step').count()) === 3);
      ok(label + ': the sheet says the inspector doesn\'t price or approve', /doesn’t price repairs or approve credits/.test(await page.locator('[data-rr-sheet]').textContent()));
      await until(async () => s.saves.length > 0 && JSON.stringify(s.saves[s.saves.length - 1]).includes('Per roofer’s quote'), 4000);
      const last = s.saves[s.saves.length - 1] || {};
      ok(label + ': it saves what is on the page, with the report\'s version, a moment after a change',
        last.version === SAMPLE.published_at && JSON.stringify(last.items) === JSON.stringify([
          { finding: 'C1.1', ask: 'credit', note: 'Per roofer’s quote', cents: 125000 }, { finding: 'C2.1', ask: 'repair', note: '' }]), JSON.stringify(last.items));
      await shot(page, '[data-rr-sheet]', label + '-2-sheet');

      // An amount that isn't one: never saved, Share waits.
      const before = s.saves.length;
      await page.locator('[data-rr-amount="C1.1"]').fill('12.345');
      await page.waitForTimeout(1000);
      ok(label + ': an amount that isn\'t dollars and cents is marked, never saved, and Share waits',
        s.saves.length === before && (await page.locator('[data-rr-amount="C1.1"]').getAttribute('aria-invalid')) === 'true' && await page.locator('[data-rr-share]').isDisabled());
      await page.locator('[data-rr-amount="C1.1"]').fill('1250');
      await until(async () => !(await page.locator('[data-rr-share]').isDisabled()));
      await page.locator('[data-rr-share]').click();
      ok(label + ': shared, it gives the document\'s link to send, and says Inspyx sends nothing',
        await until(async () => /^https:\/\/inspyx\.com\/repair#[A-Za-z0-9_-]{22}$/.test(await page.locator('[data-rr-link]').inputValue().catch(() => ''))) &&
        /Inspyx doesn’t send it to anyone/.test(await page.locator('[data-rr-done]').textContent()));
      ok(label + ': the share went after the last save', asked.findIndex((b) => b.repair === 'share') > asked.map((b) => b.repair).lastIndexOf('save'));
      await shot(page, '[data-rr-sheet]', label + '-3-shared');
      const link = await page.locator('[data-rr-link]').inputValue();
      ok(label + ': no errors, nothing else leaves the page', errs.length === 0 && away.length === 0, errs.concat(away).join(' | '));
      ok(label + ': nothing runs off the side', await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth));
      await ctx.close();

      // The document, as the agent would open it.
      const d = await open(browser, { server: s, w, at: 'repair#' + link.split('#')[1] });
      ok(label + ': the document shows the house, who made it, each finding\'s ask and the total',
        await until(async () => await d.page.locator('[data-rd-sheet]').isVisible()) &&
        (await d.page.locator('[data-rd-v="address"]').textContent()) === '12 Palm Way' &&
        /Prepared by the client from the inspection report by Rivera Inspections/.test(await d.page.locator('[data-rd-v="by"]').textContent()) &&
        (await d.page.locator('[data-rd-items] tr').count()) === 2 &&
        (await d.page.locator('[data-rd-v="total"]').textContent()) === '$1,250.00', await d.page.locator('[data-rd-sheet]').textContent().catch(() => ''));
      ok(label + ': its key is taken out of the address at once', new URL(d.page.url()).pathname === '/repair' && !d.page.url().includes('#'));
      ok(label + ': it says amounts are requests, and offers Save as PDF', /Amounts are requests, not estimates/.test(await d.page.locator('.rd-f').textContent()) && await d.page.locator('[data-rd-print]').isVisible());
      ok(label + ': served under its own rule: this site\'s scripts only, the report function and nothing else', /script-src 'self';/.test(d.res.headers()['content-security-policy'] || '') && /connect-src 'self' https:\/\/btxlrfvqifnrnxffohsz\.supabase\.co;/.test(d.res.headers()['content-security-policy'] || ''), (d.res.headers()['content-security-policy'] || '').slice(0, 80));
      ok(label + ': the document page has no errors and nothing off the side', d.errs.length === 0 && d.away.length === 0 && await d.page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), d.errs.join(' | '));
      await shot(d.page, null, label + '-4-document');
      await d.ctx.close();
    });
  }

  await group('Share right after a change: what is shared is what is on the page', async () => {
    const s = server();
    const { page, ctx, asked } = await open(browser, { server: s });
    await until(async () => (await page.locator('[data-rr-add]').count()) > 0);
    await page.locator('[data-rr-add="C1.1"]').click();
    await page.locator('[data-rr-open]').click();
    await page.locator('[data-rr-item="C1.1"] [data-rr-ask="credit"]').click();
    await page.locator('[data-rr-amount="C1.1"]').fill('900');
    await page.locator('[data-rr-share]').click();   // at once, inside the moment a save waits
    await until(async () => asked.some((b) => b.repair === 'share'));
    const shareAt = asked.findIndex((b) => b.repair === 'share');
    const saves = asked.slice(0, shareAt).filter((b) => b.repair === 'save');
    const last = saves[saves.length - 1] || {};
    ok('share at once: the save with the new amount went first', JSON.stringify(last.items || []).includes('"cents":90000'), JSON.stringify(saves.map((x) => x.items)));
    await ctx.close();
  });

  await group('Share while a save is on the wire, and after a failed one: what is shared is what is on the page (Codex on #91)', async () => {
    const s = server();
    s.saveDelay = 900;
    const { page, ctx, asked } = await open(browser, { server: s });
    await until(async () => (await page.locator('[data-rr-add]').count()) > 0);
    await page.locator('[data-rr-add="C1.1"]').click();
    await page.locator('[data-rr-open]').click();
    await page.locator('[data-rr-item="C1.1"] [data-rr-ask="credit"]').click();
    await page.locator('[data-rr-amount="C1.1"]').fill('500');
    await page.waitForTimeout(SETTLE_MS + 200);   // the $500 save is on the wire, slowly
    await page.locator('[data-rr-amount="C1.1"]').fill('700');
    await page.locator('[data-rr-share]').click();
    await until(async () => Object.keys(s.shares).length === 1, 6000);
    const shared = Object.values(s.shares)[0] || { items: [] };
    ok('in flight: the share froze the amount on the page, $700', shared.items[0] && shared.items[0].cents === 70000, JSON.stringify(shared.items));
    await ctx.close();

    const f = server();
    f.failSaves = 1;
    const b = await open(browser, { server: f });
    await until(async () => (await b.page.locator('[data-rr-add]').count()) > 0);
    await b.page.locator('[data-rr-add="C1.2"]').click();
    await until(async () => f.saves.length === 1, 3000);   // that save fails
    await b.page.locator('[data-rr-open]').click();
    await b.page.locator('[data-rr-share]').click();
    await until(async () => Object.keys(f.shares).length === 1, 6000);
    const order = b.asked.map((x) => x.repair).filter(Boolean);
    ok('after a failed save: Share saved again first, then shared what is on the page', f.saves.length === 2 && order.lastIndexOf('save') < order.indexOf('share') &&
      (Object.values(f.shares)[0] || { items: [] }).items.map((i) => i.title).join() === 'Loose flashing', JSON.stringify(order));
    await b.ctx.close();

    const g = server();
    g.dropSaves = 1;
    const c = await open(browser, { server: g });
    await until(async () => (await c.page.locator('[data-rr-add]').count()) > 0);
    await c.page.locator('[data-rr-add="C2.1"]').click();
    await until(async () => g.saves.length === 1, 3000);   // that save never arrives
    await c.page.waitForTimeout(300);
    await c.page.locator('[data-rr-open]').click();
    await c.page.locator('[data-rr-share]').click();
    await until(async () => Object.keys(g.shares).length === 1, 6000);
    ok('after a save that never arrived: Share saved again first', g.saves.length === 2 &&
      (Object.values(g.shares)[0] || { items: [] }).items.map((i) => i.title).join() === 'Corroded fitting', String(g.saves.length));
    await c.ctx.close();

    const h = server();
    h.dropShares = 1;
    const d = await open(browser, { server: h });
    await until(async () => (await d.page.locator('[data-rr-add]').count()) > 0);
    await d.page.locator('[data-rr-add="C2.1"]').click();
    await until(async () => h.saves.length === 1, 3000);
    await d.page.locator('[data-rr-open]').click();
    await d.page.locator('[data-rr-share]').click();   // that share never arrives
    await until(async () => /\S/.test(await d.page.locator('[data-rr-status]').textContent()) && !/Saved|Saving/.test(await d.page.locator('[data-rr-status]').textContent()), 4000);
    const said = await d.page.locator('[data-rr-status]').textContent();
    ok('a share that never arrived: it says so, no link, Share still on', said.trim().length > 0 && !/Saved|Saving/.test(said) &&
      (await d.page.locator('[data-rr-done]').count()) === 0 && !(await d.page.locator('[data-rr-share]').isDisabled()), said);
    await d.page.locator('[data-rr-share]').click();
    await until(async () => Object.keys(h.shares).length === 1, 4000);
    await until(async () => (await d.page.locator('[data-rr-done]').count()) === 1, 3000);
    ok('the next Share works, and the error is gone', (await d.page.locator('[data-rr-done]').count()) === 1 &&
      (await d.page.locator('[data-rr-status]').textContent()) !== said, await d.page.locator('[data-rr-status]').textContent());
    ok('a share that never arrived: no error on the page', d.errs.length === 0, d.errs.join(' | '));
    await d.ctx.close();
  });

  await group('the sheet is what is shared: Remove takes a finding off it; back to Credit, its amount counts (Codex on #91, r2)', async () => {
    const s = server();
    const { page, ctx } = await open(browser, { server: s });
    await until(async () => (await page.locator('[data-rr-add]').count()) > 0);
    await page.locator('[data-rr-add="C1.1"]').click();
    await page.locator('[data-rr-add="C1.2"]').click();
    await page.locator('[data-rr-open]').click();
    await page.locator('[data-rr-item="C1.2"] .rr-remove').click();
    ok('Remove: the finding goes from the sheet at once, and from its card', (await page.locator('[data-rr-item="C1.2"]').count()) === 0 &&
      (await page.locator('[data-rr-add="C1.2"]').getAttribute('aria-pressed')) === 'false');
    const item = page.locator('[data-rr-item="C1.1"]');
    await item.locator('[data-rr-ask="credit"]').click();
    await page.locator('[data-rr-amount="C1.1"]').fill('300');
    await page.locator('[data-rr-item="C1.1"] [data-rr-ask="repair"]').click();
    ok('Repair: no credit counts', (await page.locator('[data-rr-total] strong').textContent()) === '$0.00');
    await page.locator('[data-rr-item="C1.1"] [data-rr-ask="credit"]').click();
    ok('back to Credit: the amount in the box counts again, and Share is open', (await page.locator('[data-rr-amount="C1.1"]').inputValue()) === '300' &&
      (await page.locator('[data-rr-total] strong').textContent()) === '$300.00' && !(await page.locator('[data-rr-share]').isDisabled()));
    await until(async () => JSON.stringify((s.saves[s.saves.length - 1] || {}).items || []) === JSON.stringify([{ finding: 'C1.1', ask: 'credit', note: '', cents: 30000 }]), 3000);
    ok('back to Credit: what is saved is the sheet: one finding, a $300 credit', JSON.stringify((s.saves[s.saves.length - 1] || {}).items) === JSON.stringify([{ finding: 'C1.1', ask: 'credit', note: '', cents: 30000 }]), JSON.stringify((s.saves[s.saves.length - 1] || {}).items));
    await ctx.close();
  });

  await group('an edit after Share takes the shared link away (it is of the older sheet) (Codex on #91, r3)', async () => {
    const s = server();
    const { page, ctx } = await open(browser, { server: s });
    await until(async () => (await page.locator('[data-rr-add]').count()) > 0);
    await page.locator('[data-rr-add="C1.1"]').click();
    await page.locator('[data-rr-open]').click();
    await page.locator('[data-rr-item="C1.1"] [data-rr-ask="credit"]').click();
    await page.locator('[data-rr-amount="C1.1"]').fill('400');
    await page.locator('[data-rr-share]').click();
    await until(async () => await page.locator('[data-rr-done]').isVisible());
    await page.locator('[data-rr-amount="C1.1"]').fill('450');
    ok('edited after sharing: the old link is gone at once', (await page.locator('[data-rr-done]').count()) === 0);
    await page.waitForTimeout(1200);
    ok('and stays gone once the new amount is saved', (await page.locator('[data-rr-done]').count()) === 0 && JSON.stringify(s.saves[s.saves.length - 1].items).includes('"cents":45000'));
    await ctx.close();
  });

  await group('a page older than the report: it says so, and saves nothing', async () => {
    const s = server();
    const { page, ctx } = await open(browser, { server: s });
    await until(async () => (await page.locator('[data-rr-add]').count()) > 0);
    s.changed = true;
    await page.locator('[data-rr-add="C1.1"]').click();
    await page.locator('[data-rr-open]').click();
    ok('report changed: it asks to reload, Share waits', await until(async () => /updated the report/.test(await page.locator('[data-rr-status]').textContent())) &&
      await page.locator('.rr-reload').isVisible() && await page.locator('[data-rr-share]').isDisabled());
    ok('report changed: nothing was kept', Object.keys(s.requests).length === 0);
    await ctx.close();
  });

  await group('back again: what was saved is there; the agent shares as the agent', async () => {
    const s = server();
    s.requests[KEY] = { items: [{ finding: 'C1.2', ask: 'replace', cents: null, note: '' }], note: 'Before closing' };
    const { page, ctx } = await open(browser, { server: s });
    ok('reload: the finding picked before is picked', await until(async () => (await page.locator('[data-rr-add="C1.2"]').getAttribute('aria-pressed')) === 'true'));
    await ctx.close();
    const a = await open(browser, { server: s, key: AGENT });
    await until(async () => (await a.page.locator('[data-rr-add]').count()) > 0);
    await a.page.locator('[data-rr-add="C2.1"]').click();
    await a.page.locator('[data-rr-open]').click();
    ok('agent: the button is Share, not "with your agent"', (await a.page.locator('[data-rr-share]').textContent()) === 'Share');
    await a.ctx.close();
  });

  await group('no builder where the link isn\'t open to it, and none for a gone document', async () => {
    const s = server();
    const { page, ctx } = await open(browser, { server: s, key: LOCKED });
    await page.waitForTimeout(800);
    ok('locked to this link: the report stands, no builder', (await page.locator('[data-rr-add]').count()) === 0 && !(await page.locator('[data-rr-bar]').isVisible().catch(() => false)));
    await ctx.close();
    const d = await open(browser, { server: s, at: 'repair#NoSuchDocNoSuchDocNoSu' });
    ok('a document key no share has: it says so', await until(async () => await d.page.locator('[data-rd-state="gone"]').isVisible()));
    await d.ctx.close();
  });

  await browser.close();
  console.log(failed ? `\n${failed} FAILED` : '\nALL PASS');
  process.exit(failed ? 1 : 0);
})();
