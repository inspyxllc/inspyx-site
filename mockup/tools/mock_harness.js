// Local test harness for the mock-up artboard.
// It renders the .dc.html with a tiny stand-in for the canvas runtime (holes,
// sc-if, events, refs) so the drawing and layout can be checked in Chromium.
//
// usage: node mock_harness.js <Main.dc.html> <uploadsDir> <outDir> [width height dsf] [-- scrollTops...]
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const [dcPath, uploadsDir, outDir] = process.argv.slice(2, 5);
const rest = process.argv.slice(5);
const dash = rest.indexOf('--');
const dims = (dash >= 0 ? rest.slice(0, dash) : rest).map(Number);
const W = dims[0] || 390, H = dims[1] || 844, DSF = dims[2] || 1;
const tops = dash >= 0 ? rest.slice(dash + 1) : [];

const src = fs.readFileSync(dcPath, 'utf8');
const xdc = /<x-dc>([\s\S]*?)<\/x-dc>/.exec(src)[1];
const helmet = (/<helmet>([\s\S]*?)<\/helmet>/.exec(xdc) || [, ''])[1];
let markup = xdc.replace(/<helmet>[\s\S]*?<\/helmet>/, '');
const sm = /<script type="text\/x-dc" data-dc-script data-props='([^']*)'>([\s\S]*?)<\/script>/.exec(src);
if (!sm) throw new Error('logic script not found');
const dataProps = sm[1], logic = sm[2];
const blobs = { REPORT_COVER: 'inspyx-report-cover.jpg', REPORT_FINDINGS: 'inspyx-report-findings.jpg', REPORT_PHOTOS: 'inspyx-report-photos.jpg', '4c8f62b40e278f5e8890eb4cf81b3126': 'inspyx-report-cover.jpg', '767697cf89e79153a162fb68757116c6': 'inspyx-report-findings.jpg', 'd07aedecfc6b0871dd703949cf3d7564': 'inspyx-report-photos.jpg' };
markup = markup.replace(/\/_blob\/([A-Za-z0-9_]+)/g, (m, id) => blobs[id] ? 'file://' + path.join(uploadsDir, blobs[id]) : m);

const runtime = `
(function () {
  const props = JSON.parse(document.getElementById('dp').textContent);
  const p = {};
  for (const k in props) if (k[0] !== '$' && props[k] && 'default' in props[k]) p[k] = props[k].default;
  Object.assign(p, window.__props || {});
  const comp = new Component(p);
  comp.props = p;
  window.__comp = comp;
  const mount = document.getElementById('mount');
  mount.appendChild(document.getElementById('tpl').content.cloneNode(true));
  let vals = comp.renderVals();
  const ups = [];
  const get = (pth) => { pth = pth.trim(); if (pth === 'true') return true; if (pth === 'false') return false; return pth.split('.').reduce((o, k) => (o == null ? undefined : o[k]), vals); };
  const WHOLE = /^\\s*\\{\\{\\s*([^}]+?)\\s*\\}\\}\\s*$/;
  const sub = (s) => s.replace(/\\{\\{\\s*([^}]+?)\\s*\\}\\}/g, (_, q) => { const v = get(q); if (v === undefined) console.error('unbound hole: ' + q); return v == null ? '' : String(v); });
  const has = (s) => s.indexOf('{{') >= 0;
  const walk = (node) => {
    if (node.nodeType === 3) { const s = node.nodeValue; if (has(s)) ups.push(() => { node.nodeValue = sub(s); }); return; }
    if (node.nodeType !== 1) return;
    const tag = node.tagName.toLowerCase();
    if (tag === 'sc-if') {
      const m = WHOLE.exec(node.getAttribute('value') || '');
      const span = document.createElement('span');
      while (node.firstChild) span.appendChild(node.firstChild);
      node.replaceWith(span);
      const q = m ? m[1] : 'false';
      ups.push(() => { const v = get(q); if (v === undefined) console.error('unbound sc-if: ' + q); span.style.display = v ? 'contents' : 'none'; });
      Array.from(span.childNodes).forEach(walk);
      return;
    }
    for (const attr of Array.from(node.attributes)) {
      const name = attr.name, val = attr.value, m = WHOLE.exec(val);
      if (/^on[a-z]/.test(name) && m) {
        node.removeAttribute(name);
        node.addEventListener(name.slice(2), (e) => { const fn = get(m[1]); if (typeof fn === 'function') fn(e); else console.error('handler missing: ' + m[1]); });
        continue;
      }
      if (name === 'ref' && m) { node.removeAttribute(name); const fn = get(m[1]); if (typeof fn === 'function') fn(node); else console.error('ref missing: ' + m[1]); continue; }
      if (has(val)) ups.push(() => { if (m) { const v = get(m[1]); if (v === undefined) console.error('unbound attr: ' + m[1]); if (v == null) node.removeAttribute(name); else node.setAttribute(name, String(v)); } else node.setAttribute(name, sub(val)); });
    }
    Array.from(node.childNodes).forEach(walk);
  };
  Array.from(mount.childNodes).forEach(walk);
  comp.__update = () => { vals = comp.renderVals(); ups.forEach((u) => u()); };
  comp.__update();
  if (comp.componentDidMount) comp.componentDidMount();
})();
`;

