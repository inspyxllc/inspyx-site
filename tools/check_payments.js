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
  await page.route('**/functions/v1/payments', async (r) => {
    const b = JSON.parse(r.request().postData() || '{}'); asks.push(b.action);
    let a = b.action === 'connect' ? connect : status;
    if (Array.isArray(a)) { const [delay, answer] = a[Math.min(asks.filter((x) => x === 'status').length - 1, a.length - 1)]; await new Promise((d) => setTimeout(d, delay)); a = answer; }
    if (a === 'down') return r.abort('failed');
    r.fulfill({ status: a.status, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(a.json) });
  });
  await page.route(/stripe\.com|evil\.example/, (r) => { went.push(r.request().url()); r.fulfill({ status: 200, contentType: 'text/html', body: '<!doctype html><title>stand-in</title>' }); });
  await page.goto(base + '/payments');
  await page.waitForTimeout(700);
  const seen = () => page.evaluate(() => ({ words: [...document.querySelectorAll('[data-stands]')].filter((e) => !e.hidden).map((e) => e.textContent.trim()), buttons: [...document.querySelectorAll('[data-do]')].filter((e) => !e.hidden).map((e) => e.textContent.trim()), now: [...document.querySelectorAll('.pay-step.is-now')].map((e) => e.dataset.step), next: [...document.querySelectorAll('[data-next]')].filter((e) => !e.hidden).map((e) => e.textContent.trim()), current: [...document.querySelectorAll('.pay-step[aria-current="step"]')].map((e) => e.dataset.step) }));
  return { ctx, page, errs, went, asks, seen };
}
(async () => {
  const browser = await playwright.chromium.launch();
  try {
    const cases = [
      ['no plan yet', { status: 409, json: { error: 'no_account' } }, 'Start your plan first, from your account: card payments use the same Stripe account.', ['Your account'], ['plan'], ['Next: start your plan from Your account, below.']],
      ['not set up', { status: 200, json: { state: 'none', payouts: false } }, 'Not set up. Clients can pay you by card once Stripe has your business details and bank account.', ['Set up'], ['stripe'], ['Next: tap Set up below.']],
      ['Stripe needs more', { status: 200, json: { state: 'needs_info', payouts: false } }, 'Stripe needs a few more details before clients can pay you by card.', ['Finish setup'], ['stripe'], ['Next: tap Finish setup below.']],
      ['Stripe checking', { status: 200, json: { state: 'pending', payouts: false } }, 'Stripe is checking your details. This usually takes a few minutes.', ['Check again'], ['stripe'], ['Next: tap Check again below.']],
      ['ready', { status: 200, json: { state: 'ready', payouts: true } }, 'Ready: clients can pay you by card.', [], [], []],
      ['no answer', 'down', 'Couldn’t check. Try again.', ['Check again'], ['stripe'], ['Next: tap Check again below.']],
    ];
    for (const [what, status, words, buttons, now, next] of cases) {
      const o = await open(browser, status, null);
      const v = await o.seen();
      ok(what + ': says so, with the one button that moves it on', JSON.stringify(v.words) === JSON.stringify([words]) && JSON.stringify(v.buttons) === JSON.stringify(buttons) && JSON.stringify(v.now) === JSON.stringify(now) && o.errs.length === 0, JSON.stringify(v));
      // The step it is at names that button (Moises, 2026-11-26: the steps read as buttons).
      ok(what + ': the step it is at says which button below moves it on', JSON.stringify(v.next) === JSON.stringify(next) && JSON.stringify(v.current) === JSON.stringify(now), JSON.stringify([v.next, v.current]));
      await o.ctx.close();
    }
    // Steps, never choices: nothing in them can be pressed, and nothing looks as if it could.
    {
      const o = await open(browser, { status: 200, json: { state: 'none', payouts: false } }, null);
      const look = () => o.page.evaluate(() => [...document.querySelectorAll('.pay-step')].map((li) => {
        const c = getComputedStyle(li), d = getComputedStyle(li.querySelector('.pay-dot'));
        return [c.cursor, c.backgroundColor, c.boxShadow, d.boxShadow, li.querySelectorAll('button, a, input, [role], [tabindex]').length, d.animationName].join('|');
      }));
      const before = await look();
      await o.page.hover('.pay-step[data-step="ready"]');
      await o.page.waitForTimeout(250);
      const after = await look();
      const steps = before.map((x) => x.split('|'));
      ok('the steps are steps, not choices: no button, link or role in them, a plain cursor, no box, outline, ring or pulse, and no change under the pointer',
        before.join() === after.join() && steps.every(([cursor, bg, shadow, dotShadow, pressables, anim]) =>
          cursor === 'default' && (bg === 'rgba(0, 0, 0, 0)' || bg === 'transparent') && shadow === 'none' && dotShadow === 'none' && pressables === '0' && anim === 'none'),
        JSON.stringify([before, after]));
      await o.ctx.close();
    }
    // Back to the tab while the first check is still out: the newer answer stands (a slow older one never wins).
    let o = await open(browser, [[900, { status: 200, json: { state: 'pending', payouts: false } }], [50, { status: 200, json: { state: 'ready', payouts: true } }]], null);
    await o.page.evaluate(() => { Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true }); document.dispatchEvent(new Event('visibilitychange')); });
    await o.page.waitForTimeout(1300);
    const latest = await o.seen();
    ok('two checks out at once: the newer answer stands', JSON.stringify(latest.words) === JSON.stringify(['Ready: clients can pay you by card.']), JSON.stringify(latest.words));
    await o.ctx.close();
    o = await open(browser, { status: 200, json: { state: 'none', payouts: false } }, { status: 200, json: { url: 'https://connect.stripe.com/setup/e/acct_1/abc' } });
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
