// Self-checks for the card payments page (/payments, 2026-11-23). The payments function is stood in for: nothing
// reaches a server, and Stripe's page is never really opened.
//
// usage: node tools/serve.js &   then   node tools/check_payments.js   (URL=http://localhost:4174/ for another port)
const playwright = require('playwright');
const base = (process.env.URL || 'http://localhost:4173/').replace(/\/+$/, '');
let failed = 0;
const ok = (name, pass, detail) => { if (!pass) failed++; console.log((pass ? 'PASS  ' : 'FAIL  ') + name + (pass || detail === undefined ? '' : '  [' + detail + ']')); };
async function open(browser, status, connect) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  await ctx.addInitScript(() => localStorage.setItem('inspyx.signin', JSON.stringify({ access: 'a', renew: 'r', ends: Date.now() + 3600e3, id: '11111111-1111-4111-8111-111111111111', email: 'dave@example.com' })));
  const page = await ctx.newPage();
  const errs = [], went = [], asks = [];
  page.on('pageerror', (e) => errs.push(e.message));
  await page.route('**/functions/v1/payments', (r) => {
    const b = JSON.parse(r.request().postData() || '{}'); asks.push(b.action);
    const a = b.action === 'connect' ? connect : status;
    if (a === 'down') return r.abort('failed');
    r.fulfill({ status: a.status, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(a.json) });
  });
  await page.route(/stripe\.com|evil\.example/, (r) => { went.push(r.request().url()); r.fulfill({ status: 200, contentType: 'text/html', body: '<!doctype html><title>stand-in</title>' }); });
  await page.goto(base + '/payments');
  await page.waitForTimeout(700);
  const seen = () => page.evaluate(() => ({ words: [...document.querySelectorAll('[data-stands]')].filter((e) => !e.hidden).map((e) => e.textContent.trim()), buttons: [...document.querySelectorAll('[data-do]')].filter((e) => !e.hidden).map((e) => e.textContent.trim()), now: [...document.querySelectorAll('.pay-step.is-now')].map((e) => e.dataset.step) }));
  return { ctx, page, errs, went, asks, seen };
}
(async () => {
  const browser = await playwright.chromium.launch();
  try {
    const cases = [
      ['no plan yet', { status: 409, json: { error: 'no_account' } }, 'Start your plan first, from your account: card payments use the same Stripe account.', ['Your account'], ['plan']],
      ['not set up', { status: 200, json: { state: 'none', payouts: false } }, 'Not set up. Clients can pay you by card once Stripe has your business details and bank account.', ['Set up'], ['stripe']],
      ['Stripe needs more', { status: 200, json: { state: 'needs_info', payouts: false } }, 'Stripe needs a few more details before clients can pay you by card.', ['Finish setup'], ['stripe']],
      ['Stripe checking', { status: 200, json: { state: 'pending', payouts: false } }, 'Stripe is checking your details. This usually takes a few minutes.', ['Check again'], ['stripe']],
      ['ready', { status: 200, json: { state: 'ready', payouts: true } }, 'Ready: clients can pay you by card.', [], []],
      ['no answer', 'down', 'Couldn’t check. Try again.', ['Check again'], ['stripe']],
    ];
    for (const [what, status, words, buttons, now] of cases) {
      const o = await open(browser, status, null);
      const v = await o.seen();
      ok(what + ': says so, with the one button that moves it on', JSON.stringify(v.words) === JSON.stringify([words]) && JSON.stringify(v.buttons) === JSON.stringify(buttons) && JSON.stringify(v.now) === JSON.stringify(now) && o.errs.length === 0, JSON.stringify(v));
      await o.ctx.close();
    }
    let o = await open(browser, { status: 200, json: { state: 'none', payouts: false } }, { status: 200, json: { url: 'https://connect.stripe.com/setup/e/acct_1/abc' } });
    await o.page.click('[data-do="setup"]');
    await o.page.waitForTimeout(700);
    ok('Set up opens Stripe\'s own page', o.went.some((u) => u.startsWith('https://connect.stripe.com/setup/')) && o.asks.includes('connect'), o.went.join(','));
    await o.ctx.close();
    o = await open(browser, { status: 200, json: { state: 'none', payouts: false } }, { status: 200, json: { url: 'https://evil.example/stripe.com' } });
    await o.page.click('[data-do="setup"]');
    await o.page.waitForTimeout(700);
    ok('a page anywhere but Stripe\'s is never opened, and the page says it couldn\'t', o.went.length === 0 && await o.page.isVisible('[data-page-failed]'), o.went.join(','));
    await o.ctx.close();
    o = await open(browser, { status: 200, json: { state: 'ready', payouts: false } }, null);
    ok('ready, payouts still being checked: said under it', await o.page.isVisible('[data-payouts]'));
    ok('the plan page stays unlinked: /payments points to the account page', await o.page.evaluate(() => ![...document.querySelectorAll('a')].some((a) => a.getAttribute('href') === '/plan')));
    await o.ctx.close();
  } finally { await browser.close(); }
  console.log(failed === 0 ? 'all checks passed' : failed + ' CHECK(S) FAILED');
  process.exit(failed === 0 ? 0 : 1);
})();
