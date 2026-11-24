// Self-checks for Client View / Agent View (2026-11-24, Inspyx 4): the People card on an inspection (/inspections) and
// the look page (/look). NOTHING REAL IS ASKED. The report and inspection-sync functions are stand-ins this test runs
// itself, answering as the live ones do (backend/supabase/functions/report, look_ticket and {"look"}, in the app's
// repo). Every id and ticket is made up; any other request that tries to leave the site is stopped and counted.
// usage: node tools/serve.js &   then   node tools/check_look.js   (BROWSER=webkit for Safari's engine)
//        SHOTS=<folder> saves the screens.
const fs = require('fs');
const path = require('path');
const playwright = require('playwright');
const engine = process.env.BROWSER === 'webkit' ? playwright.webkit : playwright.chromium;

const url = process.env.URL || 'http://localhost:4173/';
const HOME = new URL(url).origin;
const SERVER = 'https://btxlrfvqifnrnxffohsz.supabase.co';
const REPORT = SERVER + '/functions/v1/report';
const SYNC = SERVER + '/functions/v1/inspection-sync';
const ME = '11111111-1111-4111-8111-111111111111';
const INSP = '6f1c2a3b-0000-4000-8000-000000000001';
const HOUR = 3600000, PHONE = 390, WIDE = 1280;
const SHOTS = process.env.SHOTS || '';
// Made-up tickets, built at run time so no literal here looks like a secret (the #425 lesson).
const T1 = 'T'.repeat(11) + 'k'.repeat(11), T2 = 'U'.repeat(11) + 'm'.repeat(11);
const kept = () => JSON.stringify({ access: 'test-access-1', renew: 'test-renew-1', ends: Date.now() + HOUR, id: ME, email: 'pat@example.com' });
let failed = 0;
const ok = (name, cond, extra) => { if (!cond) failed++; console.log((cond ? 'PASS  ' : 'FAIL  ') + name + (extra ? '  [' + extra + ']' : '')); };
const group = async (label, fn) => { try { await fn(); } catch (e) { ok(label + ': these checks could not run', false, String((e && e.message) || e).split('\n')[0]); } };
const until = async (fn, ms) => { const end = Date.now() + (ms || 4000); for (;;) { if (await fn()) return true; if (Date.now() > end) return false; await new Promise((r) => setTimeout(r, 50)); } };
const vis = (page, sel) => page.evaluate((q) => [...document.querySelectorAll(q)].filter((e) => !e.hidden && e.getClientRects().length > 0).map((e) => e.innerText.replace(/\s+/g, ' ').trim()), sel);
const shot = async (page, name) => { if (SHOTS) { fs.mkdirSync(SHOTS, { recursive: true }); await page.screenshot({ path: path.join(SHOTS, name + '.png'), fullPage: false }); } };

const PDF = SERVER + '/storage/v1/object/sign/reports/x/y/pdf/z.pdf?token=dl';
const ABOUT = { address: '12 Oak St', locality: 'Miami, FL 33101', inspected: 'November 6, 2026', inspector: 'Sam Rivera', company: 'Rivera Inspections' };
const ANSWERS = {
  not_sent_client: { state: 'not_sent', look: { view: 'client' }, agreement: 'to_sign', due_cents: 32500 },
  not_sent_agent: { state: 'not_sent', look: { view: 'agent' }, agreement: 'signed', due_cents: 32500 },
  locked: { state: 'locked', look: { view: 'client' }, about: ABOUT, pay_url: SERVER + '/functions/v1/pay/' + 'P'.repeat(22), due_cents: 42500 },
  plain: { state: 'plain', look: { view: 'agent' }, about: ABOUT, pdf: { url: PDF, name: 'Inspection Report.pdf' } },
};

/* The inspection-sync stand-in's fields for one inspection and its people. */
function fields(people) {
  let seq = 0;
  const f = (entity, id, field, value) => ({ inspection: INSP, entity, id, field, value, at: Date.now(), device: 'phone-aaaaaaaaaaaaaaaaaa', seq: ++seq });
  const out = [f('inspection', INSP, 'title', '12 Oak St'), f('inspection', INSP, 'address', '12 Oak St, Miami'), f('inspection', INSP, 'created_at', 1794600000000)];
  people.forEach((p, i) => {
    out.push(f('person', p.id, 'role', p.role), f('person', p.id, 'name', p.name), f('person', p.id, 'position', i));
    if (p.gone) out.push(f('person', p.id, '_del', true));
  });
  return out;
}

