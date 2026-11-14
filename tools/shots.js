// Takes pictures of the home page at chosen sizes and scroll positions, for looking at.
// usage: node tools/shots.js <outDir> <W> <H> [dsf] [--still] [--bars=N] -- <scrollTop or t:FILMTIME> ...
//   t:2.3 scrolls to film time 2.3 (1 is the top of the page, 5 is the end of the film)
//   call:0.5 scrolls to the middle of the phone call in Mia's scene (0 is its start, 1 its end)
//   talk:0.5 scrolls to the middle of the conversation in the Spex scene (0 is its start, 1 its end)
//   desk:0.5 scrolls to the middle of the two requests in the Spex Business scene (0 is the start, 1 the end)
//   --still   turns the visitor's "reduce motion" setting on
//   --bars=N  pretends a phone browser's bars take N pixels at first (the canvas is then taller than the screen you compose for)
// Needs the page served: node tools/serve.js
const path = require('path');
const fs = require('fs');
const { chromium } = require('playwright');

const args = process.argv.slice(2);
const cut = args.indexOf('--');
const head = cut < 0 ? args : args.slice(0, cut);
const stops = cut < 0 ? ['0'] : args.slice(cut + 1);
const flags = head.filter((a) => a.startsWith('--'));
const pos = head.filter((a) => !a.startsWith('--'));
const outDir = pos[0], W = parseInt(pos[1] || '390', 10), H = parseInt(pos[2] || '844', 10), dsf = parseFloat(pos[3] || '1');
const still = flags.includes('--still');
const bars = parseInt((flags.find((f) => f.startsWith('--bars=')) || '--bars=0').slice(7), 10);
const url = process.env.URL || 'http://localhost:4173/';

(async () => {
  fs.mkdirSync(outDir, { recursive: true });
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: dsf, hasTouch: W < 860, isMobile: W < 860, reducedMotion: still ? 'reduce' : 'no-preference' });
  // one fixed moment for the film's own clock, so two runs draw the same picture
  await ctx.addInitScript(() => {
    const raf = window.requestAnimationFrame.bind(window);
    window.requestAnimationFrame = (fn) => raf(() => fn(5000));
  });
  const page = await ctx.newPage();
  const errs = [];
  page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') errs.push(m.type() + ': ' + m.text()); });
  page.on('pageerror', (e) => errs.push('pageerror: ' + e.message));
  page.on('requestfailed', (r) => errs.push('failed: ' + r.url()));
  await page.goto(url, { waitUntil: 'load' });
  if (bars) await page.addStyleTag({ content: '.svh{height:calc(100vh - ' + bars + 'px) !important}.hero{min-height:calc(100vh - ' + bars + 'px) !important}' });
  await page.waitForTimeout(700);
  for (const s of stops) {
    const top = await page.evaluate((stop) => {
      let y = parseFloat(stop);
      if (stop.startsWith('talk:')) {
        // a point in the Spex scene's conversation: talk:0 is its start, talk:1 its end
        y = window.__inspyxFilm.talkScroll(parseFloat(stop.slice(5)));
      } else if (stop.startsWith('call:')) {
        // a point in the phone call in Mia's scene: call:0 is the start, call:1 the end
        y = window.__inspyxFilm.callScroll(parseFloat(stop.slice(5)));
      } else if (stop.startsWith('desk:')) {
        // a point in the Spex Business scene's two requests: desk:0 is the start, desk:1 the end
        y = window.__inspyxFilm.deskScroll(parseFloat(stop.slice(5)));
      } else if (stop.startsWith('t:')) {
        const T = parseFloat(stop.slice(2));
        const secs = Array.from(document.querySelectorAll('[data-scene]')).filter((e) => parseFloat(e.getAttribute('data-scene')) >= 1);
        const hero = document.querySelector('[data-scene="0"]');
        const n = Math.min(secs.length, Math.max(1, Math.floor(T)));
        const sec = secs[n - 1];
        const secTop = sec.getBoundingClientRect().top + window.pageYOffset;
        y = secTop + (T - n) * sec.offsetHeight - hero.offsetHeight;
      }
      document.documentElement.style.scrollBehavior = 'auto';
      window.scrollTo(0, y);
      return Math.round(window.pageYOffset);
    }, s);
    await page.waitForTimeout(420);
    const name = (s.startsWith('talk:') ? 'talk' + s.slice(5).replace('.', '_') : s.startsWith('desk:') ? 'desk' + s.slice(5).replace('.', '_') : s.startsWith('call:') ? 'call' + s.slice(5).replace('.', '_') : s.startsWith('t:') ? 'T' + s.slice(2).replace('.', '_') : 'y' + String(top).padStart(5, '0')) + '.png';
    await page.screenshot({ path: path.join(outDir, name) });
    console.log(name + '  scrollTop ' + top);
  }
  const wide = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, iw: window.innerWidth, h: document.documentElement.scrollHeight }));
  console.log('page ' + JSON.stringify(wide) + (wide.sw > wide.iw ? '  SIDEWAYS SCROLL' : ''));
  console.log(errs.length ? 'ISSUES:\n' + errs.join('\n') : 'no console errors');
  await browser.close();
})().catch((e) => { console.error(e); process.exit(1); });
