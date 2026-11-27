// Self-checks for the pages' notices: a success ("Saved.", "Deleted.") never wears an error's red, and an error never a
// success's green (the rehearsal, 2026-11-26: /agreements said "Saved." in a red box). Every page that has notices is
// opened, every notice shown in turn, and its colours read as the browser draws them. Nothing reaches a server.
// usage: node tools/serve.js &   then   URL=http://localhost:4173/ node tools/check_say.js
const playwright = require('playwright');
const fs = require('fs');
const path = require('path');
const base = (process.env.URL || 'http://localhost:4173/').replace(/\/+$/, '');
let failed = 0;
const ok = (name, pass, detail) => { if (!pass) failed++; console.log((pass ? 'PASS  ' : 'FAIL  ') + name + (pass || detail === undefined ? '' : '  [' + detail + ']')); };
const SUCCESS = new Set(['saved', 'deleted']);
const ERROR = new Set(['failed', 'refused']);
const dir = path.join(__dirname, '../coming-soon');
const pages = fs.readdirSync(dir).filter((f) => f.endsWith('.html') && /data-say="/.test(fs.readFileSync(path.join(dir, f), 'utf8')));
(async () => {
  const browser = await playwright.chromium.launch();
  try {
    for (const file of pages) {
      const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
      await ctx.addInitScript(() => localStorage.setItem('inspyx.signin', JSON.stringify({ access: 'a', renew: 'r', ends: Date.now() + 3600e3, id: '11111111-1111-4111-8111-111111111111', email: 'dave@example.com' })));
      await ctx.route(/supabase\.co|stripe\.com/, (r) => r.abort('failed'));
      const page = await ctx.newPage();
      await page.goto(base + '/' + file.replace(/\.html$/, ''));
      await page.waitForTimeout(400);
      const seen = await page.evaluate(() => [...document.querySelectorAll('[data-say]')].map((p) => {
        const was = p.hidden; p.hidden = false;
        // Every container up the tree shown too, so the colours read are the drawn ones.
        const c = getComputedStyle(p); const out = [p.getAttribute('data-say'), c.backgroundColor, c.color];
        p.hidden = was; return out;
      }));
      // app.css's .say p (an error) and .say p.ok (a success), as drawn.
      const red = (bg) => bg === 'rgb(253, 236, 235)';
      const green = (bg) => bg === 'rgb(232, 244, 236)';
      for (const [say, bg, fg] of seen) {
        if (SUCCESS.has(say)) ok(file + ': "' + say + '" never in an error\'s red', !red(bg) && !/rgb\(140, 29, 24\)/.test(fg), bg + ' ' + fg);
        if (ERROR.has(say)) ok(file + ': "' + say + '" never in a success\'s green', !green(bg), bg);
      }
      await ctx.close();
    }
  } finally { await browser.close(); }
  console.log(failed === 0 ? 'all checks passed' : failed + ' CHECK(S) FAILED');
  process.exit(failed === 0 ? 0 : 1);
})();
