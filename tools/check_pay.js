// Self-checks for a client's pay page with the inspector's card fee: /pay.
// NOTHING REAL IS ASKED OR PAID. The pay function is a stand-in this test runs itself, answering as the live one does
// (backend/supabase/functions/pay in the app's repo), and Stripe.js is a stand-in too: a plain box takes the place of
// Stripe's card form, and "credit", "debit" or "bad" typed into it picks what Stripe would say. The link is made up;
// any other request that tries to leave the site is stopped and counted as a failure.
// usage: node tools/serve.js &   then   node tools/check_pay.js
//        (in Safari's engine instead of Chrome's: BROWSER=webkit node tools/check_pay.js)
const fs = require('fs');
const path = require('path');
const playwright = require('playwright');
const engine = process.env.BROWSER === 'webkit' ? playwright.webkit : playwright.chromium;

const url = process.env.URL || 'http://localhost:4173/';
const HOME = new URL(url).origin;
const FN = 'https://btxlrfvqifnrnxffohsz.supabase.co/functions/v1/pay/';
const STRIPE_JS = 'https://js.stripe.com/v3/';
// Made up, built at run time so no literal here looks like a secret.
const LINK = 'P'.repeat(11) + 'q'.repeat(11);
// Another inspection's link, opened in the same tab.
const LINK2 = 'R'.repeat(11) + 's'.repeat(11);
const PK = 'pk_' + 'test_' + 'x'.repeat(24);
const ACCT = 'acct_' + '1Ab2Cd3Ef4';
const PI = 'pi_' + '3Qx' + 'y'.repeat(20);
const SECRET = PI + '_secret_' + 'z'.repeat(20);
const RECEIPT = 'https://pay.stripe.com/receipts/acct_1Ab2Cd3Ef4/ch_3Qx/rcpt_x';
const PHONE = 390, WIDE = 1280;
const TIMEOUT = /localhost/.test(url) ? 8000 : 20000;
const PAY_CSP = "default-src 'none'; script-src 'self' https://js.stripe.com https://*.js.stripe.com; style-src 'self'; img-src 'self'; " +
  "frame-src https://js.stripe.com https://*.js.stripe.com https://hooks.stripe.com; connect-src https://btxlrfvqifnrnxffohsz.supabase.co https://api.stripe.com; " +
  "base-uri 'none'; form-action 'none'; frame-ancestors 'none'";
let failed = 0;
const ok = (name, cond, extra) => { if (!cond) failed++; console.log((cond ? 'PASS  ' : 'FAIL  ') + name + (extra ? '  [' + extra + ']' : '')); };
const group = async (label, fn) => { try { await fn(); } catch (e) { ok(label + ': these checks could not run', false, String((e && e.message) || e).split('\n')[0]); } };

const DUE = {
  state: 'due', business_name: 'Sunshine Home Inspections', title: 'Home inspection + Radon', detail: '12 Palm Way, Miami Gardens',
  due_cents: 40000, currency: 'usd', card_fee_bp: 300, stripe_account: ACCT, publishable_key: PK,
};
const quoteFor = (pm) => (/Debit/.test(pm)
  ? { state: 'quote', client_secret: SECRET, due_cents: 40000, card_fee_cents: 0, total_cents: 40000, credit: false, card_fee_bp: 300 }
  : { state: 'quote', client_secret: SECRET, due_cents: 40000, card_fee_cents: 1200, total_cents: 41200, credit: true, card_fee_bp: 300 });

// Stripe.js, standing in: what the page asks of it is recorded on window.__stripe.
const FAKE_STRIPE = `
window.Stripe = function (pk, opts) {
  var s = window.__stripe = { pk: pk, opts: opts, calls: [], cleared: 0 };
  return {
    elements: function () { return { create: function (type, o) { s.type = type; s.options = o; return {
      mount: function (el) { var i = document.createElement('input'); i.setAttribute('data-fakecard', ''); i.setAttribute('aria-label', 'card'); el.appendChild(i); s.mounted = true; },
      on: function (ev, fn) { s.on = ev; },
      clear: function () { s.cleared++; document.querySelector('[data-fakecard]').value = ''; }
    }; } }; },
    createPaymentMethod: function (a) {
      s.calls.push('pm:' + a.type);
      var v = document.querySelector('[data-fakecard]').value;
      if (v === 'bad') return Promise.resolve({ error: { message: 'Your card number is incomplete.' } });
      return Promise.resolve({ paymentMethod: { id: v === 'debit' ? 'pm_1Debit000000000' : 'pm_1Credit00000000' } });
    },
    confirmCardPayment: function (secret) {
      s.calls.push('confirm:' + secret);
      if (window.__decline) return Promise.resolve({ error: { message: 'Your card was declined.' } });
      return Promise.resolve({ paymentIntent: { id: secret.split('_secret_')[0], status: 'succeeded' } });
    }
  };
};`;

