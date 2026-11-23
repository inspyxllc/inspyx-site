// Self-checks for the dashboard's navigation (2026-11-23, job 5, Inspyx 4): every signed-in page has it, its own item
// marked; a sidebar on a wide screen, a tab bar with More on a phone; nothing runs off the side; "Saved." in green.
// NOTHING REAL IS ASKED: the sign-in is a made-up one and every request that tries to leave the site is stopped.
// usage: node tools/serve.js &   then   node tools/check_dash_nav.js   (BROWSER=webkit for Safari's engine; SHOTS=<dir>)
const playwright = require('playwright');
const engine = process.env.BROWSER === 'webkit' ? playwright.webkit : playwright.chromium;
const url = (process.env.URL || 'http://localhost:4173/').replace(/\/?$/, '/');
const HOME = new URL(url).origin;
const SHOTS = process.env.SHOTS || '';
let failed = 0;
const ok = (name, cond, extra) => { if (!cond) failed++; console.log((cond ? 'PASS  ' : 'FAIL  ') + name + (extra ? '  [' + extra + ']' : '')); };
const kept = JSON.stringify({ access: 'test-access-1', renew: 'test-renew-1', ends: Date.now() + 3600e3, id: '11111111-1111-4111-8111-111111111111', email: 'pat@example.com' });

const ITEMS = ['/today', '/inspections', '/calendar', '/prices', '/booking', '/emails', '/payments', '/agreements', '/people', '/account'];
const LABELS = 'What needs you | Inspections | Calendar | Prices | Booking | Emails | Payments | Agreements | People | Account';
const PAGES = { today: '/today', inspections: '/inspections', calendar: '/calendar', prices: '/prices', booking: '/booking', emails: '/emails',
  payments: '/payments', agreements: '/agreements', people: '/people', account: '/account', numbers: null, reports: null, templates: null, profile: null };

async function open(browser, path, w) {
  const ctx = await browser.newContext({ viewport: { width: w, height: 860 }, locale: 'en-US' });
  await ctx.addInitScript((v) => { try { localStorage.setItem('inspyx.signin', v); } catch (e) { /* none */ } }, kept);
  const page = await ctx.newPage();
  page.setDefaultTimeout(8000);
  const errs = [];
  page.on('pageerror', (e) => errs.push(e.message));
  await page.route((u) => !u.href.startsWith(HOME), (r) => r.abort());
  await page.goto(url + path, { waitUntil: 'load' });
  await page.waitForTimeout(300);
  return { ctx, page, errs };
}

(async () => {
  const browser = await engine.launch();
  console.log('browser: ' + engine.name() + ' ' + browser.version());
  for (const [name, here] of Object.entries(PAGES)) {
    for (const w of [1280, 390]) {
      const { ctx, page, errs } = await open(browser, name, w);
      const v = await page.evaluate(() => {
        const nav = document.querySelector('body > nav.dash');
        const items = nav ? [...nav.querySelectorAll('.dash-items a')] : [];
        const shown = (e) => !!e && getComputedStyle(e).display !== 'none' && e.getClientRects().length > 0;
        return {
          nav: !!nav,
          hrefs: items.map((a) => a.getAttribute('href')),
          labels: items.map((a) => a.textContent.trim()).join(' | '),
          current: [...(nav ? nav.querySelectorAll('.dash-items [aria-current="page"]') : [])].map((a) => a.getAttribute('href')),
          visible: items.filter(shown).map((a) => a.getAttribute('href')),
          more: nav ? shown(nav.querySelector('.dash-more summary')) : false,
          sideways: document.documentElement.scrollWidth > window.innerWidth,
          rect: nav ? nav.getBoundingClientRect().toJSON() : null,
        };
      });
      const label = name + ' at ' + w;
      ok(label + ': the navigation, every item in order', v.nav && JSON.stringify(v.hrefs) === JSON.stringify(ITEMS) && v.labels === LABELS, v.labels);
      ok(label + ': its own item marked (or none for a page off the list)', JSON.stringify(v.current) === JSON.stringify(here ? [here] : []), JSON.stringify(v.current));
      if (w === 1280) ok(label + ': a sidebar down the left, all ten shown, no More', v.rect.left === 0 && v.rect.height >= 800 && v.visible.length === 10 && !v.more, JSON.stringify(v.rect));
      else ok(label + ': a tab bar along the bottom: four, then More', Math.round(v.rect.bottom) === 860 && JSON.stringify(v.visible) === JSON.stringify(ITEMS.slice(0, 4)) && v.more, JSON.stringify(v.visible));
      ok(label + ': nothing runs off the side', !v.sideways);
      ok(label + ': no errors', errs.length === 0, errs.join(' | '));
      await ctx.close();
    }
  }
  // On a phone, More holds the other six; on one of them, More is marked.
  {
    const { ctx, page } = await open(browser, 'payments', 390);
    ok('phone: More is marked on a page it holds', await page.getAttribute('.dash-more summary', 'aria-current') === 'page');
    await page.click('.dash-more summary');
    const more = await page.evaluate(() => [...document.querySelectorAll('.dash-more ul a')].filter((a) => a.getClientRects().length).map((a) => a.getAttribute('href')));
    ok('phone: More opens the other six', JSON.stringify(more) === JSON.stringify(ITEMS.slice(4)), JSON.stringify(more));
    if (SHOTS) await page.screenshot({ path: SHOTS + '/31-nav-phone-more.png' });
    await page.click('.dash-more ul a[href="/agreements"]');
    ok('phone: an item there opens its page', await page.waitForURL(/\/agreements$/).then(() => true, () => false));
    await ctx.close();
  }
  // The sidebar comes right after the logo for the Tab key; the page's own words after it.
  {
    const { ctx, page } = await open(browser, 'prices', 1280);
    const order = [];
    for (let i = 0; i < 3; i++) { await page.keyboard.press(engine.name() === 'webkit' ? 'Alt+Tab' : 'Tab'); order.push(await page.evaluate(() => (document.activeElement.getAttribute('aria-label') || document.activeElement.textContent || '').trim())); }
    ok('wide: Tab goes logo, then the sidebar', order[0] === 'Inspyx, home' && order[1] === 'What needs you' && order[2] === 'Inspections', JSON.stringify(order));
    if (SHOTS) await page.screenshot({ path: SHOTS + '/30-nav-wide.png' });
    await ctx.close();
  }
  // "Saved." in green, with a tick, wherever a page says it.
  for (const [path, sel] of [['prices', '[data-say="saved"]'], ['inspections', '[data-save="saved"]'], ['profile', '[data-psay="saved"]'], ['booking', '[data-say="saved"]']]) {
    const { ctx, page } = await open(browser, path, 1280);
    const c = await page.evaluate((q) => { const e = document.querySelector(q); e.hidden = false; let p = e.parentElement; while (p) { p.hidden = false; p = p.parentElement; } const s = getComputedStyle(e); return { color: s.color, tick: getComputedStyle(e, '::before').content }; }, sel);
    ok(path + ': "Saved." is green, with a tick', c.color === 'rgb(23, 146, 79)' && /✓/.test(c.tick), JSON.stringify(c));
    await ctx.close();
  }
  await browser.close();
  console.log(failed === 0 ? 'all checks passed' : failed + ' CHECK(S) FAILED');
  process.exit(failed === 0 ? 0 : 1);
})();
