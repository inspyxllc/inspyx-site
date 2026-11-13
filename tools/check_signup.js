// Self-checks for the sign-up page, /signup (2026-11-13). NO REAL ACCOUNT IS EVER MADE HERE: every call to the account
// server and to Inspyx's functions is caught and answered by this test with made-up values; any other request that
// tries to leave the site is stopped and counted as a failure.
// usage: node tools/serve.js &   then   node tools/check_signup.js   (BROWSER=webkit for Safari's engine)
const playwright = require('playwright');
const engine = process.env.BROWSER === 'webkit' ? playwright.webkit : playwright.chromium;
const url = process.env.URL || 'http://localhost:4173/';
const HOME = new URL(url).origin;
const SERVER = 'https://btxlrfvqifnrnxffohsz.supabase.co';
const WHO = 'pat@example.com', ID = '11111111-1111-4111-8111-111111111111';
const TOKEN = 'test-signup-access-0123456789abcdef', RENEW = 'test-signup-renew';
// His words for the two ticks (approved 2026-11-13, "Yes, use them"): a change here needs his word too.
const TERMS = 'I agree to the Inspyx Terms of Service and Privacy Policy.';
const METRICS = 'Inspyx may see my app numbers: how many inspections I do, how long I’m on site, and how long each report takes. Never my clients’ names, addresses or reports. The first 10 inspectors who tick this become founders.';
let failed = 0;
const ok = (name, cond, extra) => { if (!cond) failed++; console.log((cond ? 'PASS  ' : 'FAIL  ') + name + (extra ? '  [' + extra + ']' : '')); };
const group = async (label, fn) => { try { await fn(); } catch (e) { ok(label + ': these checks could not run', false, String((e && e.message) || e).split('\n')[0]); } };
const kept = (n) => JSON.stringify({ access: 'test-access-' + n, renew: 'test-renew-' + n, ends: Date.now() + 3600000, id: ID, email: WHO });

async function open(browser, where, answers, store) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  if (store !== undefined) await ctx.addInitScript((v) => { if (!sessionStorage.getItem('seeded')) { sessionStorage.setItem('seeded', '1'); localStorage.setItem('inspyx.signin', v); } }, store);
  const page = await ctx.newPage();
  page.setDefaultTimeout(8000);
  const errs = [], away = [], calls = [];
  page.on('pageerror', (e) => errs.push('pageerror: ' + e.message));
  await page.route((u) => !u.href.startsWith(HOME) && !u.href.startsWith('data:'), async (route) => {
    const req = route.request();
    if (!req.url().startsWith(SERVER + '/auth/v1/') && !req.url().startsWith(SERVER + '/functions/v1/')) { away.push(req.url()); return route.abort(); }
    const call = { method: req.method(), path: req.url().slice(SERVER.length), headers: req.headers(), body: req.postData() };
    calls.push(call);
    const a = answers ? answers(call, calls) : { status: 200, json: {} };
    if (a === 'offline') return route.abort('failed');
    if (a === 'stay') return route.fulfill({ status: 204 });
    return route.fulfill({ status: a.status, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(a.json || {}) });
  });
  const res = await page.goto(url + where, { waitUntil: 'load' });
  await page.waitForTimeout(400);
  return { ctx, page, errs, away, calls, res };
}
const step = (page) => page.evaluate(() => ['start', 'check', 'finish', 'password'].filter((k) => { const e = document.querySelector('[data-' + k + ']'); return e && !e.hidden && e.getClientRects().length; }));
const shown = (page) => page.evaluate(() => [...document.querySelectorAll('[data-say]')].filter((p) => !p.hidden && p.getClientRects().length).map((p) => p.getAttribute('data-say')));
const flat = (t) => t.replace(/\s+/g, ' ').trim();