async function open(browser, o) {
  const ctx = await browser.newContext({ viewport: { width: o.w || WIDE, height: 900 }, locale: 'en-US', timezoneId: 'America/New_York' });
  const page = await ctx.newPage();
  page.setDefaultTimeout(TIMEOUT);
  const errs = [], away = [], calls = [], asked = [];
  page.on('pageerror', (e) => errs.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource|net::ERR/.test(m.text())) errs.push(m.text()); });
  page.on('request', (r) => asked.push(r.url()));
  await page.addInitScript(() => { window.__csp = []; document.addEventListener('securitypolicyviolation', (e) => window.__csp.push(e.violatedDirective + ' ' + e.blockedURI)); });
  await page.route((u) => !u.href.startsWith(HOME) && !u.href.startsWith('data:') && !u.href.startsWith('blob:'), async (route) => {
    const req = route.request(), u = req.url();
    const cors = { 'access-control-allow-origin': '*' };
    if (u === STRIPE_JS && !o.noStripe) return route.fulfill({ status: 200, contentType: 'text/javascript', body: FAKE_STRIPE });
    if (!u.startsWith(FN + LINK) && !u.startsWith(FN + LINK2)) { away.push(u); return route.abort(); }
    if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: { ...cors, 'access-control-allow-headers': 'content-type', 'access-control-allow-methods': 'GET, POST' } });
    const q = new URL(u).search;
    // The function's own Checkout address, opened when the fee no longer applies.
    if (req.method() === 'GET' && q === '') { calls.push({ method: 'GET', q, nav: true }); return route.fulfill({ status: 200, contentType: 'text/plain', body: 'checkout' }); }
    const body = req.method() === 'POST' ? JSON.parse(req.postData() || '{}') : null;
    calls.push({ method: req.method(), q, body, headers: req.headers(), link: u.startsWith(FN + LINK2) ? 2 : 1 });
    const a = o.answer ? o.answer(req.method(), q, body, calls.length) : null;
    const def = req.method() === 'POST' ? { status: 200, json: quoteFor(body.payment_method) }
      : /pi=/.test(q) ? { status: 200, json: { state: 'paid', receipt_url: RECEIPT } }
      : u.startsWith(FN + LINK2) ? { status: 200, json: { ...DUE, title: 'Reinspection' } }
      : { status: 200, json: DUE };
    const r = a || def;
    return route.fulfill({ status: r.status, contentType: 'application/json', headers: cors, body: JSON.stringify(r.json) });
  });
  const res = await page.goto(url + (o.path === undefined ? 'pay#' + LINK : o.path), { waitUntil: 'load' });
  await page.waitForTimeout(400);
  return { ctx, page, errs, away, calls, asked, res };
}

const until = async (fn, ms) => { const end = Date.now() + (ms || TIMEOUT / 2); for (;;) { if (await fn()) return true; if (Date.now() > end) return false; await new Promise((r) => setTimeout(r, 50)); } };
// What a person sees: innerText leaves out hidden parts (the C9 line's other variant, the debit line).
const shown = async (page, sel) => (await page.evaluate((q) => [...document.querySelectorAll(q)].filter((e) => e.getClientRects().length > 0).map((e) => e.innerText.replace(/\s+/g, ' ').trim()), sel)).join(' | ');
const fake = (page) => page.evaluate(() => window.__stripe || null);
const csp = (page) => page.evaluate(() => window.__csp);

async function quoteWith(page, cardText) {
  await page.fill('[data-fakecard]', cardText);
  await page.click('[data-continue]');
}

