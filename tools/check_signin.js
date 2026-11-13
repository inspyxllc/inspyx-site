// Self-checks for signing in on the website: /signin and /account.
// NO REAL SIGN-IN IS EVER MADE HERE. Every call the pages make to the account server is caught and answered by
// this test, with a made-up address and a made-up password that exist nowhere; any other request that tries to
// leave the site is stopped and counted as a failure.
// usage: node tools/serve.js &   then   node tools/check_signin.js
//        (served somewhere else: URL=http://localhost:4174/ node tools/check_signin.js)
//        (in Safari's engine instead of Chrome's: BROWSER=webkit node tools/check_signin.js)
const playwright = require('playwright');
const engine = process.env.BROWSER === 'webkit' ? playwright.webkit : playwright.chromium;
const fs = require('fs');
const path = require('path');

const url = process.env.URL || 'http://localhost:4173/';
const HOME = new URL(url).origin;
const SERVER = 'https://btxlrfvqifnrnxffohsz.supabase.co';
const WHO = 'pat@example.com', PASS = 'made-up-pass-4-tests';
const PHONE = 390, WIDE = 1280;
const STORE = 'inspyx.signin';
let failed = 0;
let signinRule = '';
const ok = (name, cond, extra) => { if (!cond) failed++; console.log((cond ? 'PASS  ' : 'FAIL  ') + name + (extra ? '  [' + extra + ']' : '')); };
const group = async (label, fn) => { try { await fn(); } catch (e) { ok(label + ': these checks could not run', false, String((e && e.message) || e).split('\n')[0]); } };
const granted = (n, secs) => ({ access_token: 'test-access-' + n, refresh_token: 'test-renew-' + n, token_type: 'bearer', expires_in: secs || 3600, user: { id: '11111111-1111-4111-8111-111111111111', email: WHO } });
const kept = (n, endsInMs) => JSON.stringify({ access: 'test-access-' + n, renew: 'test-renew-' + n, ends: Date.now() + endsInMs, id: '11111111-1111-4111-8111-111111111111', email: WHO });

// The words of the two pages, as drafted on 2026-11-12. They wait for Moises's approval; once he gives it, they are
// his words, and a change here needs his word too. The sentences about a failed sign-in are the app's own.
const SIGNIN_WORDS = ['h1: Welcome back.', 'button: Continue with Google', 'p: or with your email', 'label: Email', 'label: Password',
  'p: That email or password was not accepted. Check both and try again.',
  'p: Inspyx could not reach the sign-in server. Check your connection and try again.',
  'p: The sign-in server answered in an unexpected way. No session was created.',
  'p: The sign-in server refused the request. Try again later.',
  'p: Sign-in did not complete. Try again.',
  'p: No Inspyx account uses that Google address. Sign in with your email and password, or join the waitlist.',
  'p: Google sign-in did not complete. Try again.',
  'button: Sign in',
  'p: Forgot your password? Reset it',
  'p: New to Inspyx? Join the waitlist'];
const ACCOUNT_WORDS = ['h1: Account', 'p: Signed in as', 'button: Sign out', 'p: Inspyx could not reach the sign-in server. Check your connection and try again.', 'p: The sign-in server refused the request. Try again later.'];
const read = () => {
  const flat = (t) => t.replace(/\s+/g, ' ').trim();
  const main = document.querySelector('main').cloneNode(true);
  main.querySelectorAll('noscript, [data-email]').forEach((e) => e.remove());
  const SEL = 'h1, h2, label, p, button';
  return [...main.querySelectorAll(SEL)].filter((e) => !e.parentElement.closest(SEL)).map((e) => e.tagName.toLowerCase() + ': ' + flat(e.textContent));
};

