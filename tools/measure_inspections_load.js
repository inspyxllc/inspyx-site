// How fast "Your inspections" opens on a large account: the list after a fresh load, one inspection opened, and a
// reload. NOTHING REAL IS ASKED: the account is made up here, in the shape of the largest real one (27 inspections,
// 51,542 fields: counts by kind as inspyx-prod held them, values of the same average size), and inspection-sync is a
// stand-in with the live rules for after, inspection, entities and limit. Each answer waits as the live function
// does, roughly: LATENCY_MS per call plus PER_FIELD_MS per field it carries.
// usage: node tools/serve.js 4611 &   then   URL=http://localhost:4611/ node tools/measure_inspections_load.js
// Prints one line per measure, and a JSON summary last.
const playwright = require('playwright');

const url = process.env.URL || 'http://localhost:4173/';
const HOME = new URL(url).origin;
const SERVER = 'https://btxlrfvqifnrnxffohsz.supabase.co';
const ME = '11111111-1111-4111-8111-111111111111';
const LATENCY_MS = Number(process.env.LATENCY_MS || 300), PER_FIELD_MS = Number(process.env.PER_FIELD_MS || 0.08);
const store = JSON.stringify({ access: 'test-access-1', renew: 'test-renew-1', ends: Date.now() + 3600000, id: ME, email: 'pat@example.com' });

// inspyx-prod's largest account, by kind: [fields, rows, average value bytes].
const SHAPE = {
  item: [45160, 2258, 16], section: [2137, 305, 17], photo: [1908, 212, 30], fact: [880, 176, 25], person: [477, 53, 27],
  cover_parties: [416, 26, 16], inspection: [297, 27, 18], reinspection_finding: [201, 67, 23], reinspection: [30, 6, 23],
  cover_photo: [24, 4, 31], property_record: [12, 2, 23],
};
const INSPECTIONS = 27;

function account() {
  const fields = []; let seq = 0;
  const insp = Array.from({ length: INSPECTIONS }, (_, i) => '6f1c2a3b-0000-4000-8000-' + String(i + 1).padStart(12, '0'));
  const word = (n) => 'x'.repeat(Math.max(1, n - 2));
  const add = (inspection, entity, id, field, value) => fields.push({ inspection, entity, id, field, value, at: 1794600000000 + seq, device: 'phone-aaaaaaaaaaaaaaaaaa', seq: ++seq });
  insp.forEach((id, i) => {
    const own = { title: (i + 1) + ' Oak Street', address: (i + 1) + ' Oak Street', city: 'Miami', created_at: 1794600000000 - i * 86400000,
      scheduled_at: 1794600000000 - i * 86400000 + 3600000 };
    Object.keys(own).forEach((f) => add(id, 'inspection', id, f, own[f]));
    for (let k = Object.keys(own).length; k < Math.round(SHAPE.inspection[0] / INSPECTIONS); k++) add(id, 'inspection', id, 'extra_' + k, word(SHAPE.inspection[2]));
  });
  Object.keys(SHAPE).filter((e) => e !== 'inspection').forEach((entity) => {
    const [n, rows, bytes] = SHAPE[entity], per = Math.round(n / rows);
    for (let r = 0; r < rows; r++) {
      const inspection = insp[r % INSPECTIONS], id = entity === 'reinspection' ? inspection : entity + '-' + r;
      if (entity === 'section') { add(inspection, entity, id, 'name', 'Stop ' + r); add(inspection, entity, id, 'position', r); }
      else if (entity === 'item') {
        add(inspection, entity, id, 'section_id', 'section-' + (r % 305 - (r % 305) % INSPECTIONS + r % INSPECTIONS) % 305);
        add(inspection, entity, id, 'label', 'Item ' + r); add(inspection, entity, id, 'position', r);
      } else if (entity === 'person') { add(inspection, entity, id, 'role', r % 2 ? 'client' : 'buyer_agent'); add(inspection, entity, id, 'name', 'Person ' + r); }
      for (let k = fields.filter((f) => f.id === id && f.entity === entity).length; k < per; k++) add(inspection, entity, id, 'field_' + k, word(bytes));
    }
  });
  return { fields, insp };
}

