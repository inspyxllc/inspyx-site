// Self-checks for the signing page (/sign#<key>, 2026-11-22, Inspyx 4; signing step 3, part 5).
// NOTHING REAL IS SIGNED HERE. The sign function is a stand-in this test runs itself (view and sign, as inspyx-mobile's
// sign/index.ts answers them); any other request that tries to leave the site is stopped and counted as a failure.
// The browser runs in New York time.
// usage: node tools/serve.js &   then   node tools/check_sign.js
const playwright = require('playwright');
const fs = require('fs');
const path = require('path');
const engine = process.env.BROWSER === 'webkit' ? playwright.webkit : playwright.chromium;

const url = process.env.URL || 'http://localhost:4173/';
const HOME = new URL(url).origin;
const FN = 'https://btxlrfvqifnrnxffohsz.supabase.co/functions/v1/sign';
const KEY = '3f2504e0-4f89-41d3-9a0c-0305e82c3301.' + 'A'.repeat(22);
let failed = 0;
const ok = (name, cond, extra) => { if (!cond) failed++; console.log((cond ? 'PASS  ' : 'FAIL  ') + name + (extra ? '  [' + extra + ']' : '')); };
const group = async (label, fn) => { try { await fn(); } catch (e) { ok(label + ': these checks could not run', false, String((e && e.message) || e).split('\n')[0]); } };

// The server's rule for how many initials a text takes (sign/core.ts initialsNeeded): one a spot, else one, at most 60.
const SPOT = /\[[ \t\u00a0]*initials[ \t\u00a0]*\]/gi;
const needed = (t) => Math.min(Math.max((t.match(SPOT) || []).length, 1), 60);
const TEXT = 'INSPECTION AGREEMENT\nI agree to the scope. [Initials]\nLimits apply. [ initials ]\n<b>not markup</b> & "quotes"';
const VIEW = (text = TEXT, over = {}) => Object.assign({
  state: 'open', title: 'Home inspection agreement (starter, test)', text, textSha256: 'ab'.repeat(32), initials: needed(text),
  inspector: { name: 'Pat Rivera', company: 'Rivera Inspections' },
  booking: { startsAt: Date.UTC(2026, 11, 2, 14), endsAt: Date.UTC(2026, 11, 2, 17), timeZone: 'America/New_York', address: '1 Main St Apt 103, Miami, FL 33169', services: ['Home inspection'], totalCents: 45000 },
}, over);

async function open(browser, o = {}) {
  const ctx = await browser.newContext({ viewport: { width: o.w || 1280, height: o.h || 900 }, locale: 'en-US', timezoneId: 'America/New_York', hasTouch: !!o.touch, isMobile: !!o.touch });
  const page = await ctx.newPage();
  page.setDefaultTimeout(8000);
  const errs = [], away = [], calls = [];
  page.on('pageerror', (e) => errs.push('pageerror: ' + e.message));
  // The browser logs every answer that isn't 2xx ("Failed to load resource"): the 404s, 429s and failures served
  // here on purpose. Any other console error counts.
  page.on('console', (m) => { if (m.type() === 'error' && !/^Failed to load resource/.test(m.text())) errs.push('console: ' + m.text()); });
  await page.route((u) => !u.href.startsWith(HOME) && !u.href.startsWith('data:'), async (route) => {
    const req = route.request(), u = req.url();
    if (u !== FN) { away.push(u); return route.abort(); }
    const body = JSON.parse(req.postData() || '{}');
    calls.push({ body, referer: req.headers()['referer'] || '' });
    const reply = (status, b) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(b) });
    if (o.down) return route.abort('failed');
    if (o.slow) return reply(429, { state: 'slow' });
    if (o.gone || body.key !== KEY) return reply(404, { state: 'gone' });
    if (body.action === 'view') return reply(200, o.view || VIEW());
    if (body.action === 'sign') {
      if (o.signDelay) await new Promise((r) => setTimeout(r, o.signDelay));
      if (o.signAnswer) return reply(o.signAnswer[0], o.signAnswer[1]);
      return reply(200, { state: 'signed' });
    }
    return reply(404, { state: 'gone' });
  });
  await page.goto(url.replace(/\/$/, '') + (o.path || '/sign#' + KEY));
  return { page, ctx, errs, away, calls };
}

