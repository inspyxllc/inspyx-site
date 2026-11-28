// Hidden is hidden, on every page: nothing marked hidden (the attribute, on it or on a parent) is drawn once the page
// has loaded and its scripts have run. A rule that lays an element out (display:flex, block…) beats the browser's own
// rule for hidden, so a page that hides its parts until they're wanted would show them all at once: page.css and
// app.css each end that with [hidden]{display:none !important}. This looks at what the browser draws, never at the
// attribute alone, so a page with a stylesheet of its own is held to it too.
// usage: node tools/serve.js &   then   node tools/check_hidden.js
//        (served somewhere else: URL=http://localhost:4391/ node tools/check_hidden.js)
const playwright = require('playwright');
const fs = require('fs');
const path = require('path');

const url = process.env.URL || 'http://localhost:4173/';
const root = path.join(__dirname, '..', 'coming-soon');
const PAGES = fs.readdirSync(root).filter((f) => f.endsWith('.html')).map((f) => f.replace(/\.html$/, '')).sort();
let failed = 0;
const ok = (name, cond, extra) => { if (!cond) failed++; console.log((cond ? 'PASS  ' : 'FAIL  ') + name + (extra ? '  [' + extra + ']' : '')); };

(async () => {
  const browser = await playwright.chromium.launch();
  try {
    for (const name of PAGES) {
      const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
      const page = await ctx.newPage();
      // Nothing leaves this machine: every request to another host is refused.
      await page.route(/^(?!http:\/\/localhost)/, (r) => r.abort());
      try {
        await page.goto(url + (name === 'index' ? '' : name), { waitUntil: 'load' });
        await page.waitForTimeout(400);
        const drawn = await page.evaluate(() =>
          [...document.querySelectorAll('[hidden]')]
            .filter((e) => e.getClientRects().length > 0)
            .map((e) => e.tagName.toLowerCase() + (e.className && typeof e.className === 'string' ? '.' + e.className.trim().split(/\s+/).join('.') : '') +
              [...e.attributes].filter((a) => a.name.startsWith('data-')).map((a) => '[' + a.name + (a.value ? '=' + a.value : '') + ']').join('')));
        ok(name + ': nothing marked hidden is drawn', drawn.length === 0, drawn.slice(0, 6).join(' '));
      } catch (e) {
        ok(name + ': the page loads', false, String(e.message || e).slice(0, 120));
      }
      await ctx.close();
    }
  } finally {
    await browser.close();
  }
  console.log(failed ? '\n' + failed + ' CHECK(S) FAILED' : '\nall checks passed');
  process.exit(failed ? 1 : 0);
})();
