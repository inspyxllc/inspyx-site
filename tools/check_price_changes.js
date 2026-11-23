// Self-checks for price changes and your questions on /prices (2026-11-23, job 3, Inspyx 4).
// NOTHING REAL IS ASKED OR CHANGED HERE: the sync function is a stand-in this test runs itself (as in
// check_prices.js), the sign-in is a made-up one, and any other request that tries to leave the site is stopped.
// usage: node tools/serve.js &   then   node tools/check_price_changes.js   (SHOTS=<dir> to keep screenshots)
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

const T = Date.now() - 10 * 60000;
function server() {
  const held = new Map(); let tick = 0;
  const changedAt = () => new Date(Date.UTC(2026, 10, 16, 12) + (++tick)).toISOString();
  const norm = (c) => String(c || '').trim().toUpperCase();
  const put = (r) => held.set(r.kind + '/' + r.id, Object.assign({}, r, { changed_at: changedAt() }));
  const push = (rows) => {
    const skipped = [], applied = [];
    for (const r of rows) {
      const h = held.get(r.kind + '/' + r.id);
      if (h && !(r.updated_at > h.updated_at)) { applied.push({ kind: r.kind, id: r.id, applied: false }); continue; }
      if (r.kind === 'price_services' && r.deleted_at === null && r.data.parentId != null) {
        const p = held.get('price_services/' + r.data.parentId);
        if (!p || p.deleted_at !== null) { skipped.push({ kind: r.kind, id: r.id, reason: 'price:parent' }); continue; }
      }
      if (r.kind === 'price_discounts' && r.deleted_at === null) {
        const clash = [...held.values()].some((x) => x.kind === 'price_discounts' && x.id !== r.id && x.deleted_at === null && norm(x.data.code) === norm(r.data.code));
        if (clash) { skipped.push({ kind: r.kind, id: r.id, reason: 'price:code_taken' }); continue; }
      }
      put(r); applied.push({ kind: r.kind, id: r.id, applied: true });
    }
    return { skipped, applied };
  };
  const row = (kind, data) => ({ kind, id: data.id, updated_at: data.updatedAt, deleted_at: data.deletedAt, data });
  return { held, push, put, row, value: (kind, id) => (held.get(kind + '/' + id) || {}).data };
}

function seed(s) {
  const base = { ownerAccountId: ME, createdAt: T, updatedAt: T, deletedAt: null };
  s.put(s.row('price_services', Object.assign({ id: 'svc-home', parentId: null, name: 'Home inspection', description: 'The whole house.', feeCents: 40000, minutes: 180, minimumFeeCents: 35000, position: 0 }, base)));
  s.put(s.row('price_services', Object.assign({ id: 'svc-condo', parentId: null, name: 'Condo inspection', description: null, feeCents: 30000, minutes: 120, minimumFeeCents: null, position: 1 }, base)));
  s.put(s.row('price_services', Object.assign({ id: 'add-radon', parentId: 'svc-home', name: 'Radon test', description: null, feeCents: 15000, minutes: 60, minimumFeeCents: null, position: 0 }, base)));
  s.put(s.row('price_services', Object.assign({ id: 'add-wdo', parentId: 'svc-home', name: 'Termite (WDO)', description: null, feeCents: 9500, minutes: 0, minimumFeeCents: null, position: 1 }, base)));
  s.put(s.row('price_modifiers', Object.assign({ id: 'mod-sqft', serviceId: 'svc-home', basis: 'square_feet', mode: 'ranges', position: 0,
    tiersJson: JSON.stringify({ tiers: [{ from: null, to: 2000, fee_cents: 0, minutes: 0 }, { from: 2000, to: null, fee_cents: 5000, minutes: 30 }] }) }, base)));
  s.put(s.row('price_discounts', Object.assign({ id: 'disc-save', code: 'SAVE10', kind: 'percent', value: 1000, appliesToJson: '[]', maxUses: 20,
    expiresAt: new Date('2026-12-31T23:59:59-05:00').getTime(), active: true }, base)));
}