/** Draws a stroke on a pad by real pointer events (mouse, or touch on a phone). */
async function draw(page, name, touch) {
  const c = page.locator(`[data-pad="${name}"]`);
  await c.scrollIntoViewIfNeeded();
  const b = await c.boundingBox();
  if (touch) {
    // A touch stroke, as pointer events (Playwright's touchscreen taps only).
    await page.evaluate(({ name, b }) => {
      const el = document.querySelector(`[data-pad="${name}"]`);
      const ev = (type, x, y) => el.dispatchEvent(new PointerEvent(type, { pointerId: 7, pointerType: 'touch', clientX: x, clientY: y, bubbles: true, cancelable: true }));
      ev('pointerdown', b.x + 10, b.y + b.height / 2);
      for (let i = 1; i <= 10; i++) ev('pointermove', b.x + 10 + i * (b.width - 20) / 10, b.y + b.height / 2 + (i % 2 ? 8 : -8));
      ev('pointerup', b.x + b.width - 10, b.y + b.height / 2);
    }, { name, b: { x: b.x, y: b.y, width: b.width, height: b.height } });
    return;
  }
  await page.mouse.move(b.x + 10, b.y + b.height / 2);
  await page.mouse.down();
  for (let i = 1; i <= 10; i++) await page.mouse.move(b.x + 10 + i * (b.width - 20) / 10, b.y + b.height / 2 + (i % 2 ? 8 : -8));
  await page.mouse.up();
}
const shown = (page, sel) => page.locator(sel).isVisible();
const pngInfo = (b64) => {
  const b = Buffer.from(b64, 'base64');
  return { png: b.slice(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])), w: b.readUInt32BE(16), h: b.readUInt32BE(20), depth: b[24], colour: b[25], bytes: b.length, trns: b.includes(Buffer.from('tRNS')) };
};