(async () => {
  const browser = await engine.launch();
  console.log('browser: ' + engine.name() + ' ' + browser.version());

  for (const [label, w] of [['wide', WIDE], ['phone', PHONE]]) {
    await group('what is due, ' + label, async () => {
      const { page, ctx, errs, away, calls, asked, res } = await open(browser, { w });
      const loc = await page.evaluate(() => location.pathname + location.hash);
      ok(label + ': the link is taken out of the address at once (/pay, nothing after it)', loc === '/pay', loc);
      ok(label + ': asks only the pay function, once, by GET ?view=json, with no sign-in and no key of its own',
        errs.length === 0 && away.length === 0 && calls.length === 1 && calls[0].method === 'GET' && calls[0].q === '?view=json' &&
        !calls[0].headers.authorization && !calls[0].headers.apikey, errs.concat(away).join(' | ') + ' ' + JSON.stringify(calls));
      ok(label + ': the link goes to the pay function alone', asked.filter((u) => u.includes(LINK)).every((u) => u.startsWith(FN + LINK)), asked.join(' '));
      const h = res.headers();
      ok(label + ': served under /pay\'s own rule: Stripe\'s form and Inspyx\'s server only, never cached, never framed, noindex',
        h['content-security-policy'] === PAY_CSP && h['cache-control'] === 'no-store' && h['x-frame-options'] === 'DENY' &&
        h['referrer-policy'] === 'no-referrer' && /noindex/.test(h['x-robots-tag'] || ''), h['content-security-policy']);
      ok(label + ': what it is for, and what is due', (await shown(page, '[data-what]')) === 'Home inspection + Radon 12 Palm Way, Miami Gardens' &&
        (await shown(page, '.pay-amount')) === 'Due: $400.00', (await shown(page, '[data-what]')) + ' / ' + (await shown(page, '.pay-amount')));
      ok(label + ': the card fee is said before the card (C9)', (await shown(page, '.pay-note')) ===
        'Sunshine Home Inspections adds a 3% fee when you pay by credit card. There’s no fee on a debit card.', await shown(page, '.pay-note'));
      const s = await fake(page);
      ok(label + ': Stripe\'s card form, on the inspector\'s own Stripe account, without Link', s && s.pk === PK && s.opts && s.opts.stripeAccount === ACCT &&
        s.type === 'card' && s.options.disableLink === true && s.mounted === true, JSON.stringify(s));
      ok(label + ': no state line, no error, no total yet', (await shown(page, '[data-states] [data-state]')) === '' && (await shown(page, '[data-error]')) === '' && (await shown(page, '[data-quote]')) === '');
      ok(label + ': nothing runs off the side of the screen', await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth));
      ok(label + ': the buttons are big enough to tap (44 px or more)', await page.evaluate(() => [...document.querySelectorAll('button, a')].filter((e) => !e.closest('[hidden]') && e.getClientRects().length).every((e) => e.getBoundingClientRect().height >= 44)));
      ok(label + ': no security rule was broken', (await csp(page)).length === 0, (await csp(page)).join(' | '));
      await ctx.close();
    });
  }

  await group('a credit card: the fee and the new total before Pay, then paid', async () => {
    const { page, ctx, errs, away, calls } = await open(browser, {});
    await quoteWith(page, 'credit');
    ok('Continue asks for the payment with the card Stripe made, by POST, saying only that the body is JSON',
      await until(async () => calls.length === 2) && calls[1].method === 'POST' && JSON.stringify(calls[1].body) === JSON.stringify({ action: 'quote', payment_method: 'pm_1Credit00000000' }) &&
      !calls[1].headers.authorization && !calls[1].headers.apikey, JSON.stringify(calls[1]));
    ok('the fee and the total (C10), and Pay with the total (C12)', await until(async () => (await shown(page, '[data-quote]')) !== '') &&
      (await shown(page, '[data-credit]')) === 'Credit card fee (3%): $12.00' && (await shown(page, '.pay-total')) === 'Total: $412.00' &&
      (await shown(page, '[data-paynow]')) === 'Pay $412.00' && (await shown(page, '[data-debit]')) === '' && (await shown(page, '[data-other]')) === 'Use a different card',
      await shown(page, '[data-quote]'));
    ok('the card form is put away while the total shows', (await shown(page, '[data-entry]')) === '');
    await page.click('[data-paynow]');
    const s = await fake(page);
    ok('Pay confirms that payment with Stripe, once', await until(async () => ((await fake(page)).calls || []).includes('confirm:' + SECRET)) &&
      (await fake(page)).calls.filter((c) => c.startsWith('confirm:')).length === 1, JSON.stringify(s && s.calls));
    ok('then asks the pay function what it recorded, by the payment\'s id', await until(async () => calls.some((c) => c.q === '?view=json&pi=' + PI)), JSON.stringify(calls.map((c) => c.q)));
    ok('paid: the thanks and Stripe\'s receipt', await until(async () => (await shown(page, '[data-states] [data-state]')) === 'Paid. Thank you!') &&
      (await page.getAttribute('[data-receipt]', 'href')) === RECEIPT && (await shown(page, '[data-receipt]')) === 'See your receipt' && (await shown(page, '[data-due]')) === '');
    ok('no errors, nothing else asked, no rule broken', errs.length === 0 && away.length === 0 && (await csp(page)).length === 0, errs.concat(away).join(' | '));
    await ctx.close();
  });

  await group('a debit card: no fee', async () => {
    const { page, ctx } = await open(browser, {});
    await quoteWith(page, 'debit');
    ok('no fee on a debit card (C11), and the total is what is due', await until(async () => (await shown(page, '[data-quote]')) !== '') &&
      (await shown(page, '[data-debit]')) === 'No card fee on a debit card.' && (await shown(page, '[data-credit]')) === '' &&
      (await shown(page, '.pay-total')) === 'Total: $400.00' && (await shown(page, '[data-paynow]')) === 'Pay $400.00', await shown(page, '[data-quote]'));
    await page.click('[data-other]');
    ok('Use a different card (C13): the card form again, emptied, the total put away', (await shown(page, '[data-quote]')) === '' &&
      (await shown(page, '[data-entry] [data-continue]')) === 'Continue' && (await fake(page)).cleared === 1);
    await ctx.close();
  });

  await group('cards that don\'t go through', async () => {
    const { page, ctx, calls } = await open(browser, {});
    await quoteWith(page, 'bad');
    ok('a card Stripe can\'t read: says so, with Stripe\'s reason, and asks nothing', await until(async () => (await shown(page, '[data-error="card"]')) !== '') &&
      (await shown(page, '[data-why]')) === 'Your card number is incomplete.' && calls.length === 1 && !(await page.isDisabled('[data-continue]')));
    await quoteWith(page, 'credit');
    ok('a good card after it: the error is gone', await until(async () => (await shown(page, '[data-quote]')) !== '') && (await shown(page, '[data-error]')) === '');
    await page.evaluate(() => { window.__decline = true; });
    await page.click('[data-paynow]');
    ok('declined: says so, with Stripe\'s reason, and Pay can be tried again', await until(async () => (await shown(page, '[data-error="declined"]')) !== '') &&
      (await shown(page, '[data-why]')) === 'Your card was declined.' && !(await page.isDisabled('[data-paynow]')) && !calls.some((c) => /pi=/.test(c.q)));
    await ctx.close();
  });

  await group('a quote that doesn\'t add up is never offered', async () => {
    const { page, ctx } = await open(browser, { answer: (m) => (m === 'POST' ? { status: 200, json: { ...quoteFor('pm_1Credit'), total_cents: 41000 } } : null) });
    await quoteWith(page, 'credit');
    ok('a total that isn\'t what is due plus the fee: no Pay button, the error line', await until(async () => (await shown(page, '[data-error="failed"]')) !== '') && (await shown(page, '[data-quote]')) === '');
    await ctx.close();
  });

  await group('without the business\'s name, and Colorado\'s 2%', async () => {
    const { page, ctx } = await open(browser, { answer: (m, q) => (q === '?view=json' ? { status: 200, json: { ...DUE, business_name: null, card_fee_bp: 200 } } : null) });
    ok('"Your inspector" says it, at the rate that applies', (await shown(page, '.pay-note')) === 'Your inspector adds a 2% fee when you pay by credit card. There’s no fee on a debit card.', await shown(page, '.pay-note'));
    await ctx.close();
  });

  const states = [
    ['a link that doesn\'t work', { status: 404, json: { error: 'not_found' } }, 'This pay link doesn’t work. Ask your inspector for a new one.', false],
    ['no answer', { status: 503, json: { error: 'unavailable' } }, 'The payment couldn’t be opened. Check your connection and try again.', true],
    ['paid in full', { status: 200, json: { state: 'nothing_due', paid_in_full: true } }, 'This inspection is paid in full. Thank you!', false],
    ['nothing due', { status: 200, json: { state: 'nothing_due', paid_in_full: false } }, 'Nothing is due on this link.', false],
    ['already paid', { status: 200, json: { state: 'paid', receipt_url: RECEIPT } }, 'Paid. Thank you!', false],
    ['an answer it can\'t use', { status: 200, json: { ...DUE, publishable_key: 'sk_live_x' } }, 'The payment couldn’t be opened. Check your connection and try again.', true],
  ];
  for (const [label, answer, words, retry] of states) {
    await group(label, async () => {
      const { page, ctx, errs } = await open(browser, { answer: (m, q) => (q === '?view=json' ? answer : null) });
      ok(label + ': says so', (await shown(page, '[data-states] [data-state]')) === words && (await shown(page, '[data-due]')) === '', await shown(page, '[data-states] [data-state]'));
      ok(label + ': Try again ' + (retry ? 'shows' : 'doesn\'t show'), ((await shown(page, '[data-again]')) === 'Try again') === retry);
      ok(label + ': no errors', errs.length === 0, errs.join(' | '));
      await ctx.close();
    });
  }

  await group('the fee no longer applies: Stripe\'s Checkout, as before', async () => {
    const { page, ctx, calls } = await open(browser, { answer: (m, q) => (q === '?view=json' ? { status: 200, json: { state: 'checkout', url: FN + LINK } } : null) });
    ok('opens the pay function\'s own address, which sends the client to Checkout', await until(async () => calls.some((c) => c.nav)), JSON.stringify(calls));
    await ctx.close();
  });

  await group('a checkout address that isn\'t the pay function\'s is never opened', async () => {
    const { page, ctx, calls, away } = await open(browser, { answer: (m, q) => (q === '?view=json' ? { status: 200, json: { state: 'checkout', url: 'https://example.com/' + LINK } } : null) });
    ok('it stays, and says it couldn\'t open', (await shown(page, '[data-states] [data-state]')) === 'The payment couldn’t be opened. Check your connection and try again.' && !calls.some((c) => c.nav) && away.length === 0, away.join(' '));
    await ctx.close();
  });

  await group('no link', async () => {
    const { page, ctx, calls } = await open(browser, { path: 'pay' });
    ok('without a link it says the link doesn\'t work, and asks nothing', (await shown(page, '[data-states] [data-state]')) === 'This pay link doesn’t work. Ask your inspector for a new one.' && calls.length === 0);
    await ctx.close();
  });

  // Once Stripe took the payment, the page follows THAT payment until its result is read: an answer that doesn't come
  // (a timeout, a 5xx) never strands it, and nothing ever offers to pay again.
  await group('paid, but the first read of the result fails', async () => {
    let piAsks = 0;
    const { page, ctx, calls } = await open(browser, { answer: (m, q) => {
      if (!/pi=/.test(q)) return null;
      piAsks++;
      return piAsks === 1 ? { status: 503, json: {} } : piAsks === 2 ? { status: 200, json: { state: 'confirming' } } : null;
    } });
    await quoteWith(page, 'credit');
    await until(async () => (await shown(page, '[data-quote]')) !== '');
    await page.click('[data-paynow]');
    ok('it keeps asking about that payment, then shows the thanks and the receipt', await until(async () => (await shown(page, '[data-states] [data-state]')) === 'Paid. Thank you!', 15000) &&
      (await page.getAttribute('[data-receipt]', 'href')) === RECEIPT && piAsks >= 3, 'asked ' + piAsks);
    ok('and never offers to pay again: no Try again, no amount due, no second payment', (await shown(page, '[data-again]')) === '' && (await shown(page, '[data-due]')) === '' &&
      calls.filter((c) => c.method === 'POST').length === 1 && (await fake(page)).calls.filter((c) => c.startsWith('confirm:')).length === 1);
    await ctx.close();
  });
  await group('paid, and the tab is reloaded before the result is read', async () => {
    const { page, ctx, calls } = await open(browser, { answer: (m, q) => (/pi=/.test(q) ? { status: 200, json: { state: 'confirming' } } : null) });
    await quoteWith(page, 'credit');
    await until(async () => (await shown(page, '[data-quote]')) !== '');
    await page.click('[data-paynow]');
    await until(async () => calls.some((c) => /pi=/.test(c.q)));
    const before = calls.length;
    await page.reload({ waitUntil: 'load' });
    await page.waitForTimeout(600);
    const after = calls.slice(before);
    ok('the reloaded page follows the same payment, never asks what is due, and shows no way to pay', after.length > 0 && after.every((c) => c.q === '?view=json&pi=' + PI) &&
      (await shown(page, '[data-due]')) === '' && (await shown(page, '[data-states] [data-state]')) === 'Your payment is going through. Stripe’s receipt shows here once it’s confirmed.',
      JSON.stringify(after.map((c) => c.q)));
    await ctx.close();
  });
  await group('another pay link opened in the same tab', async () => {
    const { page, ctx, calls } = await open(browser, {});
    await until(async () => (await shown(page, '[data-what]')) !== '');
    // The page starts again on it: wait for that load before reading anything (the reload may come before the
    // call that moves the address returns).
    const reloaded = page.waitForEvent('load');
    await page.evaluate((l) => { location.hash = l; }, LINK2).catch(() => {});
    await reloaded;
    await page.waitForTimeout(400);
    ok('the page starts again on the new link: its inspection, and the address put away again', await until(async () => (await shown(page, '[data-what]')).startsWith('Reinspection')) &&
      calls.some((c) => c.link === 2) && new URL(page.url()).hash === '', await shown(page, '[data-what]'));
    await ctx.close();
  });
  await group('Stripe\'s form can\'t load', async () => {
    const { page, ctx } = await open(browser, { noStripe: true });
    ok('without Stripe.js it says it couldn\'t open, and shows no card box', (await shown(page, '[data-states] [data-state]')) === 'The payment couldn’t be opened. Check your connection and try again.' && (await shown(page, '[data-due]')) === '');
    await ctx.close();
  });

  {
    const root = path.join(__dirname, '..', 'coming-soon');
    const text = (f) => fs.readFileSync(path.join(root, f), 'utf8');
    const js = text('assets/pay.js'), html = text('pay.html');
    ok('pay.js says no words: every sentence is in the page', !/[A-Z][a-z]+ [a-z]+ [a-z]+[.!?]['"`]/.test(js) && !/['"`][A-Z][a-z]+ [a-z]+ /.test(js));
    ok('pay.js opens nothing but the pay function\'s own address, writes no HTML and runs no text as code',
      (js.match(/location\.(assign|replace)\(/g) || []).length === 1 && /indexOf\(FN \+ link\) === 0/.test(js) && !/location\.href\s*=|window\.open|\.innerHTML|document\.write|eval\(|new Function/.test(js));
    ok('pay.js asks only the pay function, with no key or sign-in', (js.match(/https:\/\//g) || []).length === 1 && /var FN = 'https:\/\/btxlrfvqifnrnxffohsz\.supabase\.co\/functions\/v1\/pay\/';/.test(js) && !/apikey|Authorization|auth\.js/.test(js));
    ok('the page loads Stripe.js from js.stripe.com itself and its own files, no inline script or style',
      (html.match(/<script /g) || []).length === 2 && /<script src="https:\/\/js\.stripe\.com\/v3\/"><\/script>/.test(html) && /<script src="\/assets\/pay\.js" defer><\/script>/.test(html) &&
      !/<script(?![^>]*\ssrc=)|<style|\sstyle=|\son[a-z]+=/.test(html) && (html.match(/(?:src|href)="(?!\/|https:\/\/js\.stripe\.com\/v3\/")[^"]*"/g) || []).length === 0);
    ok('no other page loads Stripe.js', fs.readdirSync(root).filter((f) => f.endsWith('.html') && f !== 'pay.html').every((f) => !/js\.stripe\.com/.test(text(f))));
    ok('search engines are told to leave it alone, and the list for them leaves it out', /<meta name="robots" content="noindex/.test(html) && !/\/pay/.test(text('sitemap.xml')));
  }

  await browser.close();
  console.log(failed ? '\n' + failed + ' CHECK(S) FAILED' : '\nall checks passed');
  process.exit(failed ? 1 : 0);
})();
