// One local look at the stand-alone page: phone-size screenshots plus the taps a visitor would make.
// usage: node test_standalone.js <test.html> <outDir> <width> <height>
const path = require('path');
const fs = require('fs');
const { chromium } = require('playwright');

const [htmlPath, outDir, w, h] = process.argv.slice(2);
const W = Number(w) || 390, H = Number(h) || 700;

(async () => {
  fs.mkdirSync(outDir, { recursive: true });
  const browser = await chromium.launch();
  const context = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 1, hasTouch: true, isMobile: true });
  const page = await context.newPage();
  const errs = [];
  page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') errs.push(m.type() + ': ' + m.text()); });
  page.on('pageerror', (e) => errs.push('pageerror: ' + e.message));
  await page.goto('file://' + htmlPath);
  await page.waitForTimeout(600);
  const sc = '[data-scroller]';
  const info = await page.evaluate(() => {
    const s = document.querySelector('[data-scroller]');
    return {
      docW: document.documentElement.scrollWidth, docH: document.documentElement.scrollHeight, winH: window.innerHeight,
      scrollerH: s.clientHeight, scrollH: s.scrollHeight, scW: s.scrollWidth, scCW: s.clientWidth,
      heroH: document.querySelector('[data-scene="0"]').offsetHeight,
      rawHoles: document.getElementById('mount').innerText.indexOf('{{') >= 0,
      h1s: Array.from(document.querySelectorAll('h1')).filter((e) => e.offsetParent !== null).map((e) => e.textContent)
    };
  });
  console.log(JSON.stringify(info));
  const shot = async (name) => { await page.waitForTimeout(280); await page.screenshot({ path: path.join(outDir, name + '.png') }); };
  const to = async (y) => page.evaluate((v) => document.querySelector('[data-scroller]').scrollTo({ top: v, behavior: 'instant' }), y);
  await shot('01-top');
  await to(H + 420); await shot('02-mia');
  await to(H + 1300 + 430); await shot('03-office');
  await to(H + 2600 + 420); await shot('04-spex');
  await to(H + 3900 + 430); await shot('05-report');
  await to(H + 5200 - 250); await shot('06-pages');
  // the header button should bring the waitlist heading into view, clear of the header
  await to(0);
  await page.tap('a:has-text("Join the waitlist") >> nth=0');
  await page.waitForTimeout(2600);
  const head = await page.evaluate(() => {
    const r = document.querySelector('#waitlist h2').getBoundingClientRect();
    return { top: Math.round(r.top), bottom: Math.round(r.bottom), scrollTop: Math.round(document.querySelector('[data-scroller]').scrollTop) };
  });
  console.log('after tapping the header button, waitlist heading at ' + JSON.stringify(head));
  await shot('07-waitlist');
  await page.tap('.ix-pill:has-text("Solo inspector")');
  await page.tap('.ix-pill:has-text("Spectora")');
  await page.tap('#waitlist button:has-text("Join the waitlist")');
  await page.waitForTimeout(150);
  console.log('empty email shows the error: ' + await page.evaluate(() => { const e = document.querySelector('[role=alert]'); return !!e && getComputedStyle(e.parentElement).display !== 'none'; }));
  await page.fill('#ix-email', 'inspector@example.com');
  await page.tap('#waitlist button:has-text("Join the waitlist")');
  await page.waitForTimeout(150);
  console.log('joined card shows: ' + await page.evaluate(() => { const e = document.querySelector('[role=status]'); return !!e && e.offsetParent !== null; }));
  await page.tap('button[aria-label="More inspections a week"]');
  console.log('calculator after one tap: ' + await page.evaluate(() => Array.from(document.querySelectorAll('[data-scroller] div')).filter((e) => e.children.length === 0 && /^(\$?[\d,.]+)$/.test(e.textContent.trim())).map((e) => e.textContent.trim()).join(' / ')));
  console.log('outside links open in a new tab: ' + await page.evaluate(() => Array.from(document.querySelectorAll('a[href^="https://"]')).every((a) => a.target === '_blank')));
  console.log(errs.length ? 'ISSUES:\n' + errs.slice(0, 20).join('\n') : 'no console errors');
  await browser.close();
})().catch((e) => { console.error(e); process.exit(1); });
