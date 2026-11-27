// Self-checks for the account page (job 7, W20, 2026-11-23): who is signed in, a new password, the business in one
// place, the plan, and where an account is deleted. NO REAL SIGN-IN IS EVER MADE OR CHANGED HERE: the sign-in is a
// made-up one, every call to the account server is answered by this test, and any other request that tries to
// leave the site is stopped and counted as a failure. No password is ever written to the output.
// usage: node tools/serve.js &   then   node tools/check_account.js   (BROWSER=webkit for Safari's engine; SHOTS=<dir>)
const playwright = require('playwright');
const engine = process.env.BROWSER === 'webkit' ? playwright.webkit : playwright.chromium;
const url = (process.env.URL || 'http://localhost:4173/').replace(/\/?$/, '/');
const HOME = new URL(url).origin;
const SERVER = 'https://btxlrfvqifnrnxffohsz.supabase.co';
const SHOTS = process.env.SHOTS || '';
const WHO = 'pat@example.com';
let failed = 0;
const ok = (name, cond, extra) => { if (!cond) failed++; console.log((cond ? 'PASS  ' : 'FAIL  ') + name + (extra ? '  [' + extra + ']' : '')); };
const group = async (label, fn) => { try { await fn(); } catch (e) { ok(label + ': these checks could not run', false, String((e && e.message) || e).split('\n')[0]); } };
const kept = JSON.stringify({ access: 'test-access-1', renew: 'test-renew-1', ends: Date.now() + 3600e3, id: '11111111-1111-4111-8111-111111111111', email: WHO });

async function open(browser, answer, w) {
  const ctx = await browser.newContext({ viewport: { width: w || 1280, height: 900 }, locale: 'en-US' });
  await ctx.addInitScript((v) => { try { localStorage.setItem('inspyx.signin', v); } catch (e) { /* none */ } }, kept);
  const page = await ctx.newPage();
  page.setDefaultTimeout(8000);
  const errs = [], away = [], puts = [];
  page.on('pageerror', (e) => errs.push(e.message));
  await page.route((u) => !u.href.startsWith(HOME), async (route) => {
    const req = route.request(), u = req.url();
    if (u === SERVER + '/auth/v1/user' && req.method() === 'PUT') {
      puts.push(JSON.parse(req.postData() || '{}'));
      const a = answer();
      if (a === 'offline') return route.abort();
      return route.fulfill({ status: a, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: a === 200 ? JSON.stringify({ id: 'x', email: WHO }) : JSON.stringify({ error_code: a === 422 ? 'weak_password' : 'x' }) });
    }
    if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': 'GET,POST,PUT' } });
    away.push(u); return route.abort();
  });
  await page.goto(url + 'account', { waitUntil: 'load' });
  await page.waitForSelector('[data-account]:not([hidden])');
  return { ctx, page, errs, away, puts };
}
const vis = (page, sel) => page.$$eval(sel, (els) => els.filter((e) => e.getClientRects().length > 0).map((e) => e.textContent.replace(/\s+/g, ' ').trim()));

