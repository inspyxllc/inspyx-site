// Self-checks for the public pages' security rule (vercel.json, 2026-11-17): each page is served with the headers
// its rule names, and runs under it with nothing refused. A refused script, style sheet, picture or call shows as a
// "securitypolicyviolation" event in the page, and fails here: so a rule too tight for its page, or a page that
// grew something its rule doesn't allow, is caught before it is published.
// Also: the home page's early script (assets/home-early.js) still does its two jobs; the waitlist's call still
// leaves (answered here: no sign-up is ever sent); and no other site can show these pages in a frame.
// usage: node tools/serve.js &   then   node tools/check_headers.js
//        (the pages served somewhere else: URL=http://localhost:4174/ node tools/check_headers.js)
//        (in Safari's engine instead of Chrome's: BROWSER=webkit node tools/check_headers.js)
// tools/check_rules.js checks the same rules as Vercel reads them; this checks them as a browser lives under them.
const playwright = require('playwright');
const engine = process.env.BROWSER === 'webkit' ? playwright.webkit : playwright.chromium;

const url = process.env.URL || 'http://localhost:4173/';
let failed = 0;
const ok = (name, cond, extra) => { if (!cond) failed++; console.log((cond ? 'PASS  ' : 'FAIL  ') + name + (extra ? '  [' + extra + ']' : '')); };

const SUPA = 'https://btxlrfvqifnrnxffohsz.supabase.co';
// TRY SPEX (2026-11-23): the home page may also reach the Spex relay (its demo challenge and voice session), run
// the challenge's Web Worker from this site, and play media from this site.
const TRY_RELAY = 'chat---spex-relay-yu5bdad2fa-uc.a.run.app';
const HOME_CSP = "default-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self'; connect-src " + SUPA + " https://" + TRY_RELAY + " wss://" + TRY_RELAY + "; worker-src 'self'; media-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'";
const PAGE_CSP = "default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self' data:; base-uri 'none'; form-action 'none'; frame-ancestors 'none'";
const POLICY = ['about', 'founders', 'pricing', 'privacy', 'refunds', 'support', 'terms'];

// Every refusal the page reports, kept from before its first script runs.
const LISTEN = () => {
  window.__refused = [];
  document.addEventListener('securitypolicyviolation', (e) => {
    window.__refused.push(e.violatedDirective + ' ' + (e.blockedURI || '(written into the page)') + (e.sample ? ' "' + e.sample.slice(0, 40) + '"' : ''));
  });
};

async function open(browser, path, opts) {
  const o = opts || {};
  const ctx = await browser.newContext({ viewport: { width: o.w || 390, height: 844 } });
  const page = await ctx.newPage();
  const said = [], calls = [];
  page.on('console', (m) => { if (/content security policy|refused to/i.test(m.text())) said.push(m.text()); });
  await page.addInitScript(LISTEN);
  await page.route('**/rest/v1/rpc/join_waitlist', async (route) => {
    calls.push(route.request().url());
    return route.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: '"ok"' });
  });
  const res = await page.goto(url + path, { waitUntil: 'load' });
  return { ctx, page, res, said, calls };
}

// Down the whole page and back, so everything it draws on the way (the home page's scenes) is drawn.
async function walk(page) {
  await page.evaluate(async () => {
    const step = Math.max(200, Math.floor(innerHeight * 0.8));
    for (let y = 0; y < document.documentElement.scrollHeight; y += step) { scrollTo(0, y); await new Promise((r) => setTimeout(r, 60)); }
    scrollTo(0, 0);
  });
  await page.waitForTimeout(300);
}

