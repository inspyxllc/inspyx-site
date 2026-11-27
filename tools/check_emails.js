// Self-checks for the automatic emails page (/emails, 2026-11-23). The sync and automation-preview functions are
// stood in for: nothing reaches a server. Checked against the server's twin rules (inspyx-mobile automation_rules.dart).
//
// usage: node tools/serve.js &   then   node tools/check_emails.js   (URL=http://localhost:4174/ for another port)
const playwright = require('playwright');
const base = (process.env.URL || 'http://localhost:4173/').replace(/\/+$/, '');
const ME = '11111111-1111-4111-8111-111111111111';
let failed = 0;
const ok = (name, pass, detail) => { if (!pass) failed++; console.log((pass ? 'PASS  ' : 'FAIL  ') + name + (pass || detail === undefined ? '' : '  [' + detail + ']')); };
const WHEN = { booking_confirmed: ['now'], booking_rescheduled: ['now'], sign_and_pay: ['3d', '2d', '1d'], day_before: ['1d', '2d', 'same_day'], review_request: ['right_after', '1d', '3d'] };
const ROLES = ['client', 'buyer_agent', 'listing_agent'];
function rowProblem(d) {
  if (d.id !== 'automation' || d.ownerAccountId !== ME || !Number.isInteger(d.updatedAt) || d.deletedAt !== null) return 'shape';
  if (d.design !== 'bold_1') return 'design';
  if (d.brandColor !== null && !/^#[0-9a-fA-F]{6}$/.test(d.brandColor)) return 'color';
  for (const [id, m] of Object.entries(d.messages || {})) {
    if (!WHEN[id]) return 'unknown_message';
    if (typeof m.on !== 'boolean' || !WHEN[id].includes(m.when)) return 'when ' + id;
    if (!Array.isArray(m.to) || m.to.some((r) => !ROLES.includes(r)) || new Set(m.to).size !== m.to.length) return 'to ' + id;
  }
  return null;
}
async function open(browser, o) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  // Every frame runs this; the email's sandboxed frame has no storage (and must not), so it is skipped there.
  await ctx.addInitScript((me) => { try { localStorage.setItem('inspyx.signin', JSON.stringify({ access: 'a', renew: 'r', ends: Date.now() + 3600e3, id: me, email: 'dave@example.com' })); } catch (e) { /* the sandboxed frame */ } }, ME);
  const page = await ctx.newPage();
  const errs = [], pushes = [], previews = [];
  page.on('pageerror', (e) => errs.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
  await page.route('**/functions/v1/sync', async (r) => { const b = JSON.parse(r.request().postData() || '{}'); (b.push || []).forEach((x) => pushes.push(x)); if (o.slow && (b.push || []).length) await new Promise((d) => setTimeout(d, o.slow)); r.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify({ rows: o.rows || [], next: null, more: false }) }); });
  await page.route('**/functions/v1/automation-preview', (r) => { previews.push(JSON.parse(r.request().postData() || '{}')); r.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify({ subject: 'Subject <b>x</b>', html: o.html === undefined ? '<p>x</p>' : o.html, text: 'Line one\n\nLine two' }) }); });
  // Inspyx's stored logo (the only pictures the frame may show), and any other address, counted.
  const away = [];
  await page.route('https://btxlrfvqifnrnxffohsz.supabase.co/storage/**', (r) => r.fulfill({ status: 200, contentType: 'image/png', body: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64') }));
  await page.route('https://evil.example/**', (r) => { away.push(r.request().url()); r.abort(); });
  await page.goto(base + '/emails');
  await page.waitForSelector('[data-list]:not([hidden])', { timeout: 8000 });
  return { ctx, page, errs, pushes, previews, away };
}
(async () => {
  const browser = await playwright.chromium.launch();
  try {
    let o = await open(browser, {});
    const first = await o.page.evaluate(() => [...document.querySelectorAll('[data-msg]')].map((li) => [li.dataset.msg, li.querySelector('[data-on]').checked, li.querySelector('[data-when]').value, [...li.querySelectorAll('[data-who] input')].filter((i) => i.checked).map((i) => i.value).join('+')]));
    ok('no row yet: the five messages, as the app\'s defaults', JSON.stringify(first) === JSON.stringify([['booking_confirmed', true, 'now', 'client+buyer_agent'], ['booking_rescheduled', true, 'now', 'client+buyer_agent'], ['sign_and_pay', true, '2d', 'client'], ['day_before', true, '1d', 'client+buyer_agent+listing_agent'], ['review_request', true, 'right_after', 'client']]), JSON.stringify(first));
    await o.page.locator('[data-msg="day_before"] [data-on]').uncheck({ force: true });
    await o.page.waitForTimeout(300);
    await o.page.locator('[data-msg="sign_and_pay"] [data-when]').selectOption('3d');
    await o.page.waitForTimeout(300);
    await o.page.locator('[data-msg="review_request"] [data-who] input[value="buyer_agent"]').check();
    await o.page.waitForTimeout(300);
    const last = o.pushes[o.pushes.length - 1];
    ok('three changes in a row: each sent whole, and the last holds all three (none lost before the echo)', o.pushes.length === 3 && last.data.messages.day_before.on === false && last.data.messages.sign_and_pay.when === '3d' && JSON.stringify(last.data.messages.review_request.to) === '["client","buyer_agent"]', JSON.stringify(last && last.data.messages));
    ok('every row sent is one the server\'s rules keep', o.pushes.every((p) => p.kind === 'automation_settings' && p.id === 'automation' && rowProblem(p.data) === null), o.pushes.map((p) => rowProblem(p.data)).join(','));
    for (const [url, good] of [['https://g.page/r/abc/review', true], ['https://search.google.com/local/writereview?placeid=x', true], ['http://g.page/r/abc', false], ['https://evil.example/g.page', false], ['https://notgoogle.com/x', false], ['https://g.page/r/a b', false]]) {
      const before = o.pushes.length;
      await o.page.fill('[data-review-url]', url);
      await o.page.click('[data-review-save]');
      await o.page.waitForTimeout(300);
      const sent = o.pushes.length > before;
      ok('the review link ' + url + (good ? ' is kept' : ' is refused, said, and never sent'), good ? sent && o.pushes[o.pushes.length - 1].data.googleReviewUrl === url : !sent && await o.page.isVisible('[data-review-bad]'));
    }
    await o.page.click('[data-msg="booking_confirmed"] summary');
    await o.page.waitForTimeout(500);
    const pv = await o.page.evaluate(() => ({ s: document.querySelector('[data-msg="booking_confirmed"] [data-mail-subject]').textContent, html: document.querySelector('[data-msg="booking_confirmed"] [data-mail-subject]').innerHTML }));
    ok('the preview asks for the client\'s email and shows its words as text, never as markup', o.previews.some((p) => p.messageId === 'booking_confirmed' && p.role === 'client') && pv.s === 'Subject <b>x</b>' && pv.html.includes('&lt;b&gt;'), JSON.stringify(pv));
    ok('no errors in the console', o.errs.length === 0, o.errs.join(' | '));
    await o.ctx.close();
    // Two quick changes while the first save is still on its way (Codex on #77): both kept, in order.
    o = await open(browser, { slow: 600 });
    await o.page.locator('[data-msg="day_before"] [data-on]').uncheck({ force: true });
    await o.page.locator('[data-msg="sign_and_pay"] [data-when]').selectOption('1d');
    await o.page.waitForTimeout(1800);
    const both = o.pushes[o.pushes.length - 1];
    ok('two quick changes on a slow server: sent one after the other, the second holding the first', o.pushes.length === 2 && both.data.messages.day_before.on === false && both.data.messages.sign_and_pay.when === '1d' && both.updated_at > o.pushes[0].updated_at, JSON.stringify(o.pushes.map((p) => [p.data.messages.day_before.on, p.data.messages.sign_and_pay.when])));
    ok('…and the page shows both', await o.page.evaluate(() => !document.querySelector('[data-msg="day_before"] [data-on]').checked && document.querySelector('[data-msg="sign_and_pay"] [data-when]').value === '1d'));
    await o.ctx.close();
    // A link typed, not yet saved, then another change: the typed link stays (Codex on #77).
    o = await open(browser, {});
    await o.page.fill('[data-review-url]', 'https://g.page/r/draft/review');
    await o.page.locator('[data-msg="day_before"] [data-on]').uncheck({ force: true });
    await o.page.waitForTimeout(500);
    await o.page.evaluate(() => { Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true }); document.dispatchEvent(new Event('visibilitychange')); });
    await o.page.waitForTimeout(500);
    ok('a link typed and not saved survives another change and a pull', (await o.page.inputValue('[data-review-url]')) === 'https://g.page/r/draft/review', await o.page.inputValue('[data-review-url]'));
    await o.ctx.close();
    // Wording written on the phone is kept as it is.
    const row = { kind: 'automation_settings', id: 'automation', updated_at: 5, deleted_at: null, data: { id: 'automation', ownerAccountId: ME, design: 'bold_1', brandColor: '#0F766E', googleReviewUrl: null, messages: { sign_and_pay: { on: true, when: '1d', to: ['client'], subject: 'My subject', body: 'My words' } }, updatedAt: 5, deletedAt: null } };
    o = await open(browser, { rows: [row] });
    await o.page.locator('[data-msg="booking_confirmed"] [data-on]').uncheck({ force: true });
    await o.page.waitForTimeout(300);
    const kept = o.pushes[0] && o.pushes[0].data;
    ok('a change keeps the phone\'s own wording, color and settings', !!kept && kept.messages.sign_and_pay.subject === 'My subject' && kept.messages.sign_and_pay.body === 'My words' && kept.messages.sign_and_pay.when === '1d' && kept.brandColor === '#0F766E' && kept.updatedAt > 5 && rowProblem(kept) === null, JSON.stringify(kept));
    await o.ctx.close();
    // The designed email (the rehearsal, round 2): the html the email function sends, in a sandboxed frame of its
    // own: its styles and Inspyx's stored logo show; nothing in it runs, loads from elsewhere, or opens.
    const MAIL = '<!doctype html><html><head><style>.hi{color:rgb(1,2,3)}</style><script>window.parent.hit=1<\/script></head>' +
      '<body style="margin:0;background:rgb(240,240,240)"><table role="presentation" width="100%"><tr><td>' +
      '<img data-logo src="https://btxlrfvqifnrnxffohsz.supabase.co/storage/v1/object/public/logos/a.png" width="56" height="56" alt="Rivera">' +
      '<script>document.body.setAttribute(\'data-ran\',\'1\')<\/script><p class="hi" data-hi>Hello Casey,</p><p data-own style="color:rgb(4,5,6)">Your inspection is booked.</p>' +
      '<img data-evil src="https://evil.example/x.png" onerror="document.body.setAttribute(\'data-hit\',\'1\')">' +
      '<a data-link href="https://inspyx.com/sign#preview" style="background:rgb(15,118,110);color:#fff">Sign and pay</a></td></tr></table></body></html>';
    o = await open(browser, { html: MAIL });
    await o.page.click('[data-msg="booking_confirmed"] summary');
    const frame = o.page.frameLocator('[data-msg="booking_confirmed"] [data-mail-designed] iframe');
    const shown = await frame.locator('[data-hi]').textContent({ timeout: 5000 }).catch(() => null);
    ok('the designed email shows, in a frame sandboxed to scripts only', shown === 'Hello Casey,' &&
      (await o.page.getAttribute('[data-msg="booking_confirmed"] [data-mail-designed] iframe', 'sandbox')) === 'allow-scripts', String(shown));
    const look = await frame.locator('body').evaluate((b) => ({
      hi: getComputedStyle(b.querySelector('[data-hi]')).color, own: getComputedStyle(b.querySelector('[data-own]')).color, bg: getComputedStyle(b).backgroundColor,
      logo: b.querySelector('[data-logo]').naturalWidth, evil: b.querySelector('[data-evil]').naturalWidth, hit: b.getAttribute('data-hit'),
      scripts: document.querySelectorAll('script:not([src])').length })).catch((e) => ({ e: String(e) }));
    ok('its own styles show (its style block and inline styles), and the stored logo', look.hi === 'rgb(1, 2, 3)' && look.own === 'rgb(4, 5, 6)' && look.bg === 'rgb(240, 240, 240)' && look.logo === 1, JSON.stringify(look));
    await o.page.waitForTimeout(300);
    ok('nothing in it runs or loads from elsewhere: no script kept, no handler run, no other address asked', look.scripts === 0 && look.hit === null && o.away.length === 0 &&
      (await o.page.evaluate(() => window.hit)) === undefined, JSON.stringify([look, o.away]));
    await frame.locator('[data-link]').click();
    await o.page.waitForTimeout(300);
    ok('a link in it opens nothing', (await frame.locator('[data-hi]').count()) === 1 && o.page.context().pages().length === 1);
    const fit = await o.page.$eval('[data-msg="booking_confirmed"] [data-mail-designed] iframe', (f) => parseInt(f.style.height, 10));
    ok('the frame fits the email (its height told)', fit >= 120 && fit < 420, String(fit));
    ok('the notes: the designed one, not the plain one; the plain words hidden', await o.page.isVisible('[data-msg="booking_confirmed"] [data-mail-note="designed"]') &&
      !(await o.page.isVisible('[data-msg="booking_confirmed"] [data-mail-note="plain"]')) && !(await o.page.isVisible('[data-msg="booking_confirmed"] [data-mail-text]')));
    if (process.env.SHOTS) await o.page.locator('[data-msg="booking_confirmed"]').screenshot({ path: process.env.SHOTS + '/emails-designed.png' });
    await o.ctx.close();
    // Its rules: the frame page may be framed by Inspyx only, show inline styles and the stored logo, run only its file;
    // /emails may frame its own pages and nothing else.
    const fr = await fetch(base + '/email-frame'), em = await fetch(base + '/emails');
    ok('the frame page\'s own rule', fr.headers.get('content-security-policy') === "default-src 'none'; script-src 'self'; style-src 'unsafe-inline'; img-src https://btxlrfvqifnrnxffohsz.supabase.co data:; base-uri 'none'; form-action 'none'; frame-ancestors 'self'" &&
      fr.headers.get('x-frame-options') === 'SAMEORIGIN', fr.headers.get('content-security-policy'));
    ok('/emails may frame only its own pages, and is framed by none', / frame-src 'self';/.test(em.headers.get('content-security-policy')) && /frame-ancestors 'none'/.test(em.headers.get('content-security-policy')) && em.headers.get('x-frame-options') === 'DENY', em.headers.get('content-security-policy'));
    // Booking confirmed with no agreement to sign: the preview asks for the email the sender makes then (toSign false);
    // with a live agreement, as before. Other messages never say.
    const legal = (idv, kind, deletedAt) => ({ kind: 'legal_documents', id: idv, updated_at: 2, deleted_at: deletedAt, data: { id: idv, ownerAccountId: ME, kind, title: 'T', body: 'B', createdAt: 1, updatedAt: 2, deletedAt } });
    for (const [label, rows, want] of [['no agreement', [], false], ['only a deleted agreement and a privacy notice', [legal('a1', 'agreement', 3), legal('p1', 'privacy', null)], false],
      ['a live agreement', [legal('a2', 'agreement', null)], undefined], ['someone else\'s agreement only', [Object.assign(legal('a3', 'agreement', null), { data: Object.assign(legal('a3', 'agreement', null).data, { ownerAccountId: 'other' }) })], false]]) {
      o = await open(browser, { rows });
      await o.page.click('[data-msg="booking_confirmed"] summary');
      await o.page.click('[data-msg="day_before"] summary');
      await o.page.waitForTimeout(400);
      const bc = o.previews.filter((p) => p.messageId === 'booking_confirmed').pop(), db = o.previews.filter((p) => p.messageId === 'day_before').pop();
      ok('the Booking confirmed preview, ' + label + ': ' + (want === false ? 'with nothing to sign' : 'as before'), !!bc && bc.toSign === want && !!db && !('toSign' in db), JSON.stringify([bc, db]));
      await o.ctx.close();
    }
    // No designed email (the function made none): the plain words, as before.
    o = await open(browser, { html: '' });
    await o.page.click('[data-msg="booking_confirmed"] summary');
    await o.page.waitForSelector('[data-msg="booking_confirmed"] [data-mail-text]:not([hidden])', { timeout: 5000 }).catch(() => null);
    ok('no designed email: the plain words and their note, no frame', (await o.page.textContent('[data-msg="booking_confirmed"] [data-mail-text]')) === 'Line one\n\nLine two' &&
      await o.page.isVisible('[data-msg="booking_confirmed"] [data-mail-note="plain"]') && (await o.page.locator('[data-msg="booking_confirmed"] iframe').count()) === 0 && o.errs.length === 0, o.errs.join(' | '));
    await o.ctx.close();
  } finally { await browser.close(); }
  console.log(failed === 0 ? 'all checks passed' : failed + ' CHECK(S) FAILED');
  process.exit(failed === 0 ? 0 : 1);
})();