async function open(browser, o) {
  const ctx = await browser.newContext({ viewport: { width: o.w || WIDE, height: 900 }, locale: 'en-US', timezoneId: 'America/New_York' });
  const store = o.store === undefined ? kept() : o.store;
  await ctx.addInitScript((v) => { try { if (!sessionStorage.getItem('seeded')) { sessionStorage.setItem('seeded', '1'); if (v === null) localStorage.removeItem('inspyx.signin'); else localStorage.setItem('inspyx.signin', v); } } catch (e) { /* none */ } }, store);
  const page = await ctx.newPage();
  page.setDefaultTimeout(8000);
  const errs = [], away = [], tickets = [], looks = [], syncs = [];
  page.on('pageerror', (e) => errs.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource|net::ERR/.test(m.text())) errs.push(m.text()); });
  await page.routeWebSocket(/realtime\/v1\/websocket/, (ws) => { ws.onMessage((data) => { const m = JSON.parse(String(data)); if (m.event === 'phx_join') ws.send(JSON.stringify({ topic: m.topic, event: 'phx_reply', ref: m.ref, payload: { status: 'ok', response: {} } })); }); });
  await page.route((u) => !u.href.startsWith(HOME) && !u.href.startsWith('data:'), async (route) => {
    const req = route.request(), u = req.url();
    const cors = { 'access-control-allow-origin': '*' };
    if ((u === REPORT || u === SYNC) && req.method() === 'OPTIONS') {
      return route.fulfill({ status: 204, headers: { ...cors, 'access-control-allow-headers': 'accept, authorization, apikey, content-type', 'access-control-allow-methods': 'POST' } });
    }
    if (u === SYNC) {
      const body = JSON.parse(req.postData() || '{}');
      syncs.push(body);
      const rows = body.after ? [] : fields(o.people || []);
      return route.fulfill({ status: 200, contentType: 'application/json', headers: cors, body: JSON.stringify({ results: [], skipped: [], fields: rows, next: rows.length ? rows[rows.length - 1].seq : body.after, more: false, now: Date.now() }) });
    }
    if (u !== REPORT) { away.push(u); return route.abort(); }
    const body = JSON.parse(req.postData() || '{}');
    const h = req.headers();
    if (body.action === 'look_ticket') {
      tickets.push({ body, auth: h.authorization || '' });
      const t = o.ticket ? o.ticket(tickets.length) : { status: 200, json: { ticket: tickets.length === 1 ? T1 : T2, expires_in: 60 } };
      return route.fulfill({ status: t.status, contentType: 'application/json', headers: cors, body: JSON.stringify(t.json) });
    }
    looks.push({ body, auth: h.authorization || '' });
    const a = o.look ? o.look(looks.length, body) : { status: 200, json: ANSWERS[o.answer] };
    return route.fulfill({ status: a.status, contentType: 'application/json', headers: cors, body: JSON.stringify(a.json) });
  });
  const res = await page.goto(url + o.path, { waitUntil: 'load' });
  await page.waitForTimeout(400);
  return { ctx, page, errs, away, tickets, looks, syncs, res };
}

const lookPath = (as) => 'look#i=' + INSP + '&as=' + as;