(async () => {
  const browser = await engine.launch();

  await group('the states', async () => {
    for (const [o, which] of [[{ gone: true }, 'gone'], [{ slow: true }, 'slow'], [{ down: true }, 'down'], [{ path: '/sign' }, 'gone'], [{ path: '/sign#nonsense' }, 'gone'], [{ path: '/sign#' + KEY.slice(0, -1) }, 'gone'], [{ path: '/sign#%' }, 'gone'], [{ path: '/sign#%FF' }, 'gone'], [{ path: '/sign#' + encodeURIComponent(KEY + ' ') }, 'gone']]) {
      const t = await open(browser, o);
      await t.page.locator(`[data-state="${which}"]`).waitFor({ state: 'visible' });
      ok(`${JSON.stringify(o)}: shows ${which}, and nothing else`, (await shown(t.page, '[data-state="open"]')) === false && (await shown(t.page, '[data-state="loading"]')) === false);
      if (o.path) ok(`${o.path}: a bad key asks nothing`, t.calls.length === 0);
      ok(`${which}: no error, nothing else asked`, t.errs.length === 0 && t.away.length === 0, t.errs.concat(t.away).join(' | '));
      await t.ctx.close();
    }
  });

  await group('reading', async () => {
    const t = await open(browser);
    await t.page.locator('[data-state="open"]').waitFor({ state: 'visible' });
    if (process.env.DEBUG) console.log(JSON.stringify([await t.page.locator('h1').first().textContent(), await t.page.locator('.sg-lede').textContent(), await t.page.locator('[data-when]').textContent()]));
    ok('the title, the company and the inspection, in New York time', (await t.page.locator('[data-state="open"] h1').textContent()) === 'Your inspection agreement'
      && (await t.page.locator('.sg-lede').textContent()).includes('Rivera Inspections')
      && /Wednesday, December 2 at 9:00\sAM EST, 1 Main St Apt 103/.test(await t.page.locator('[data-when]').textContent()));
    const text = await t.page.locator('[data-text]').textContent();
    ok('the text as text: markup stays words', text.includes('<b>not markup</b> & "quotes"') && (await t.page.locator('[data-text] b').count()) === 0);
    ok('one "Initial here" a spot, as the server counts', (await t.page.locator('.sg-spot').count()) === 2);
    ok('the view asked once, with the key, no Referer', t.calls.length === 1 && t.calls[0].body.action === 'view' && t.calls[0].body.key === KEY && t.calls[0].referer === '');
    ok('no error, nothing else asked', t.errs.length === 0 && t.away.length === 0, t.errs.concat(t.away).join(' | '));
    await t.ctx.close();
  });

  await group('spots, as the server counts them', async () => {
    const texts = ['No spots at all.', '[Initials]'.repeat(3), 'a [Initials\n] b [INITIALS] c', ('Clause [Initials]\n').repeat(70), '[\tinitials\u00a0]', '[Initial] [Initialss]'];
    for (const text of texts) {
      const t = await open(browser, { view: VIEW(text) });
      await t.page.locator('[data-state="open"]').waitFor({ state: 'visible' });
      const shownSpots = await t.page.locator('.sg-spot').count();
      const wantShown = Math.max((text.match(SPOT) || []).length, 1);
      ok(`${JSON.stringify(text).slice(0, 40)}: ${wantShown} spot(s) shown`, shownSpots === wantShown, String(shownSpots));
      await t.ctx.close();
    }
  });

  await group('the ask to draw initials goes once they are placed, whatever the order (rehearsal 3, finding 26)', async () => {
    const ONE = 'AGREEMENT\nI agree. [Initials]';
    const orders = {
      'Sign first, then draw, then the spot': async (page) => { await page.click('[data-sign]'); await draw(page, 'initials'); await page.locator('.sg-spot').first().click(); },
      'the spot first, then draw, then the spot': async (page) => { await page.locator('.sg-spot').first().click(); await draw(page, 'initials'); await page.locator('.sg-spot').first().click(); },
      'draw, then the spot': async (page) => { await draw(page, 'initials'); await page.locator('.sg-spot').first().click(); },
    };
    // The spot first, or Sign first, then draw: the ask to draw goes as the initials are drawn; the spot stays the
    // client's to tap (a second tap on an initialed spot takes it back).
    for (const first of ['.sg-spot', '[data-sign]']) {
      const t = await open(browser, { view: VIEW(ONE) });
      await t.page.locator('[data-state="open"]').waitFor({ state: 'visible' });
      await t.page.locator(first).first().click();
      ok(first + ' first: asked to draw', await shown(t.page, '[data-say="draw-initials"]'));
      await draw(t.page, 'initials');
      const placed = (await t.page.locator('[data-v="placed"]').first().textContent()).replace(/\s+/g, ' ').trim();
      ok(first + ' first, then draw: the ask goes as they are drawn; no spot initialed by itself', !(await shown(t.page, '[data-say="draw-initials"]')) && /^0 .* 1$/.test(placed), placed);
      await t.ctx.close();
    }
    // Another ask on screen is left as it is: drawing the initials answers only the ask to draw them.
    {
      const t = await open(browser, { view: VIEW(ONE) });
      await t.page.locator('[data-state="open"]').waitFor({ state: 'visible' });
      await draw(t.page, 'initials');
      await t.page.click('[data-sign]');
      ok('asked to initial the spot', await shown(t.page, '[data-say="initials"]'));
      await draw(t.page, 'initials');
      ok('drawing more leaves that ask', await shown(t.page, '[data-say="initials"]'));
      await t.ctx.close();
    }
    for (const touch of [false, true]) {
      for (const [label, steps] of Object.entries(orders)) {
        const t = await open(browser, { view: VIEW(ONE), touch });
        await t.page.locator('[data-state="open"]').waitFor({ state: 'visible' });
        await steps(t.page);
        const placed = (await t.page.locator('[data-v="placed"]').first().textContent()).replace(/\s+/g, ' ').trim();
        const asks = await t.page.locator('[data-say]:visible').allTextContents();
        ok((touch ? 'touch: ' : 'mouse: ') + label + ': 1 of 1, and no ask left', /^1 .* 1$/.test(placed) && asks.length === 0, JSON.stringify({ placed, asks }));
        await t.ctx.close();
      }
    }
  });

  await group('what stops a signing, in order', async () => {
    const t = await open(browser);
    await t.page.locator('[data-state="open"]').waitFor({ state: 'visible' });
    await t.page.click('[data-sign]');
    ok('no initials drawn: asked to draw them', await shown(t.page, '[data-say="draw-initials"]'));
    await t.page.locator('.sg-spot').first().click();
    ok('a spot tapped before drawing: asked to draw first, not marked', await shown(t.page, '[data-say="draw-initials"]') && (await t.page.locator('.sg-spot').first().getAttribute('aria-pressed')) === 'false');
    await draw(t.page, 'initials');
    await t.page.locator('.sg-spot').first().click();
    await t.page.click('[data-sign]');
    ok('one spot left: asked to initial each', await shown(t.page, '[data-say="initials"]'));
    await t.page.locator('.sg-spot').nth(1).click();
    ok('the count says 2 of 2', /2 .* 2/.test(await t.page.locator('[data-v="placed"]').textContent()));
    await t.page.click('[data-sign]');
    ok('no name: asked for it', await shown(t.page, '[data-say="name"]'));
    await t.page.fill('#sg-name', '   ');
    await t.page.click('[data-sign]');
    ok('spaces only: still no name', await shown(t.page, '[data-say="name"]'));
    await t.page.fill('#sg-name', '  Sam   Client ');
    await t.page.click('[data-sign]');
    ok('no signature: asked for it', await shown(t.page, '[data-say="signature"]'));
    ok('nothing sent yet', t.calls.filter((c) => c.body.action === 'sign').length === 0);
    await t.page.click('[data-clear="initials"]');
    ok('new initials: every spot to initial again', (await t.page.locator('.sg-spot[aria-pressed="true"]').count()) === 0);
    await t.ctx.close();
  });

  for (const touch of [false, true]) {
    await group(touch ? 'signing on a phone (touch)' : 'signing', async () => {
      const t = await open(browser, touch ? { w: 390, h: 844, touch: true } : {});
      await t.page.locator('[data-state="open"]').waitFor({ state: 'visible' });
      await draw(t.page, 'initials', touch);
      for (const s of await t.page.locator('.sg-spot').all()) await s.click();
      await t.page.fill('#sg-name', '  Sam   Client ');
      await draw(t.page, 'signature', touch);
      await t.page.click('[data-sign]');
      await t.page.locator('[data-state="signed"]').waitFor({ state: 'visible' });
      const sent = t.calls.filter((c) => c.body.action === 'sign');
      ok('signed once', sent.length === 1);
      const b = sent[0].body;
      ok('the key, the text it read, the name folded', b.key === KEY && b.textSha256 === 'ab'.repeat(32) && b.name === 'Sam Client');
      const s = pngInfo(b.signature), i = pngInfo(b.initials[0]);
      ok('the signature: a PNG of 1200 x 400, 8-bit RGBA, no colour key, under 200 KB', s.png && s.w === 1200 && s.h === 400 && s.depth === 8 && s.colour === 6 && !s.trns && s.bytes < 200 * 1024, JSON.stringify(s));
      ok('the initials: 450 x 150 (67,500 pixels), 8-bit RGBA, under 50 KB, one a spot', i.png && i.w === 450 && i.h === 150 && i.depth === 8 && i.colour === 6 && !i.trns && i.bytes < 50 * 1024 && b.initials.length === 2, JSON.stringify(i));
      ok('the page scrolled not while drawing (touch-action none)', (await t.page.locator('[data-pad="signature"]').evaluate((el) => getComputedStyle(el).touchAction)) === 'none');
      ok('signed: the thanks, with the company', (await t.page.locator('[data-state="signed"]').textContent()).includes('Rivera Inspections'));
      // What happens next (the rehearsal, 2026-11-26): the copy on its way, nothing more to do, and the inspection's day.
      const next = await t.page.locator('.sg-next li:not([hidden])').allTextContents();
      ok('signed: what happens next, with the inspection\'s day and place', next.length === 3 && next[1].startsWith('Rivera Inspections has it too') &&
        /^Your inspection: .+, .+\.$/.test(next[2]) && (await t.page.locator('[data-state="signed"]').textContent()).includes('You can close this page.'), JSON.stringify(next));
      ok('the agreement\'s own name, the inspector\'s, is nowhere on the page or its tab', !(await t.page.textContent('body')).includes('(starter, test)') && !(await t.page.title()).includes('(starter, test)'), await t.page.title());
      ok('no error, nothing else asked', t.errs.length === 0 && t.away.length === 0, t.errs.concat(t.away).join(' | '));
      await t.ctx.close();
    });
  }

  await group('more spots than the server takes (over 60): all to initial, 60 sent', async () => {
    const text = ('Clause [Initials]\n').repeat(70);
    const t = await open(browser, { view: VIEW(text) });
    await t.page.locator('[data-state="open"]').waitFor({ state: 'visible' });
    await draw(t.page, 'initials');
    for (const s of await t.page.locator('.sg-spot').all()) await s.click();
    await t.page.fill('#sg-name', 'Sam Client');
    await draw(t.page, 'signature');
    await t.page.click('[data-sign]');
    await t.page.locator('[data-state="signed"]').waitFor({ state: 'visible' });
    ok('70 spots initialed, 60 initials sent (the server\'s count)', t.calls.find((c) => c.body.action === 'sign').body.initials.length === 60);
    await t.ctx.close();
  });

  await group('a double tap signs once', async () => {
    const t = await open(browser, { signDelay: 800 });
    await t.page.locator('[data-state="open"]').waitFor({ state: 'visible' });
    await draw(t.page, 'initials');
    for (const s of await t.page.locator('.sg-spot').all()) await s.click();
    await t.page.fill('#sg-name', 'Sam Client');
    await draw(t.page, 'signature');
    await t.page.click('[data-sign]');
    await t.page.locator('[data-sign]').click({ force: true }).catch(() => {});
    await t.page.locator('[data-state="signed"]').waitFor({ state: 'visible' });
    ok('one sign request', t.calls.filter((c) => c.body.action === 'sign').length === 1);
    await t.ctx.close();
  });

  for (const [answer, which] of [[[409, { error: 'changed' }], 'changed'], [[400, { error: 'name' }], 'name'], [[400, { error: 'signature' }], 'too-big'], [[400, { error: 'initials' }], 'too-big'], [[503, { error: 'database' }], 'failed'], [[404, { state: 'gone' }], 'gone'], [[429, { state: 'slow' }], 'slow']]) {
    await group(`the server answers ${answer[0]} ${JSON.stringify(answer[1])}`, async () => {
      const t = await open(browser, { signAnswer: answer });
      await t.page.locator('[data-state="open"]').waitFor({ state: 'visible' });
      await draw(t.page, 'initials');
      for (const s of await t.page.locator('.sg-spot').all()) await s.click();
      await t.page.fill('#sg-name', 'Sam Client');
      await draw(t.page, 'signature');
      await t.page.click('[data-sign]');
      const sel = which === 'gone' || which === 'slow' ? `[data-state="${which}"]` : `[data-say="${which}"]`;
      await t.page.locator(sel).waitFor({ state: 'visible' });
      ok(`${which} is said`, true);
      if (which !== 'gone' && which !== 'slow') ok('and the button is ready to try again', await t.page.locator('[data-sign]').isEnabled());
      await t.ctx.close();
    });
  }

  await group('another key in the same tab starts over (Codex on site PR 65)', async () => {
    const t = await open(browser);
    await t.page.locator('[data-state="open"]').waitFor({ state: 'visible' });
    await draw(t.page, 'initials');
    await t.page.locator('.sg-spot').first().click();
    const other = '4f2504e0-4f89-41d3-9a0c-0305e82c3301.' + 'B'.repeat(22);
    await Promise.all([t.page.waitForEvent('load'), t.page.evaluate((k) => { location.hash = k; }, other)]);
    await t.page.locator('[data-state="gone"]').waitFor({ state: 'visible' });
    const views = t.calls.filter((c) => c.body.action === 'view').map((c) => c.body.key);
    ok('the new key is asked for, and nothing of the old is shown', views.length === 2 && views[1] === other && (await t.page.locator('[data-state="open"]').isVisible()) === false, JSON.stringify(views));
    await t.ctx.close();
  });

  await group('already signed', async () => {
    const t = await open(browser, { view: VIEW(TEXT, { state: 'signed', signerName: 'Sam Client', signedAt: Date.UTC(2026, 10, 22, 14, 14) }) });
    await t.page.locator('[data-state="signed"]').waitFor({ state: 'visible' });
    ok('says who signed and when, in the inspector\'s time', /Signed by Sam Client on Sunday, November 22 at 9:14\sAM EST/.test(await t.page.locator('[data-v="signedline"]').textContent()));
    await t.ctx.close();
  });

  await group('step 2: Pay when a fee is owed; "nothing more to do" only when nothing is (the lead, 2026-11-27)', async () => {
    const signed = { state: 'signed', signerName: 'Sam Client', signedAt: Date.UTC(2026, 10, 22, 14, 14) };
    const step = async (page) => ({ next: (await page.locator('.sg-next li:visible').allTextContents()).map((x) => x.replace(/\s+/g, ' ').trim()),
      href: await page.locator('[data-pay-link]').isVisible() ? await page.getAttribute('[data-pay-link]', 'href') : null });
    let t = await open(browser, { view: VIEW(TEXT, Object.assign({}, signed, { pay: { dueCents: 27550, link: 'https://inspyx.com/pay#Tok_ddddddddddddddddd1' } })) });
    await t.page.locator('[data-state="signed"]').waitFor({ state: 'visible' });
    let a = await step(t.page);
    ok('owed: step 2 says what is owed and offers Pay, to the pay link; never "nothing more to do"',
      a.next[1] === 'Rivera Inspections has it too. One step left: your inspection fee, $275.50. Your report unlocks once it’s paid.Pay $275.50' &&
      a.href === 'https://inspyx.com/pay#Tok_ddddddddddddddddd1' && !a.next.join().includes('nothing more'), JSON.stringify(a));
    if (process.env.SHOTS) await t.page.locator('[data-state="signed"]').screenshot({ path: process.env.SHOTS + '/sign-pay-owed.png' });
    await t.ctx.close();
    // The server's link now (rehearsal 3, finding 13): inspyx.com/pay/<token>, which goes on to Stripe.
    t = await open(browser, { view: VIEW(TEXT, Object.assign({}, signed, { pay: { dueCents: 27550, link: 'https://inspyx.com/pay/Tok_ddddddddddddddddd1' } })) });
    await t.page.locator('[data-state="signed"]').waitFor({ state: 'visible' });
    a = await step(t.page);
    ok('owed, with an inspyx.com/pay/<token> link: Pay goes there', a.href === 'https://inspyx.com/pay/Tok_ddddddddddddddddd1' && a.next[1].endsWith('Pay $275.50'), JSON.stringify(a));
    await t.ctx.close();
    for (const [label, pay] of [['nothing owed (no pay link)', null], ['paid in full', { dueCents: 0, link: 'https://inspyx.com/pay#Tok_ddddddddddddddddd1' }],
      ['a link that isn\'t this site\'s pay page', { dueCents: 500, link: 'https://evil.example/pay#Tok_ddddddddddddddddd1' }],
      ['this site, but not its pay link', { dueCents: 500, link: 'https://inspyx.com/payx/Tok_ddddddddddddddddd1' }],
      ['a pay link with more after the token', { dueCents: 500, link: 'https://inspyx.com/pay/Tok_ddddddddddddddddd1/x' }],
      ['the supabase.co address', { dueCents: 500, link: 'https://btxlrfvqifnrnxffohsz.supabase.co/functions/v1/pay/Tok_ddddddddddddddddd1' }]]) {
      t = await open(browser, { view: VIEW(TEXT, Object.assign({}, signed, { pay })) });
      await t.page.locator('[data-state="signed"]').waitFor({ state: 'visible' });
      a = await step(t.page);
      ok(label + ': "nothing more to do", no Pay', a.href === null && a.next[1] === 'Rivera Inspections has it too. There’s nothing more to do before the inspection.', JSON.stringify(a));
      await t.ctx.close();
    }
  });

  await group('the page\'s rules (vercel.json, served here as there)', async () => {
    const res = await fetch(url.replace(/\/$/, '') + '/sign');
    const csp = res.headers.get('content-security-policy') || '';
    ok('script and connect only to this site and the sign function', csp.includes("script-src 'self'") && csp.includes('connect-src https://btxlrfvqifnrnxffohsz.supabase.co') && csp.includes("default-src 'none'"));
    ok('no Referer, never stored, never indexed, never framed', res.headers.get('referrer-policy') === 'no-referrer' && res.headers.get('cache-control') === 'no-store' && /noindex/.test(res.headers.get('x-robots-tag') || '') && res.headers.get('x-frame-options') === 'DENY');
  });

  await group('pay links: inspyx.com/pay/<token> goes to the pay function, never stored, indexed or framed (rehearsal 3, finding 13)', async () => {
    const cfg = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'coming-soon', 'vercel.json'), 'utf8'));
    const r = (cfg.rewrites || []).filter((x) => x.source === '/pay/:token');
    ok('one rewrite, to the pay function, token and all', r.length === 1 && r[0].destination === 'https://btxlrfvqifnrnxffohsz.supabase.co/functions/v1/pay/:token', JSON.stringify(r));
    const h = (cfg.headers || []).find((x) => x.source === '/pay/(.*)');
    const of = (k) => h && (h.headers.find((x) => x.key === k) || {}).value;
    ok('no Referer, never stored, never indexed, never framed', !!h && of('Referrer-Policy') === 'no-referrer' && of('Cache-Control') === 'no-store' &&
      /noindex/.test(of('X-Robots-Tag') || '') && of('X-Frame-Options') === 'DENY' && /default-src 'none'/.test(of('Content-Security-Policy') || ''), JSON.stringify(h));
  });

  await browser.close();
  console.log(failed ? `${failed} FAILED` : 'ALL PASS');
  process.exit(failed ? 1 : 0);
})();
