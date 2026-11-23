// Self-checks for sign-in links by email (2026-11-23): the "Email me a sign-in link" way on /signin, and the page a
// link opens, /signin/link.
// NO REAL SIGN-IN IS EVER MADE HERE. Every call the pages make to the account server is caught and answered by this
// test with made-up values (a stand-in server that keeps each key good once); any other request that tries to leave
// the site is stopped and counted as a failure.
// usage: node tools/serve.js &   then   node tools/check_signin_link.js   (BROWSER=webkit for Safari's engine)
const playwright = require('playwright');
const engine = process.env.BROWSER === 'webkit' ? playwright.webkit : playwright.chromium;
const url = process.env.URL || 'http://localhost:4173/';
const HOME = new URL(url).origin;
const SERVER = 'https://btxlrfvqifnrnxffohsz.supabase.co';
const WHO = 'pat@example.com';
const KEY = 'a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4';   // the shape of the server's own (hex)
let failed = 0;
const ok = (name, cond, extra) => { if (!cond) failed++; console.log((cond ? 'PASS  ' : 'FAIL  ') + name + (extra ? '  [' + extra + ']' : '')); };
const group = async (label, fn) => { try { await fn(); } catch (e) { ok(label + ': these checks could not run', false, String((e && e.message) || e).split('\n')[0]); } };
const granted = () => ({ access_token: 'test-access-1', refresh_token: 'test-renew-1', token_type: 'bearer', expires_in: 3600, user: { id: '11111111-1111-4111-8111-111111111111', email: WHO } });

/* The stand-in account server. answers(call) may answer a call itself; otherwise /otp answers 200, and /verify signs in
   once per key (the real server's rule), then answers 403 otp_expired, as the real one does for a used or old key. */
function server() {
  const used = new Set();
  return (call) => {
    if (call.path.startsWith('/auth/v1/verify')) {
      const b = JSON.parse(call.body || '{}');
      if (b.type !== 'magiclink' || used.has(b.token_hash)) return { status: 403, json: { code: 403, error_code: 'otp_expired', msg: 'Email link is invalid or has expired' } };
      used.add(b.token_hash);
      return { status: 200, json: granted() };
    }
    if (call.path.startsWith('/auth/v1/otp')) return { status: 200, json: {} };
    return { status: 404, json: {} };
  };
}

async function open(browser, where, o) {
  const opts = o || {};
  const ctx = opts.ctx || await browser.newContext({ viewport: { width: opts.w || 390, height: 844 }, isMobile: !opts.w, hasTouch: !opts.w });
  const page = await ctx.newPage();
  page.setDefaultTimeout(8000);
  if (opts.clock) await page.clock.install();
  const errs = [], away = [], calls = [], logs = [];
  const answer = opts.answers || server();
  page.on('pageerror', (e) => errs.push('pageerror: ' + e.message));
  page.on('console', (m) => logs.push(m.text()));
  await page.route((u) => !u.href.startsWith(HOME) && !u.href.startsWith('data:'), async (route) => {
    const req = route.request();
    // The dashboard a sign-in lands on asks two things; neither is a sign-in call, so neither is counted.
    if (req.url().startsWith(SERVER + '/functions/v1/')) return route.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify({ needs: [], rows: [], next: null, more: false, as_of: new Date().toISOString() }) });
    if (req.url() === SERVER + '/auth/v1/user' && req.method() === 'GET') return route.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify({ id: 'x', email: WHO, user_metadata: {} }) });
    if (!req.url().startsWith(SERVER + '/auth/v1/')) { away.push(req.url()); return route.abort(); }
    const call = { method: req.method(), path: req.url().slice(SERVER.length), headers: req.headers(), body: req.postData() };
    calls.push(call);
    const a = await answer(call, calls.length);
    if (a === 'offline') return route.abort('failed');
    if (a === 'silent') return undefined;
    return route.fulfill({ status: a.status, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(a.json || {}) });
  });
  const res = await page.goto(url + where, { waitUntil: 'load' });
  await page.waitForTimeout(opts.settle === undefined ? 400 : opts.settle);
  return { ctx, page, errs, away, calls, logs, res };
}
const shown = (page, scope) => page.evaluate((s) => [...document.querySelectorAll((s || '') + ' [data-say], ' + (s || '') + ' [data-wait]')].filter((p) => !p.hidden && p.getClientRects().length).map((p) => p.getAttribute('data-say') || 'wait'), scope);
const state = (page) => page.evaluate(() => [...document.querySelectorAll('[data-state]')].filter((e) => !e.hidden).map((e) => e.getAttribute('data-state')).join(','));
const visible = (page, sel) => page.evaluate((s) => { const e = document.querySelector(s); return !!e && !e.hidden && e.getClientRects().length > 0; }, sel);
const kept = (page) => page.evaluate(() => JSON.stringify(Object.assign({}, localStorage)) + JSON.stringify(Object.assign({}, sessionStorage)));
const signedIn = (page) => page.evaluate(() => localStorage.getItem('inspyx.signin'));