async function open(browser, o) {
  const ctx = await browser.newContext({ viewport: { width: o.w || WIDE, height: 900 }, locale: 'en-US', timezoneId: 'America/New_York' });
  const store = o.store === undefined ? kept() : o.store;
  await ctx.addInitScript((v) => { try { if (!sessionStorage.getItem('seeded')) { sessionStorage.setItem('seeded', '1'); if (v === null) localStorage.removeItem('inspyx.signin'); else localStorage.setItem('inspyx.signin', v); } } catch (e) { /* none */ } }, store);
  const page = await ctx.newPage();
  page.setDefaultTimeout(8000);
  const s = o.server, errs = [], away = [], calls = [];
  page.on('pageerror', (e) => errs.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource|net::ERR/.test(m.text())) errs.push(m.text()); });
  await page.route((u) => !u.href.startsWith(HOME) && !u.href.startsWith('data:'), async (route) => {
    const req = route.request(), u = req.url();
    if (!u.startsWith(SERVER + SYNC)) { away.push(u); return route.abort(); }
    const body = JSON.parse(req.postData() || '{}');
    calls.push({ headers: req.headers(), body });
    if (o.down && o.down()) return route.abort('failed');
    const { skipped, applied } = s.push(body.push || []);
    const after = body.after ? body.after.at : '';
    const rows = [...s.held.values()].filter((r) => r.changed_at > after).sort((a, b) => (a.changed_at < b.changed_at ? -1 : 1));
    const page_ = rows.slice(0, body.limit || 200);
    const last = page_[page_.length - 1];
    return route.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify({
      applied, skipped, rows: page_, next: last ? { at: last.changed_at, kind: last.kind, id: last.id } : body.after || null, more: rows.length > page_.length }) });
  });
  const res = await page.goto(url + 'prices', { waitUntil: 'load' });
  await page.waitForTimeout(400);
  return { ctx, page, errs, away, calls, res };
}

// What a person sees: innerText leaves out hidden parts (a dialog's other titles, a button's second press) and keeps
// the break between side-by-side parts (an add-on's name and its fee), which textContent would glue together.
const vis = (page, sel) => page.evaluate((q) => [...document.querySelectorAll(q)].filter((e) => !e.hidden && e.getClientRects().length > 0).map((e) => e.innerText.replace(/\s+/g, ' ').trim()), sel);
const until = async (fn, ms) => { const end = Date.now() + (ms || 4000); for (;;) { if (await fn()) return true; if (Date.now() > end) return false; await new Promise((r) => setTimeout(r, 50)); } };
const pushed = (calls) => calls.flatMap((c) => c.body.push || []);
const card = (page, name) => page.locator('.prc-card', { has: page.locator('[data-v="name"]', { hasText: name }) }).first();


// The phone's rulebook (inspyx-mobile test/fixtures/price_rules.json), read from a checkout next to this one or RULES=.
const fs = require('fs'), path = require('path');
const RULES = process.env.RULES || path.join(__dirname, '../../wt-stamp/test/fixtures/price_rules.json');
const PHONE_W = 390;
const SHOTS = process.env.SHOTS || '';
const shot = async (page, name) => { if (SHOTS) await page.screenshot({ path: path.join(SHOTS, name + '.png'), fullPage: false }); };
const fill = async (loc, v) => { await loc.fill(''); if (v !== '') await loc.fill(v); };