(async () => {
  const browser = await engine.launch();
  console.log('browser: ' + engine.name() + ' ' + browser.version());

  // ---- each public page: its headers, and nothing refused while it loads and is scrolled through, phone and wide
  for (const [path, csp] of [['', HOME_CSP]].concat(POLICY.map((p) => [p, PAGE_CSP]))) {
    const name = '/' + path;
    for (const w of [390, 1280]) {
      const { ctx, page, res, said } = await open(browser, path, { w });
      const h = res.headers();
      if (w === 390) {
        ok(name + ': served with its rule', h['content-security-policy'] === csp, h['content-security-policy']);
        ok(name + ': nosniff, never in a frame, and the address alone sent to other sites', h['x-content-type-options'] === 'nosniff' && h['x-frame-options'] === 'DENY' && h['referrer-policy'] === 'strict-origin-when-cross-origin', [h['x-content-type-options'], h['x-frame-options'], h['referrer-policy']].join(' | '));
      }
      await walk(page);
      const refused = await page.evaluate(() => window.__refused);
      ok(name + ' at ' + w + ': nothing refused', refused.length === 0 && said.length === 0, refused.concat(said).join(' | '));
      await ctx.close();
    }
  }

  // ---- a wrong address and a file get the two headers every address gets, and no page's rule
  for (const path of ['no-such-page', 'assets/page.css', 'assets/home-early.js']) {
    const { ctx, res } = await open(browser, path);
    const h = res.headers();
    ok('/' + path + ': nosniff and never in a frame, and no page rule', h['x-content-type-options'] === 'nosniff' && h['x-frame-options'] === 'DENY' && !h['content-security-policy'], JSON.stringify([res.status(), h['x-content-type-options'], h['x-frame-options'], h['content-security-policy'] || null]));
    await ctx.close();
  }

  // ---- the home page's early script, from its own file now, still runs before the page is drawn
  for (const q of ['done', 'back', 'canceled']) {
    const { ctx, page } = await open(browser, '?billing=' + q);
    const s = await page.evaluate(() => ({ b: document.documentElement.getAttribute('data-billing'), site: getComputedStyle(document.querySelector('.site')).display, refused: window.__refused }));
    ok('?billing=' + q + ': the early script marks the page, so Stripe\'s return message shows in place of the home page', s.b === q && s.site === 'none' && s.refused.length === 0, JSON.stringify(s));
    await ctx.close();
  }
  {
    const { ctx, page } = await open(browser, '#waitlist');
    const s = await page.evaluate(() => ({ arrive: document.documentElement.hasAttribute('data-arrive'), refused: window.__refused }));
    ok('/#waitlist: the early script makes the page stand at the form at once', s.arrive && s.refused.length === 0, JSON.stringify(s));
    await page.waitForTimeout(700);
    ok('/#waitlist: and lets the page glide again once loaded', !(await page.evaluate(() => document.documentElement.hasAttribute('data-arrive'))));
    await ctx.close();
  }

  // ---- the waitlist's call still leaves, to Inspyx's server only (answered here)
  {
    const { ctx, page, calls, said } = await open(browser, '');
    await page.fill('[data-join] input[type=email]', 'checks@example.com');
    await page.evaluate(() => { const f = document.querySelector('[data-join]'); (f.requestSubmit ? f.requestSubmit() : f.submit()); });
    await page.waitForTimeout(800);
    const refused = await page.evaluate(() => window.__refused);
    ok('the waitlist form\'s call reaches Inspyx\'s server, and nothing is refused', calls.length === 1 && calls[0].startsWith(SUPA + '/rest/v1/rpc/join_waitlist') && refused.length === 0 && said.length === 0, JSON.stringify({ calls, refused, said }));
    await ctx.close();
  }

  // (Scripts off is not checked here: a browser driven by Playwright with scripts off still reads <noscript> as
  // text, so its style never applies, with or without a rule: tried on inspyx.com, 2026-11-17. The home page's
  // rule allows the style written into it ('unsafe-inline' for styles), which tools/check_rules.js checks.)

  // ---- no other site shows these pages in a frame
  {
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    const said = [];
    page.on('console', (m) => said.push(m.text()));
    await page.setContent('<iframe src="' + url + 'pricing" width="400" height="400"></iframe><iframe src="' + url + '" width="400" height="400"></iframe>');
    await page.waitForTimeout(1500);
    const inside = [];
    for (const f of page.frames().slice(1)) {
      try { inside.push(await f.evaluate(() => (document.body ? document.body.innerText : '').slice(0, 80))); } catch (e) { inside.push(''); }
    }
    ok('a page elsewhere that frames /pricing or the home page shows nothing of them', inside.every((t) => !/Inspyx|INSPYX|Pricing|price/.test(t)), JSON.stringify({ inside, said: said.slice(0, 2) }));
    await ctx.close();
  }

  await browser.close();
  console.log(failed ? '\n' + failed + ' CHECK(S) FAILED' : '\nall checks passed');
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