(async () => {
  const browser = await engine.launch();
  console.log('browser: ' + engine.name() + ' ' + browser.version());

  // ---- /signin: asking for a link ----
  await group('the sign-in page\'s link way', async () => {
    const { ctx, page, calls, errs, away } = await open(browser, 'signin');
    ok('the link form is hidden until asked for, and nothing is called', !(await visible(page, '[data-link]')) && calls.length === 0 && errs.length === 0 && away.length === 0, errs.concat(away).join(' | '));
    await page.fill('#signin-email', WHO);
    await page.click('[data-link-open]');
    ok('"Email me a sign-in link" opens the form with the address already typed above, and says it is open', await visible(page, '[data-link]') && (await page.inputValue('#link-email')) === WHO && (await page.getAttribute('[data-link-open]', 'aria-expanded')) === 'true');
    ok('one email field at a time: the password way steps aside while the link way is open', !(await visible(page, '[data-signin]')) && !(await visible(page, '[data-link-open]')));
    await page.click('[data-link-close]');
    ok('"Use your password" brings the password way back, and closes the link way', await visible(page, '[data-signin]') && !(await visible(page, '[data-link]')) && await visible(page, '[data-link-open]') && (await page.getAttribute('[data-link-open]', 'aria-expanded')) === 'false');
    await page.click('[data-link-open]');
    await page.click('[data-link] button[type="submit"]');
    await page.waitForTimeout(300);
    const c = calls[0] || {}, b = JSON.parse(c.body || '{}');
    ok('one call: the account server\'s /otp, for this address, never making an account, with no way back named and no secret', calls.length === 1 && c.method === 'POST' && c.path === '/auth/v1/otp' && b.email === WHO && b.create_user === false && Object.keys(b).sort().join() === 'create_user,email' && !c.headers.authorization && !('referer' in c.headers), JSON.stringify(c).slice(0, 300));
    ok('it says a link is on its way if an account uses the address, and counts down to the next one', JSON.stringify(await shown(page, '[data-link]')) === '["sent","wait"]' && await page.isDisabled('[data-link] button[type="submit"]'));
    const secs = Number(await page.textContent('[data-link] [data-secs]'));
    ok('the countdown starts near 60 seconds', secs >= 58 && secs <= 60, String(secs));
    await ctx.close();
  });

  await group('a minute later, another link may be asked for', async () => {
    const { ctx, page } = await open(browser, 'signin', { clock: true });
    await page.click('[data-link-open]');
    await page.fill('#link-email', WHO);
    await page.click('[data-link] button[type="submit"]');
    await page.waitForTimeout(200);
    await page.clock.runFor(30000);
    const half = Number(await page.textContent('[data-link] [data-secs]'));
    await page.clock.runFor(31000);
    ok('the seconds count down, and at the end the button works again and the countdown goes', half >= 29 && half <= 31 && !(await page.isDisabled('[data-link] button[type="submit"]')) && !(await visible(page, '[data-link] [data-wait]')), String(half));
    await ctx.close();
  });

  await group('a reload doesn\'t restart the minute', async () => {
    const { ctx, page, calls } = await open(browser, 'signin');
    await page.click('[data-link-open]');
    await page.fill('#link-email', WHO);
    await page.click('[data-link] button[type="submit"]');
    await page.waitForTimeout(300);
    await page.reload({ waitUntil: 'load' });
    await page.waitForTimeout(300);
    await page.click('[data-link-open]');
    ok('after a reload the button still waits, with the seconds left, and nothing more was sent', await page.isDisabled('[data-link] button[type="submit"]') && await visible(page, '[data-link] [data-wait]') && calls.length === 1);
    await ctx.close();
  });

  // The account server answers an unknown address (422) and a second request too soon (429) differently from a sent
  // link (200): the page must not.
  const looks = {};
  for (const [status, json] of [[200, {}], [422, { code: 422, error_code: 'otp_disabled', msg: 'Signups not allowed for otp' }], [429, { code: 429, error_code: 'over_email_send_rate_limit', msg: 'For security purposes, you can only request this after 57 seconds.' }]]) {
    await group('the same answer whether or not an account uses the address (' + status + ')', async () => {
      const { ctx, page } = await open(browser, 'signin', { answers: () => ({ status, json }) });
      await page.click('[data-link-open]');
      await page.fill('#link-email', WHO);
      await page.click('[data-link] button[type="submit"]');
      await page.waitForTimeout(300);
      looks[status] = JSON.stringify(await shown(page, '[data-link]')) + '|' + await page.isDisabled('[data-link] button[type="submit"]') + '|' + (await page.evaluate(() => document.querySelector('main').innerText.replace(/\d+ seconds/, 'N seconds')));
      ok('a ' + status + ' shows "sent" and the countdown, and no raw server words', looks[status].startsWith('["sent","wait"]|true') && !/Signups|security purposes|otp/i.test(looks[status]));
      await ctx.close();
    });
  }
  ok('the page reads exactly the same for 200, 422 and 429', looks[200] && looks[200] === looks[422] && looks[200] === looks[429]);

  for (const [status, kind] of [[500, 'server'], [400, 'server'], ['offline', 'network']]) {
    await group('a link that cannot be asked for (' + status + ')', async () => {
      const { ctx, page } = await open(browser, 'signin', { answers: () => (status === 'offline' ? 'offline' : { status, json: {} }) });
      await page.click('[data-link-open]');
      await page.fill('#link-email', WHO);
      await page.click('[data-link] button[type="submit"]');
      await page.waitForTimeout(400);
      ok('a ' + status + ' says "' + kind + '", with no countdown, and the button works again', JSON.stringify(await shown(page, '[data-link]')) === JSON.stringify([kind]) && !(await page.isDisabled('[data-link] button[type="submit"]')));
      await ctx.close();
    });
  }

  // ---- /signin/link: the page a link opens ----
  await group('the link page as it is served', async () => {
    const { ctx, page, res, errs, away } = await open(browser, 'signin/link');
    const h = res.headers(), csp = h['content-security-policy'] || '';
    ok('served with the strict rule: its own scripts only, the account server only, no Referer, never cached', res.status() === 200 && /script-src 'self'(;|$)/.test(csp) && /connect-src https:\/\/btxlrfvqifnrnxffohsz\.supabase\.co(;|$)/.test(csp) && /frame-ancestors 'none'/.test(csp) && /default-src 'none'/.test(csp) && h['referrer-policy'] === 'no-referrer' && h['cache-control'] === 'no-store', csp.slice(0, 160));
    const r = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, robots: (document.querySelector('meta[name=robots]') || {}).content, ref: (document.querySelector('meta[name=referrer]') || {}).content, inline: document.querySelectorAll('[style], style, script:not([src])').length, out: [...document.querySelectorAll('[src], link[href]')].map((e) => e.getAttribute('src') || e.getAttribute('href')).filter((s) => /^(https?:)?\/\//.test(s)) }));
    ok('nothing loads from another site, nothing is written inline, kept out of search, no sideways scroll', r.out.length === 0 && r.inline === 0 && r.robots === 'noindex' && r.ref === 'no-referrer' && r.sw <= 390 && errs.length === 0 && away.length === 0, JSON.stringify(r));
    await ctx.close();
  });

  await group('a good link', async () => {
    const { ctx, page, calls, logs } = await open(browser, 'signin/link#token_hash=' + KEY + '&type=magiclink', { settle: 800 });
    const c = calls[0] || {}, b = JSON.parse(c.body || '{}');
    ok('one call: /verify with the key and the type, nothing else, no Referer', calls.length === 1 && c.method === 'POST' && c.path === '/auth/v1/verify' && b.token_hash === KEY && b.type === 'magiclink' && Object.keys(b).sort().join() === 'token_hash,type' && !('referer' in c.headers), JSON.stringify(c).slice(0, 300));
    ok('it lands on the dashboard, signed in', new URL(page.url()).pathname === '/today' && !!(await signedIn(page)), page.url());
    ok('the key is nowhere: not in the address, not kept, not in the console', !page.url().includes(KEY) && !(await kept(page)).includes(KEY) && !logs.join(' ').includes(KEY));
    await ctx.close();
  });

  await group('the key leaves the address before anything else happens', async () => {
    const { ctx, page, calls } = await open(browser, 'signin/link#token_hash=' + KEY + '&type=magiclink', { answers: () => 'silent', settle: 300 });
    ok('while the server is still thinking, the address is already plain, and it says it is signing in', (await page.evaluate(() => location.href)) === HOME + '/signin/link' && (await state(page)) === 'checking' && calls.length === 1);
    await ctx.close();
  });

  await group('a link used twice', async () => {
    const answers = server();
    const first = await open(browser, 'signin/link#token_hash=' + KEY + '&type=magiclink', { answers, settle: 800 });
    await first.ctx.close();
    const { ctx, page, calls } = await open(browser, 'signin/link#token_hash=' + KEY + '&type=magiclink', { answers, settle: 800 });
    ok('the second use is refused: "This link has expired", the new-link form right there, nobody signed in', (await state(page)) === 'expired' && await visible(page, '[data-link]') && !(await signedIn(page)) && calls.length === 1);
    await page.fill('#link-email', WHO);
    await page.click('[data-link] button[type="submit"]');
    await page.waitForTimeout(300);
    ok('a new link can be sent from there at once', calls.length === 2 && calls[1].path === '/auth/v1/otp' && JSON.stringify(await shown(page, '[data-link]')) === '["sent","wait"]');
    await ctx.close();
  });

  for (const status of [400, 401, 403, 404, 410, 422]) {
    await group('a key the server refuses (' + status + ')', async () => {
      const { ctx, page, calls } = await open(browser, 'signin/link#token_hash=' + KEY + '&type=magiclink', { answers: () => ({ status, json: { error_code: 'otp_expired' } }), settle: 600 });
      ok('a ' + status + ' says expired, with the form, signs nobody in', (await state(page)) === 'expired' && await visible(page, '[data-link]') && !(await signedIn(page)) && calls.length === 1);
      await ctx.close();
    });
  }

  // Keys that are not keys: never sent anywhere.
  const bad = [
    ['too long', '#token_hash=' + 'a'.repeat(257) + '&type=magiclink'],
    ['too short', '#token_hash=abc&type=magiclink'],
    ['not a key\'s characters', '#token_hash=' + encodeURIComponent('<script>alert(1)</script>' + 'a'.repeat(30)) + '&type=magiclink'],
    ['a space inside', '#token_hash=' + encodeURIComponent('a'.repeat(15) + ' ' + 'b'.repeat(15)) + '&type=magiclink'],
    ['no type', '#token_hash=' + KEY],
    ['another kind of key (recovery)', '#token_hash=' + KEY + '&type=recovery'],
    ['another kind of key (signup)', '#token_hash=' + KEY + '&type=signup'],
    ['an error back from the server', '#error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired'],
    ['an error beside a key', '#token_hash=' + KEY + '&type=magiclink&error=access_denied'],
    ['the key in the query, not the fragment', '?token_hash=' + KEY + '&type=magiclink']
  ];
  for (const [label, tail] of bad) {
    await group('a link that is not a key: ' + label, async () => {
      const { ctx, page, calls } = await open(browser, 'signin/link' + tail);
      const st = await state(page);
      ok(label + ': nothing is sent, the address is cleaned, nobody is signed in, and a new link is offered', calls.length === 0 && (await page.evaluate(() => location.href)) === HOME + '/signin/link' && !(await signedIn(page)) && (st === 'expired' || st === 'missing') && await visible(page, '[data-link]'), st + ' ' + calls.length);
      await ctx.close();
    });
  }

  // Random keys (a property check): every well-formed key is sent once and exactly as it came; every other is never sent.
  await group('random keys', async () => {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const chars = 'abcdefABCDEF0123456789-_.~!*()%+/= <>"\'';
    let seed = 7, wrong = [];
    const rand = (n) => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed % n; };
    for (let i = 0; i < 40; i++) {
      let k = '';
      const len = [1, 19, 20, 56, 64, 128, 256, 257, 300][rand(9)];
      for (let j = 0; j < len; j++) k += chars[rand(i < 20 ? 22 : chars.length)];
      const good = /^[A-Za-z0-9_-]{20,256}$/.test(k);
      const { page, calls } = await open(browser, 'signin/link#token_hash=' + encodeURIComponent(k) + '&type=magiclink', { ctx, answers: () => ({ status: 403, json: {} }), settle: 250 });
      const sent = calls.map((c) => JSON.parse(c.body || '{}').token_hash);
      if (good ? !(sent.length === 1 && sent[0] === k) : sent.length !== 0) wrong.push(JSON.stringify(k).slice(0, 40) + ' sent ' + sent.length);
      await page.close();
    }
    ok('40 random keys: each good one sent once as it came, none of the rest sent', wrong.length === 0, wrong.slice(0, 3).join(' | '));
    await ctx.close();
  });

  await group('a link page opened with no key', async () => {
    const { ctx, page, calls } = await open(browser, 'signin/link');
    ok('it says to open the newest link or send a new one, with the form, and calls nothing', (await state(page)) === 'missing' && await visible(page, '[data-link]') && calls.length === 0);
    await ctx.close();
  });

  for (const trouble of ['offline', 500]) {
    await group('a link whose check can\'t reach the server (' + trouble + ')', async () => {
      let n = 0;
      const { ctx, page, calls } = await open(browser, 'signin/link#token_hash=' + KEY + '&type=magiclink', { answers: () => (++n === 1 ? (trouble === 'offline' ? 'offline' : { status: 500, json: {} }) : { status: 200, json: granted() }), settle: 600 });
      ok('it says so, with "Try again", no form, nobody signed in, and the key is out of the address', (await state(page)) === (trouble === 'offline' ? 'network' : 'server') && !(await visible(page, '[data-link]')) && !(await signedIn(page)) && !page.url().includes(KEY));
      await page.click('[data-state]:not([hidden]) [data-again]');
      await page.waitForTimeout(800);
      ok('"Try again" checks the same key once more, and signs in', calls.length === 2 && JSON.parse(calls[1].body).token_hash === KEY && new URL(page.url()).pathname === '/today' && !!(await signedIn(page)));
      await ctx.close();
    });
  }

  await group('an answer that is no sign-in', async () => {
    const { ctx, page } = await open(browser, 'signin/link#token_hash=' + KEY + '&type=magiclink', { answers: () => ({ status: 200, json: { access_token: 'x' } }), settle: 600 });
    ok('a half answer signs nobody in, and offers a new link', (await state(page)) === 'expired' && !(await signedIn(page)) && await visible(page, '[data-link]'));
    await ctx.close();
  });

  await group('a browser that won\'t keep a sign-in', async () => {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
    await ctx.addInitScript(() => { Storage.prototype.setItem = function () { throw new Error('no'); }; });
    const { page, calls } = await open(browser, 'signin/link#token_hash=' + KEY + '&type=magiclink', { ctx, settle: 800 });
    ok('it says the browser didn\'t keep it, offers a new link, and the sign-in it got is ended', (await state(page)) === 'storage' && await visible(page, '[data-link]') && calls.some((c) => c.path === '/auth/v1/logout?scope=local'));
    await ctx.close();
  });

  // ---- The phone's way in: Apple's file naming the app for these links only ----
  await group('the app link file', async () => {
    const ctx = await browser.newContext();
    const res = await ctx.request.get(url + '.well-known/apple-app-site-association', { maxRedirects: 0 });
    let j = null;
    try { j = JSON.parse(await res.text()); } catch (e) { j = null; }
    const d = j && j.applinks && j.applinks.details;
    const comps = d ? d.flatMap((x) => x.components || []) : [];
    ok('served straight (no redirect) as JSON', res.status() === 200 && /application\/json/.test(res.headers()['content-type'] || ''), String(res.status()) + ' ' + res.headers()['content-type']);
    ok('the app opens sign-in links and nothing else; its saved-password link stays', !!d && d.every((x) => x.appIDs.includes('9579YZP33V.com.inspyx.app')) && comps.length === 1 && comps[0]['/'] === '/signin/link' && !d.some((x) => x.paths) && JSON.stringify(j.webcredentials) === JSON.stringify({ apps: ['9579YZP33V.com.inspyx.app'] }), JSON.stringify(j).slice(0, 300));
    await ctx.close();
  });

  await browser.close();
  console.log(failed ? failed + ' FAILED' : 'all sign-in link checks passed');
  process.exit(failed ? 1 : 0);
})();