(async () => {
  const browser = await engine.launch();
  console.log('browser: ' + engine.name() + ' ' + browser.version());

  await group('the phone\'s rules', async () => {
    const book = JSON.parse(fs.readFileSync(RULES, 'utf8'));
    const s = server(); seed(s);
    const { page, ctx, errs } = await open(browser, { server: s });
    const cases = book.cases.filter((c) => c.kind === 'price_modifiers').map((c) => {
      const row = Object.assign({}, book.base.price_modifiers, c.set || {});
      (c.drop || []).forEach((k) => delete row[k]);
      return { name: c.name, want: c.want, row };
    });
    const got = await page.evaluate((cs) => cs.map((c) => {
      const R = window.InspyxPriceRules;
      let p;
      try { p = R.problem(R.parsed(c.row)); } catch (e) { p = 'threw'; }
      return { name: c.name, want: c.want, problem: p };
    }), cases);
    // The editor only ever makes rows of the right shape and never checks a deletion, so the rulebook's cases about
    // shape (a field of the wrong type or missing, a word this build doesn't know, a number JSON can't hold) are the
    // server's alone; they are named here, one by one, so a new case about what a person types can't slip past.
    const SERVER_ONLY = new Set([
      'a basis this build doesn\'t know', 'a mode this build doesn\'t know', 'a mode named constructor',
      'a basis named constructor (a plain object\'s own word)', 'a basis named toString (a plain object\'s own word)',
      'a basis named __proto__ (a plain object\'s own word)', 'a basis named hasOwnProperty (a plain object\'s own word)',
      'a range fee written 5.0', 'a range fee with cents after the point', 'a range fee written 1e3', 'a fee written as text inside a range',
      'a range with no fee', 'values that aren\'t text', 'per unit as a list', 'per unit missing its unit', 'a number range with names',
      'a number question\'s lines with names', 'a range number past what JSON holds exactly', 'a decimal in a field the phone ignores',
      'a decimal 5,000 deep in a field the phone ignores', 'a number past what JSON holds exactly, in a field the phone ignores',
      'per unit with a number past what JSON holds exactly, in a field the phone ignores', 'no service id', 'a question named by a number, not an id',
    ]);
    const live = got.filter((g, i) => cases[i].row.deletedAt == null);
    const keepWrong = live.filter((g) => g.want === null && g.problem !== null);
    const refuseWrong = live.filter((g) => g.want !== null && g.problem === null && !SERVER_ONLY.has(g.name));
    const stale = [...SERVER_ONLY].filter((n) => !got.some((g) => g.name === n && g.want !== null && g.problem === null));
    ok('every standing row the phone keeps is kept here (' + live.filter((g) => g.want === null).length + ' cases)', keepWrong.length === 0, JSON.stringify(keepWrong));
    ok('every row the phone refuses is refused here, but for ' + SERVER_ONLY.size + ' shape cases the form can\'t make (' + live.filter((g) => g.want !== null).length + ' cases)', refuseWrong.length === 0, JSON.stringify(refuseWrong));
    ok('each shape case named is still in the rulebook and still the server\'s alone', stale.length === 0, JSON.stringify(stale));
    ok('no errors', errs.length === 0, errs.join(' | '));
    await ctx.close();
  });

  await group('the how-to', async () => {
    const s = server(); seed(s);
    const { page, ctx, errs } = await open(browser, { server: s });
    ok('a how-to sits over the services, three steps', (await vis(page, '.prc-how-step')).join(' | ') === 'On a service, tap Add a price change | Pick what it reads, and what each range adds | Save: a bigger house\'s quote goes up on its own');
    ok('it moves (a finger and its scenes run)', await page.evaluate(() => document.getAnimations().filter((a) => a.effect && a.effect.target && a.effect.target.closest('.prc-how')).length >= 8));
    await page.emulateMedia({ reducedMotion: 'reduce' });
    ok('with motion turned down, it stands still on the result', await page.evaluate(() => getComputedStyle(document.querySelector('.prc-how-c')).opacity === '1' && getComputedStyle(document.querySelector('.prc-how-finger')).display === 'none'));
    ok('no errors', errs.length === 0, errs.join(' | '));
    await ctx.close();
  });

  await group('your questions', async () => {
    const s = server(); seed(s);
    const { page, ctx, errs, calls } = await open(browser, { server: s });
    await page.click('[data-add="question"]');
    await shot(page, '01-question-new');
    await page.fill('[data-form="question"] [name="name"]', 'Is there a pool?');
    await page.click('[data-form="question"] [type="submit"]');
    ok('a new yes-or-no question is saved as the phone writes it', await until(() => {
      const q = pushed(calls).find((r) => r.kind === 'price_questions');
      return q && q.data.name === 'Is there a pool?' && q.data.kind === 'yes_no' && q.data.ownerAccountId === ME && q.data.position === 0 && q.data.deletedAt === null;
    }));
    ok('it shows under Your questions', await until(async () => (await vis(page, '[data-list="questions"] li')).join() === 'Is there a pool? Yes or no Edit'), JSON.stringify(await vis(page, '[data-list="questions"] li')));
    const before = pushed(calls).length;
    await page.click('[data-add="question"]');
    await page.fill('[data-form="question"] [name="name"]', '  is there a  POOL? ');
    await page.click('[data-form="question"] [type="submit"]');
    ok('the same name again is refused, and nothing is sent', (await vis(page, '[data-qproblem]')).join() === 'You already have a question with that name.' && pushed(calls).length === before);
    await page.fill('[data-form="question"] [name="name"]', 'How many outbuildings?');
    await page.check('[data-form="question"] [name="kind"][value="number"]');
    await page.click('[data-form="question"] [type="submit"]');
    ok('a number question gets the next place', await until(() => pushed(calls).some((r) => r.kind === 'price_questions' && r.data.kind === 'number' && r.data.position === 1)));
    ok('no errors', errs.length === 0, errs.join(' | '));
    await ctx.close();
  });

  // Each kind of price change, typed into the dialog: what is sent is the phone's own tiersJson.
  const made = [
    ['square feet in ranges', async (page) => {
      const rows = page.locator('[data-tiers] .prc-tier');
      await fill(rows.nth(0).locator('[data-k="to"]'), '2000'); await fill(rows.nth(0).locator('[data-k="fee"]'), '0');
      await page.click('[data-add-tier]');
      await fill(rows.nth(1).locator('[data-k="to"]'), '3000'); await fill(rows.nth(1).locator('[data-k="fee"]'), '50'); await fill(rows.nth(1).locator('[data-k="hours"]'), '0.5');
      await page.click('[data-add-tier]');
      await fill(rows.nth(2).locator('[data-k="fee"]'), '$100.50'); await fill(rows.nth(2).locator('[data-k="hours"]'), '1');
    }, { basis: 'square_feet', mode: 'ranges', questionId: null, tiers: { tiers: [{ from: null, to: 2000, fee_cents: 0, minutes: 0 }, { from: 2000, to: 3000, fee_cents: 5000, minutes: 30 }, { from: 3000, to: null, fee_cents: 10050, minutes: 60 }] } }],
    ['square feet per unit past a number', async (page) => {
      await page.check('[name="mode"][value="per_unit_over"]');
      await page.fill('[name="over"]', '3,000'); await page.fill('[name="unit"]', '500'); await page.fill('[name="perFee"]', '25');
    }, { basis: 'square_feet', mode: 'per_unit_over', questionId: null, tiers: { over: 3000, unit: 500, fee_cents: 2500, minutes: 0 } }],
    ['year built, a discount for new houses', async (page) => {
      await page.selectOption('[name="basis"]', 'year_built');
      const r = page.locator('[data-tiers] .prc-tier').nth(0);
      await fill(r.locator('[data-k="from"]'), '2015'); await fill(r.locator('[data-k="fee"]'), '-$25');
    }, { basis: 'year_built', mode: 'ranges', questionId: null, tiers: { tiers: [{ from: 2015, to: null, fee_cents: -2500, minutes: 0 }] } }],
    ['zip codes on lines', async (page) => {
      await page.selectOption('[name="basis"]', 'zip');
      const r = page.locator('[data-lines] .prc-tier');
      await r.nth(0).locator('[data-k="zips"]').fill('33601, 33602'); await fill(r.nth(0).locator('[data-k="fee"]'), '25');
      await page.click('[data-add-line]');
      await r.nth(1).locator('[data-k="zips"]').fill('34201'); await fill(r.nth(1).locator('[data-k="fee"]'), '$-10'); await fill(r.nth(1).locator('[data-k="hours"]'), '0.25');
    }, { basis: 'zip', mode: 'ranges', questionId: null, tiers: { tiers: [{ values: ['33601', '33602'], fee_cents: 2500, minutes: 0 }, { values: ['34201'], fee_cents: -1000, minutes: 15 }] } }],
    ['foundation', async (page) => {
      await page.selectOption('[name="basis"]', 'foundation');
      const r = page.locator('[data-lines] .prc-tier').nth(0);
      await r.locator('input[value="Crawlspace"]').check(); await r.locator('input[value="Pier and beam"]').check(); await fill(r.locator('[data-k="fee"]'), '75');
    }, { basis: 'foundation', mode: 'ranges', questionId: null, tiers: { tiers: [{ values: ['Crawlspace', 'Pier and beam'], fee_cents: 7500, minutes: 0 }] } }],
    ['a yes-or-no question', async (page) => {
      await page.selectOption('[name="basis"]', 'yes_no_question');
      await page.selectOption('[name="question"]', 'q-pool');
      const yes = page.locator('[data-lines] .prc-tier').nth(0);
      await fill(yes.locator('[data-k="fee"]'), '75'); await fill(yes.locator('[data-k="hours"]'), '0.5');
    }, { basis: 'yes_no_question', mode: 'ranges', questionId: 'q-pool', tiers: { tiers: [{ values: ['yes'], fee_cents: 7500, minutes: 30 }] } }],
    ['a number question, per unit', async (page) => {
      await page.selectOption('[name="basis"]', 'number_question');
      await page.check('[name="mode"][value="per_unit_over"]');
      await page.fill('[name="over"]', '0'); await page.fill('[name="unit"]', '1'); await page.fill('[name="perFee"]', '40'); await page.fill('[name="perHours"]', '0.25');
    }, { basis: 'number_question', mode: 'per_unit_over', questionId: 'q-sheds', tiers: { over: 0, unit: 1, fee_cents: 4000, minutes: 15 } }],
  ];
  const withQuestions = (s) => {
    const base = { ownerAccountId: ME, createdAt: T, updatedAt: T, deletedAt: null };
    s.put(s.row('price_questions', Object.assign({ id: 'q-pool', name: 'Pool', kind: 'yes_no', position: 0 }, base)));
    s.put(s.row('price_questions', Object.assign({ id: 'q-sheds', name: 'Outbuildings', kind: 'number', position: 1 }, base)));
  };
  for (const [what, typeIt, want] of made) {
    await group('a new price change: ' + what, async () => {
      const s = server(); seed(s); withQuestions(s);
      const { page, ctx, errs, calls } = await open(browser, { server: s });
      await card(page, 'Condo inspection').locator('[data-add="change"]').click();
      await typeIt(page);
      if (what === 'square feet in ranges') await shot(page, '02-change-ranges');
      if (what === 'square feet per unit past a number') await shot(page, '03-change-per-unit');
      if (what === 'zip codes on lines') await shot(page, '04-change-zips');
      if (what === 'a yes-or-no question') await shot(page, '05-change-yes-no');
      await page.click('[data-form="change"] [type="submit"]');
      const sent = await until(() => pushed(calls).some((r) => r.kind === 'price_modifiers'));
      const r = pushed(calls).find((x) => x.kind === 'price_modifiers');
      const d = r ? r.data : {};
      ok(what + ': sent as the phone writes it', sent && d.serviceId === 'svc-condo' && d.basis === want.basis && d.mode === want.mode && (d.questionId || null) === want.questionId &&
        d.tiersJson === JSON.stringify(want.tiers) && d.position === 0 && d.deletedAt === null && d.ownerAccountId === ME, JSON.stringify(d));
      ok(what + ': the dialog closes and the card shows it', await until(async () => !(await page.locator('[data-dialog="change"]').evaluate((e) => e.open)) &&
        (await card(page, 'Condo inspection').locator('.prc-changes li').count()) === 1));
      ok(what + ': no errors', errs.length === 0, errs.join(' | '));
      await ctx.close();
    });
  }

  await group('what is refused before sending', async () => {
    const s = server(); seed(s); withQuestions(s);
    const { page, ctx, errs, calls } = await open(browser, { server: s });
    const tries = [
      ['ranges that overlap', async () => {
        const rows = page.locator('[data-tiers] .prc-tier');
        await fill(rows.nth(0).locator('[data-k="to"]'), '2000'); await fill(rows.nth(0).locator('[data-k="fee"]'), '10');
        await page.click('[data-add-tier]'); await fill(rows.nth(1).locator('[data-k="from"]'), '1500'); await fill(rows.nth(1).locator('[data-k="fee"]'), '20');
      }, 'The ranges overlap: start each one where the one before ends.'],
      ['a fee that isn\'t money', async () => { await fill(page.locator('[data-tiers] .prc-tier [data-k="fee"]').first(), 'ten'); }, 'Write the fee as dollars, like 25 or 25.50.'],
      ['a 4-digit zip', async () => {
        await page.selectOption('[name="basis"]', 'zip');
        await page.locator('[data-k="zips"]').fill('3360'); await fill(page.locator('[data-lines] [data-k="fee"]').first(), '5');
      }, '"3360" isn’t a 5-digit zip code.'],
      ['a zip on two lines', async () => {
        await page.selectOption('[name="basis"]', 'zip');
        const r = page.locator('[data-lines] .prc-tier');
        await r.nth(0).locator('[data-k="zips"]').fill('33601'); await page.click('[data-add-line]'); await r.nth(1).locator('[data-k="zips"]').fill('33601-1234');
      }, '"33601" is on two lines.'],
      ['a yes-or-no change that adds nothing', async () => { await page.selectOption('[name="basis"]', 'yes_no_question'); }, 'Set what a yes or a no adds.'],
      ['per unit with nothing added', async () => {
        await page.check('[name="mode"][value="per_unit_over"]'); await page.fill('[name="over"]', '3000'); await page.fill('[name="unit"]', '500');
      }, 'Add a fee or time for each unit.'],
      ['per unit, a unit of 0', async () => {
        await page.check('[name="mode"][value="per_unit_over"]'); await page.fill('[name="over"]', '3000'); await page.fill('[name="unit"]', '0'); await page.fill('[name="perFee"]', '5');
      }, 'Each unit must be at least 1.'],
      ['a range that ends before it starts', async () => {
        const r = page.locator('[data-tiers] .prc-tier').nth(0);
        await fill(r.locator('[data-k="from"]'), '3000'); await fill(r.locator('[data-k="to"]'), '2000'); await fill(r.locator('[data-k="fee"]'), '5');
      }, 'A range can’t end before it starts.'],
    ];
    for (const [what, typeIt, words] of tries) {
      await card(page, 'Condo inspection').locator('[data-add="change"]').click();
      await typeIt();
      const n = pushed(calls).length;
      await page.click('[data-form="change"] [type="submit"]');
      await page.waitForTimeout(150);
      const said = (await vis(page, '[data-c-problem]')).join();
      ok(what + ': says why, sends nothing', said === words && pushed(calls).length === n, said);
      if (what === 'ranges that overlap') await shot(page, '06-change-problem');
      await page.click('[data-form="change"] [data-close]');
    }
    ok('no errors', errs.length === 0, errs.join(' | '));
    await ctx.close();
  });

  // Codex on #78: the question chosen stays when only how it prices changes; a yes/no tier holding both answers
  // opens as one row for each, and saves.
  await group('the question and the answers stay as they are', async () => {
    const s = server(); seed(s); withQuestions(s);
    const base = { ownerAccountId: ME, createdAt: T, updatedAt: T, deletedAt: null };
    s.put(s.row('price_questions', Object.assign({ id: 'q-units', name: 'Units', kind: 'number', position: 2 }, base)));
    s.put(s.row('price_modifiers', Object.assign({ id: 'qm-both', serviceId: 'svc-condo', basis: 'yes_no_question', questionId: 'q-pool', mode: 'ranges', position: 0,
      tiersJson: JSON.stringify({ tiers: [{ values: ['yes', 'no'], fee_cents: 2000, minutes: 15 }] }) }, base)));
    const { page, ctx, errs, calls } = await open(browser, { server: s });
    await card(page, 'Condo inspection').locator('[data-add="change"]').click();
    await page.selectOption('[name="basis"]', 'number_question');
    await page.selectOption('[name="question"]', 'q-units');
    await page.check('[name="mode"][value="per_unit_over"]');
    ok('switching how it prices keeps the question chosen', await page.evaluate(() => document.querySelector('[name="question"]').value === 'q-units'));
    await page.fill('[name="over"]', '1'); await page.fill('[name="unit"]', '1'); await page.fill('[name="perFee"]', '30');
    await page.click('[data-form="change"] [type="submit"]');
    ok('and saves on it', await until(() => pushed(calls).some((r) => r.kind === 'price_modifiers' && r.data.questionId === 'q-units' && r.data.mode === 'per_unit_over')));
    await card(page, 'Condo inspection').locator('[data-edit-change="qm-both"]').click();
    ok('a tier holding yes and no opens as a Yes row and a No row, each with its fee', await page.evaluate(() =>
      [...document.querySelectorAll('[data-lines] .prc-tier')].map((li) => li.querySelector('[data-yn]').getAttribute('data-yn') + ':' + li.querySelector('[data-k="fee"]').value).join('|') === 'yes:20|no:20'));
    await page.click('[data-form="change"] [type="submit"]');
    ok('saved unchanged, it is kept (one row per answer)', await until(() => pushed(calls).some((r) => r.id === 'qm-both' && JSON.stringify(JSON.parse(r.data.tiersJson).tiers.map((t) => t.values)) === '[["yes"],["no"]]')), (await vis(page, '[data-c-problem]')).join());
    // A foundation line holding one that isn't among the four choices keeps it (Codex on #78).
    s.put(s.row('price_modifiers', Object.assign({ id: 'fd-stone', serviceId: 'svc-home', basis: 'foundation', mode: 'ranges', position: 1,
      tiersJson: JSON.stringify({ tiers: [{ values: ['Slab', 'Stone', '8" block'], fee_cents: 4000, minutes: 0 }] }) }, base)));
    await page.reload(); await page.waitForTimeout(400);
    await card(page, 'Home inspection').locator('[data-edit-change="fd-stone"]').click();
    ok('a foundation outside the four opens ticked, beside them', await page.evaluate(() =>
      [...document.querySelectorAll('[data-lines] input[type="checkbox"]:checked')].map((b) => b.value).join('|') === 'Slab|Stone|8" block'));
    await fill(page.locator('[data-lines] [data-k="fee"]').first(), '45');
    await page.click('[data-form="change"] [type="submit"]');
    ok('saved, it still holds it', await until(() => pushed(calls).some((r) => r.id === 'fd-stone' && JSON.stringify(JSON.parse(r.data.tiersJson).tiers[0].values) === '["Slab","Stone","8\\" block"]')));
    ok('no errors', errs.length === 0, errs.join(' | '));
    await ctx.close();
  });

  // The lead's sweep after Codex on #78: a value outside the form's choices is never dropped by an edit here.
  await group('values outside the form\'s choices are kept', async () => {
    const s = server(); seed(s); withQuestions(s);
    const base = { ownerAccountId: ME, createdAt: T, updatedAt: T, deletedAt: null };
    const mod = (id, extra) => s.put(s.row('price_modifiers', Object.assign({ id, serviceId: 'svc-condo', position: 0, questionId: null }, base, extra)));
    mod('k-basis', { basis: 'lot_size', mode: 'ranges', tiersJson: JSON.stringify({ tiers: [{ from: null, to: null, fee_cents: 1500, minutes: 0 }] }) });
    mod('k-mode', { basis: 'square_feet', mode: 'stepped', tiersJson: JSON.stringify({ steps: [1, 2] }) });
    mod('k-per', { basis: 'zip', mode: 'per_unit_over', tiersJson: JSON.stringify({ over: 1, unit: 1, fee_cents: 100, minutes: 0 }) });
    mod('k-question', { basis: 'yes_no_question', questionId: 'q-not-here', mode: 'ranges', tiersJson: JSON.stringify({ tiers: [{ values: ['yes'], fee_cents: 1000, minutes: 0 }] }) });
    const { page, ctx, errs, calls } = await open(browser, { server: s });
    for (const id of ['k-basis', 'k-mode', 'k-per']) {
      await card(page, 'Condo inspection').locator(`[data-edit-change="${id}"]`).click();
      ok(id + ': opens kept as it is, with no Save, only Delete', await page.isVisible('[data-c-kept]') && !(await page.isVisible('[data-form="change"] [type="submit"]')) && await page.isVisible('[data-cdelete]'));
      await page.evaluate(() => document.querySelector('[data-form="change"]').requestSubmit());
      await page.click('[data-form="change"] [data-close]');
    }
    if (SHOTS) { await card(page, 'Condo inspection').locator('[data-edit-change="k-basis"]').click(); await shot(page, '13-change-kept'); await page.click('[data-form="change"] [data-close]'); }
    ok('nothing was rewritten', !pushed(calls).some((r) => r.kind === 'price_modifiers'));
    await card(page, 'Condo inspection').locator('[data-edit-change="k-mode"]').click();
    await page.click('[data-cdelete]'); await page.click('[data-cdelete]');
    ok('one kept as it is can be deleted, its ranges untouched', await until(() => pushed(calls).some((r) => r.id === 'k-mode' && r.deleted_at !== null && r.data.mode === 'stepped' && r.data.tiersJson === JSON.stringify({ steps: [1, 2] }))));
    await card(page, 'Condo inspection').locator('[data-edit-change="k-question"]').click();
    ok('a question not on the list stays the one it reads, shown as such', await page.evaluate(() => {
      const sel = document.querySelector('[name="question"]');
      return sel.value === 'q-not-here' && sel.options[sel.selectedIndex].textContent === 'A question not on your list';
    }));
    await fill(page.locator('[data-lines] [data-k="fee"]').first(), '12');
    await page.click('[data-form="change"] [type="submit"]');
    ok('saved, it still reads that question', await until(() => pushed(calls).some((r) => r.id === 'k-question' && r.data.questionId === 'q-not-here' && JSON.parse(r.data.tiersJson).tiers[0].fee_cents === 1200)));
    ok('no errors', errs.length === 0, errs.join(' | '));
    await ctx.close();
  });

  await group('editing and deleting', async () => {
    const s = server(); seed(s); withQuestions(s);
    const base = { ownerAccountId: ME, createdAt: T, updatedAt: T, deletedAt: null };
    s.put(s.row('price_modifiers', Object.assign({ id: 'qm-pool', serviceId: 'svc-condo', basis: 'yes_no_question', questionId: 'q-pool', mode: 'ranges', position: 0,
      tiersJson: JSON.stringify({ tiers: [{ values: ['yes'], fee_cents: 7500, minutes: 30 }] }) }, base)));
    const { page, ctx, errs, calls } = await open(browser, { server: s });
    // The phone's square-feet change opens with its own ranges filled in.
    await card(page, 'Home inspection').locator('[data-edit-change="mod-sqft"]').click();
    const shown = await page.evaluate(() => [...document.querySelectorAll('[data-tiers] .prc-tier')].map((li) => [...li.querySelectorAll('input')].map((i) => i.value)));
    ok('a change opens with what it holds', JSON.stringify(shown) === JSON.stringify([['', '2000', '0', ''], ['2000', '', '50', '0.5']]), JSON.stringify(shown));
    await fill(page.locator('[data-tiers] .prc-tier').nth(1).locator('[data-k="fee"]'), '60');
    await page.click('[data-form="change"] [type="submit"]');
    ok('saved under the same name, newer', await until(() => pushed(calls).some((r) => r.id === 'mod-sqft' && r.updated_at > T && r.data.createdAt === T && JSON.parse(r.data.tiersJson).tiers[1].fee_cents === 6000)));
    // A question a change reads can't go.
    await page.locator('[data-list="questions"] li', { hasText: 'Pool' }).locator('[data-edit]').click();
    const n = pushed(calls).length;
    await page.click('[data-qdelete]');
    ok('a question a price change reads can\'t be deleted', (await vis(page, '[data-qproblem]')).join() === 'A price change reads this question: remove that first.' && pushed(calls).length === n);
    await page.click('[data-form="question"] [data-close]');
    // Delete the change: two taps.
    await card(page, 'Condo inspection').locator('[data-edit-change="qm-pool"]').click();
    ok('the yes-or-no change opens on its question, yes filled, no empty', await page.evaluate(() => document.querySelector('[name="question"]').value === 'q-pool' &&
      [...document.querySelectorAll('[data-lines] [data-k="fee"]')].map((i) => i.value).join('|') === '75|'));
    await page.click('[data-cdelete]');
    ok('the first tap only asks again', pushed(calls).length === n && (await vis(page, '[data-cdelete]')).join() === 'Delete it: tap again');
    await page.click('[data-cdelete]');
    ok('the second deletes it (a newer row, marked deleted)', await until(() => pushed(calls).some((r) => r.id === 'qm-pool' && r.deleted_at !== null && r.updated_at > T)));
    // Now the question can go.
    await page.locator('[data-list="questions"] li', { hasText: 'Pool' }).locator('[data-edit]').click();
    await page.click('[data-qdelete]'); await page.click('[data-qdelete]');
    ok('then the question can be deleted', await until(() => pushed(calls).some((r) => r.id === 'q-pool' && r.deleted_at !== null)));
    ok('no errors', errs.length === 0, errs.join(' | '));
    await shot(page, '07-page-after');
    await ctx.close();
  });

  // His pick 2 (2026-11-16): an add-on may be a credit, and has its own price changes, which go with it.
  await group('add-ons: a credit, and their own price changes', async () => {
    const s = server(); seed(s);
    const { page, ctx, errs, calls } = await open(browser, { server: s });
    const home = card(page, 'Home inspection');
    await home.locator('[data-add="addon"]').click();
    ok('an add-on says it may be below zero', (await vis(page, '[data-form="service"] [data-only="addon"]')).join() === 'Below zero for a credit, like -25.');
    await page.fill('[data-form="service"] [name="name"]', 'No attic access');
    await page.fill('[data-form="service"] [name="fee"]', '-25');
    await page.click('[data-form="service"] [type="submit"]');
    ok('an add-on of -$25 is saved as a credit', await until(() => pushed(calls).some((r) => r.kind === 'price_services' && r.data.name === 'No attic access' && r.data.feeCents === -2500 && r.data.parentId === 'svc-home')));
    ok('and shows as one', await until(async () => (await vis(page, '.prc-addon [data-v="summary"]')).includes('-$25')), JSON.stringify(await vis(page, '.prc-addon [data-v="summary"]')));
    const n = pushed(calls).length;
    await home.locator('[data-edit]').first().click();
    await page.fill('[data-form="service"] [name="fee"]', '-400');
    await page.click('[data-form="service"] [type="submit"]');
    await page.waitForTimeout(200);
    ok('a service below zero is refused, nothing sent', pushed(calls).length === n && (await vis(page, '[data-form="service"] [data-problem]')).length === 1);
    await page.click('[data-form="service"] [data-close]');

    const radon = page.locator('.prc-addon', { hasText: 'Radon test' });
    await radon.locator('[data-add="change"]').click();
    ok('the dialog names the add-on', (await vis(page, '[data-c-service]')).join() === 'Radon test');
    await page.check('[name="mode"][value="per_unit_over"]');
    await page.fill('[name="over"]', '3000'); await page.fill('[name="unit"]', '1000'); await page.fill('[name="perFee"]', '25');
    await page.click('[data-form="change"] [type="submit"]');
    ok('the change is the add-on\'s own', await until(() => pushed(calls).some((r) => r.kind === 'price_modifiers' && r.data.serviceId === 'add-radon' && r.data.position === 0)));
    ok('and is listed under the add-on', await until(async () => (await radon.locator('.prc-changes [data-v="text"]').allInnerTexts()).join() === 'Square feet: +$25 for each 1,000 past 3,000'), JSON.stringify(await radon.locator('.prc-changes [data-v="text"]').allInnerTexts()));
    const made = pushed(calls).find((r) => r.kind === 'price_modifiers' && r.data.serviceId === 'add-radon');
    await radon.locator('[data-edit]').first().click();
    await page.click('[data-form="service"] [data-delete]'); await page.click('[data-form="service"] [data-delete]');
    ok('deleting the add-on deletes its own change with it', await until(() => pushed(calls).some((r) => r.id === 'add-radon' && r.deleted_at !== null) && pushed(calls).some((r) => r.id === made.id && r.deleted_at !== null)));
    ok('no errors', errs.length === 0, errs.join(' | '));
    await shot(page, '12-addon-changes');
    await ctx.close();
  });

  await group('at phone width', async () => {
    const s = server(); seed(s); withQuestions(s);
    const { page, ctx, errs } = await open(browser, { server: s, w: PHONE_W });
    await shot(page, '08-phone-page');
    await card(page, 'Home inspection').locator('[data-edit-change="mod-sqft"]').click();
    await shot(page, '09-phone-change');
    const fits = () => page.evaluate(() => { const d = document.querySelector('[data-dialog="change"]'); return document.documentElement.scrollWidth <= window.innerWidth && d.scrollWidth <= d.clientWidth + 1; });
    await page.selectOption('[name="basis"]', 'foundation');
    await shot(page, '10-phone-foundation');
    ok('foundations fit the screen', await fits());
    await page.selectOption('[name="basis"]', 'zip');
    await shot(page, '11-phone-zip');
    ok('zip lines fit the screen', await fits());
    await page.selectOption('[name="basis"]', 'square_feet');
    ok('the dialog fits the screen, nothing runs off the side', await page.evaluate(() => {
      const d = document.querySelector('[data-dialog="change"]');
      return document.documentElement.scrollWidth <= window.innerWidth && d.scrollWidth <= d.clientWidth + 1;
    }));
    ok('no errors', errs.length === 0, errs.join(' | '));
    await ctx.close();
  });

  await browser.close();
  console.log(failed === 0 ? 'all checks passed' : failed + ' CHECK(S) FAILED');
  process.exit(failed === 0 ? 0 : 1);
})();