const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
${helmet.replace(/<link[^>]*>/g, '')}
</head><body>
<div id="mount"></div>
<template id="tpl">${markup}</template>
<script type="application/json" id="dp">${dataProps}</script>
<script>
class DCLogic {
  constructor(props) { this.props = props || {}; }
  setState(s) { this.state = Object.assign({}, this.state, typeof s === 'function' ? s(this.state) : s); if (this.__update) this.__update(); }
  forceUpdate() { if (this.__update) this.__update(); }
}
</script>
<script>${logic}</script>
<script>${runtime}</script>
</body></html>`;

fs.mkdirSync(outDir, { recursive: true });
const testHtml = path.join(outDir, 'test.html');
fs.writeFileSync(testHtml, html);

(async () => {
  const browser = await chromium.launch();
  const ctxOpts = { viewport: { width: W, height: H }, deviceScaleFactor: DSF };
  if (process.env.REDUCED) ctxOpts.reducedMotion = 'reduce';
  const context = await browser.newContext(ctxOpts);
  const page = await context.newPage();
  if (process.env.PROPS) await page.addInitScript((p) => { window.__props = JSON.parse(p); }, process.env.PROPS);
  const errs = [];
  page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') errs.push(m.type() + ': ' + m.text()); });
  page.on('pageerror', (e) => errs.push('pageerror: ' + e.message));
  await page.goto('file://' + testHtml);
  await page.waitForTimeout(500);
  const info = await page.evaluate(() => {
    const sc = document.querySelector('[data-scroller]');
    const secs = Array.from(sc.querySelectorAll('[data-scene]')).map((e) => [e.getAttribute('data-scene'), e.offsetTop, e.offsetHeight]);
    const cards = Array.from(sc.querySelectorAll('[data-scene] > div')).map((e) => e.offsetHeight);
    return { scrollHeight: sc.scrollHeight, clientHeight: sc.clientHeight, secs, cards, docW: document.documentElement.scrollWidth, scW: sc.scrollWidth, scCW: sc.clientWidth };
  });
  console.log(JSON.stringify(info));
  for (const tp of tops) {
    const v = tp === 'end' ? 1e9 : Number(tp);
    await page.evaluate((y) => { document.querySelector('[data-scroller]').scrollTo({ top: y, behavior: 'instant' }); }, v);
    await page.waitForTimeout(260);
    await page.screenshot({ path: path.join(outDir, 'shot-' + String(tp).padStart(5, '0') + '.png') });
  }
  if (process.env.INTERACT) {
    await page.evaluate(() => { document.querySelector('[data-scroller]').scrollTo({ top: 1e9, behavior: 'instant' }); });
    await page.waitForTimeout(200);
    await page.click('button[aria-label="More inspections a week"]');
    await page.click('button[aria-label="More hours per report"]');
    await page.click('button[aria-label="Lower average fee"]');
    const calc = await page.evaluate(() => Array.from(document.querySelectorAll('[data-scroller] span, [data-scroller] div')).filter((e) => e.children.length === 0 && /^(\$?[\d,.]+)$/.test(e.textContent.trim())).map((e) => e.textContent.trim()));
    console.log('calc values: ' + JSON.stringify(calc));
    await page.click('text=Team owner');
    await page.click('text=Spectora');
    await page.click('#waitlist button:has-text("Join the waitlist")');
    await page.waitForTimeout(150);
    const err1 = await page.evaluate(() => { const e = document.querySelector('[role=alert]'); return e ? getComputedStyle(e.parentElement).display : 'no alert node'; });
    console.log('empty submit, error visible: ' + err1);
    await page.screenshot({ path: path.join(outDir, 'state-error.png') });
    await page.fill('#ix-email', 'inspector@example.com');
    await page.click('#waitlist button:has-text("Join the waitlist")');
    await page.waitForTimeout(150);
    const pressed = await page.evaluate(() => Array.from(document.querySelectorAll('.ix-pill')).map((b) => b.textContent.trim() + '=' + b.getAttribute('aria-pressed')));
    console.log('pills: ' + pressed.join(', '));
    await page.evaluate(() => { document.querySelector('#waitlist').scrollIntoView({ behavior: 'instant' }); });
    await page.waitForTimeout(200);
    await page.screenshot({ path: path.join(outDir, 'state-joined.png') });
  }
  console.log(errs.length ? 'ISSUES:\n' + errs.slice(0, 20).join('\n') : 'no console errors');
  await browser.close();
})().catch((e) => { console.error(e); process.exit(1); });
