// Self-checks for the home page: the form, the calculator, Stripe's return messages, the keyboard,
// tap targets, sideways scroll, motion turned off, and the three scenes with a sequence in them. No sign-up is ever sent: the waitlist call is
// caught here and answered by the test.
// usage: node tools/serve.js &   then   node tools/check_home.js
//        (the page served somewhere else: URL=http://localhost:4174/ node tools/check_home.js)
const { chromium } = require('playwright');

const url = process.env.URL || 'http://localhost:4173/';
let failed = 0;
const ok = (name, cond, extra) => { if (!cond) failed++; console.log((cond ? 'PASS  ' : 'FAIL  ') + name + (extra ? '  [' + extra + ']' : '')); };

async function open(browser, opts) {
  const o = opts || {};
  const ctx = await browser.newContext({ viewport: { width: o.w || 390, height: o.h || 844 }, deviceScaleFactor: 1, hasTouch: !o.desktop, isMobile: !o.desktop, reducedMotion: o.still ? 'reduce' : 'no-preference' });
  const page = await ctx.newPage();
  const errs = [], calls = [];
  page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
  page.on('pageerror', (e) => errs.push('pageerror: ' + e.message));
  await page.route('**/rest/v1/rpc/join_waitlist', async (route) => {
    const req = route.request();
    calls.push({ body: req.postDataJSON(), headers: req.headers() });
    const mode = o.answer ? o.answer() : 'ok';
    if (mode === 'http500') return route.fulfill({ status: 500, contentType: 'application/json', body: '{"message":"x"}' });
    if (mode === 'offline') return route.abort('failed');
    return route.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(mode) });
  });
  await page.goto(url + (o.query || ''), { waitUntil: 'load' });
  await page.addStyleTag({ content: 'html{scroll-behavior:auto !important}' });
  await page.waitForTimeout(500);
  return { ctx, page, errs, calls };
}

