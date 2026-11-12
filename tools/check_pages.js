// Self-checks for the pricing and policy pages (/pricing, /refunds, /terms, /privacy) and the page a wrong address gets.
// Their LOOK may change; their WORDS may not, unless Moises says so. tools/page_words.json holds each page's approved
// words, links and head. These checks compare the served pages with it, then look at the layout on a phone and on a
// wide screen: the top links, tap sizes, sideways scroll, the pricing card, the policy pages' list of headings, motion off.
// usage: node tools/serve.js &   then   node tools/check_pages.js
//        (the pages served somewhere else: URL=http://localhost:4174/ node tools/check_pages.js)
//        node tools/check_pages.js --keep    writes tools/page_words.json from the served pages. Only after Moises has
//                                            approved a change of words: name his approval, with its date, in the commit.
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const url = process.env.URL || 'http://localhost:4173/';
const keep = process.argv.includes('--keep');
const FILE = path.join(__dirname, 'page_words.json');
const PAGES = ['pricing', 'refunds', 'terms', 'privacy', 'no-such-page'];   // the last is answered by 404.html
const POLICIES = ['refunds', 'terms', 'privacy'];
const NAV = [['/pricing', 'Pricing'], ['/refunds', 'Cancellation and refunds'], ['/terms', 'Terms'], ['/privacy', 'Privacy']];
// The two windows the pages are looked at in. Widths are compared with these numbers, never with the window's own
// report of itself: a phone's browser zooms out to fit a page that is too wide, and then says the window is that wide.
const PHONE = 390, WIDE = 1280;
let failed = 0;
const ok = (name, cond, extra) => { if (!cond) failed++; console.log((cond ? 'PASS  ' : 'FAIL  ') + name + (extra ? '  [' + extra + ']' : '')); };
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
// Where two lists first differ, for the message of a failed check.
const diff = (got, want) => {
  if (same(got, want)) return '';
  const n = Math.max(got.length, want.length);
  for (let i = 0; i < n; i++) if (got[i] !== want[i]) return 'line ' + (i + 1) + ' of ' + want.length + ': approved "' + String(want[i]).slice(0, 90) + '", served "' + String(got[i]).slice(0, 90) + '"';
  return '';
};
// One group of checks. A page so broken that its checks cannot even run has failed them: say so as a failed check,
// not as a crash (the undo checks count failed checks).
const group = async (label, fn) => { try { await fn(); } catch (e) { ok(label + ': these checks could not run', false, String((e && e.message) || e).split('\n')[0]); } };

// A page's words, links and head, read in the page. The pricing card's repeat of the plan (hidden from screen readers)
// and the policy pages' list of headings are left out: they are checked against the page's own words further down.
const read = () => {
  const flat = (t) => t.replace(/\s+/g, ' ').trim();
  const strip = (el) => { const c = el.cloneNode(true); c.querySelectorAll('[aria-hidden="true"], nav.toc').forEach((e) => e.remove()); return c; };
  const main = strip(document.querySelector('main')), foot = strip(document.querySelector('footer'));
  const SEL = 'h1, h2, h3, p, li, .badge, a.btn';
  const words = [...main.querySelectorAll(SEL)].filter((e) => !e.parentElement.closest(SEL)).map((e) => e.tagName.toLowerCase() + ': ' + flat(e.textContent));
  words.push('footer: ' + flat(foot.textContent));
  const links = [...main.querySelectorAll('a[href]'), ...foot.querySelectorAll('a[href]')].map((a) => a.getAttribute('href') + ' | ' + flat(a.textContent));
  const m = (sel, attr) => { const e = document.querySelector(sel); return e ? e.getAttribute(attr || 'content') : null; };
  const head = { title: document.title, description: m('meta[name=description]'), canonical: m('link[rel=canonical]', 'href'), robots: m('meta[name=robots]'),
    ogTitle: m('meta[property="og:title"]'), ogDescription: m('meta[property="og:description"]'), ogUrl: m('meta[property="og:url"]'), ogImage: m('meta[property="og:image"]'),
    card: m('meta[name="twitter:card"]'), lang: document.documentElement.lang };
  return { words, links, head };
};

async function open(browser, name, opts) {
  const o = opts || {};
  const ctx = await browser.newContext({ viewport: { width: o.w || PHONE, height: o.h || 844 }, deviceScaleFactor: 1, hasTouch: !o.desktop, isMobile: !o.desktop, reducedMotion: o.still ? 'reduce' : 'no-preference' });
  const page = await ctx.newPage();
  const errs = [], away = [];
  const home = new URL(url).origin;
  page.on('console', (m) => { if (m.type() === 'error' && !/404/.test(m.text())) errs.push(m.text()); });
  page.on('pageerror', (e) => errs.push('pageerror: ' + e.message));
  page.on('request', (r) => { const u = r.url(); if (!u.startsWith(home) && !u.startsWith('data:') && !u.startsWith('blob:')) away.push(u); });
  await page.goto(url + name, { waitUntil: 'load' });
  await page.addStyleTag({ content: 'html{scroll-behavior:auto !important}' });
  await page.waitForTimeout(400);
  return { ctx, page, errs, away };
}