async function run(browser, acct) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, locale: 'en-US' });
  await ctx.addInitScript((v) => { try { if (!sessionStorage.getItem('seeded')) { sessionStorage.setItem('seeded', '1'); localStorage.setItem('inspyx.signin', v); } } catch (e) { /* none */ } }, store);
  const page = await ctx.newPage();
  page.setDefaultTimeout(120000);
  const tally = { calls: 0, fields: 0, bytes: 0 };
  await page.routeWebSocket(/realtime\/v1\/websocket/, (ws) => ws.onMessage((d) => {
    const m = JSON.parse(String(d));
    if (m.event === 'phx_join') ws.send(JSON.stringify({ topic: m.topic, event: 'phx_reply', ref: m.ref, payload: { status: 'ok', response: {} } }));
  }));
  await page.routeWebSocket(/spex-relay/, (ws) => ws.close());
  await page.route((u) => !u.href.startsWith(HOME) && !u.href.startsWith('data:'), async (route) => {
    const req = route.request(), u = req.url(), cors = { 'access-control-allow-origin': '*' };
    if (u.startsWith(SERVER + '/functions/v1/inspection-sync')) {
      const b = JSON.parse(req.postData() || '{}'), limit = Math.min(Math.max(b.limit || 500, 1), 5000);
      const rows = acct.fields.filter((f) => f.seq > (b.after || 0) && (!b.inspection || f.inspection === b.inspection) &&
        (!b.entities || b.entities.indexOf(f.entity) >= 0)).slice(0, limit);
      const body = JSON.stringify({ results: [], skipped: [], fields: rows, next: rows.length ? rows[rows.length - 1].seq : b.after, more: rows.length >= limit, now: Date.now() });
      tally.calls++; tally.fields += rows.length; tally.bytes += body.length;
      if (process.env.DEBUG) console.log('  call', Date.now() % 100000, JSON.stringify({ after: b.after, inspection: b.inspection, entities: b.entities, n: rows.length }));
      await new Promise((r) => setTimeout(r, LATENCY_MS + rows.length * PER_FIELD_MS));
      return route.fulfill({ status: 200, contentType: 'application/json', headers: cors, body });
    }
    if (u.startsWith(SERVER + '/functions/v1/sync')) return route.fulfill({ status: 200, contentType: 'application/json', headers: cors, body: JSON.stringify({ rows: [], next: 0, more: false }) });
    if (u.startsWith(SERVER + '/functions/v1/reports-sent')) return route.fulfill({ status: 200, contentType: 'application/json', headers: cors, body: JSON.stringify({ reports: [], as_of: new Date().toISOString() }) });
    if (u.startsWith(SERVER)) return route.fulfill({ status: 200, contentType: 'application/json', headers: cors, body: '{}' });
    return route.abort();
  });
  const measure = async (label, go, until) => {
    const before = Object.assign({}, tally), t0 = Date.now();
    await go();
    if (process.env.DEBUG) console.log('  went', Date.now() % 100000, label);
    // until is a function run in the page with its argument (a string would be read as an expression, which is
    // always truthy when it is a function).
    await page.waitForFunction(until[0], until[1], { timeout: 120000, polling: 50 });
    if (process.env.DEBUG) console.log('  rows', await page.evaluate(() => [...document.querySelectorAll('[data-list="items"] li')].slice(0, 3).map((l) => l.textContent).join(' | ')), await page.evaluate(() => location.href));
    const out = { label, ms: Date.now() - t0, calls: tally.calls - before.calls, fields: tally.fields - before.fields, kb: Math.round((tally.bytes - before.bytes) / 1024) };
    console.log(label.padEnd(26) + String(out.ms).padStart(7) + ' ms  ' + String(out.calls).padStart(3) + ' calls  ' + String(out.fields).padStart(6) + ' fields  ' + String(out.kb).padStart(6) + ' KB');
    return out;
  };
  const listShown = [(n) => document.querySelectorAll('[data-list="items"] li').length === n, INSPECTIONS];
  const results = [];
  results.push(await measure('list, fresh', () => page.goto(url + 'inspections'), listShown));
  const first = acct.insp[0];
  results.push(await measure('open one inspection', () => page.evaluate((id) => { window.location.hash = id; }, first),
    [(n) => !document.querySelector('[data-detail]').hidden && document.querySelectorAll('[data-stops] > *').length >= n,
      Math.floor(SHAPE.section[1] / INSPECTIONS)]));
  results.push(await measure('list, reload', () => page.reload(), listShown));
  await ctx.close();
  return results;
}

(async () => {
  const browser = await playwright.chromium.launch();
  try {
    const acct = account();
    console.log('account: ' + acct.fields.length + ' fields, ' + INSPECTIONS + ' inspections; latency ' + LATENCY_MS + ' ms + ' + PER_FIELD_MS + ' ms a field');
    const r = await run(browser, acct);
    console.log(JSON.stringify(r));
  } finally {
    await browser.close();
  }
})();