// answers(call) says how the account server "answers" one call: { status, json } | 'offline' | 'silent' (it never
// answers) | { wait, status, json }. Other options: store (what the browser holds as the page opens), clock (the page's
// clock can be wound forward), init (run in the page before anything else), without (a file of the site that fails to load).
async function open(browser, where, opts) {
  const o = opts || {};
  const ctx = o.ctx || await browser.newContext({ viewport: { width: o.w || PHONE, height: o.h || 844 }, deviceScaleFactor: 1, hasTouch: !o.desktop, isMobile: !o.desktop, reducedMotion: o.still ? 'reduce' : 'no-preference' });
  if (o.store !== undefined && !o.ctx) await ctx.addInitScript((v) => { try { if (!sessionStorage.getItem('seeded')) { sessionStorage.setItem('seeded', '1'); if (v === null) localStorage.removeItem('inspyx.signin'); else localStorage.setItem('inspyx.signin', v); } } catch (e) { /* no storage */ } }, o.store);
  const page = await ctx.newPage();
  page.setDefaultTimeout(8000);
  if (o.clock) await page.clock.install();
  if (o.init) await page.addInitScript(o.init);
  if (o.without) await page.route('**/' + o.without, (route) => route.abort());
  const errs = [], away = [], calls = [];
  page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource|net::ERR_FAILED|net::ERR_ABORTED/.test(m.text())) errs.push(m.text()); });
  page.on('pageerror', (e) => errs.push('pageerror: ' + e.message));
  await page.route((u) => !u.href.startsWith(HOME) && !u.href.startsWith('data:'), async (route) => {
    const req = route.request();
    if (!req.url().startsWith(SERVER + '/auth/v1/')) { away.push(req.url()); return route.abort(); }
    const call = { method: req.method(), path: req.url().slice(SERVER.length), headers: req.headers(), body: req.postData() };
    calls.push(call);
    const a = o.answers ? await o.answers(call, calls.length) : { status: 200, json: granted(1) };
    if (a === 'offline') return route.abort('failed');
    if (a === 'silent') return undefined;
    // The account server sends the browser on with a redirect. Safari's engine cannot be handed a made-up redirect
    // by a test, so the stand-in is a page that sends the browser on at once: the browser ends at the same address.
    if (a.redirect) return route.fulfill({ status: 200, contentType: 'text/html', body: '<!DOCTYPE html><meta http-equiv="refresh" content="0;url=' + a.redirect.replace(/&/g, '&amp;').replace(/"/g, '&quot;') + '"><title>on</title>' });
    // 'stay': the server answers with nothing to show, so the browser stays on the page it was leaving.
    if (a === 'stay') return route.fulfill({ status: 204 });
    if (a.wait) await new Promise((r) => setTimeout(r, a.wait));
    return route.fulfill({ status: a.status, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(a.json === undefined ? {} : a.json) });
  });
  const res = await page.goto(url + where, { waitUntil: 'load' });
  await page.waitForTimeout(350);
  return { ctx, page, errs, away, calls, res };
}
const at = (page) => page.evaluate(() => location.pathname);
const stored = (page) => page.evaluate((k) => localStorage.getItem(k), STORE);
const shown = (page) => page.evaluate(() => [...document.querySelectorAll('[data-say]')].filter((p) => !p.hidden && p.getClientRects().length).map((p) => p.getAttribute('data-say')));
async function fill(page, pass) { await page.fill('#signin-email', WHO); await page.fill('#signin-password', pass === undefined ? PASS : pass); }

(async () => {
  const browser = await engine.launch();
  console.log('browser: ' + engine.name() + ' ' + browser.version());

  // ---- the page as it opens: on a phone and on a wide screen
  for (const [label, w, desktop] of [['phone', PHONE, false], ['wide', WIDE, true]]) {
    await group('sign-in page, ' + label, async () => {
      const { ctx, page, errs, away, calls, res } = await open(browser, 'signin', { w, h: desktop ? 900 : 844, desktop });
      ok('sign-in page, ' + label + ': opens with no errors and asks no other site for anything, the account server included', errs.length === 0 && away.length === 0 && calls.length === 0, errs.concat(away).join(' | ') + ' calls: ' + calls.length);
      const h = res.headers(), csp = h['content-security-policy'] || '';
      if (!signinRule) signinRule = csp;
      ok('sign-in page, ' + label + ': served with the rule that only the site\'s own scripts and styles run, and only the account server may be called', /script-src 'self'(;|$)/.test(csp) && /style-src 'self'(;|$)/.test(csp) && csp.includes("connect-src " + SERVER) && !/unsafe/.test(csp) && /frame-ancestors 'none'/.test(csp) && /form-action 'none'/.test(csp) && (h['referrer-policy'] || '') === 'no-referrer' && (h['x-frame-options'] || '') === 'DENY', csp.slice(0, 200));
      const r = await page.evaluate(() => {
        const box = (e) => { const b = e.getBoundingClientRect(); return { l: Math.round(b.left), t: Math.round(b.top), r: Math.round(b.right), b: Math.round(b.bottom), w: Math.round(b.width), h: Math.round(b.height) }; };
        const q = (s) => document.querySelector(s);
        const em = q('#signin-email'), pw = q('#signin-password'), form = q('[data-signin]'), stage = q('.stage');
        const sides = [...document.querySelectorAll('.side')].filter((e) => e.getClientRects().length).map(box);
        return {
          sw: document.documentElement.scrollWidth,
          inline: document.querySelectorAll('[style], style, script:not([src])').length,
          robots: (q('meta[name=robots]') || {}).content, title: document.title, h1: document.querySelectorAll('h1').length,
          em: { type: em.type, auto: em.autocomplete, label: (q('label[for="signin-email"]') || {}).textContent, req: em.required, h: box(em).h },
          pw: { type: pw.type, auto: pw.autocomplete, label: (q('label[for="signin-password"]') || {}).textContent, req: pw.required, h: box(pw).h },
          method: form.getAttribute('method'), action: form.getAttribute('action'), btn: box(q('[data-signin] button')).h, logo: box(q('.signin .logo')).h, wait: box(q('.help .line')).h,
          said: [...document.querySelectorAll('[data-say]')].filter((p) => !p.hidden).length,
          stage: { hidden: stage.getAttribute('aria-hidden'), box: box(stage), phone: box(q('.phone3')), sides, focusable: stage.querySelectorAll('a, button, input, [tabindex]').length },
          font: getComputedStyle(document.body).fontFamily, foot: [...document.querySelectorAll('footer nav a')].map((a) => a.getAttribute('href')).join(',')
        };
      });
      ok('sign-in page, ' + label + ': nothing scrolls sideways, and nothing is written into the page as a script or a style', r.sw <= w && r.inline === 0, r.sw + ' wide in ' + w + '; written in: ' + r.inline);
      ok('sign-in page, ' + label + ': the two boxes are named, typed and filled in the way browsers and password managers expect; were the script ever to fail, the form could not put a password in an address', r.em.type === 'email' && r.em.auto === 'username' && r.em.label === 'Email' && r.em.req && r.pw.type === 'password' && r.pw.auto === 'current-password' && r.pw.label === 'Password' && r.pw.req && r.method === 'post' && r.action === '/signin', JSON.stringify([r.em, r.pw, r.method, r.action]));
      ok('sign-in page, ' + label + ': the boxes, the button, the logo and the waitlist link are big enough to tap; no message shows yet', r.em.h >= 44 && r.pw.h >= 44 && r.btn >= 44 && r.logo >= 44 && r.wait >= 44 && r.said === 0, JSON.stringify({ email: r.em.h, password: r.pw.h, button: r.btn, logo: r.logo, waitlist: r.wait, said: r.said }));
      ok('sign-in page, ' + label + ': kept out of search results, one main heading, the home page\'s own type, the footer\'s six pages', r.robots === 'noindex' && r.h1 === 1 && /^-apple-system/.test(r.font) && r.foot === '/about,/support,/pricing,/refunds,/terms,/privacy' && r.title === 'Inspyx — Sign in', JSON.stringify([r.robots, r.h1, r.title, r.foot]));
      const s = r.stage, inside = (b) => b.l >= s.box.l - 2 && b.r <= s.box.r + 2 && b.t >= s.box.t - 2 && b.b <= s.box.b + 2;
      ok('sign-in page, ' + label + ': the picture beside the form is hidden from screen readers, holds nothing to tab to, and is whole (' + (desktop ? 'the phone and its three cards' : 'the phone alone') + ')', s.hidden === 'true' && s.focusable === 0 && inside(s.phone) && s.sides.length === (desktop ? 3 : 0) && s.sides.every(inside), JSON.stringify({ stage: s.box, phone: s.phone, cards: s.sides.length }));
      const words = await page.evaluate(read);
      ok('sign-in page, ' + label + ': its words are the drafted ones', JSON.stringify(words) === JSON.stringify(SIGNIN_WORDS), JSON.stringify(words.filter((x, i) => x !== SIGNIN_WORDS[i]).slice(0, 2)));
      await ctx.close();
    });
  }

  // ---- Google (2026-11-13). Google itself is never reached: the account server's hand-off is caught here and
  // answered with what the real one sends back, a code in the sign-in page's address.
  const sha = (v) => require('crypto').createHash('sha256').update(v).digest('base64url');
  const secretOf = (page) => page.evaluate(() => sessionStorage.getItem('inspyx.signin.google'));
  const rest = (page) => page.evaluate(() => { const g = document.querySelector('[data-google]'), b = document.querySelector('[data-signin] button'); return { g: g.disabled, b: b.disabled, word: g.textContent.trim(), sign: b.textContent.trim(), search: location.search, hash: location.hash, path: location.pathname }; });

  await group('Google, the button', async () => {
    const { ctx, page, errs, calls } = await open(browser, 'signin');
    const r = await page.evaluate(() => { const g = document.querySelector('[data-google]'); const b = g.getBoundingClientRect(); const or = document.querySelector('.or'); const em = document.querySelector('#signin-email'); return { type: g.type, h: Math.round(b.height), w: Math.round(b.width), logo: g.querySelectorAll('svg path').length, above: b.bottom <= or.getBoundingClientRect().top && or.getBoundingClientRect().bottom <= em.getBoundingClientRect().top, inForm: !!g.closest('form'), sw: document.documentElement.scrollWidth, kept: sessionStorage.getItem('inspyx.signin.google') }; });
    ok('Google, the button: a real button outside the form, big enough to tap, with Google\'s four-colour mark, above "or with your email" and the email box', r.type === 'button' && !r.inForm && r.h >= 44 && r.logo === 4 && r.above && r.sw <= PHONE, JSON.stringify(r));
    ok('Google, the button: opening the page asks the account server for nothing and keeps nothing', calls.length === 0 && r.kept === null && errs.length === 0, calls.map((c) => c.path).join(',') + errs.join(' | '));
    await ctx.close();
  });

  await group('Google, a good sign-in', async () => {
    // The page is on its way out while the hand-off is answered, so nothing is read from it then: the secret is
    // read from the exchange's own body afterwards, and checked against the challenge the hand-off carried.
    let challenge = '', secretAtHandOff = null, pageRef = null, midExchange = null;
    const { ctx, page, errs, away, calls } = await open(browser, 'signin', { answers: async (call) => {
      if (call.path.startsWith('/auth/v1/authorize')) {
        const q = new URL(SERVER + call.path).searchParams;
        challenge = q.get('code_challenge') || '';
        return { redirect: HOME + '/signin?code=test-code-1' };
      }
      if (call.path.startsWith('/auth/v1/token')) { midExchange = await rest(pageRef).catch(() => null); return { wait: 400, status: 200, json: granted(7) }; }
      return { status: 200, json: {} };
    } });
    pageRef = page;
    await page.evaluate(() => document.querySelector('[data-google]').click());
    await page.waitForURL('**/account');
    await page.waitForTimeout(300);
    const hand = calls.find((c) => c.path.startsWith('/auth/v1/authorize')) || { path: '' };
    const q = new URL(SERVER + hand.path).searchParams;
    ok('Google, a good sign-in: the browser is handed to the account server for Google, to come back to this site\'s sign-in page, with a challenge and no secret in the address', hand.method === 'GET' && q.get('provider') === 'google' && q.get('redirect_to') === HOME + '/signin' && q.get('code_challenge_method') === 's256' && /^[A-Za-z0-9_-]{43}$/.test(challenge) && [...q.keys()].sort().join(',') === 'code_challenge,code_challenge_method,provider,redirect_to', hand.path.slice(0, 200));
    const t = calls.find((c) => c.path.startsWith('/auth/v1/token')) || { headers: {} };
    const body = (() => { try { return JSON.parse(t.body); } catch (e) { return {}; } })();
    secretAtHandOff = body.code_verifier;
    ok('Google, a good sign-in: the code is exchanged once, in a request\'s body, together with the secret', calls.filter((c) => c.path.startsWith('/auth/v1/token')).length === 1 && t.method === 'POST' && t.path === '/auth/v1/token?grant_type=pkce' && body.auth_code === 'test-code-1' && body.code_verifier === secretAtHandOff && Object.keys(body).length === 2 && !!t.headers.apikey, t.path);
    ok('Google, a good sign-in: the secret this tab made stays in this tab, is long and random, and is what the challenge was made from', typeof secretAtHandOff === 'string' && secretAtHandOff.length >= 43 && sha(secretAtHandOff) === challenge && !hand.path.includes(secretAtHandOff), String(secretAtHandOff).length + ' long');
    ok('Google, a good sign-in: by the time it is exchanged the code is gone from the address, and neither button takes a tap', !!midExchange && midExchange.search === '' && midExchange.hash === '' && midExchange.path === '/signin' && midExchange.g && midExchange.b && midExchange.sign === 'Signing in…', JSON.stringify(midExchange));
    const s = JSON.parse(await stored(page) || '{}');
    ok('Google, a good sign-in: it ends on the account page, signed in, with the secret forgotten and nothing asked of any other site', (await at(page)) === '/account' && s.access === 'test-access-7' && s.email === WHO && (await secretOf(page)) === null && away.length === 0 && errs.length === 0, away.concat(errs).join(' | '));
    await page.goBack().catch(() => {});
    await page.waitForTimeout(400);
    const back = await page.evaluate(() => location.pathname + location.search);
    ok('Google, a good sign-in: the Back button finds no code in any address the browser kept', !/code=/.test(back), back);
    await ctx.close();
  });

  for (const [label, came, kind, why] of [
    ['an address with no Inspyx account', '?error=access_denied&error_code=signup_disabled&error_description=Signups+not+allowed+for+this+instance', 'noaccount', 'says so'],
    ['the same, told in the address\'s tail', '#error=access_denied&error_code=signup_disabled&error_description=Signups+not+allowed', 'noaccount', 'says so'],
    ['turning back at Google', '?error=access_denied&error_description=The+user+denied+access', '', 'says nothing'],
    ['a server error on the way', '?error=server_error&error_code=unexpected_failure&error_description=boom', 'google', 'says Google did not complete'],
    ['a code this tab never asked for', '?code=test-code-9', 'google', 'says Google did not complete'],
  ]) {
    await group('Google, ' + label, async () => {
      const { ctx, page, errs, calls } = await open(browser, 'signin' + came);
      const r = await rest(page), said = await shown(page);
      ok('Google, ' + label + ': the page ' + why + ', asks the account server for nothing, signs nobody in, cleans its address and is ready for another try', JSON.stringify(said) === JSON.stringify(kind ? [kind] : []) && calls.length === 0 && (await stored(page)) === null && r.search === '' && r.hash === '' && !r.g && !r.b && r.word === 'Continue with Google' && errs.length === 0, JSON.stringify({ said, r, calls: calls.length }));
      await ctx.close();
    });
  }

  for (const [label, answer, kind] of [
    ['a code the server refuses', { status: 400, json: { error_code: 'flow_state_not_found' } }, 'google'],
    ['a server that fails', { status: 500, json: {} }, 'server'],
    ['no connection on the way back', 'offline', 'network'],
    ['an answer that is no sign-in', { status: 200, json: { access_token: 'x' } }, 'malformed'],
  ]) {
    await group('Google, ' + label, async () => {
      const { ctx, page, calls } = await open(browser, 'signin?code=test-code-2', { init: () => { try { if (!sessionStorage.getItem('g-seeded')) { sessionStorage.setItem('g-seeded', '1'); sessionStorage.setItem('inspyx.signin.google', 'made-up-secret-for-tests-0123456789-abcdefghij'); } } catch (e) { /* none */ } }, answers: () => answer });
      await page.waitForTimeout(400);
      const r = await rest(page), said = await shown(page);
      ok('Google, ' + label + ': one try, the right message, nobody signed in, the secret used up, both buttons back', JSON.stringify(said) === JSON.stringify([kind]) && calls.length === 1 && (await stored(page)) === null && (await secretOf(page)) === null && !r.g && !r.b && r.search === '', JSON.stringify({ said, calls: calls.length, r }));
      await ctx.close();
    });
  }

  await group('Google, a code that is not a code', async () => {
    const { ctx, page, calls } = await open(browser, 'signin?code=' + encodeURIComponent('a b"c<d>'), { init: () => { try { sessionStorage.setItem('inspyx.signin.google', 'made-up-secret-for-tests-0123456789-abcdefghij'); } catch (e) { /* none */ } } });
    ok('Google, a code that is not a code: it is never sent anywhere', calls.length === 0 && JSON.stringify(await shown(page)) === '["google"]', String(calls.length));
    await ctx.close();
  });

  await group('Google, a browser that cannot keep the secret', async () => {
    const { ctx, page, calls } = await open(browser, 'signin', { init: () => { Storage.prototype.setItem = function () { throw new Error('full'); }; } });
    await page.evaluate(() => { document.querySelector('[data-google]').click(); });
    await page.waitForTimeout(400);
    const r = await rest(page);
    ok('Google, a browser that cannot keep the secret: it is not sent to Google, and the page says the sign-in did not complete', calls.length === 0 && r.path === '/signin' && !r.g && JSON.stringify(await shown(page)) === '["other"]', JSON.stringify(r));
    await ctx.close();
  });

  await group('Google, a browser that only pretends to keep the secret', async () => {
    const { ctx, page, calls } = await open(browser, 'signin', { init: () => { Storage.prototype.setItem = function () { /* says nothing, keeps nothing */ }; } });
    await page.evaluate(() => { document.querySelector('[data-google]').click(); });
    await page.waitForTimeout(400);
    const r = await rest(page);
    ok('Google, a browser that only pretends to keep the secret: it is not sent to Google either, since it could never finish coming back', calls.length === 0 && r.path === '/signin' && !r.g && JSON.stringify(await shown(page)) === '["other"]', JSON.stringify(r));
    await ctx.close();
  });

  await group('Google, tapped twice', async () => {
    let hands = 0;
    const { ctx, page } = await open(browser, 'signin', { answers: (call) => { if (call.path.startsWith('/auth/v1/authorize')) { hands++; return 'stay'; } return { status: 200, json: {} }; } });
    const tap = () => page.evaluate(() => { document.querySelector('[data-google]').click(); });
    await tap();
    await page.waitForTimeout(300);
    const mid = await rest(page);
    await tap();
    await page.evaluate(() => document.querySelector('[data-signin]').requestSubmit());
    await page.waitForTimeout(400);
    ok('Google, tapped twice: one hand-off; while it is on its way the button says "Opening Google…" and neither button takes a tap', hands === 1 && mid.g && mid.b && mid.word === 'Opening Google…' && mid.sign === 'Sign in', JSON.stringify({ hands, mid }));
    await ctx.close();
  });

  // ---- a good sign-in
  await group('a good sign-in', async () => {
    const { ctx, page, errs, away, calls } = await open(browser, 'signin', { answers: () => ({ wait: 700, status: 200, json: granted(1) }) });
    await fill(page);
    await page.click('[data-signin] button');
    await page.waitForTimeout(250);
    const mid = await page.evaluate(() => { const b = document.querySelector('[data-signin] button'); return { text: b.textContent, off: b.disabled, busy: document.querySelector('[data-signin]').getAttribute('aria-busy') }; });
    await page.evaluate(() => document.querySelector('[data-signin]').requestSubmit());   // a second sending, forced past the dead button
    await page.waitForURL('**/account');
    await page.waitForTimeout(300);
    const c = calls[0] || { headers: {} };
    const body = (() => { try { return JSON.parse(c.body); } catch (e) { return {}; } })();
    ok('a good sign-in: while it is on its way the button says "Signing in…", cannot be pressed, and the form cannot be sent twice', mid.text === 'Signing in…' && mid.off && mid.busy === 'true' && calls.filter((x) => x.path.startsWith('/auth/v1/token')).length === 1, JSON.stringify(mid) + ' calls: ' + calls.length);
    ok('a good sign-in: one call, the way the app makes it; the address and password go in its body, never in an address', c.method === 'POST' && c.path === '/auth/v1/token?grant_type=password' && !!c.headers.apikey && !c.headers.authorization && body.email === WHO && body.password === PASS && Object.keys(body).length === 2, JSON.stringify({ method: c.method, path: c.path, key: !!c.headers.apikey }));
    const s = await stored(page), who = await page.evaluate(() => { const m = document.querySelector('[data-account]'); return { hidden: m.hidden, text: m.querySelector('.who').textContent.replace(/\s+/g, ' ').trim() }; });
    ok('a good sign-in: lands on the account page, which names who is signed in', (await at(page)) === '/account' && !who.hidden && who.text === 'Signed in as ' + WHO && errs.length === 0 && away.length === 0, JSON.stringify(who) + ' ' + errs.join(' | '));
    ok('a good sign-in: the browser keeps the sign-in and never the password', !!s && JSON.parse(s).access === 'test-access-1' && JSON.parse(s).email === WHO && !s.includes(PASS) && !(await page.evaluate((p) => JSON.stringify(Object.assign({}, localStorage, sessionStorage)) + document.cookie + location.href, PASS)).includes(PASS), 'kept: ' + (s ? s.length + ' characters' : 'nothing'));
    const words = await page.evaluate(read);
    ok('the account page: its words are the drafted ones', JSON.stringify(words) === JSON.stringify(ACCOUNT_WORDS), JSON.stringify(words));
    const a = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, robots: (document.querySelector('meta[name=robots]') || {}).content, btn: Math.round(document.querySelector('[data-signout]').getBoundingClientRect().height), inline: document.querySelectorAll('[style], style, script:not([src])').length, title: document.title }));
    ok('the account page: kept out of search results, nothing scrolls sideways, its button is big enough to tap', a.robots === 'noindex' && a.sw <= PHONE && a.btn >= 44 && a.inline === 0 && a.title === 'Inspyx — Account', JSON.stringify(a));
    await ctx.close();
  });

  // ---- sign-ins that do not go through: each says its own sentence, and only that one
  const refusals = [
    ['a wrong password', () => ({ status: 400, json: { code: 400, error_code: 'invalid_credentials', msg: 'Invalid login credentials' } }), 'rejected'],
    ['no connection', () => 'offline', 'network'],
    ['a server that fails', () => ({ status: 500, json: { msg: 'x' } }), 'server'],
    ['too many tries (the server says wait)', () => ({ status: 429, json: { msg: 'x' } }), 'server'],
    ['an answer with no account in it', () => ({ status: 200, json: { access_token: 'a', refresh_token: 'b', expires_in: 3600, user: { email: WHO } } }), 'malformed'],
    ['an answer that is not an answer', () => ({ status: 200, json: 'nonsense' }), 'malformed']
  ];
  for (const [label, answers, want] of refusals) {
    await group(label, async () => {
      const { ctx, page, errs, calls } = await open(browser, 'signin', { answers });
      await fill(page);
      await page.click('[data-signin] button');
      await page.waitForTimeout(600);
      const r = await page.evaluate(() => { const b = document.querySelector('[data-signin] button'); return { email: document.querySelector('#signin-email').value, pass: document.querySelector('#signin-password').value, text: b.textContent, off: b.disabled, focus: document.activeElement && document.activeElement.id }; });
      const said = await shown(page);
      const fields = want === 'rejected' ? r.pass === '' && r.focus === 'signin-password' : r.pass.length > 0;
      ok(label + ': the page says so in its own sentence and no other, stays put, keeps no sign-in, and the button works again', JSON.stringify(said) === JSON.stringify([want]) && (await at(page)) === '/signin' && (await stored(page)) === null && r.text === 'Sign in' && !r.off && r.email === WHO && fields && calls.length === 1 && errs.length === 0, JSON.stringify({ said, r, calls: calls.length }) + ' ' + errs.join(' | '));
      await ctx.close();
    });
  }
  await group('a server that never answers', async () => {
    const { ctx, page, calls } = await open(browser, 'signin', { clock: true, answers: () => 'silent' });
    const button = () => page.evaluate(() => { const b = document.querySelector('[data-signin] button'); return b.textContent + (b.disabled ? ' (off)' : ''); });
    await fill(page);
    await page.click('[data-signin] button');
    await page.waitForTimeout(250);
    await page.clock.fastForward(29000); await page.waitForTimeout(250);
    const before = await button(), saidBefore = await shown(page);
    await page.clock.fastForward(2000); await page.waitForTimeout(400);
    const after = await button(), said = await shown(page);
    ok('a server that never answers is waited on for 30 seconds and no longer; then the page says it could not be reached', before === 'Signing in… (off)' && saidBefore.length === 0 && after === 'Sign in' && JSON.stringify(said) === '["network"]' && calls.length === 1 && (await stored(page)) === null, JSON.stringify({ before, saidBefore, after, said }));
    await ctx.close();
  });
  await group('a browser that keeps nothing', async () => {
    const { ctx, page, calls } = await open(browser, 'signin', { init: () => { Storage.prototype.setItem = function () { throw new Error('this browser keeps nothing'); }; } });
    await fill(page); await page.click('[data-signin] button'); await page.waitForTimeout(600);
    const end = calls[1] || { headers: {} }, said = await shown(page);
    ok('a browser that will not keep a sign-in: the page says the sign-in did not complete, and ends the one it was just given, and only that one', JSON.stringify(said) === '["other"]' && (await at(page)) === '/signin' && (await stored(page)) === null && calls.length === 2 && end.method === 'POST' && end.path === '/auth/v1/logout?scope=local' && end.headers.authorization === 'Bearer test-access-1', JSON.stringify({ said, calls: calls.map((c) => c.path) }));
    await ctx.close();
  });
  await group('trying again', async () => {
    let n = 0;
    const { ctx, page } = await open(browser, 'signin', { answers: () => (++n === 1 ? { status: 400, json: {} } : n === 2 ? 'offline' : { status: 200, json: granted(2) }) });
    await fill(page, 'made-up-wrong-pass'); await page.click('[data-signin] button'); await page.waitForTimeout(500);
    const first = await shown(page);
    await page.fill('#signin-password', PASS); await page.click('[data-signin] button'); await page.waitForTimeout(500);
    const second = await shown(page);
    ok('a second refusal, of another kind, takes the place of the first message: one message at a time', JSON.stringify(first) === '["rejected"]' && JSON.stringify(second) === '["network"]', JSON.stringify([first, second]));
    await page.focus('#signin-password'); await page.keyboard.press('Enter'); await page.waitForURL('**/account');
    ok('trying again after a refusal works, by the Enter key', (await at(page)) === '/account' && JSON.parse(await stored(page)).access === 'test-access-2' && n === 3, 'calls: ' + n);
    await ctx.close();
  });
  await group('an empty form', async () => {
    const { ctx, page, calls } = await open(browser, 'signin');
    await page.click('[data-signin] button'); await page.waitForTimeout(300);
    await page.fill('#signin-email', 'not-an-address'); await page.fill('#signin-password', PASS); await page.click('[data-signin] button'); await page.waitForTimeout(300);
    ok('an empty form, or an address that is not one, is not sent at all', calls.length === 0 && (await at(page)) === '/signin', 'calls: ' + calls.length);
    await ctx.close();
  });

  // ---- who may see which page
  await group('the gate', async () => {
    const a = await open(browser, 'account', { store: null });
    ok('the account page with nobody signed in sends the browser to the sign-in page, and calls nobody', (await at(a.page)) === '/signin' && a.calls.length === 0, await at(a.page));
    await a.ctx.close();
    const b = await open(browser, 'signin', { store: kept(3, 3600000) });
    ok('the sign-in page with somebody signed in sends the browser to the account page', (await at(b.page)) === '/account' && b.calls.length === 0 && (await b.page.evaluate(() => document.querySelector('.who').textContent.replace(/\s+/g, ' ').trim())) === 'Signed in as ' + WHO, await at(b.page));
    await b.ctx.close();
    const c = await open(browser, 'account', { store: '{"access":"x"}' });
    ok('something in the browser that is not a whole sign-in counts as nobody signed in', (await at(c.page)) === '/signin', await at(c.page));
    await c.ctx.close();
    const g = await open(browser, 'account', { store: null, without: 'assets/account.js' });
    ok('the gate alone sends a signed-out browser away from the account page, even when the page\'s own script never arrives', (await at(g.page)) === '/signin', await at(g.page));
    await g.ctx.close();
  });

  // ---- signing out
  await group('signing out', async () => {
    const { ctx, page, calls } = await open(browser, 'account', { store: kept(4, 3600000), answers: () => ({ status: 204 }) });
    await page.click('[data-signout]'); await page.waitForURL('**/signin');
    const c = calls[0] || { headers: {} };
    ok('signing out forgets the sign-in here, tells the server to end this browser\'s sign-in and no other (the phone stays signed in), and goes back to the sign-in page', (await stored(page)) === null && calls.length === 1 && c.method === 'POST' && c.path === '/auth/v1/logout?scope=local' && c.headers.authorization === 'Bearer test-access-4' && (await at(page)) === '/signin', JSON.stringify({ path: c.path, auth: c.headers.authorization, calls: calls.length }));
    await ctx.close();
    const off = await open(browser, 'account', { store: kept(5, 3600000), answers: () => 'offline' });
    await off.page.click('[data-signout]'); await off.page.waitForURL('**/signin');
    ok('signing out with no connection still signs this browser out', (await stored(off.page)) === null && (await at(off.page)) === '/signin');
    await off.ctx.close();
  });
  await group('two tabs', async () => {
    const one = await open(browser, 'account', { store: kept(6, 3600000), answers: () => ({ status: 204 }) });
    const two = await open(browser, 'account', { ctx: one.ctx, answers: () => ({ status: 204 }) });
    const both = (await at(one.page)) === '/account' && (await at(two.page)) === '/account';
    await two.page.click('[data-signout]'); await two.page.waitForURL('**/signin'); await one.page.waitForURL('**/signin', { timeout: 5000 });
    ok('signed out in one tab, the other tab follows', both && (await at(one.page)) === '/signin');
    await one.ctx.close();
    const x = await open(browser, 'signin', { store: null });
    const y = await open(browser, 'signin', { ctx: x.ctx });
    await fill(y.page); await y.page.click('[data-signin] button'); await y.page.waitForURL('**/account'); await x.page.waitForURL('**/account', { timeout: 5000 });
    ok('signed in in one tab, the sign-in page in the other tab follows', (await at(x.page)) === '/account' && (await at(y.page)) === '/account');
    await x.ctx.close();
    const p = await open(browser, 'account', { store: kept(15, 3600000) });
    const q = await open(browser, 'account', { ctx: p.ctx });
    const was = await p.page.evaluate(() => document.querySelector('[data-email]').textContent);
    await q.page.evaluate(([k, v]) => localStorage.setItem(k, v), [STORE, kept(16, 3600000).replace(WHO, 'sam@example.com')]);
    await p.page.waitForTimeout(300);
    const now = await p.page.evaluate(() => document.querySelector('[data-email]').textContent);
    ok('somebody else signs in from another tab: the account page names who is signed in now, not who was', was === WHO && now === 'sam@example.com', was + ' then ' + now);
    await p.ctx.close();
  });

  // ---- a sign-in that is about to end is renewed before it is used
  await group('renewing', async () => {
    const a = await open(browser, 'account', { store: kept(7, 10000), answers: () => ({ status: 200, json: granted(8) }) });
    const c = a.calls[0] || { headers: {} }, s = JSON.parse(await stored(a.page));
    ok('a sign-in with seconds left is renewed once, and the new one replaces it', a.calls.length === 1 && c.path === '/auth/v1/token?grant_type=refresh_token' && JSON.parse(c.body).refresh_token === 'test-renew-7' && s.access === 'test-access-8' && s.renew === 'test-renew-8' && (await at(a.page)) === '/account', JSON.stringify({ calls: a.calls.length, path: c.path, now: s.access }));
    await a.ctx.close();
    const b = await open(browser, 'account', { store: kept(9, 3600000) });
    ok('a sign-in with an hour left is used as it is: no call', b.calls.length === 0 && (await at(b.page)) === '/account', 'calls: ' + b.calls.length);
    const bh = b.res.headers();
    ok('the account page is served under the same rule as the sign-in page', !!signinRule && (bh['content-security-policy'] || '') === signinRule && (bh['referrer-policy'] || '') === 'no-referrer' && (bh['x-frame-options'] || '') === 'DENY', (bh['content-security-policy'] || 'no rule').slice(0, 80));
    await b.ctx.close();
    const w = await open(browser, 'account', { store: kept(12, 10000), answers: () => ({ wait: 900, status: 200, json: granted(12) }) });
    const drawn = () => w.page.evaluate(() => document.querySelector('[data-account]').getClientRects().length);
    const early = await drawn();
    await w.page.waitForTimeout(1000);
    const late = await drawn();
    ok('while a renewal is on its way the account page shows nothing of the account; it shows once the renewal is back', early === 0 && late > 0, early + ' then ' + late);
    await w.ctx.close();
    const r = await open(browser, 'account', { store: kept(10, -5000), answers: () => ({ status: 400, json: {} }) });
    await r.page.waitForURL('**/signin');
    ok('a renewal the server rejects signs the browser out', (await stored(r.page)) === null && (await at(r.page)) === '/signin');
    await r.ctx.close();
    const n = await open(browser, 'account', { store: kept(11, -5000), answers: () => 'offline' });
    ok('a renewal that cannot reach the server keeps the sign-in and says so on the page', (await at(n.page)) === '/account' && JSON.parse(await stored(n.page)).access === 'test-access-11' && JSON.stringify(await shown(n.page)) === '["network"]', JSON.stringify(await shown(n.page)));
    await n.ctx.close();
    const f = await open(browser, 'account', { store: kept(17, -5000), answers: () => ({ status: 500, json: { msg: 'x' } }) });
    ok('a renewal the server fails on keeps the sign-in too, and the page blames the server, not the connection', (await at(f.page)) === '/account' && JSON.parse(await stored(f.page)).access === 'test-access-17' && JSON.stringify(await shown(f.page)) === '["server"]' && f.calls.length === 1, JSON.stringify(await shown(f.page)));
    await f.ctx.close();
  });

  // ---- the Back button. A browser that brings a page back shows it as it was left and tells the page so (the
  //      "pageshow" signal, marked "persisted"). The browser these checks run in always loads the page again instead,
  //      so the checks send that signal themselves. A real Back in Safari is checked by hand (see the manual).
  await group('the Back button', async () => {
    const back = () => window.dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true }));
    const a = await open(browser, 'account', { store: kept(13, 3600000) });
    await a.page.evaluate((k) => localStorage.removeItem(k), STORE);
    await a.page.evaluate(back); await a.page.waitForURL('**/signin');
    ok('an account page brought back by the Back button after signing out goes to the sign-in page', (await at(a.page)) === '/signin');
    await a.ctx.close();
    const b = await open(browser, 'signin', { answers: () => ({ wait: 1500, status: 200, json: granted(14) }) });
    const button = () => b.page.evaluate(() => { const x = document.querySelector('[data-signin] button'); return x.textContent + (x.disabled ? ' (off)' : ''); });
    await fill(b.page); await b.page.click('[data-signin] button'); await b.page.waitForTimeout(250);
    const mid = await button();
    await b.page.evaluate(back);
    const rest = await button();
    await b.page.waitForURL('**/account');
    ok('a sign-in page brought back by the Back button has its button at rest again, not stuck on "Signing in…"', mid === 'Signing in… (off)' && rest === 'Sign in', JSON.stringify([mid, rest]));
    await b.ctx.close();
  });

  // ---- the keyboard, and motion turned off
  await group('the keyboard', async () => {
    const { ctx, page } = await open(browser, 'signin', { w: WIDE, h: 900, desktop: true });
    // Safari's Tab key stops at the boxes only, and Option+Tab stops at everything (its own long-standing way);
    // Chrome's Tab stops at everything. So the full round is walked with the key that makes it in each.
    const safari = engine.name() === 'webkit';
    const here = () => page.evaluate(() => { const e = document.activeElement; return e.id || e.getAttribute('aria-label') || e.textContent.trim().slice(0, 18); });
    const order = [];
    for (let i = 0; i < 6; i++) { await page.keyboard.press(safari ? 'Alt+Tab' : 'Tab'); order.push(await here()); }
    ok('the Tab key goes: logo, Google, email, password, Sign in, then the help lines; never into the picture', order[0] === 'Inspyx, home' && order[1] === 'Continue with Goog' && order[2] === 'signin-email' && order[3] === 'signin-password' && order[4] === 'Sign in' && order[5] === 'Reset it', order.join(' > '));
    if (safari) {
      await page.focus('#signin-email'); await page.keyboard.press('Tab');
      ok('in Safari the plain Tab key goes from the email box to the password box', (await here()) === 'signin-password', await here());
    }
    await ctx.close();
  });
  await group('motion', async () => {
    const on = await open(browser, 'signin', { w: WIDE, h: 900, desktop: true });
    const pose = (p) => p.evaluate(() => getComputedStyle(document.querySelector('.phone3')).transform);
    const box = await on.page.evaluate(() => { const b = document.querySelector('.stage').getBoundingClientRect(); return [b.left, b.top, b.width, b.height]; });
    const rest = await pose(on.page);
    await on.page.mouse.move(box[0] + box[2] * 0.85, box[1] + box[3] * 0.8); await on.page.waitForTimeout(700);
    const near = await pose(on.page), moving = await on.page.evaluate(() => document.getAnimations().filter((a) => a.playState === 'running').length);
    ok('with motion on, the phone floats and leans to the pointer', rest !== near && moving > 0, moving + ' running');
    await on.ctx.close();
    const off = await open(browser, 'signin', { w: WIDE, h: 900, desktop: true, still: true });
    const rest2 = await pose(off.page);
    await off.page.mouse.move(box[0] + box[2] * 0.85, box[1] + box[3] * 0.8); await off.page.waitForTimeout(700);
    const moving2 = await off.page.evaluate(() => document.getAnimations().filter((a) => a.playState === 'running').length);
    ok('with motion turned off, nothing on the sign-in page moves or leans', (await pose(off.page)) === rest2 && moving2 === 0, moving2 + ' running');
    await off.ctx.close();
  });

  // ---- the files themselves
  {
    const root = path.join(__dirname, '..', 'coming-soon');
    const text = (f) => fs.readFileSync(path.join(root, f), 'utf8');
    const key = (s) => (s.match(/sb_publishable_[A-Za-z0-9_-]+/) || [''])[0], host = (s) => (s.match(/https:\/\/[a-z0-9]+\.supabase\.co/) || [''])[0];
    ok('the sign-in uses the same public key and the same server as the waitlist form, and no other key is in its files', !!key(text('assets/auth.js')) && key(text('assets/auth.js')) === key(text('assets/home.js')) && host(text('assets/auth.js')) === host(text('assets/home.js')) && host(text('assets/auth.js')) === SERVER && !/service_role|sb_secret_|eyJ[A-Za-z0-9_-]{20,}/.test(text('assets/auth.js') + text('assets/signin.js') + text('assets/account.js') + text('signin.html') + text('account.html')));
    const rule = (JSON.parse(text('vercel.json')).headers || []).filter((r) => ['/signin', '/account'].every((p) => new RegExp('^' + r.source + '$').test(p)));
    const says = (k) => (rule.length === 1 ? (rule[0].headers.find((x) => x.key === k) || {}).value : undefined);
    ok('one server rule covers both pages; it also tells browsers to keep neither page and to guess no file types', rule.length === 1 && says('Cache-Control') === 'no-store' && says('X-Content-Type-Options') === 'nosniff' && says('Content-Security-Policy') === signinRule && !!signinRule, 'rules that cover both: ' + rule.length);
    const pages = ['index.html', 'pricing.html', 'refunds.html', 'terms.html', 'privacy.html', 'about.html', 'support.html', '404.html'];
    const linked = pages.filter((f) => /href="\/(signin|account)"/.test(text(f)));
    ok('nothing on the site links to the sign-in page yet, and the list of pages for search engines leaves it out', linked.length === 0 && !/signin|account/.test(text('sitemap.xml')), linked.join(','));
    ok('the three scripts say no words: every sentence is in the pages', !/[A-Z][a-z]+ [a-z]+ [a-z]+[.!?]['"`]/.test(['auth', 'signin', 'account'].map((f) => text('assets/' + f + '.js').replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, '')).join('\n')));
  }

  await browser.close();
  console.log(failed ? '\n' + failed + ' CHECK(S) FAILED' : '\nall checks passed');
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