(async () => {
  const browser = await chromium.launch();

  if (keep) {
    const out = { about: 'The approved words, links and head of the pricing and policy pages. Written by: node tools/check_pages.js --keep. Change it only with a change of words Moises approved.' };
    for (const name of PAGES) { const { ctx, page } = await open(browser, name); out[name] = await page.evaluate(read); await ctx.close(); console.log('kept  ' + name + ': ' + out[name].words.length + ' lines, ' + out[name].links.length + ' links'); }
    fs.writeFileSync(FILE, JSON.stringify(out, null, 1) + '\n');
    await browser.close();
    return;
  }

  const saved = JSON.parse(fs.readFileSync(FILE, 'utf8'));

  for (const name of PAGES) {
    const want = saved[name];
    const here = name === 'no-such-page' ? null : '/' + name;

    // ---- on a phone: the words, the links, the head, and the layout
    await group(name + ', phone', async () => {
      const { ctx, page, errs, away } = await open(browser, name);
      const got = await page.evaluate(read);
      ok(name + ': every word is the approved one', same(got.words, want.words), diff(got.words, want.words));
      ok(name + ': every link reads and goes as approved', same(got.links, want.links), diff(got.links, want.links));
      ok(name + ': title, description and link-preview tags are unchanged', same(got.head, want.head), same(got.head, want.head) ? '' : JSON.stringify(got.head));
      ok(name + ': loads with no errors, and asks no other site for anything', errs.length === 0 && away.length === 0, errs.concat(away).join(' | '));
      const r = await page.evaluate(() => {
        const box = (e) => { const b = e.getBoundingClientRect(); return { w: Math.round(b.width), h: Math.round(b.height) }; };
        const bar = document.querySelector('header');
        const logo = bar.querySelector('a[href="/"]');
        return {
          sw: document.documentElement.scrollWidth,
          logo: logo ? { name: logo.getAttribute('aria-label'), h: box(logo).h, mark: !!logo.querySelector('svg') } : null,
          nav: [...bar.querySelectorAll('nav a')].map((a) => box(a).h),
          footNav: [...document.querySelectorAll('footer nav a')].map((a) => [a.getAttribute('href'), a.textContent.trim()]),
          foot: [...document.querySelectorAll('footer a')].map((a) => box(a).h),
          btn: [...document.querySelectorAll('main a.btn')].map((a) => box(a).h),
          font: getComputedStyle(document.body).fontFamily, h1: document.querySelectorAll('h1').length
        };
      });
      ok(name + ': nothing scrolls sideways on a phone', r.sw <= PHONE, r.sw + ' wide in a ' + PHONE + ' window');
      ok(name + ', phone: the top keeps to the logo, and the footer has the four pages', !!r.logo && r.logo.name === 'Inspyx, home' && r.logo.mark && r.nav.length === 4 && r.nav.every((h) => h === 0) && same(r.footNav, NAV), JSON.stringify([r.logo, r.nav, r.footNav]));
      ok(name + ', phone: the logo, the buttons and the footer links are big enough to tap', r.logo && r.logo.h >= 44 && r.foot.length >= 6 && r.foot.every((h) => h >= 44) && r.btn.every((h) => h >= 44), JSON.stringify({ logo: r.logo && r.logo.h, foot: r.foot, btn: r.btn }));
      ok(name + ': the type is the home page\'s own (nothing is fetched for it), and there is one main heading', /^-apple-system/.test(r.font) && r.h1 === 1, r.font + ' / h1: ' + r.h1);
      await ctx.close();
    });

    // ---- on a wide screen: the same words, the four pages at the top, and nothing scrolls sideways
    await group(name + ', wide', async () => {
      const { ctx, page, errs } = await open(browser, name, { w: WIDE, h: 900, desktop: true });
      const got = await page.evaluate(read);
      const sw = await page.evaluate(() => document.documentElement.scrollWidth);
      ok(name + ': the same words on a wide screen, and nothing scrolls sideways', same(got.words, want.words) && sw <= WIDE && errs.length === 0, diff(got.words, want.words) || sw + ' wide in a ' + WIDE + ' window ' + errs.join(' | '));
      const nav = await page.evaluate(() => [...document.querySelectorAll('header nav a')].map((a) => ({ href: a.getAttribute('href'), text: a.textContent.trim(), cur: a.getAttribute('aria-current'), h: Math.round(a.getBoundingClientRect().height) })));
      const label = await page.evaluate(() => document.querySelector('header nav').getAttribute('aria-label'));
      ok(name + ', wide: the top has the four pages, this one marked, each big enough to tap', same(nav.map((a) => [a.href, a.text]), NAV) && nav.every((a) => (a.cur === 'page') === (a.href === here) && a.h >= 44) && !!label, JSON.stringify(nav));
      await ctx.close();
    });
  }

  // ---- the pricing page: the plan, and its card
  await group('pricing, phone', async () => {
    const { ctx, page } = await open(browser, 'pricing');
    const r = await page.evaluate(() => {
      const flat = (t) => t.replace(/\s+/g, ' ').trim();
      const h = (s) => Math.round(document.querySelector(s).getBoundingClientRect().height);
      const fs = (s) => parseFloat(getComputedStyle(document.querySelector(s)).fontSize);
      const art = document.querySelector('.hero-art');
      const card = art && art.querySelector('.card3d');
      const plan = (flat(document.querySelector('.plan').textContent) + ' INSPYX').toLowerCase();
      const said = art ? [...art.querySelectorAll('.face-top > span, .face-plan > span')].map((e) => flat(e.textContent)).filter(Boolean) : [];
      return { price: h('.price'), priceFs: fs('.price'), badge: h('.badge'), btn: h('.plan .btn'), hidden: !!art && art.getAttribute('aria-hidden') === 'true', said, stray: said.filter((t) => !plan.includes(t.toLowerCase())),
        cardR: card ? Math.round(card.getBoundingClientRect().right) : 0, cardL: card ? Math.round(card.getBoundingClientRect().left) : -1 };
    });
    ok('pricing, phone: the price, the plan\'s tag and its button each stay on one line', r.price < r.priceFs * 1.25 && r.badge <= 36 && r.btn <= 60, JSON.stringify({ price: r.price, type: r.priceFs, tag: r.badge, button: r.btn }));
    ok('pricing: the card repeats the plan, is hidden from screen readers, and says nothing the plan does not', r.hidden && r.said.length === 4 && r.said.includes('$69 a month') && r.stray.length === 0, 'hidden: ' + r.hidden + ' says: ' + JSON.stringify(r.said) + ' stray: ' + JSON.stringify(r.stray));
    ok('pricing, phone: the card is whole inside the window', r.cardR > 0 && r.cardR <= PHONE && r.cardL >= 0, r.cardL + ' to ' + r.cardR + ' in ' + PHONE);
    await ctx.close();
  });
  await group('pricing, the plan\'s button', async () => {
    const { ctx, page } = await open(browser, 'pricing');
    await Promise.all([page.waitForURL('**/#waitlist'), page.click('.plan .btn')]);
    await page.waitForLoadState('load');
    const r = await page.evaluate(() => { const s = document.querySelector('#waitlist'); const i = s && s.querySelector('input'); return { at: location.pathname + location.hash, top: s ? Math.round(s.getBoundingClientRect().top) : null, input: i ? Math.round(i.getBoundingClientRect().bottom) : null, ih: window.innerHeight }; });
    ok('pricing: the plan\'s button opens the home page at its waitlist, with the form in the window', r.at === '/#waitlist' && r.top !== null && Math.abs(r.top) <= 4 && r.input > 0 && r.input < r.ih, JSON.stringify(r));
    await ctx.close();
  });
  await group('pricing, wide', async () => {
    const { ctx, page } = await open(browser, 'pricing', { w: WIDE, h: 900, desktop: true });
    const pose = () => page.evaluate(() => getComputedStyle(document.querySelector('.card3d')).transform);
    const moving = () => page.evaluate(() => document.getAnimations().filter((a) => a.playState === 'running').length);
    const box = await page.evaluate(() => { const b = document.querySelector('.hero').getBoundingClientRect(); return [b.left, b.top, b.width, b.height]; });
    const rest = await pose();
    await page.mouse.move(box[0] + box[2] * 0.9, box[1] + box[3] * 0.8); await page.waitForTimeout(700);
    const near = await pose();
    await page.mouse.move(box[0] + box[2] * 0.5, box[1] + box[3] + 200); await page.waitForTimeout(800);
    const back = await pose();
    ok('pricing, wide: the card leans to the pointer and comes back to rest', rest !== near && back === rest && /matrix3d/.test(near), rest.slice(0, 40) + ' / ' + near.slice(0, 40) + ' / ' + back.slice(0, 40));
    ok('pricing: with motion on, the card floats', (await moving()) > 0);
    await ctx.close();
  });
  await group('pricing, motion turned off', async () => {
    const { ctx, page } = await open(browser, 'pricing', { w: WIDE, h: 900, desktop: true, still: true });
    const pose = () => page.evaluate(() => getComputedStyle(document.querySelector('.card3d')).transform);
    const box = await page.evaluate(() => { const b = document.querySelector('.hero').getBoundingClientRect(); return [b.left, b.top, b.width, b.height]; });
    const rest = await pose();
    await page.mouse.move(box[0] + box[2] * 0.9, box[1] + box[3] * 0.8); await page.waitForTimeout(700);
    const near = await pose();
    const moving = await page.evaluate(() => document.getAnimations().filter((a) => a.playState === 'running').length);
    ok('pricing, motion turned off: nothing moves, and the card does not lean', moving === 0 && near === rest, moving + ' running / ' + (near === rest ? 'still' : 'leaned'));
    await ctx.close();
  });

  // ---- the policy pages: the list of headings beside the text
  for (const name of POLICIES) {
    await group(name + ', wide', async () => {
      const { ctx, page } = await open(browser, name, { w: WIDE, h: 900, desktop: true });
      const r = await page.evaluate(() => {
        const flat = (t) => t.replace(/\s+/g, ' ').trim();
        const toc = document.querySelector('nav.toc'), art = document.querySelector('main article');
        const heads = [...art.querySelectorAll('h2')].map((h) => ['#' + h.id, flat(h.textContent)]);
        const list = [...toc.querySelectorAll('a')].map((a) => [a.getAttribute('href'), flat(a.textContent)]);
        const t = toc.getBoundingClientRect(), a = art.getBoundingClientRect();
        const widest = Math.max(...[...art.querySelectorAll('p, li')].map((e) => e.getBoundingClientRect().width));
        return { heads, list, ids: new Set(heads.map((h) => h[0])).size, beside: t.right <= a.left && Math.abs(t.top - a.top) < 4, pos: getComputedStyle(toc).position, tocH: Math.round(t.height), widest: Math.round(widest), label: toc.getAttribute('aria-label') };
      });
      ok(name + ': the list of headings is the page\'s own headings, each going to its section', r.heads.length > 3 && JSON.stringify(r.heads) === JSON.stringify(r.list) && r.ids === r.heads.length && r.heads.every((h) => h[0].length > 1) && !!r.label, r.heads.length + ' headings, ' + r.list.length + ' in the list');
      ok(name + ', wide: the list stands beside the text and stays in view; a line of text is not too long to read', r.beside && r.pos === 'sticky' && r.widest <= 760, JSON.stringify({ beside: r.beside, pos: r.pos, widest: r.widest }));
      await page.click('nav.toc a:nth-child(3)'); await page.waitForTimeout(500);
      const j = await page.evaluate(() => { const a = document.querySelector('nav.toc a:nth-child(3)'); const h = document.querySelector(a.getAttribute('href')); return { top: Math.round(h.getBoundingClientRect().top), cur: a.getAttribute('aria-current'), marked: document.querySelectorAll('nav.toc a[aria-current]').length, toc: Math.round(document.querySelector('nav.toc').getBoundingClientRect().top), y: Math.round(window.scrollY) }; });
      ok(name + ', wide: choosing a heading brings its section up and marks it, and the list has stayed in view', j.y > 0 && j.top >= 0 && j.top < 160 && j.cur === 'true' && j.marked === 1 && (r.tocH > 860 || (j.toc >= 0 && j.toc < 60)), JSON.stringify(j));
      await page.click('nav.toc a:last-child'); await page.waitForTimeout(700);
      const z = await page.evaluate(() => { const a = document.querySelector('nav.toc a:last-child'); const h = document.querySelector(a.getAttribute('href')); return { top: Math.round(h.getBoundingClientRect().top), ih: window.innerHeight, cur: a.getAttribute('aria-current'), marked: document.querySelectorAll('nav.toc a[aria-current]').length }; });
      ok(name + ', wide: the last heading, which cannot reach the top, is marked when chosen and is in the window', z.cur === 'true' && z.marked === 1 && z.top >= 0 && z.top < z.ih, JSON.stringify(z));
      await ctx.close();
    });
    await group(name + ', phone', async () => {
      const { ctx, page } = await open(browser, name);
      const r = await page.evaluate(() => { const t = document.querySelector('nav.toc'), a = document.querySelector('main article'); const ink = document.createRange(); ink.selectNodeContents(document.querySelector('h1')); return { above: t.getBoundingClientRect().bottom <= a.getBoundingClientRect().top, pos: getComputedStyle(t).position, title: Math.round(ink.getBoundingClientRect().right) }; });
      ok(name + ', phone: the list stands above the text and does not follow the page; the title fits', r.above && r.pos === 'static' && r.title <= PHONE - 16, JSON.stringify(r) + ' in ' + PHONE);
      await ctx.close();
    });
  }

  await browser.close();
  console.log(failed ? '\n' + failed + ' CHECK(S) FAILED' : '\nall checks passed');
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