(async () => {
  const browser = await engine.launch();
  console.log('browser: ' + engine.name() + ' ' + browser.version());

  await group('the page as it opens', async () => {
    const { ctx, page, errs, away, calls, res } = await open(browser, 'signup');
    const h = res.headers(), csp = h['content-security-policy'] || '';
    ok('opens on the first step, asks nothing of anyone, no errors', errs.length === 0 && away.length === 0 && calls.length === 0 && JSON.stringify(await step(page)) === '["start"]', errs.concat(away).join(' | '));
    ok('served with the sign-in pages\' strict rule, and kept out of search', /script-src 'self'(;|$)/.test(csp) && csp.includes('connect-src ' + SERVER) && /frame-ancestors 'none'/.test(csp) && (await page.evaluate(() => document.querySelector('meta[name=robots]').content)) === 'noindex');
    const r = await page.evaluate(() => { const f = document.querySelector('[data-create]'); const t = [...f.querySelectorAll('.tick')]; return { terms: t[0] && t[0].textContent, metrics: t[1] && t[1].textContent, termsReq: f.querySelector('[name=terms]').required, metricsReq: f.querySelector('[name=metrics]').required, links: [...t[0].querySelectorAll('a')].map((a) => a.getAttribute('href')).join(','), sw: document.documentElement.scrollWidth, tickH: t.map((x) => Math.round(x.getBoundingClientRect().height)), pw: f.querySelector('[name=password]').autocomplete, inline: document.querySelectorAll('[style], style, script:not([src])').length }; });
    ok('the two ticks say his approved words, word for word', flat(r.terms) === TERMS && flat(r.metrics) === METRICS, JSON.stringify([flat(r.terms), flat(r.metrics)]));
    ok('the Terms tick is required and links to the Terms and the Privacy Policy; the metrics tick is not required', r.termsReq && !r.metricsReq && r.links === '/terms,/privacy');
    ok('nothing scrolls sideways; each tick is big enough to tap; a new password box; nothing written inline', r.sw <= 390 && r.tickH.every((x) => x >= 44) && r.pw === 'new-password' && r.inline === 0, JSON.stringify(r.tickH));
    await ctx.close();
  });

  await group('making an account with an email', async () => {
    const { ctx, page, calls } = await open(browser, 'signup', () => ({ status: 200, json: { id: ID, email: WHO } }));
    await page.fill('#signup-email', WHO); await page.fill('#signup-password', 'made-up-pass-1');
    await page.click('[data-create] button');
    await page.waitForTimeout(200);
    ok('without the Terms tick, nothing is sent', calls.length === 0);
    await page.check('[data-create] [name=terms]'); await page.check('[data-create] [name=metrics]');
    await page.click('[data-create] button');
    await page.waitForTimeout(400);
    const c = calls[0] || {};
    const back = new URL(SERVER + (c.path || '/')).searchParams.get('redirect_to');
    ok('one call: the account server\'s sign-up, with the email and password, its link coming back to this page', calls.length === 1 && c.method === 'POST' && (c.path || '').startsWith('/auth/v1/signup?') && back === HOME + '/signup' && JSON.parse(c.body).email === WHO && !c.headers.authorization, JSON.stringify(c).slice(0, 160));
    ok('it says to check the email, empties the password, and keeps no sign-in', JSON.stringify(await step(page)) === '["check"]' && (await page.inputValue('#signup-password')) === '' && (await page.evaluate(() => localStorage.getItem('inspyx.signin'))) === null);
    const t = await page.evaluate(() => localStorage.getItem('inspyx.signup.ticks'));
    ok('the ticks are remembered on this device, with nothing secret in them', t && JSON.parse(t).metrics === true && !t.includes('made-up-pass'), t);
    await ctx.close();
  });

  for (const [ans, kind] of [[{ status: 422, json: { error_code: 'signup_disabled', msg: 'Signups not allowed for this instance' } }, 'closed'], [{ status: 403, json: { msg: 'signup_closed' } }, 'closed'], [{ status: 422, json: { error_code: 'weak_password' } }, 'weak'], [{ status: 429, json: {} }, 'busy'], ['offline', 'network']]) {
    await group('a sign-up that is refused (' + kind + ')', async () => {
      const { ctx, page } = await open(browser, 'signup', () => ans);
      await page.fill('#signup-email', WHO); await page.fill('#signup-password', 'made-up-pass-1'); await page.check('[data-create] [name=terms]');
      await page.click('[data-create] button');
      await page.waitForTimeout(400);
      ok('says "' + kind + '" and stays on the first step', JSON.stringify(await shown(page)) === JSON.stringify([kind]) && JSON.stringify(await step(page)) === '["start"]');
      await ctx.close();
    });
  }

  await group('back from the confirmation email', async () => {
    let recorded = false;
    const answers = (c) => {
      if (c.path === '/auth/v1/user') return { status: 200, json: { id: ID, email: WHO } };
      if (c.path === '/functions/v1/signup') { const b = JSON.parse(c.body); if (b.action === 'record') { recorded = true; return { status: 200, json: { new: true, founder: true, founder_number: 1, metrics: true } }; } return { status: 200, json: { recorded, has_password: true, founder: recorded, founder_number: recorded ? 1 : null, metrics: recorded } }; }
      return { status: 500, json: {} };
    };
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true });
    await ctx.addInitScript((w) => { if (!sessionStorage.getItem('seeded')) { sessionStorage.setItem('seeded', '1'); localStorage.setItem('inspyx.signup.ticks', JSON.stringify({ email: w, terms: true, metrics: true })); } }, WHO);
    const o = await open(browser, 'signup#access_token=' + TOKEN + '&expires_in=3600&refresh_token=' + RENEW + '&token_type=bearer&type=signup', answers);
    await o.ctx.close();
    const page = await ctx.newPage(); const calls = [];
    await page.route((u) => !u.href.startsWith(HOME), async (route) => { const req = route.request(); const c = { method: req.method(), path: req.url().slice(SERVER.length), headers: req.headers(), body: req.postData() }; calls.push(c); const a = answers(c); return route.fulfill({ status: a.status, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(a.json) }); });
    await page.goto(url + 'signup#access_token=' + TOKEN + '&expires_in=3600&refresh_token=' + RENEW + '&token_type=bearer&type=signup', { waitUntil: 'load' });
    await page.waitForTimeout(600);
    const where = await page.evaluate(() => location.href);
    ok('the link\'s sign-in is taken out of the address at once', !where.includes(TOKEN) && !where.includes('#'), where);
    ok('it asks who the sign-in belongs to, keeps it, and shows the finish step with the remembered ticks', calls[0] && calls[0].path === '/auth/v1/user' && calls[0].headers.authorization === 'Bearer ' + TOKEN && JSON.stringify(await step(page)) === '["finish"]' && await page.isChecked('[data-finish] [name=terms]') && await page.isChecked('[data-finish] [name=metrics]') && (await page.textContent('[data-email]')) === WHO);
    await page.click('[data-finish] button');
    await page.waitForURL('**/account', { timeout: 5000 }).catch(() => {});
    const rec = calls.find((c) => c.path === '/functions/v1/signup' && JSON.parse(c.body).action === 'record');
    ok('Finish records the Terms tick (this wording) and the metrics tick, as the signed-in account', !!rec && JSON.parse(rec.body).terms === true && JSON.parse(rec.body).terms_version === '2026-11-13' && JSON.parse(rec.body).metrics === true && rec.headers.authorization === 'Bearer ' + TOKEN, rec && rec.body);
    ok('then, with a password already, it goes to the account page and forgets the remembered ticks', (await page.evaluate(() => location.pathname)) === '/account' && (await page.evaluate(() => localStorage.getItem('inspyx.signup.ticks'))) === null);
    await ctx.close();
  });

  await group('a signed-in account without a password (Google)', async () => {
    const { ctx, page, calls } = await open(browser, 'signup', (c) => {
      if (c.path === '/functions/v1/signup') return { status: 200, json: { recorded: true, has_password: false, founder: false, founder_number: null, metrics: false } };
      if (c.path === '/auth/v1/user' && c.method === 'PUT') return { status: 200, json: { id: ID } };
      return { status: 500, json: {} };
    }, kept(1));
    ok('shows the password step', JSON.stringify(await step(page)) === '["password"]');
    await page.fill('#signup-new', 'new-pass-12345');
    await page.click('[data-password] button');
    await page.waitForURL('**/account', { timeout: 5000 }).catch(() => {});
    const put = calls.find((c) => c.method === 'PUT');
    ok('sets the password with its own sign-in, then goes to the account page', !!put && put.path === '/auth/v1/user' && JSON.parse(put.body).password === 'new-pass-12345' && put.headers.authorization === 'Bearer test-access-1' && (await page.evaluate(() => location.pathname)) === '/account');
    await ctx.close();
  });

  await group('Google', async () => {
    const { ctx, page, calls } = await open(browser, 'signup', () => 'stay');
    await page.click('[data-google]');
    await page.waitForTimeout(300);
    ok('without the Terms tick, Google is not opened', calls.length === 0);
    await page.check('[data-create] [name=terms]');
    await page.click('[data-google]');
    await page.waitForTimeout(500);
    const c = calls[0] || {};
    const back = new URL(SERVER + (c.path || '/')).searchParams.get('redirect_to');
    ok('with it, the account server is asked to open Google and come back to this page', (c.path || '').startsWith('/auth/v1/authorize?provider=google') && back === HOME + '/signup', c.path);
    await ctx.close();
  });

  await group('a link that no longer works', async () => {
    const { ctx, page, calls } = await open(browser, 'signup#error=access_denied&error_code=otp_expired');
    ok('the address is cleaned, it says so, and the first step shows', !(await page.evaluate(() => location.hash)) && JSON.stringify(await shown(page)) === '["expired"]' && JSON.stringify(await step(page)) === '["start"]' && calls.length === 0);
    await ctx.close();
  });

  await browser.close();
  console.log(failed ? failed + ' FAILED' : 'all sign-up checks passed');
  process.exit(failed ? 1 : 0);
})();
