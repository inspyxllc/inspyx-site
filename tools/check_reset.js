// Self-checks for the password-reset page, /reset (2026-11-13).
// NO REAL RESET IS EVER MADE HERE. Every call the page makes to the account server is caught and answered by this
// test with made-up values; any other request that tries to leave the site is stopped and counted as a failure.
// usage: node tools/serve.js &   then   node tools/check_reset.js   (BROWSER=webkit for Safari's engine)
const playwright = require('playwright');
const engine = process.env.BROWSER === 'webkit' ? playwright.webkit : playwright.chromium;
const url = process.env.URL || 'http://localhost:4173/';
const HOME = new URL(url).origin;
const SERVER = 'https://btxlrfvqifnrnxffohsz.supabase.co';
const TOKEN = 'test-recovery-token-not-real-0123456789';
let failed = 0;
const ok = (name, cond, extra) => { if (!cond) failed++; console.log((cond ? 'PASS  ' : 'FAIL  ') + name + (extra ? '  [' + extra + ']' : '')); };
const group = async (label, fn) => { try { await fn(); } catch (e) { ok(label + ': these checks could not run', false, String((e && e.message) || e).split('\n')[0]); } };

async function open(browser, where, answers) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const page = await ctx.newPage();
  page.setDefaultTimeout(8000);
  const errs = [], away = [], calls = [];
  page.on('pageerror', (e) => errs.push('pageerror: ' + e.message));
  await page.route((u) => !u.href.startsWith(HOME) && !u.href.startsWith('data:'), async (route) => {
    const req = route.request();
    if (!req.url().startsWith(SERVER + '/auth/v1/')) { away.push(req.url()); return route.abort(); }
    const call = { method: req.method(), path: req.url().slice(SERVER.length), headers: req.headers(), body: req.postData() };
    calls.push(call);
    const a = answers ? answers(call) : { status: 200, json: {} };
    if (a === 'offline') return route.abort('failed');
    return route.fulfill({ status: a.status, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(a.json || {}) });
  });
  const res = await page.goto(url + where, { waitUntil: 'load' });
  await page.waitForTimeout(300);
  return { ctx, page, errs, away, calls, res };
}
const shown = (page) => page.evaluate(() => [...document.querySelectorAll('[data-say]')].filter((p) => !p.hidden && p.getClientRects().length).map((p) => p.getAttribute('data-say')));
const visible = (page, sel) => page.evaluate((s) => { const e = document.querySelector(s); return !!e && !e.hidden && e.getClientRects().length > 0; }, sel);
const kept = (page) => page.evaluate(() => JSON.stringify(Object.assign({}, localStorage)) + JSON.stringify(Object.assign({}, sessionStorage)));