(async () => {
  const browser = await engine.launch();
  console.log('browser: ' + engine.name() + ' ' + browser.version());

  await group('the page', async () => {
    const { page, ctx, errs, away } = await open(browser, () => 200);
    ok('names who is signed in', (await vis(page, '.who')).join() === 'Signed in as ' + WHO);
    ok('the business in one place: company, prices, agreements, booking, emails, payments, templates, people, past inspections (the rehearsal, round 2), then the plan', JSON.stringify(await page.$$eval('.acct-links a', (as) => as.map((a) => a.getAttribute('href')))) === JSON.stringify(['/profile', '/prices', '/agreements', '/booking', '/emails', '/payments', '/template', '/people', '/bring-business', '/plan']));
    // Each one leads to a page this site has (a link that goes nowhere fails here).
    for (const href of ['/template', '/people', '/bring-business']) {
      const r = await fetch(new URL(href, page.url()).href);
      ok(href + ' is a page here', r.status === 200, String(r.status));
    }
    ok('says where an account is deleted, and that it can\'t be undone', (await vis(page, '.acct-help')).some((t) => t.startsWith('On your phone: More → Account → Delete your account.') && t.endsWith('It can’t be undone.')));
    ok('opens with no errors and asks nobody', errs.length === 0 && away.length === 0, errs.concat(away).join(' | '));
    if (SHOTS) await page.screenshot({ path: SHOTS + '/50-account-wide.png', fullPage: true });
    await ctx.close();
  });

  await group('a new password', async () => {
    let answer = 200;
    const { page, ctx, puts } = await open(browser, () => answer);
    const save = async (a, b) => { await page.fill('[name="password"]', a); await page.fill('[name="again"]', b); await page.click('[data-password] button[type="submit"]'); };
    const said = async () => (await vis(page, '[data-psay]')).join();
    await save('short', 'short');
    ok('fewer than 8 characters: says so, sends nothing', await said() === 'Use at least 8 characters.' && puts.length === 0);
    await save('long-enough-1', 'long-enough-2');
    ok('two different: says so, sends nothing', await said() === 'The two don’t match. Type the same password twice.' && puts.length === 0);
    answer = 422;
    await save('long-enough-1', 'long-enough-1');
    ok('one the server won\'t take: says so, as the server said', await page.waitForFunction(() => !document.querySelector('[data-psay="weak"]').hidden).then(() => true, () => false) && puts.length === 1);
    answer = 401;
    await save('long-enough-1', 'long-enough-1');
    ok('a sign-in that has ended: says so, with the way back', await page.waitForFunction(() => !document.querySelector('[data-psay="rejected"]').hidden).then(() => true, () => false) && await page.getAttribute('[data-psay="rejected"] a', 'href') === '/signin');
    answer = 'offline';
    await save('long-enough-1', 'long-enough-1');
    ok('no connection: says so', await page.waitForFunction(() => !document.querySelector('[data-psay="network"]').hidden).then(() => true, () => false));
    answer = 200;
    const n = puts.length;
    await save('long-enough-9', 'long-enough-9');
    ok('saved: says so in green, and the boxes are emptied', await page.waitForFunction(() => !document.querySelector('[data-psay="saved"]').hidden).then(() => true, () => false) && await page.inputValue('[name="password"]') === '' && await page.inputValue('[name="again"]') === '');
    ok('one request, the password alone, to the sign-in server', puts.length === n + 1 && JSON.stringify(Object.keys(puts[n])) === '["password"]' && puts[n].password === 'long-enough-9');
    ok('"Saved." is green', await page.$eval('[data-psay="saved"]', (e) => getComputedStyle(e).color) === 'rgb(23, 146, 79)');
    await ctx.close();
  });

  await group('on a phone', async () => {
    const { page, ctx, errs } = await open(browser, () => 200, 390);
    ok('nothing runs off the side, and every button is big enough to tap', await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth && [...document.querySelectorAll('.acct .btn')].filter((b) => b.getClientRects().length).every((b) => b.getBoundingClientRect().height >= 44)));
    ok('no errors', errs.length === 0, errs.join(' | '));
    if (SHOTS) await page.screenshot({ path: SHOTS + '/51-account-phone.png', fullPage: true });
    await ctx.close();
  });

  await group('the page says no words', async () => {
    const code = require('fs').readFileSync(require('path').join(__dirname, '..', 'coming-soon', 'assets', 'account.js'), 'utf8');
    const bare = code.replace(/\/\*[\s\S]*?\*\/|(^|[^:'"])\/\/.*$/gm, '$1');
    const literals = bare.match(/'(?:[^'\\\n]|\\.)*'|"(?:[^"\\\n]|\\.)*"/g) || [];
    const sentences = literals.map((l) => l.slice(1, -1)).filter((t) => /^[A-Za-z]/.test(t) && t.split(' ').filter((w) => /^[A-Za-z’']+[.,!?:;]?$/.test(w)).length >= 3);
    ok('the script says no words: every sentence is in the page', sentences.length === 0, sentences.join(' | '));
  });

  await browser.close();
  console.log(failed ? '\n' + failed + ' CHECK(S) FAILED' : '\nall checks passed');
  process.exit(failed ? 1 : 0);
})();
