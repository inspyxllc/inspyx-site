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
  await ctx.addInitScript((me) => localStorage.setItem('inspyx.signin', JSON.stringify({ access: 'a', renew: 'r', ends: Date.now() + 3600e3, id: me, email: 'dave@example.com' })), ME);
  const page = await ctx.newPage();
  const errs = [], pushes = [], previews = [];
  page.on('pageerror', (e) => errs.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
  await page.route('**/functions/v1/sync', (r) => { const b = JSON.parse(r.request().postData() || '{}'); (b.push || []).forEach((x) => pushes.push(x)); r.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify({ rows: o.rows || [], next: null, more: false }) }); });
  await page.route('**/functions/v1/automation-preview', (r) => { previews.push(JSON.parse(r.request().postData() || '{}')); r.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify({ subject: 'Subject <b>x</b>', html: '<p>x</p>', text: 'Line one\n\nLine two' }) }); });
  await page.goto(base + '/emails');
  await page.waitForSelector('[data-list]:not([hidden])', { timeout: 8000 });
  return { ctx, page, errs, pushes, previews };
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
    // Wording written on the phone is kept as it is.
    const row = { kind: 'automation_settings', id: 'automation', updated_at: 5, deleted_at: null, data: { id: 'automation', ownerAccountId: ME, design: 'bold_1', brandColor: '#0F766E', googleReviewUrl: null, messages: { sign_and_pay: { on: true, when: '1d', to: ['client'], subject: 'My subject', body: 'My words' } }, updatedAt: 5, deletedAt: null } };
    o = await open(browser, { rows: [row] });
    await o.page.locator('[data-msg="booking_confirmed"] [data-on]').uncheck({ force: true });
    await o.page.waitForTimeout(300);
    const kept = o.pushes[0] && o.pushes[0].data;
    ok('a change keeps the phone\'s own wording, color and settings', !!kept && kept.messages.sign_and_pay.subject === 'My subject' && kept.messages.sign_and_pay.body === 'My words' && kept.messages.sign_and_pay.when === '1d' && kept.brandColor === '#0F766E' && kept.updatedAt > 5 && rowProblem(kept) === null, JSON.stringify(kept));
    await o.ctx.close();
  } finally { await browser.close(); }
  console.log(failed === 0 ? 'all checks passed' : failed + ' CHECK(S) FAILED');
  process.exit(failed === 0 ? 0 : 1);
})();