(async () => {
  const browser = await chromium.launch();

  // ---- the page loads clean, and its head carries what search and link previews need
  {
    const { ctx, page, errs } = await open(browser);
    ok('loads with no errors in the console', errs.length === 0, errs.join(' | '));
    const head = await page.evaluate(() => {
      const m = (sel, attr) => { const e = document.querySelector(sel); return e ? e.getAttribute(attr || 'content') : null; };
      let ld = null; try { ld = JSON.parse(document.querySelector('script[type="application/ld+json"]').textContent); } catch (e) { ld = 'broken'; }
      return { title: document.title, desc: m('meta[name=description]'), canon: m('link[rel=canonical]', 'href'), ogt: m('meta[property="og:title"]'), ogi: m('meta[property="og:image"]'), card: m('meta[name="twitter:card"]'), ld: ld && ld['@graph'] ? ld['@graph'].map((x) => x['@type']).join(',') : String(ld), h1: document.querySelectorAll('.site h1').length, lang: document.documentElement.lang };
    });
    ok('title, description, canonical link and link-preview tags are present', !!(head.title && head.desc && head.canon === 'https://inspyx.com/' && head.ogt && head.ogi && head.card), JSON.stringify(head));
    ok('structured data parses (Organization, WebSite)', head.ld === 'Organization,WebSite', head.ld);
    ok('one main heading, and the page says it is in English', head.h1 === 1 && head.lang === 'en');
    const film = await page.evaluate(() => { const c = document.querySelector('canvas[data-film]'); const d = c.getContext('2d').getImageData(Math.floor(c.width / 2), Math.floor(c.height * 0.7), 1, 1).data; return { w: c.width, h: c.height, a: d[3] }; });
    ok('the film is drawing', film.w > 0 && film.a === 255, JSON.stringify(film));
    for (const f of ['assets/share.jpg', 'assets/favicon.svg', 'assets/favicon-32.png', 'assets/apple-touch-icon.png', 'robots.txt', 'sitemap.xml', 'assets/report-cover.webp', 'assets/report-cover.jpg']) {
      const r = await page.request.get(url + f);
      ok('file is served: ' + f, r.status() === 200, String(r.status()));
    }
    const nf = await page.request.get(url + 'no-such-page');
    ok('a wrong address gets the page-not-found page', nf.status() === 404 && (await nf.text()).includes("That page isn't here."));
    await ctx.close();
  }

  // ---- header button takes you to the waitlist
  {
    const { ctx, page } = await open(browser);
    await page.click('.bar .btn');
    await page.waitForTimeout(400);
    const at = await page.evaluate(() => Math.round(document.getElementById('waitlist').getBoundingClientRect().top));
    ok('"Join the waitlist" in the header jumps to the form', Math.abs(at) < 4, 'top ' + at);
    await ctx.close();
  }

  // ---- the header's Pricing link: wide screens only
  {
    const shown = async (o) => { const { ctx, page } = await open(browser, o); const r = await page.evaluate(() => { const a = document.querySelector('.bar-link'); return { vis: !!a && a.getClientRects().length > 0, href: a ? a.getAttribute('href') : null }; }); await ctx.close(); return r; };
    const phone = await shown({}), wide = await shown({ w: 1280, h: 800, desktop: true });
    ok('the header links Pricing on a wide screen, and keeps to the logo and the button on a phone', !phone.vis && wide.vis && wide.href === '/pricing', JSON.stringify([phone, wide]));
  }

  // ---- calculator
  {
    const { ctx, page } = await open(browser);
    const val = (k) => page.textContent('[data-v="' + k + '"]');
    ok('calculator starts at 8 inspections, 2 hours, 5 calls, $400: 16 hours and $8,800', (await val('hoursWeek')) === '16' && (await val('dollars')) === '$8,800');
    await page.click('[data-step="insp"][data-d="1"]');
    await page.click('[data-step="hrs"][data-d="1"]');
    ok('more inspections and longer reports: 9 x 2.5 = 22.5 hours', (await val('insp')) === '9' && (await val('hrs')) === '2.5' && (await val('hoursWeek')) === '22.5');
    await page.click('[data-step="fee"][data-d="-1"]');
    ok('fee steps by $25: 22 calls a month x $375 = $8,250', (await val('fee')) === '$375' && (await val('dollars')) === '$8,250');
    for (let i = 0; i < 6; i++) await page.click('[data-step="calls"][data-d="-1"]', { force: true }).catch(() => {});
    const minusOff = await page.isDisabled('[data-step="calls"][data-d="-1"]');
    ok('calls stop at 0, the minus button switches off, and the dollars read $0', (await val('calls')) === '0' && minusOff && (await val('dollars')) === '$0');
    for (let i = 0; i < 14; i++) await page.click('[data-step="insp"][data-d="1"]', { force: true }).catch(() => {});
    ok('inspections stop at 20 and the plus button switches off', (await val('insp')) === '20' && (await page.isDisabled('[data-step="insp"][data-d="1"]')));
    await ctx.close();
  }

  // ---- the waitlist form
  {
    const { ctx, page, calls } = await open(browser);
    await page.click('[data-submit]');
    let s = await page.evaluate(() => ({ err: !document.getElementById('ix-err').hidden, inv: document.getElementById('ix-email').getAttribute('aria-invalid'), focus: document.activeElement.id }));
    ok('empty email: the error shows, the field is marked and gets the cursor, nothing is sent', s.err && s.inv === 'true' && s.focus === 'ix-email' && calls.length === 0);
    await page.fill('#ix-email', 'not-an-email');
    s = await page.evaluate(() => ({ err: !document.getElementById('ix-err').hidden }));
    ok('typing clears the error', !s.err);
    await page.click('[data-submit]');
    ok('a wrong email is stopped on the page, nothing is sent', calls.length === 0);
    await page.click('[data-pick="who"][data-val="team"]');
    await page.click('[data-pick="who"][data-val="solo"]');
    await page.click('[data-pick="uses"][data-val="spectora"]');
    await page.click('[data-pick="uses"][data-val="spectora"]');
    await page.click('[data-pick="uses"][data-val="other"]');
    const pills = await page.evaluate(() => Array.from(document.querySelectorAll('[data-pick]')).filter((b) => b.getAttribute('aria-pressed') === 'true').map((b) => b.getAttribute('data-val')).join(','));
    ok('taps: one choice per row, a second tap takes it back', pills === 'solo,other', pills);
    await page.fill('#ix-email', '  Pat@Example.com ');
    await page.click('[data-submit]');
    await page.waitForTimeout(300);
    const c = calls[0] || { body: {}, headers: {} };
    ok('a good email is sent once, with the two taps and the page', calls.length === 1 && c.body.p_email === 'Pat@Example.com' && c.body.p_who === 'solo' && c.body.p_uses === 'other' && c.body.p_page === new URL(url).host + '/' && c.body.p_source === '', JSON.stringify(c.body));
    ok('the call carries the public key', /^sb_publishable_/.test(c.headers.apikey || ''));
    s = await page.evaluate(() => ({ form: document.querySelector('[data-join]').hidden, done: !document.querySelector('[data-joined]').hidden, text: document.querySelector('[data-joined]').textContent.replace(/\s+/g, ' ').trim(), focus: document.activeElement.hasAttribute('data-joined') }));
    ok('then: "You\'re on the list." replaces the form and takes the focus', s.form && s.done && s.text === "You're on the list. We'll email you when the pilot opens." && s.focus, s.text);
    await ctx.close();
  }
  for (const [mode, want] of [['busy', 'A lot of people are joining right now.'], ['http500', "That didn't go through."], ['offline', "That didn't go through."], ['invalid', null]]) {
    const { ctx, page, calls } = await open(browser, { answer: () => mode, query: '?utm_source=facebook&utm_campaign=pilot' });
    await page.fill('#ix-email', 'pat@example.com');
    await page.click('[data-submit]');
    await page.waitForTimeout(400);
    const s = await page.evaluate(() => ({ fail: document.querySelector('[data-fail]').hidden ? '' : document.querySelector('[data-fail]').textContent, err: !document.getElementById('ix-err').hidden, form: document.querySelector('[data-join]').hidden, btn: document.querySelector('[data-submit]').disabled, label: document.querySelector('[data-submit]').textContent }));
    if (want) ok('answer "' + mode + '": the form stays, with the right message, and the button works again', !s.form && s.fail.startsWith(want) && !s.btn && s.label === 'Join the waitlist', s.fail);
    else ok('answer "invalid": the email error shows', !s.form && s.err);
    if (mode === 'busy') ok('the ad that brought them is sent along', calls[0] && calls[0].body.p_source === 'source=facebook campaign=pilot', calls[0] && calls[0].body.p_source);
    await ctx.close();
  }
  {
    const { ctx, page, calls } = await open(browser);
    await page.fill('#ix-email', 'bot@example.com');
    await page.evaluate(() => { document.querySelector('input[name="website"]').value = 'http://spam.example'; });
    await page.click('[data-submit]');
    await page.waitForTimeout(200);
    const done = await page.evaluate(() => !document.querySelector('[data-joined]').hidden);
    ok('a robot that fills the hidden field is told "ok" and nothing is sent', done && calls.length === 0);
    await ctx.close();
  }

  // ---- Stripe's return messages
  for (const [q, h, p] of [['done', "You're all set.", 'Your Inspyx plan has started. Tap ✓ at the top to go back to the app.'], ['back', 'All done.', 'Tap ✓ at the top to go back to Inspyx.'], ['canceled', 'No charge was made.', 'Tap ✓ at the top to go back to Inspyx.']]) {
    const { ctx, page, errs } = await open(browser, { query: '?billing=' + q });
    const s = await page.evaluate(() => {
      const vis = (e) => !!e && e.getClientRects().length > 0;
      const msgs = Array.from(document.querySelectorAll('.rv-msg')).filter(vis);
      return { site: vis(document.querySelector('.site')), n: msgs.length, h: msgs[0] ? msgs[0].querySelector('h1').textContent : '', p: msgs[0] ? msgs[0].querySelector('p').textContent : '', film: !!window.__inspyxFilm, links: Array.from(document.querySelectorAll('.rv-foot nav a')).map((a) => a.getAttribute('href')).join(',') };
    });
    ok('?billing=' + q + ' shows only its message, word for word', !s.site && s.n === 1 && s.h === h && s.p === p && !s.film && s.links === '/pricing,/refunds,/terms,/privacy' && errs.length === 0, JSON.stringify(s));
    await ctx.close();
  }
  {
    const { ctx, page } = await open(browser, { query: '?billing=other' });
    const site = await page.evaluate(() => document.querySelector('.site').getClientRects().length > 0 && document.querySelector('.rv').getClientRects().length === 0);
    ok('any other ?billing value shows the normal page', site);
    await ctx.close();
  }

  // ---- sideways scroll and tap targets on phones
  for (const [w, h] of [[320, 568], [360, 640], [390, 844], [430, 932]]) {
    const { ctx, page } = await open(browser, { w, h });
    const r = await page.evaluate(() => {
      const small = [];
      for (const e of document.querySelectorAll('.site a, .site button, .site input')) {
        if (e.closest('.hp') || e.classList.contains('skip')) continue;
        const b = e.getBoundingClientRect();
        if (b.width === 0 && b.height === 0) continue;
        if (b.width < 43.5 || b.height < 43.5) small.push((e.textContent || e.name || '').trim().slice(0, 24) + ' ' + Math.round(b.width) + 'x' + Math.round(b.height));
      }
      return { sw: document.documentElement.scrollWidth, iw: window.innerWidth, small };
    });
    ok(w + ' px wide: no sideways scroll', r.sw <= r.iw, 'page ' + r.sw + ' px, screen ' + r.iw + ' px');
    ok(w + ' px wide: every link, button and field is at least 44 px', r.small.length === 0, r.small.join(' ; '));
    await ctx.close();
  }

  // ---- keyboard: every control can be reached, and shows where you are
  {
    const { ctx, page } = await open(browser, { w: 1280, h: 800, desktop: true });
    const seen = [];
    let ring = true;
    for (let i = 0; i < 40; i++) {
      await page.keyboard.press('Tab');
      const a = await page.evaluate(() => { const e = document.activeElement; if (!e || e === document.body) return null; const cs = getComputedStyle(e); return { t: (e.getAttribute('aria-label') || e.textContent || e.name || e.id || '').trim().slice(0, 30), o: cs.outlineStyle + ' ' + cs.outlineWidth }; });
      if (!a) break;
      if (seen.length && a.t === seen[0]) break;
      seen.push(a.t);
      if (!/^solid 3px/.test(a.o)) ring = false;
    }
    const want = ['Skip to content', 'Inspyx, home', 'Pricing', 'Join the waitlist', 'Join the waitlist', 'Fewer inspections a week', 'More inspections a week', 'Fewer hours per report', 'More hours per report', 'Fewer calls to voicemail', 'More calls to voicemail', 'Lower average fee', 'Higher average fee', 'Join the waitlist', 'email', 'Solo inspector', 'Team owner', 'Agent', 'Investor', 'Spectora', 'Another app', 'Nothing yet', 'Join the waitlist', 'Pricing', 'Terms', 'Privacy', 'Cancellation and refunds', 'support@inspyx.com', '(888) 772-2919'];
    const norm = seen.map((t) => (t === '' ? 'email' : t));
    ok('Tab reaches every control in page order (' + seen.length + ' stops)', JSON.stringify(norm) === JSON.stringify(want), norm.join(' > '));
    ok('each stop shows a focus ring', ring);
    await ctx.close();
  }

  // ---- motion turned off
  {
    const { ctx, page, errs } = await open(browser, { still: true });
    const T = [];
    for (const y of [0, 500, 900, 3000, 3300, 5661]) {
      await page.evaluate((v) => window.scrollTo(0, v), y);
      await page.waitForTimeout(250);
      T.push(await page.evaluate(() => Math.round(window.__inspyxFilm._lastT * 1000) / 1000));
    }
    ok('motion off: each scene holds still at its start, then at its end', JSON.stringify(T) === JSON.stringify([1, 1, 1.995, 2, 2.995, 3.995]) && errs.length === 0, T.join(', '));
    await ctx.close();
  }

  // ---- the wide layout
  {
    const { ctx, page, errs } = await open(browser, { w: 1440, h: 900, desktop: true });
    const r = await page.evaluate(() => { const f = document.querySelector('.film').getBoundingClientRect(); const t = document.querySelector('.hero h1').getBoundingClientRect(); return { pos: getComputedStyle(document.querySelector('.film')).position, fx: Math.round(f.left), fw: Math.round(f.width), fh: Math.round(f.height), tr: Math.round(t.right), sw: document.documentElement.scrollWidth }; });
    ok('wide screen: the film plays in its own window, to the right of the words', r.pos === 'sticky' && r.tr < r.fx && r.sw === 1440 && errs.length === 0, JSON.stringify(r));
    await ctx.close();
  }

  // ---- the phone call in Mia's scene
  const Q1 = '“How much for a 2,000-square-foot house?”', A1 = '“A house that size is $425.”';
  const Q2 = '“Can you come tomorrow morning?”', A2 = '“Yes. You’re booked for 9:00 AM.”';
  const CALL_AT = [0.09, 0.2, 0.33, 0.47, 0.62, 0.77, 1];
  const callAt = async (page, u) => { await page.evaluate((v) => window.scrollTo(0, window.__inspyxFilm.callScroll(v)), u); await page.waitForTimeout(250); return page.evaluate(() => window.__inspyxFilm._callLive.join(' | ')); };
  {
    const { ctx, page, errs } = await open(browser, {});
    const w = await page.evaluate(() => { const f = window.__inspyxFilm, c = f._call; return { say: c.say.map((l) => l.who + ' / ' + l.label + ': ' + l.text), small: [c.ring, c.answered, c.booked[0], c.booked[1]].join(' / '), next: f._desk.rows[0].when + ' / ' + f._desk.rows[0].from, text: document.querySelector('[data-call]').textContent.replace(/\s+/g, ' ').trim() }; });
    ok('Mia\'s scene: two questions, two answers and the small cards, read from the page\'s own words',
      w.say.length === 4 && w.say[0] === 'call / Caller: How much for a 2,000-square-foot house?' && w.say[1] === 'mia / Mia: A house that size is $425.'
      && w.say[2] === 'call / Caller: Can you come tomorrow morning?' && w.say[3] === 'mia / Mia: Yes. You\'re booked for 9:00 AM.'
      && w.small === 'Incoming call / Mia answered / Tomorrow, 9:00 AM / Booked on your calendar', w.say.join(' | ') + ' || ' + w.small);
    ok('the job Mia books is the first line of the calendar in the next scene, marked Phone', w.next === 'Tomorrow, 9:00 AM / Phone' && w.small.includes(' / Tomorrow, 9:00 AM / '), w.next);
    ok('the same call is in the page as text, for people who can\'t see the film', /your phone rings while you are on the roof, and Mia answers it\. The caller: How much for a 2,000-square-foot house\? Mia: A house that size is \$425\./.test(w.text) && /Booked on your calendar: tomorrow at 9:00 AM\./.test(w.text), w.text.slice(0, 120));
    const seen = [];
    for (const u of CALL_AT) seen.push(await callAt(page, u));
    ok('scrolling: the phone rings, Mia answers, the caller asks the price and Mia gives it', seen[0] === 'Incoming call' && seen[1] === 'Mia answered' && seen[2] === Q1 && seen[3] === Q1 + ' | ' + A1 && errs.length === 0, seen.slice(0, 4).join(' || '));
    ok('then the caller asks for tomorrow morning, and Mia books it', seen[4] === Q2 && seen[5] === Q2 + ' | ' + A2, seen.slice(4, 6).join(' || '));
    ok('it ends with the job on the calendar, under Mia\'s last words', seen[6] === A2 + ' | Tomorrow, 9:00 AM', seen[6]);
    const T = await page.evaluate(() => { const f = window.__inspyxFilm; return [Math.round(f._lastT * 1000) / 1000, f._callU, f._deskU]; });
    ok('the film\'s clock waits through the call, and runs on afterwards', T[1] === 1 && T[0] > 1.6 && T[0] < 2 && T[2] === 0, T.join(', '));
    // the caller's words are in a white card and Mia's in a black one
    await callAt(page, 0.47);
    const ink = await page.evaluate(() => { const f = window.__inspyxFilm, c = f._cv.getContext('2d'); return f._callBoxes.map((b) => { const d = c.getImageData(Math.round(b[1] + b[3] - 12), Math.round(b[2] + b[4] / 2), 1, 1).data; return b[0] + ':' + (d[0] + d[1] + d[2] < 150 ? 'black' : d[0] + d[1] + d[2] > 600 ? 'white' : 'other'); }).join(' '); });
    ok('the caller\'s words show on a white card and Mia\'s on a black one', ink === 'call:white mia:black', ink);
    await ctx.close();
  }
  // at every size, through the whole call: the cards stay on the screen, below the page's own card and the
  // eave he kneels on, and clear of the phone on the dash
  for (const [w, h, desktop, roomy] of [[390, 844, false, true], [390, 664, false, true], [375, 667, false, true], [360, 640, false, true], [430, 932, false, true], [320, 568, false, false], [768, 1024, false, true], [1440, 900, true, true], [1280, 620, true, true]]) {
    const { ctx, page, errs } = await open(browser, { w, h, desktop });
    const bad = [];
    let count = '';
    for (const u of CALL_AT) {
      await callAt(page, u);
      const r = await page.evaluate(() => {
        const f = window.__inspyxFilm, G = f._G, k = f._cam.z * G.k;
        const phone = f._pt(G.k, G.xF + 106, G.yG - 69), eave = f._pt(1, 0, -139)[1];
        return { boxes: f._callBoxes, W: f._W, H: f._Hh, top: Math.max(f._tops[1] + 13, eave + 7), phoneTop: phone[1] - 4.8 * k, phoneBottom: phone[1] + 4.8 * k, roomy: f._callRoomy, s: f._sB };
      });
      count += r.boxes.length;
      if (r.roomy !== roomy) bad.push(u + ': roomy ' + r.roomy);
      if (r.phoneBottom > r.H - 4) bad.push(u + ': the phone on the dash is off the screen');
      if (r.s < 0.78) bad.push(u + ': the cards are drawn too small, ' + r.s.toFixed(2));
      for (const b of r.boxes) {
        if (b[1] < 11.5 || b[1] + b[3] > r.W - 11.5) bad.push(u + ': ' + b[0] + ' runs off the side');
        if (b[2] < r.top - 0.5) bad.push(u + ': ' + b[0] + ' sits too high');
        if (b[2] + b[4] > r.phoneTop + 0.5) bad.push(u + ': ' + b[0] + ' covers the phone on the dash');
      }
    }
    ok(w + ' x ' + h + ': through the whole call the cards keep to their place' + (roomy ? ', a question over its answer' : ', one at a time'), bad.length === 0 && count === (roomy ? '1112122' : '1111111') && errs.length === 0, bad.join(' ; ') + ' cards: ' + count);
    await ctx.close();
  }
  {
    // a phone with its browser bars showing: the truck sits lower, so the cards keep their full size
    const { ctx, page } = await open(browser, { w: 390, h: 664 });
    await callAt(page, 0.47);
    const r = await page.evaluate(() => { const f = window.__inspyxFilm, G = f._G; return { s: f._sB, ground: f._pt(G.k, 0, G.yG)[1], H: f._Hh }; });
    ok('a phone with its bars showing: the cards keep their full size, and the truck still stands on the screen', r.s > 0.95 && r.ground < r.H, JSON.stringify(r));
    await ctx.close();
  }
  {
    const { ctx, page, errs } = await open(browser, { still: true });
    const seen = [];
    for (const u of [0.05, 0.5, 0.95]) {
      await page.evaluate((v) => window.scrollTo(0, window.__inspyxFilm.callScroll(v)), u);
      await page.waitForTimeout(250);
      seen.push(await page.evaluate(() => window.__inspyxFilm._callU + ':' + window.__inspyxFilm._callLive.length));
    }
    ok('motion off: the call is a row of stills, one piece at a time', JSON.stringify(seen) === JSON.stringify(['0.09:1', '0.47:2', '1:2']) && errs.length === 0, seen.join(', '));
    await ctx.close();
  }

  // ---- the two requests in the Spex Business scene
  {
    const { ctx, page, errs } = await open(browser, {});
    const w = await page.evaluate(() => { const d = window.__inspyxFilm._desk; return { say: d.say.map((l) => l.who + ' / ' + l.label + ': ' + l.text), rows: d.rows.map((r) => r.when + ' / ' + r.from), title: d.title, count: d.count, text: document.querySelector('[data-desk]').textContent.replace(/\s+/g, ' ').trim() }; });
    ok('the Spex Business scene: two requests, two replies and three calendar lines, read from the page\'s own words',
      w.say.length === 4 && w.say[0] === 'mail / Email from Dana, an agent: Can you inspect 412 Palm Ave on Friday afternoon?' && w.say[1] === 'biz / Spex Business replied: Friday at 2:00 PM is open. The inspection is $425.'
      && w.say[2] === 'form / Your website form, from Marcus: I need a pre-listing inspection early next week.' && w.say[3] === 'biz / Spex Business replied: Monday at 10:00 AM is open. The inspection is $375.'
      && JSON.stringify(w.rows) === JSON.stringify(['Tomorrow, 9:00 AM / Phone', 'Friday, 2:00 PM / Email', 'Monday, 10:00 AM / Website']) && w.title === 'Your calendar' && w.count === 'booked', w.say.join(' | ') + ' || ' + w.rows.join(' | '));
    ok('the same story is in the page as text, for people who can\'t see the film', /An email from Dana, an agent: Can you inspect 412 Palm Ave on Friday afternoon\? Spex Business replies: Friday at 2:00 PM is open\./.test(w.text) && /Booked on your calendar: Monday at 10:00 AM\./.test(w.text), w.text.slice(0, 120));
    const at = async (u) => { await page.evaluate((v) => window.scrollTo(0, window.__inspyxFilm.deskScroll(v)), u); await page.waitForTimeout(250); return page.evaluate(() => window.__inspyxFilm._deskLive.join(' | ')); };
    const a = await at(0.12), b = await at(0.27), c = await at(0.42), d = await at(0.6), e = await at(1);
    const Q1 = '\u201CCan you inspect 412 Palm Ave on Friday afternoon?\u201D', R1 = '\u201CFriday at 2:00 PM is open. The inspection is $425.\u201D';
    const Q2 = '\u201CI need a pre-listing inspection early next week.\u201D', R2 = '\u201CMonday at 10:00 AM is open. The inspection is $375.\u201D';
    ok('scrolling: the email comes in with one job on the calendar, and Spex Business replies', a === Q1 + ' | Tomorrow, 9:00 AM' && b === Q1 + ' | ' + R1 + ' | Tomorrow, 9:00 AM' && errs.length === 0, [a, b].join(' || '));
    ok('then the job is on the calendar, and the website form comes in', c === Q1 + ' | ' + R1 + ' | Tomorrow, 9:00 AM | Friday, 2:00 PM' && d === Q2 + ' | Tomorrow, 9:00 AM | Friday, 2:00 PM', [c, d].join(' || '));
    ok('it ends with three jobs on the calendar', e === Q2 + ' | ' + R2 + ' | Tomorrow, 9:00 AM | Friday, 2:00 PM | Monday, 10:00 AM', e);
    const T = await page.evaluate(() => { const f = window.__inspyxFilm; return [Math.round(f._lastT * 1000) / 1000, f._deskU, f._talkU]; });
    ok('the film\'s clock waits while the requests come in, and runs on afterwards', T[1] === 1 && T[0] > 2.65 && T[0] < 3 && T[2] === 0, T.join(', '));
    await ctx.close();
  }
  {
    // a phone with its browser bars showing: the reply takes the request's place, and the calendar stays
    const { ctx, page, errs } = await open(browser, { w: 390, h: 664 });
    const at = async (u) => { await page.evaluate((v) => window.scrollTo(0, window.__inspyxFilm.deskScroll(v)), u); await page.waitForTimeout(250); return page.evaluate(() => window.__inspyxFilm._deskLive.length + ':' + window.__inspyxFilm._deskLive[0].slice(1, 7)); };
    const seen = [await at(0.12), await at(0.27), await at(1)];
    ok('a shorter phone: one card at a time above the calendar', JSON.stringify(seen) === JSON.stringify(['2:Can yo', '2:Friday', '4:Monday']) && errs.length === 0, seen.join(', '));
    await ctx.close();
  }
  {
    // a small phone: once a job is booked, the calendar moves up and shows every line
    const { ctx, page, errs } = await open(browser, { w: 320, h: 568 });
    await page.evaluate(() => window.scrollTo(0, window.__inspyxFilm.deskScroll(1)));
    await page.waitForTimeout(250);
    const live = await page.evaluate(() => window.__inspyxFilm._deskLive.join(' | '));
    ok('a small phone: it ends on the calendar alone, with all three jobs', live === 'Tomorrow, 9:00 AM | Friday, 2:00 PM | Monday, 10:00 AM' && errs.length === 0, live);
    await ctx.close();
  }
  {
    const { ctx, page, errs } = await open(browser, { still: true });
    const seen = [];
    for (const u of [0.05, 0.5, 0.95]) {
      await page.evaluate((v) => window.scrollTo(0, window.__inspyxFilm.deskScroll(v)), u);
      await page.waitForTimeout(250);
      seen.push(await page.evaluate(() => window.__inspyxFilm._deskU + ':' + window.__inspyxFilm._deskLive.length));
    }
    ok('motion off: the requests are a row of stills, one piece at a time', JSON.stringify(seen) === JSON.stringify(['0.12:2', '0.6:3', '1:5']) && errs.length === 0, seen.join(', '));
    await ctx.close();
  }

  // ---- the conversation in the Spex scene
  {
    const { ctx, page, errs } = await open(browser, {});
    const w = await page.evaluate(() => { const f = window.__inspyxFilm; return { say: f._say.map((l) => l.label + ': ' + l.text), filed: f._filed, text: document.querySelector('[data-talk]').textContent.replace(/\s+/g, ' ').trim() }; });
    ok('the Spex scene: six lines of conversation and the "filed" card, read from the page\'s own words', w.say.length === 6 && w.say[0] === 'You: Spex, take a photo of that breaker.' && w.say[1] === 'Spex: Camera open.' && w.say[4] === 'You: Take it.' && w.say[5] === 'Spex: Got it.' && w.filed && w.filed[0] === 'Filed under Electrical', w.say.join(' | '));
    ok('the same conversation is in the page as text, for people who can\'t see the film', /You: Spex, take a photo of that breaker\. Spex: Camera open\./.test(w.text) && /Filed under Electrical\./.test(w.text), w.text.slice(0, 110));
    const at = async (u) => { await page.evaluate((v) => window.scrollTo(0, window.__inspyxFilm.talkScroll(v)), u); await page.waitForTimeout(250); return page.evaluate(() => window.__inspyxFilm._talkLive.join(' | ')); };
    const a = await at(0.12), b = await at(0.27), c = await at(0.6), d = await at(1);
    ok('scrolling: he speaks, then Spex answers, each time', a === '\u201CSpex, take a photo of that breaker.\u201D' && b === a + ' | \u201CCamera open.\u201D' && c === '\u201CSpex, put the flash on, put the light on, and zoom in 4\u00D7.\u201D | \u201CFlash on, light on, 4\u00D7.\u201D' && errs.length === 0, [a, b, c].join(' || '));
    ok('it ends with the photo taken and filed', d === '\u201CTake it.\u201D | \u201CGot it.\u201D | Filed under Electrical', d);
    const T = await page.evaluate(() => { const f = window.__inspyxFilm; return [Math.round(f._lastT * 1000) / 1000, f._talkU]; });
    ok('the film\'s clock waits while they talk, and runs on afterwards', T[1] === 1 && T[0] > 3.56 && T[0] < 4, T.join(', '));
    await ctx.close();
  }
  {
    const { ctx, page, errs } = await open(browser, { still: true });
    const seen = [];
    for (const u of [0.05, 0.5, 0.95]) {
      await page.evaluate((v) => window.scrollTo(0, window.__inspyxFilm.talkScroll(v)), u);
      await page.waitForTimeout(250);
      seen.push(await page.evaluate(() => window.__inspyxFilm._talkU + ':' + window.__inspyxFilm._talkLive.length));
    }
    ok('motion off: the conversation is a row of stills, one line at a time', JSON.stringify(seen) === JSON.stringify(['0.12:1', '0.6:2', '1:3']) && errs.length === 0, seen.join(', '));
    await ctx.close();
  }

  // ---- a very tall window (a large monitor, or one turned upright): each sequence still plays out inside its own stretch
  for (const [w, h] of [[1600, 1900], [1200, 2300]]) {
    const { ctx, page, errs } = await open(browser, { w, h, desktop: true });
    const seen = [];
    for (const [n, live] of [[1, '_callLive'], [2, '_deskLive'], [3, '_talkLive']]) {
      seen.push(await page.evaluate(async ([n, live]) => {
        const f = window.__inspyxFilm, s = f._scn.find((x) => x.n === n), sp = f._seqSpan(n, f._V, s.h), out = [];
        for (const u of [0, 0.5, 1]) { window.scrollTo(0, f.seqScroll(n, u)); await new Promise((r) => setTimeout(r, 250)); out.push(f[live].length); }
        return { n, inside: sp[0] >= 0 && sp[1] <= s.h - 149, long: Math.round(sp[1] - sp[0]), T: Math.round(f._lastT * 100) / 100, shown: out.join('') };
      }, [n, live]));
    }
    // how many pieces show at the start, the middle and the end: the call (nothing, a question with its answer, Mia's last words with the job),
    // the requests (the calendar's first line, two lines, both cards with three lines), the conversation (nothing, two lines, two lines with the card)
    const want = ['022', '125', '023'];
    ok(w + ' x ' + h + ': each sequence plays from its start to its end inside its own stretch of page', seen.every((r, i) => r.inside && r.long >= 900 && r.T < r.n + 1 && r.shown === want[i]) && errs.length === 0, JSON.stringify(seen));
    await ctx.close();
  }

  // ---- between the two: a tablet held upright, or a narrow window
  {
    const { ctx, page, errs } = await open(browser, { w: 768, h: 1024 });
    const r = await page.evaluate(() => {
      const edge = (s) => { const b = document.querySelector(s).getBoundingClientRect(); return Math.round(b.left) + '-' + Math.round(b.right); };
      return { film: edge('.film'), sheet: edge('.sheet'), wait: edge('.wait'), foot: edge('.foot'), sw: document.documentElement.scrollWidth, pos: getComputedStyle(document.querySelector('.film')).position };
    });
    ok('tablet: the film, the report sheet, the waitlist and the footer share one centred column', r.pos === 'fixed' && r.film === '124-644' && r.sheet === r.film && r.wait === r.film && r.foot === r.film && r.sw === 768 && errs.length === 0, JSON.stringify(r));
    await ctx.close();
  }

  await browser.close();
  console.log(failed ? '\n' + failed + ' CHECK(S) FAILED' : '\nall checks passed');
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