(async () => {
  const browser = await engine.launch();
  console.log('browser: ' + engine.name() + ' ' + browser.version());

  await group('the page as it opens', async () => {
    const { ctx, page, errs, away, calls, res } = await open(browser, 'reset');
    const h = res.headers(), csp = h['content-security-policy'] || '';
    ok('opens with no errors, asks nothing of anyone, and shows only the email form', errs.length === 0 && away.length === 0 && calls.length === 0 && await visible(page, '[data-ask]') && !(await visible(page, '[data-new]')), errs.concat(away).join(' | '));
    ok('served with the same strict rule as the sign-in page', /script-src 'self'(;|$)/.test(csp) && csp.includes('connect-src ' + SERVER) && /frame-ancestors 'none'/.test(csp) && (h['referrer-policy'] || '') === 'no-referrer', csp.slice(0, 120));
    const r = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, robots: (document.querySelector('meta[name=robots]') || {}).content, inline: document.querySelectorAll('[style], style, script:not([src])').length, em: document.querySelector('#reset-email').autocomplete, btn: Math.round(document.querySelector('[data-ask] button').getBoundingClientRect().height) }));
    ok('nothing scrolls sideways at phone width, kept out of search, nothing written inline, the button big enough to tap', r.sw <= 390 && r.robots === 'noindex' && r.inline === 0 && r.em === 'username' && r.btn >= 44, JSON.stringify(r));
    await ctx.close();
  });

  await group('asking for a reset email', async () => {
    const { ctx, page, calls } = await open(browser, 'reset');
    await page.fill('#reset-email', 'pat@example.com');
    await page.click('[data-ask] button');
    await page.waitForTimeout(300);
    const c = calls[0] || {};
    const back = new URL(SERVER + (c.path || '/')).searchParams.get('redirect_to');
    ok('one call: the account server\'s recover, with the address, sending the link back to this page', calls.length === 1 && c.method === 'POST' && (c.path || '').startsWith('/auth/v1/recover?') && back === HOME + '/reset' && JSON.parse(c.body).email === 'pat@example.com' && !c.headers.authorization, JSON.stringify(c));
    ok('it says an email is on its way, without saying whether an account uses the address', JSON.stringify(await shown(page)) === '["sent"]');
    await ctx.close();
  });

  for (const [status, kind] of [[429, 'busy'], [500, 'server'], ['offline', 'network']]) {
    await group('a reset email that cannot be sent (' + kind + ')', async () => {
      const { ctx, page } = await open(browser, 'reset', () => (status === 'offline' ? 'offline' : { status, json: {} }));
      await page.fill('#reset-email', 'pat@example.com');
      await page.click('[data-ask] button');
      await page.waitForTimeout(400);
      ok('a refusal (' + status + ') says "' + kind + '", and the button works again', JSON.stringify(await shown(page)) === JSON.stringify([kind]) && !(await page.isDisabled('[data-ask] button')));
      await ctx.close();
    });
  }

  await group('back from the reset link', async () => {
    const { ctx, page, calls } = await open(browser, 'reset#access_token=' + TOKEN + '&expires_in=3600&refresh_token=r-not-real&token_type=bearer&type=recovery', (c) => ({ status: 200, json: { id: 'x' } }));
    const where = await page.evaluate(() => location.href);
    ok('the one-time sign-in is taken out of the address at once, and kept nowhere in the browser', !where.includes('#') && !where.includes(TOKEN) && !(await kept(page)).includes(TOKEN), where);
    ok('the new-password form shows instead of the email form', await visible(page, '[data-new]') && !(await visible(page, '[data-ask]')));
    await page.fill('#reset-password', 'new-pass-12345');
    await page.fill('#reset-again', 'new-pass-1234X');
    await page.click('[data-new] button');
    await page.waitForTimeout(200);
    ok('two different passwords: nothing is sent, and it says so', calls.length === 0 && JSON.stringify(await shown(page)) === '["mismatch"]');
    await page.fill('#reset-again', 'new-pass-12345');
    await page.click('[data-new] button');
    await page.waitForTimeout(400);
    const put = calls[0] || {}, out = calls[1] || {};
    ok('the password is set once, with the link\'s one-time sign-in', put.method === 'PUT' && put.path === '/auth/v1/user' && put.headers.authorization === 'Bearer ' + TOKEN && JSON.parse(put.body).password === 'new-pass-12345', JSON.stringify(put).slice(0, 200));
    ok('then that one-time sign-in is ended, and nobody is left signed in here', out.method === 'POST' && out.path === '/auth/v1/logout?scope=local' && out.headers.authorization === 'Bearer ' + TOKEN && (await page.evaluate(() => localStorage.getItem('inspyx.signin'))) === null);
    ok('it says the password is changed, the boxes are emptied, and the form is gone', await visible(page, '[data-done]') && !(await visible(page, '[data-new]')) && (await page.evaluate(() => document.querySelector('#reset-password').value + document.querySelector('#reset-again').value)) === '');
    await ctx.close();
  });

  for (const [status, kind] of [[422, 'weak'], [401, 'expired']]) {
    await group('a new password the server refuses (' + status + ')', async () => {
      const { ctx, page, calls } = await open(browser, 'reset#access_token=' + TOKEN + '&type=recovery', () => ({ status, json: {} }));
      await page.fill('#reset-password', 'short-but-8');
      await page.fill('#reset-again', 'short-but-8');
      await page.click('[data-new] button');
      await page.waitForTimeout(400);
      const said = await shown(page);
      if (kind === 'weak') ok('a refused password says why, and the form stays', JSON.stringify(said) === '["weak"]' && await visible(page, '[data-new]'));
      else ok('a link that no longer works sends the person back to ask for a new one', await visible(page, '[data-ask]') && await visible(page, '[data-old]') && !(await visible(page, '[data-new]')));
      ok('no sign-in is ended or kept after a refusal (' + status + ')', calls.length === 1 && (await page.evaluate(() => localStorage.getItem('inspyx.signin'))) === null);
      await ctx.close();
    });
  }

  await group('a link that comes back with an error', async () => {
    const { ctx, page, calls } = await open(browser, 'reset#error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired');
    ok('the address is cleaned, the email form shows with "ask for a new one", nothing is called', !(await page.evaluate(() => location.hash)) && await visible(page, '[data-ask]') && await visible(page, '[data-old]') && calls.length === 0);
    await ctx.close();
  });

  await group('reloading drops the one-time sign-in', async () => {
    const { ctx, page, calls } = await open(browser, 'reset#access_token=' + TOKEN + '&type=recovery');
    await page.reload({ waitUntil: 'load' });
    await page.waitForTimeout(300);
    ok('after a reload, only the email form shows and nothing was sent', await visible(page, '[data-ask]') && !(await visible(page, '[data-new]')) && calls.length === 0);
    await ctx.close();
  });

  await group('the sign-in page links here', async () => {
    const { ctx, page } = await open(browser, 'signin');
    const href = await page.evaluate(() => { const a = [...document.querySelectorAll('.help a')].find((x) => /Reset it/.test(x.textContent)); return a && a.getAttribute('href'); });
    ok('"Forgot your password? Reset it" goes to /reset', href === '/reset', String(href));
    await ctx.close();
  });

  await browser.close();
  console.log(failed ? failed + ' FAILED' : 'all reset checks passed');
  process.exit(failed ? 1 : 0);
})();