(async () => {
  const browser = await engine.launch();
  console.log('browser: ' + engine.name() + ' ' + browser.version());

  for (const [label, w] of [['wide', WIDE], ['phone', PHONE]]) {
    await group('the People card, ' + label, async () => {
      const people = [
        { id: '6f1c2a3b-0000-4000-8000-0000000000e1', role: 'client', name: 'Dana Reyes' },
        { id: '6f1c2a3b-0000-4000-8000-0000000000e2', role: 'buyer_agent', name: 'Alex Agent' },
        { id: '6f1c2a3b-0000-4000-8000-0000000000e3', role: 'listing_agent', name: '' },
        { id: '6f1c2a3b-0000-4000-8000-0000000000e4', role: 'client', name: 'Gone Person', gone: true },
      ];
      const { page, ctx, errs, away, tickets } = await open(browser, { w, path: 'inspections#' + INSP, people });
      await until(async () => (await vis(page, '[data-people-list] li')).length > 0);
      const rows = await vis(page, '[data-people-list] li');
      ok(label + ': the inspection lists its people with their role and a view each; a deleted one is gone',
        rows.length === 3 && /Dana Reyes\s*Client\s*Client view/.test(rows[0]) && /Alex Agent\s*Buyer’s agent\s*Agent view/.test(rows[1]) && /No name yet\s*Listing agent\s*Agent view/.test(rows[2]), rows.join(' | '));
      const links = await page.evaluate(() => [...document.querySelectorAll('[data-look]')].map((a) => [a.getAttribute('href'), a.getAttribute('target'), a.getAttribute('rel')]));
      ok(label + ': each opens the look in a new tab: client for the client, agent for an agent, and no name in the address',
        JSON.stringify(links) === JSON.stringify([
          ['/look#i=' + INSP + '&as=client', '_blank', 'noopener'],
          ['/look#i=' + INSP + '&as=agent', '_blank', 'noopener'],
          ['/look#i=' + INSP + '&as=agent', '_blank', 'noopener'],
        ]), JSON.stringify(links));
      ok(label + ': the inspections page itself asks for no ticket, and nothing leaves the site', tickets.length === 0 && away.length === 0 && errs.length === 0, errs.concat(away).join(' | '));
      const box = await page.evaluate(() => { const r = document.querySelector('[data-people]').getBoundingClientRect(); return [r.width, document.documentElement.scrollWidth, window.innerWidth]; });
      ok(label + ': the card fits the page (no sideways scroll)', box[1] <= box[2], JSON.stringify(box));
      await page.evaluate(() => document.querySelector('[data-people]').scrollIntoView({ block: 'center' }));
      await shot(page, 'people-card-' + label);
      await ctx.close();
    });
  }

  await group('the how-to', async () => {
    const people = [{ id: '6f1c2a3b-0000-4000-8000-0000000000e1', role: 'client', name: 'Dana Reyes' }];
    const { page, ctx } = await open(browser, { path: 'inspections#' + INSP, people });
    await until(async () => (await vis(page, '.look-how-step')).length === 3);
    ok('the People card shows how it works, in three steps', (await vis(page, '.look-how-step')).join(' | ') === 'Tap Client view (or Agent view) by the person | A new tab opens on exactly what they see | Look around: nothing is counted, paid or sent');
    if (SHOTS) {
      await page.evaluate(() => document.querySelector('.look-how').scrollIntoView({ block: 'center' }));
      for (const [ms, name] of [[2000, 'a'], [4500, 'b'], [7500, 'c']]) {
        await page.evaluate((t) => document.getAnimations().forEach((an) => { an.pause(); an.currentTime = t; }), ms);
        await page.locator('.look-how').screenshot({ path: path.join(SHOTS, 'howto-' + name + '.png') });
      }
    }
    await ctx.close();
    const calm = await browser.newContext({ reducedMotion: 'reduce', viewport: { width: WIDE, height: 900 } });
    await calm.addInitScript((v) => { try { localStorage.setItem('inspyx.signin', v); } catch (e) { /* none */ } }, kept());
    const p2 = await calm.newPage();
    await p2.route((u) => !u.href.startsWith(HOME), (route) => {
      const u = route.request().url();
      if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': 'authorization, apikey, content-type' } });
      if (u === SYNC) { const rows = fields(people); return route.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify({ results: [], skipped: [], fields: rows, next: rows.length, more: false, now: Date.now() }) }); }
      return route.abort();
    });
    await p2.routeWebSocket(/realtime/, () => {});
    await p2.goto(url + 'inspections#' + INSP, { waitUntil: 'load' });
    await until(async () => (await vis(p2, '.look-how-step')).length === 3);
    const still = await p2.evaluate(() => ['a', 'b', 'c'].map((n) => getComputedStyle(document.querySelector('.look-how-' + n)).display !== 'none' && getComputedStyle(document.querySelector('.look-how-' + n)).opacity === '1').concat([getComputedStyle(document.querySelector('.look-how-finger')).display]));
    ok('motion turned down: a still of the result (the client\'s view), no finger', JSON.stringify(still) === JSON.stringify([false, false, true, 'none']), JSON.stringify(still));
    await calm.close();
  });

  await group('no people', async () => {
    const { page, ctx } = await open(browser, { path: 'inspections#' + INSP, people: [] });
    await page.waitForTimeout(500);
    ok('an inspection with no client or agent shows no People card', (await vis(page, '[data-people]')).length === 0);
    await ctx.close();
  });

  for (const [label, w] of [['wide', WIDE], ['phone', PHONE]]) {
    await group('not sent yet, client, ' + label, async () => {
      const { page, ctx, errs, away, tickets, looks, res } = await open(browser, { w, path: lookPath('client'), answer: 'not_sent_client' });
      await until(async () => (await vis(page, '[data-state="not_sent"]')).length > 0);
      ok(label + ': a ticket is asked for as the signed-in inspector, for this inspection and the client view',
        tickets.length === 1 && tickets[0].auth === 'Bearer test-access-1' && JSON.stringify(tickets[0].body) === JSON.stringify({ action: 'look_ticket', inspection_id: INSP, as: 'client' }), JSON.stringify(tickets));
      ok(label + ': the look sends the ticket alone, once, with no sign-in', looks.length === 1 && JSON.stringify(looks[0].body) === JSON.stringify({ look: T1 }) && looks[0].auth === '', JSON.stringify(looks));
      const card = (await vis(page, '[data-state="not_sent"]'))[0] || '';
      ok(label + ': "Not sent yet", with the agreement waiting and what is due', /Not sent yet/.test(card) && /Nothing has been sent to your client yet/.test(card) && /waiting to be signed/.test(card) && /\$325\.00 is due/.test(card) && !/is signed\./.test(card), card);
      ok(label + ': the bar says Client view, and nothing is counted or sent', /Client view\s*What your client sees\. Nothing you do here is counted or sent\./.test((await vis(page, '[data-look-bar]'))[0] || '') && (await page.title()) === 'Client view');
      const csp = res.headers()['content-security-policy'] || '';
      ok(label + ': served with the report page\'s rule: only Inspyx\'s own server, no store, no index', /connect-src 'self' https:\/\/btxlrfvqifnrnxffohsz\.supabase\.co;/.test(csp) && /frame-ancestors 'none'/.test(csp) && res.headers()['cache-control'] === 'no-store' && /noindex/.test(res.headers()['x-robots-tag'] || ''), csp.slice(0, 100));
      ok(label + ': no errors, nothing else asked', errs.length === 0 && away.length === 0, errs.concat(away).join(' | '));
      const wide = await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);
      ok(label + ': fits the page', wide);
      await shot(page, 'not-sent-client-' + label);
      await ctx.close();
    });
  }

  await group('not sent yet, agent', async () => {
    const { page, ctx, tickets } = await open(browser, { w: PHONE, path: lookPath('agent'), answer: 'not_sent_agent' });
    await until(async () => (await vis(page, '[data-state="not_sent"]')).length > 0);
    const card = (await vis(page, '[data-state="not_sent"]'))[0] || '';
    ok('agent: asked as the agent view; the card says nothing was sent to the agent, and no agreement or amount (his ruling: an agent never sees an amount)',
      tickets[0] && tickets[0].body.as === 'agent' && /Nothing has been sent to this agent yet/.test(card) && !/\$|agreement/.test(card), card);
    ok('agent: the bar says Agent view', /Agent view\s*What the agent sees\./.test((await vis(page, '[data-look-bar]'))[0] || '') && (await page.title()) === 'Agent view');
    await shot(page, 'not-sent-agent-phone');
    await ctx.close();
  });

  for (const [label, w] of [['wide', WIDE], ['phone', PHONE]]) {
    await group('locked, ' + label, async () => {
      const { page, ctx, errs, looks, away } = await open(browser, { w, path: lookPath('client'), answer: 'locked' });
      await until(async () => (await vis(page, '[data-state="locked"]')).length > 0);
      const pay = await page.evaluate(() => { const p = document.querySelector('[data-pay]'); return p ? [p.tagName, p.getAttribute('href'), p.getAttribute('aria-disabled'), p.textContent.trim()] : null; });
      ok(label + ': the client\'s locked cover is drawn by the report page itself', (await vis(page, '.lk-addr')).join() === '12 Oak St');
      ok(label + ': its Pay button shows as the client sees it, and goes nowhere', pay && pay[0] === 'SPAN' && pay[1] === null && pay[2] === 'true' && /\$425\.00/.test(pay[3]), JSON.stringify(pay));
      const before = page.url();
      await page.click('[data-pay]');
      await page.waitForTimeout(300);
      ok(label + ': tapping Pay changes nothing and opens nothing', page.url() === before && ctx.pages().length === 1 && away.length === 0);
      ok(label + ': the report page asked nothing of its own (one look only), and the pill keeps saying whose view it is',
        looks.length === 1 && /Client view · nothing is counted/.test((await vis(page, '[data-pill]'))[0] || '') && errs.length === 0, errs.join(' | '));
      await shot(page, 'locked-client-' + label);
      await ctx.close();
    });
  }

  await group('plain', async () => {
    const { page, ctx, looks } = await open(browser, { path: lookPath('agent'), answer: 'plain' });
    await until(async () => (await page.$('[data-pdf]')) !== null);
    ok('a report the page can\'t lay out: its PDF, drawn by the report page, under the Agent view bar', (await page.getAttribute('[data-pdf]', 'href')) === PDF && looks.length === 1 && /Agent view/.test((await vis(page, '[data-look-bar]'))[0] || ''));
    await ctx.close();
  });

  await group('not his, or closed', async () => {
    const a = await open(browser, { path: lookPath('client'), ticket: () => ({ status: 404, json: { error: 'inspection' } }) });
    await until(async () => (await vis(a.page, '[data-state="gone"]')).length > 0);
    ok('an inspection that isn\'t his: "This view has closed", and no look is asked', a.looks.length === 0 && /This view has closed/.test((await vis(a.page, '[data-state="gone"]'))[0] || ''));
    await a.ctx.close();
    const b = await open(browser, { path: lookPath('client'), look: () => ({ status: 404, json: { state: 'gone' } }) });
    await until(async () => (await vis(b.page, '[data-state="gone"]')).length > 0);
    ok('a ticket already used or too late: "This view has closed"', b.looks.length === 1 && (await vis(b.page, '[data-state="gone"]')).length === 1);
    await b.ctx.close();
    for (const bad of ['look', 'look#i=../x&as=client', 'look#i=' + INSP + '&as=seller', 'look#t=short']) {
      const c = await open(browser, { path: bad, answer: 'locked' });
      ok('an address that asks for nothing a look can open (' + bad.slice(4) + '): closed, nothing asked', c.tickets.length === 0 && c.looks.length === 0 && (await vis(c.page, '[data-state="gone"]')).length === 1);
      await c.ctx.close();
    }
  });

  await group('signed out', async () => {
    const { page, ctx, tickets, looks } = await open(browser, { store: null, path: lookPath('client'), answer: 'locked' });
    await until(async () => (await vis(page, '[data-state="signin"]')).length > 0);
    ok('signed out: asks to sign in, asks no ticket and no look', tickets.length === 0 && looks.length === 0 && (await page.getAttribute('[data-state="signin"] a', 'href')) === '/signin');
    await shot(page, 'signed-out');
    await ctx.close();
  });

  await group('failed, then try again', async () => {
    const { page, ctx, tickets, looks } = await open(browser, { path: lookPath('client'), look: (n) => (n === 1 ? { status: 500, json: { error: 'database' } } : { status: 200, json: ANSWERS.locked }) });
    await until(async () => (await vis(page, '[data-state="failed"]')).length > 0);
    ok('the server failed: "Couldn\'t open this view", with Try again', /Couldn’t open this view/.test((await vis(page, '[data-state="failed"]'))[0] || ''));
    await page.click('[data-again]');
    await until(async () => (await vis(page, '[data-state="locked"]')).length > 0);
    ok('Try again opens it with a fresh ticket, never the spent one', tickets.length === 2 && looks.length === 2 && looks[1].body.look === T2, JSON.stringify(looks.map((l) => l.body)));
    await ctx.close();
  });

  await group('from the app: a ticket in the address', async () => {
    const { page, ctx, tickets, looks } = await open(browser, { store: null, path: 'look#t=' + T1, answer: 'locked' });
    await until(async () => (await vis(page, '[data-state="locked"]')).length > 0);
    ok('the app\'s ticket opens the view with no sign-in on this browser, and asks no ticket of its own', tickets.length === 0 && looks.length === 1 && looks[0].body.look === T1);
    ok('the ticket is taken out of the address at once', new URL(page.url()).pathname === '/look' && !page.url().includes(T1), page.url());
    await page.reload({ waitUntil: 'load' });
    await page.waitForTimeout(500);
    ok('a reload: the view has closed, and the spent ticket is never sent again', looks.length === 1 && (await vis(page, '[data-state="gone"]')).length === 1);
    await ctx.close();
  });

  await browser.close();
  console.log(failed ? `\n${failed} check(s) FAILED` : '\nAll look checks passed.');
  process.exit(failed ? 1 : 0);
})();
