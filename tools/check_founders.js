// Self-checks for the founders page, /founders (2026-11-13). Its words are Moises's, approved that day ("Yes, as is"):
// a change here needs his word too. usage: node tools/serve.js &   then   node tools/check_founders.js
const playwright = require('playwright');
const engine = process.env.BROWSER === 'webkit' ? playwright.webkit : playwright.chromium;
const url = process.env.URL || 'http://localhost:4173/';
const HOME = new URL(url).origin;
const WORDS = [
  'h1: Founding inspectors',
  'p: The first 10 inspectors who help us measure Inspyx become founders.',
  'h2: What you get',
  'li: 30 days free, starting the day the app is ready to download.',
  'li: The founding price: $69 a month, or $649 a year, instead of $79.95 a month. It stays yours for as long as your plan continues.',
  'h2: What we ask',
  'li: Share your app numbers: how many inspections you do, how long you’re on site, and how long each report takes. Never your clients’ names, addresses or reports.',
  'li: If a founder stops sharing, the founding price ends at the next renewal. We’ll email you before that happens, and the place goes to the next inspector who ticks the box.',
];
let failed = 0;
const ok = (name, cond, extra) => { if (!cond) failed++; console.log((cond ? 'PASS  ' : 'FAIL  ') + name + (extra ? '  [' + extra + ']' : '')); };
(async () => {
  const browser = await engine.launch();
  console.log('browser: ' + engine.name() + ' ' + browser.version());
  for (const w of [390, 1280]) {
    const ctx = await browser.newContext({ viewport: { width: w, height: 900 } });
    const page = await ctx.newPage(); const errs = [], away = [];
    page.on('pageerror', (e) => errs.push(e.message));
    await page.route((u) => !u.href.startsWith(HOME) && !u.href.startsWith('data:'), (r) => { away.push(r.request().url()); return r.abort(); });
    const res = await page.goto(url + 'founders', { waitUntil: 'load' });
    await page.waitForTimeout(300);
    const r = await page.evaluate(() => {
      const flat = (t) => t.replace(/\s+/g, ' ').trim();
      const words = [...document.querySelectorAll('main h1, main .title p, main article h2, main article li, main article p')].map((e) => e.tagName.toLowerCase() + ': ' + flat(e.textContent));
      return { words, sw: document.documentElement.scrollWidth, robots: (document.querySelector('meta[name=robots]') || {}).content, foot: [...document.querySelectorAll('footer nav a')].map((a) => a.getAttribute('href')).join(','), h1: document.querySelectorAll('h1').length };
    });
    ok(w + ' wide: opens (200), no errors, asks no other site for anything', res.status() === 200 && errs.length === 0 && away.length === 0, errs.concat(away).join(' | '));
    ok(w + ' wide: its words are his approved ones, word for word', JSON.stringify(r.words) === JSON.stringify(WORDS), JSON.stringify(r.words.filter((x, i) => x !== WORDS[i]).slice(0, 2)));
    ok(w + ' wide: kept out of search until sign-up opens, one heading, the six footer pages, nothing scrolls sideways', r.robots === 'noindex' && r.h1 === 1 && r.foot === '/about,/support,/pricing,/refunds,/terms,/privacy' && r.sw <= w, JSON.stringify([r.robots, r.foot, r.sw]));
    await ctx.close();
  }
  await browser.close();
  console.log(failed ? failed + ' FAILED' : 'all founders checks passed');
  process.exit(failed ? 1 : 0);
})();
