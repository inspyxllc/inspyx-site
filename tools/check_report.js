// Self-checks for the client's report page (coming-soon/report.html, served at /r/<key>).
// They open the page on a sample report and look at what a client would: the words and numbers against
// the sample's own, the sheets and photos, the PDF button, a phone's Back, the other states, sideways
// scroll, tap targets, and that a report's text is never run as code.
//
// usage: node tools/report_serve.js --sample <folder> &
//        node tools/check_report.js <folder>
// <folder> holds the sample: report.json (what the report function answers), files/ and report.pdf.
// The sample is not in this repo, which is public.
const fs = require('fs');
const path = require('path');
const playwright = require('playwright');
// BROWSER=webkit runs every check in WebKit (Safari's engine); Chromium otherwise.
const engine = process.env.BROWSER === 'webkit' ? playwright.webkit : playwright.chromium;

const sampleDir = process.argv[2];
if (!sampleDir) { console.error('usage: node tools/check_report.js <sample folder>'); process.exit(2); }
const base = process.env.URL || 'http://localhost:4174';
const sample = JSON.parse(fs.readFileSync(path.join(sampleDir, 'report.json'), 'utf8'));
const report = sample.report;

let failed = 0;
const ok = (name, cond, extra) => { if (!cond) failed++; console.log((cond ? 'PASS  ' : 'FAIL  ') + name + (extra ? '  [' + extra + ']' : '')); };
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

async function open(browser, opts) {
  const o = opts || {};
  const ctx = await browser.newContext({
    viewport: { width: o.w || 390, height: o.h || 844 }, deviceScaleFactor: 1, hasTouch: !o.desktop, isMobile: !o.desktop,
    reducedMotion: o.reduced ? 'reduce' : 'no-preference',
  });
  const page = await ctx.newPage();
  const errs = [], requests = [];
  page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
  page.on('pageerror', (e) => errs.push('pageerror: ' + e.message));
  page.on('request', (r) => requests.push(r.url()));
  if (o.init) await page.addInitScript(o.init);
  // The sample's movies, under Inspyx's file store's address as a real report gives them (the page's rules let
  // movies come from there alone), carried to the sample folder with the browser's own byte ranges.
  await page.route(MOVIES + '**', async (route) => {
    const req = route.request();
    const name = new URL(req.url()).pathname.split('/').pop();
    const res = await route.fetch({ url: base + '/sample-report/media/' + name, headers: req.headers() });
    return route.fulfill({ response: res });
  });
  if (o.answer) {
    await page.route('**/sample-report/report.json', (route) => {
      const a = o.answer();
      if (a.abort) return route.abort('failed');
      return route.fulfill({ status: a.status || 200, contentType: 'application/json', body: JSON.stringify(a.body === undefined ? {} : a.body) });
    });
  }
  await page.goto(base + (o.path || '/r/sample'), { waitUntil: 'load' });
  await page.waitForFunction(() => !document.getElementById('app').hasAttribute('aria-busy'), null, { timeout: 8000 }).catch(() => {});
  await page.waitForTimeout(250);
  return { ctx, page, errs, requests };
}

/** Waits until the page has stopped scrolling (a glide to a section takes a moment). */
async function settle(page) {
  await page.evaluate(() => new Promise((done) => {
    let last = window.scrollY, still = 0, n = 0;
    const tick = () => {
      if (window.scrollY === last) still++; else { still = 0; last = window.scrollY; }
      if (still >= 8 || ++n > 300) return done();
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }));
}

const clone = (x) => JSON.parse(JSON.stringify(x));
/** Where the sample's movies are said to be: Inspyx's file store, as a real report's are. */
const MOVIES = 'https://btxlrfvqifnrnxffohsz.supabase.co/storage/v1/object/sign/reports/sample/media/';
const allFindings = () => report.sections.flatMap((s) => s.items.flatMap((i) => i.findings));
const ranked = () => report.glance2.groups.flatMap((g) => g.rows.map((r) => r.id));
const numberOf = (id) => allFindings().find((f) => f.id === id).number;

(async () => {
  const browser = await engine.launch();
  console.log('engine: ' + engine.name());

  // ---- the page loads clean, under the headers the live page gets
  {
    const res = await (await browser.newContext()).request.get(base + '/r/sample');
    const hd = res.headers();
    ok('the page asks search engines to leave it alone, and never passes its address on',
      /noindex/.test(hd['x-robots-tag'] || '') && hd['referrer-policy'] === 'no-referrer' && hd['cache-control'] === 'no-store', JSON.stringify([hd['x-robots-tag'], hd['referrer-policy'], hd['cache-control']]));
    const csp = hd['content-security-policy'] || '';
    ok('its security policy lets in only its own script, styles and Inspyx\'s own files',
      csp.includes("default-src 'none'") && csp.includes("script-src 'self'") && csp.includes("style-src 'self'") && csp.includes("frame-ancestors 'none'") && !csp.includes('unsafe'), csp);
    const html = await res.text();
    ok('the page\'s own markup says the same (robots, referrer), and holds no script or style of its own',
      /<meta name="robots" content="noindex, nofollow, noarchive">/.test(html) && /<meta name="referrer" content="no-referrer">/.test(html) && !/<style/i.test(html) && !/<script(?![^>]*\bsrc=)/i.test(html) && !/ style="/i.test(html));

    const { ctx, page, errs, requests } = await open(browser);
    ok('loads with no errors in the console (none from the security policy either)', errs.length === 0, errs.join(' | '));
    const foreign = requests.filter((u) => !u.startsWith(base) && !u.startsWith('data:'));
    ok('nothing is loaded from any other site', foreign.length === 0, foreign.slice(0, 3).join(' '));
    const full = requests.filter((u) => /\/files\/[0-9a-f]{64}\.jpg$/.test(u));
    ok('on opening, the only full-size photo fetched is the cover; lists use small copies', full.length === 1 && full[0].includes(report.cover.photo), String(full.length));
    const head = await page.evaluate(() => ({
      title: document.title, h1: document.querySelectorAll('h1').length, h1t: document.querySelector('h1').textContent, lang: document.documentElement.lang,
      busy: document.getElementById('app').hasAttribute('aria-busy'), main: !!document.querySelector('main#report'),
    }));
    ok('one main heading (the address), a title for the tab, English, and the page says it has finished loading',
      head.h1 === 1 && head.h1t === report.cover.address && head.title === report.cover.address + ' · ' + report.title && head.lang === 'en' && !head.busy && head.main, JSON.stringify(head));
    await ctx.close();
  }

  // ---- what it shows is the sample's own: cover, numbers, order
  {
    const { ctx, page } = await open(browser);
    const seen = await page.evaluate(() => {
      const t = (s, root) => Array.from((root || document).querySelectorAll(s)).map((e) => e.textContent.trim());
      return {
        cover: document.querySelector('.cover-in').innerText,
        tiles: t('.tile-n').map(Number),
        tileLabels: t('.tile-l'),
        lead: document.querySelector('#glance .lead').textContent,
        groups: t('#glance .group-t'),
        rows: Array.from(document.querySelectorAll('#glance .row')).map((r) => r.dataset.finding),
        rowTitles: t('#glance .row-t'),
        details: Array.from(document.querySelectorAll('#details .kv')).map((kv) => [kv.querySelector('dt').textContent, kv.querySelector('dd').textContent]),
        sections: t('#sections .sec-t'),
        cards: Array.from(document.querySelectorAll('[data-finding-card]')).map((c) => c.dataset.findingCard),
        cardTitles: t('[data-finding-card] .card-t'),
        items: t('#sections .item-t').length,
        kvs: document.querySelectorAll('#sections .item .ln').length,
        statusText: Array.from(document.querySelectorAll('#sections .status')).map((e) => e.innerText).join('\n'),
        photos: document.querySelectorAll('#sections .ph').length,
        calls: Array.from(document.querySelectorAll('#call .call')).map((c) => c.dataset.finding),
        legend: t('#legend dt'),
        standards: document.querySelector('#standards .prose').textContent,
        sig: document.querySelector('.sig').innerText,
        foot: document.querySelector('.foot').innerText,
        sampleTag: !!document.querySelector('.cover .tag'),
      };
    });
    const c = report.cover;
    ok('the cover: address, place, who it is for, the inspection date, the inspector and the buyer\'s agent',
      [c.address, c.locality, 'Prepared for ' + c.prepared_for, 'Inspection date: ' + c.inspected, c.inspector.name, 'License number: ' + c.inspector.license, c.inspector.phone, c.inspector.email, c.agents[0].name, c.agents[0].email]
        .every((s) => seen.cover.includes(s)) && seen.sampleTag);
    const n = report.counts;
    ok('the six counts are the report\'s own', same(seen.tiles, [n.SH, n.MD, n.MN, n.NT, n.photos, n.not_inspected]), seen.tiles.join(','));
    ok('the counts carry the PDF\'s labels', same(seen.tileLabels, ['Safety Hazard', 'Recommendation', 'Maintenance', 'Information', 'Photos', 'Not inspected']), seen.tileLabels.join(','));
    const G = report.glance2;
    ok('at a glance, as the PDF lists it: the lead line, each group head with its count, then "Not inspected (n)", and every finding once, most urgent first',
      seen.lead === G.lead && same(seen.groups, [...G.groups.map((g) => g.head), ...(G.not_inspected ? [G.not_inspected.head] : [])]) && same(seen.rows, ranked()),
      seen.groups.join(' / '));
    ok('each row reads its printed number and its title', same(seen.rowTitles, G.groups.flatMap((g) => g.rows.map((r) => r.number + ' ' + r.title))));
    ok('inspection details: each label with its value, in order', same(seen.details, report.details.rows));
    ok('every chapter, in the report\'s order, headed as the PDF heads it: its number and its name', same(seen.sections, report.sections.map((s) => s.number + ' ' + s.name)), String(seen.sections.length));
    ok('every finding has its card, in its chapter, in the report\'s order, under its printed number',
      same(seen.cards, allFindings().map((f) => f.id)) && same(seen.cardTitles, allFindings().map((f) => f.number + ' ' + f.title)), String(seen.cards.length));
    // An item is named when it has lines or photos of its own; a not-inspected item is named in its chapter's closing block.
    const wantItems = report.sections.reduce((a, s) => a + s.items.filter((i) => i.lines2.length || i.photos.length).length + s.status.not_inspected.length, 0);
    const wantKvs = report.sections.reduce((a, s) => a + s.items.reduce((b, i) => b + i.lines2.length, 0), 0);
    const wantPhotos = report.sections.reduce((a, s) => a + s.items.reduce((b, i) => b + i.photos.length + i.findings.reduce((d, f) => d + f.photos.length, 0), 0), 0);
    ok('every item, every line of its own and every photo is on the page', seen.items === wantItems && seen.kvs === wantKvs && seen.photos === wantPhotos && wantPhotos === n.photos,
      [seen.items, wantItems, seen.kvs, wantKvs, seen.photos, wantPhotos].join(','));
    ok('who to call: each trade once, its findings most urgent first', same(seen.calls, report.who_to_call2.flatMap((g) => g.findings.map((x) => x.id))), String(seen.calls.length));
    ok('the four categories a finding carries are explained, in the PDF\'s words', same(seen.legend, report.legend2.rows.map((r) => r.label)) && seen.standards === report.standards);
    ok('the signature block and the footer (the report\'s short number)', seen.sig.includes('Inspector signature: ' + report.signature.name) && seen.sig.includes('Date: ' + report.signature.date) && seen.foot.includes(report.report_number) && seen.foot.includes('Delivered by Inspyx'));
    ok('each chapter\'s closing blocks are on the page, in the PDF\'s words', report.sections.every((s) => [...s.status.partial, ...s.status.clean, ...s.status.not_present].every((line) => seen.statusText.includes(line.slice(line.indexOf(': ') + 2, line.indexOf(': ') + 22)))));

    // a not-inspected item, in its chapter's closing block, as the PDF prints it
    const laundry = await page.evaluate(() => {
      const block = document.querySelector('#s-C6 .status.cat-NI');
      return block ? block.innerText : '';
    });
    ok('a not-inspected item says so in its chapter, with its reason and the inspector\'s note', laundry.includes('NOT INSPECTED') && laundry.includes('Laundry') && laundry.includes('Obstructed by stored items or furnishings') && laundry.includes('Unable to inspect laundry plumbing'), laundry.slice(0, 80));
    await ctx.close();
  }

  // ---- the PDF's parts, in its order; the contents; the numbers line; a finding opened by its printed number
  {
    const { ctx, page } = await open(browser);
    const seen = await page.evaluate(() => ({
      parts: Array.from(document.querySelectorAll('main.doc > section.part')).map((e) => e.id).filter(Boolean),
      toc: Array.from(document.querySelectorAll('#contents .toc-doc li')).map((e) => e.textContent.trim()),
      numbers: Array.from(document.querySelectorAll('#legend .fine')).map((e) => e.textContent.trim()),
    }));
    const want = ['glance', 'contents', 'legend', ...(report.details.rows.length || report.details.property ? ['details'] : []), 'sections', ...(report.who_to_call2.length ? ['call'] : []), 'standards'];
    ok('the parts come in the PDF\'s order: at a glance, the contents, the categories, the details, the chapters, who to call, the standards', same(seen.parts, want), seen.parts.join(','));
    ok('in this report: every chapter, numbered as printed', same(seen.toc, report.contents.map((e) => e.number + ' ' + e.name)), String(seen.toc.length));
    ok('the line about finding numbers is under the categories', report.legend2.numbers !== '' && seen.numbers.includes(report.legend2.numbers), seen.numbers.join(' / '));
    await ctx.close();
    const f = allFindings()[2];
    const byNumber = await open(browser, { path: '/r/sample#' + f.number });
    const head = await byNumber.page.evaluate(() => { const d = document.querySelector('dialog[open] .fhead-t'); return d ? d.textContent.trim() : ''; });
    ok('a link with a finding\'s printed number (#' + f.number + ') opens that finding', head === f.number + ' ' + f.title, head);
    await byNumber.ctx.close();
  }

  // ---- the inspector's own notices: under the standards, in his words, as text, paragraphs as written
  {
    const noticed = clone(sample);
    noticed.report.notices = [
      { heading: 'What this inspection covers', text: 'First paragraph of the inspector\'s own words.\n\nSecond <b>one</b><img src=x onerror="window.__pwned=9">.' },
      { heading: 'Limitations', text: 'One limitation.' },
    ];
    const { ctx, page } = await open(browser, { answer: () => ({ body: noticed }) });
    const n = await page.evaluate(() => ({
      heads: Array.from(document.querySelectorAll('#standards .notice h3')).map((e) => e.textContent),
      paras: Array.from(document.querySelectorAll('#standards .notice')).map((e) => Array.from(e.querySelectorAll('p')).map((p) => p.textContent)),
      pwned: window.__pwned, imgs: document.querySelectorAll('#standards .notice img').length,
    }));
    ok('the notices print under the standards, each under its heading, paragraphs as he wrote them, as text',
      same(n.heads, ['What this inspection covers', 'Limitations']) &&
      same(n.paras, [['First paragraph of the inspector\'s own words.', 'Second <b>one</b><img src=x onerror="window.__pwned=9">.'], ['One limitation.']]) &&
      n.pwned === undefined && n.imgs === 0, JSON.stringify(n));
    await ctx.close();
    const none = await open(browser);
    const zero = await none.page.evaluate(() => document.querySelectorAll('#standards .notice').length);
    ok('a report with no notices prints none', report.notices.length > 0 || zero === 0, String(zero));
    await none.ctx.close();
  }

  // ---- the link's key (2026-11-14): read from #<key> (or an old link's /r/<key>), sent only in a POST's body,
  // taken out of the address at once, kept for this tab so a reload still opens it, never in any URL or log
  {
    const KEY = 'AbCdEfGhIjKlMnOpQrStUv';
    const API = 'https://btxlrfvqifnrnxffohsz.supabase.co/functions/v1/report';
    async function keyed(path, ctxIn) {
      const ctx = ctxIn || await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
      const page = await ctx.newPage();
      const asked = [], urls = [], said = [];
      // An old link's own address (/r/<key>) is the one request that carries its key: the browser asks the site
      // for it before the page runs. Every other request is checked.
      page.on('request', (r) => { if (!(r.isNavigationRequest() && r.frame() === page.mainFrame() && r.url().startsWith(base + '/r/'))) urls.push(r.url()); });
      page.on('console', (m) => said.push(m.text()));
      page.on('pageerror', (e) => said.push(e.message));
      await page.route(API + '**', (route) => {
        const req = route.request();
        asked.push({ method: req.method(), url: req.url(), body: req.postData() });
        let body = null;
        try { body = JSON.parse(req.postData() || 'null'); } catch (e) { body = null; }
        const open = req.method() === 'POST' && body && body.key === KEY && Object.keys(body).length === 1;
        return route.fulfill({ status: open ? 200 : 404, contentType: 'application/json', headers: { 'Access-Control-Allow-Origin': '*' }, body: JSON.stringify(open ? sample : { state: 'gone' }) });
      });
      await page.goto(base + path, { waitUntil: 'load' });
      await page.waitForFunction(() => !document.getElementById('app').hasAttribute('aria-busy'), null, { timeout: 8000 }).catch(() => {});
      await page.waitForTimeout(300);
      const seen = await page.evaluate(() => ({
        href: location.href, path: location.pathname, hash: location.hash,
        h1: (document.querySelector('h1') || {}).textContent || '', state: (document.querySelector('[data-state]') || {}).dataset ? document.querySelector('[data-state]').dataset.state : '',
        kept: (() => { try { return sessionStorage.getItem('inspyx.report.key'); } catch (e) { return 'no storage'; } })(),
        sheet: (document.querySelector('dialog[open] .fhead-t') || {}).textContent || '',
      }));
      return { ctx, page, asked, urls, said, seen };
    }
    const noKeyAnywhere = (r) => r.urls.every((u) => !u.includes(KEY)) && r.said.every((t) => !t.includes(KEY)) && !r.seen.href.includes(KEY);

    const fresh = await keyed('/r#' + KEY);
    ok('a new link (/r#<key>) opens the report, asked once by POST with only the key in the body',
      fresh.seen.h1 === sample.report.cover.address && fresh.asked.length === 1 && fresh.asked[0].method === 'POST' &&
      fresh.asked[0].url === API && same(JSON.parse(fresh.asked[0].body), { key: KEY }), JSON.stringify(fresh.asked).slice(0, 200));
    ok('the key leaves the address at once: it reads /r, with nothing after it', fresh.seen.path === '/r' && fresh.seen.hash === '', fresh.seen.href);
    ok('the key is in no address the page asked for, and in nothing it logged', noKeyAnywhere(fresh), fresh.urls.filter((u) => u.includes(KEY)).concat(fresh.said.filter((t) => t.includes(KEY))).join(' | ').slice(0, 200));
    ok('the key is kept for this tab only', fresh.seen.kept === KEY, String(fresh.seen.kept));
    // A reload, in the same tab: the address no longer holds the key, and the report still opens.
    const askedBefore = fresh.asked.length;
    await fresh.page.reload({ waitUntil: 'load' });
    await fresh.page.waitForFunction(() => !document.getElementById('app').hasAttribute('aria-busy'), null, { timeout: 8000 }).catch(() => {});
    const again = await fresh.page.evaluate(() => ({ h1: (document.querySelector('h1') || {}).textContent || '', href: location.href }));
    ok('a reload in the same tab opens it again, asked the same way', again.h1 === sample.report.cover.address && fresh.asked.length === askedBefore + 1 &&
      fresh.asked[fresh.asked.length - 1].method === 'POST' && !again.href.includes(KEY), JSON.stringify(again));
    await fresh.ctx.close();

    const old = await keyed('/r/' + KEY);
    ok('an old link (/r/<key>) still opens, asked by POST the same way, and its address becomes /r',
      old.seen.h1 === sample.report.cover.address && old.asked.length === 1 && old.asked[0].method === 'POST' && same(JSON.parse(old.asked[0].body), { key: KEY }) &&
      old.seen.path === '/r' && noKeyAnywhere(old), JSON.stringify([old.seen.path, old.asked.length]));
    await old.ctx.close();

    const f = allFindings()[1];
    const oldFinding = await keyed('/r/' + KEY + '#' + f.number);
    ok('an old link to one finding (/r/<key>#' + f.number + ') opens that finding, and the address keeps only #' + f.number,
      oldFinding.seen.sheet.trim() === f.number + ' ' + f.title && oldFinding.seen.path === '/r' && oldFinding.seen.hash === '#' + f.number && noKeyAnywhere(oldFinding),
      JSON.stringify([oldFinding.seen.sheet, oldFinding.seen.hash]));
    await oldFinding.ctx.close();

    const bare = await keyed('/r');
    ok('/r in a new tab, with no key: "This report link doesn\'t work.", and nothing is asked', bare.seen.state === 'gone' && bare.asked.length === 0, JSON.stringify([bare.seen.state, bare.asked.length]));
    await bare.ctx.close();
    const notKey = await keyed('/r#C6.2');
    ok('a mark that is no key (/r#C6.2) asks for nothing', notKey.seen.state === 'gone' && notKey.asked.length === 0, JSON.stringify([notKey.seen.state, notKey.asked.length]));
    await notKey.ctx.close();
    const unknown = await keyed('/r#' + KEY.split('').reverse().join(''));
    ok('a key no link has: the function says gone, and the page says so', unknown.seen.state === 'gone' && unknown.asked.length === 1, unknown.seen.state);
    await unknown.ctx.close();
  }

  // ---- movies (content /13, 2026-11-14): a clip plays when tapped, with its sound; a slowed one silent; a
  // Live Photo plays once and gives its still back; nothing plays on its own, and stepping on stops it
  {
    const moving = clone(sample);
    const R = moving.report;
    const withTwo = R.sections.flatMap((s) => s.items.flatMap((i) => i.findings)).find((f) => f.photos.length >= 2);
    const owned = R.sections.flatMap((s) => s.items).find((i) => i.photos.length >= 1);
    const MOV = { clip: 'c'.repeat(64), slow: 'd'.repeat(64), live: 'e'.repeat(64), gone: 'f'.repeat(64), unsent: 'a1'.repeat(32) };
    withTwo.photos[0].motion = { kind: 'clip', file: MOV.clip };
    withTwo.photos[1].motion = { kind: 'clip', file: MOV.slow };
    owned.photos[0].motion = { kind: 'live', file: MOV.live };
    // A movie the page was never given shows as its still.
    const another = R.sections.flatMap((s) => s.items.flatMap((i) => i.findings)).find((f) => f !== withTwo && f.photos.length >= 1);
    another.photos[0].motion = { kind: 'clip', file: MOV.unsent };
    moving.media = {
      [MOV.clip]: { url: MOVIES + 'clip_audio.mp4?token=t', w: 1280, h: 720, duration_ms: 6000, audio: true },
      [MOV.slow]: { url: MOVIES + 'slowmo.mp4?token=t', w: 1280, h: 720, duration_ms: 80000, audio: false },
      [MOV.live]: { url: MOVIES + 'live.mp4?token=t', w: 1280, h: 720, duration_ms: 3000, audio: true },
    };
    const { ctx, page, errs } = await open(browser, { answer: () => ({ body: moving }) });
    const tile = (file) => `[data-finding-card="${withTwo.id}"] .ph:has(img[data-file="${file}"])`;
    const tiles = await page.evaluate(([clipFile, slowFile, liveFile, unsentFile]) => {
      const t = (f) => Array.from(document.querySelectorAll('.ph')).find((b) => { const i = b.querySelector('img'); return i && i.getAttribute('data-file') === f; });
      const info = (b) => b ? { cls: b.className, badge: (b.querySelector('.ph-badge') || {}).textContent || '', label: b.getAttribute('aria-label') } : null;
      return { clip: info(t(clipFile)), slow: info(t(slowFile)), live: info(t(liveFile)), unsent: info(t(unsentFile)), plain: document.querySelectorAll('.ph:not(.ph-video):not(.ph-live) .ph-badge').length };
    }, [withTwo.photos[0].file, withTwo.photos[1].file, owned.photos[0].file, another.photos[0].file]);
    ok('a clip\'s still says so on its tile, with its length; a slowed one too; a Live Photo says LIVE',
      /ph-video/.test(tiles.clip.cls) && tiles.clip.badge === '0:06' && /Video, 0:06/.test(tiles.clip.label) &&
      /ph-video/.test(tiles.slow.cls) && tiles.slow.badge === '1:20' &&
      /ph-live/.test(tiles.live.cls) && tiles.live.badge === 'LIVE' && /Live Photo/.test(tiles.live.label), JSON.stringify(tiles));
    ok('a movie the page was never given shows as a plain still, and no other tile has a badge', !/ph-video|ph-live/.test(tiles.unsent.cls) && tiles.unsent.badge === '' && tiles.plain === 0, JSON.stringify(tiles.unsent));

    // The clip, opened: the still is its poster, the movie waits for a tap, with its sound.
    await page.click(`[data-finding-card="${withTwo.id}"] .ph >> nth=0`);
    await page.waitForTimeout(400);
    const v1 = await page.evaluate(() => {
      const v = document.querySelector('.viewer-video');
      return { shown: !v.hidden, img: !document.querySelector('.viewer-img').hidden, controls: v.controls, src: v.getAttribute('src'), poster: v.getAttribute('poster') || '',
        preload: v.getAttribute('preload'), playsinline: v.hasAttribute('playsinline'), muted: v.muted, paused: v.paused, t: v.currentTime, autoplay: v.autoplay };
    });
    ok('a clip opens as a player: its still as the poster, its controls, its sound on, and it does not play on its own',
      v1.shown && !v1.img && v1.controls && v1.src === MOVIES + 'clip_audio.mp4?token=t' && v1.poster.length > 0 && v1.preload === 'none' && v1.playsinline &&
      v1.muted === false && v1.paused && v1.t === 0 && !v1.autoplay, JSON.stringify(v1));
    const played = await page.evaluate(async () => {
      const v = document.querySelector('.viewer-video');
      await v.play();
      await new Promise((done) => setTimeout(done, 1500));
      return { t: v.currentTime, paused: v.paused, d: Math.round(v.duration), err: v.error && v.error.code };
    });
    ok('tapped, it plays (H.264 with AAC, as the phone makes it)', played.t > 0.5 && !played.paused && played.d === 6 && !played.err, JSON.stringify(played));
    // Stepping on stops it and lets go of it.
    await page.keyboard.press('ArrowRight');
    await page.waitForTimeout(300);
    const v2 = await page.evaluate(() => { const v = document.querySelector('.viewer-video'); return { shown: !v.hidden, src: v.getAttribute('src'), paused: v.paused, muted: v.muted, img: !document.querySelector('.viewer-img').hidden }; });
    ok('stepping on stops the clip and lets go of it; the next one, slowed and silent, waits muted',
      v2.shown && v2.src === MOVIES + 'slowmo.mp4?token=t' && v2.paused && v2.muted === true && !v2.img, JSON.stringify(v2));
    const slow = await page.evaluate(async () => {
      const v = document.querySelector('.viewer-video');
      await v.play();
      await new Promise((done) => setTimeout(done, 1200));
      return { t: v.currentTime, d: Math.round(v.duration), err: v.error && v.error.code, gone: !document.querySelector('.viewer-video-gone').hidden };
    });
    ok('a movie with no sound plays cleanly, muted, at its slowed length', slow.t > 0.3 && slow.d === 80 && !slow.err && !slow.gone, JSON.stringify(slow));
    await page.keyboard.press('Escape');
    await page.waitForTimeout(300);
    const closed = await page.evaluate(() => { const v = document.querySelector('.viewer-video'); return { src: v.getAttribute('src'), paused: v.paused, open: document.querySelectorAll('dialog[open]').length }; });
    ok('closed, nothing keeps playing or downloading', closed.src === null && closed.paused && closed.open === 0, JSON.stringify(closed));

    // The Live Photo: its still, and a button that plays its movie once.
    const ownedTile = await page.evaluateHandle((file) => Array.from(document.querySelectorAll('.ph')).find((b) => { const i = b.querySelector('img'); return i && i.getAttribute('data-file') === file; }), owned.photos[0].file);
    await ownedTile.asElement().click();
    await page.waitForTimeout(400);
    const l1 = await page.evaluate(() => ({ img: !document.querySelector('.viewer-img').hidden, video: !document.querySelector('.viewer-video').hidden, btn: !document.querySelector('.viewer-live').hidden, label: document.querySelector('.viewer-live').getAttribute('aria-label') }));
    ok('a Live Photo opens as its still, with a LIVE button, and nothing playing', l1.img && !l1.video && l1.btn && l1.label === 'Play the Live Photo', JSON.stringify(l1));
    await page.click('.viewer-live');
    await page.waitForTimeout(600);
    const l2 = await page.evaluate(() => { const v = document.querySelector('.viewer-video'); return { video: !v.hidden, playing: !v.paused, muted: v.muted, controls: v.controls, img: !document.querySelector('.viewer-img').hidden }; });
    ok('pressed, its movie plays over the still, with its sound', l2.video && l2.playing && l2.muted === false && !l2.controls && !l2.img, JSON.stringify(l2));
    await page.waitForFunction(() => document.querySelector('.viewer-video').hidden, null, { timeout: 8000 }).catch(() => {});
    const l3 = await page.evaluate(() => ({ img: !document.querySelector('.viewer-img').hidden, video: !document.querySelector('.viewer-video').hidden, btn: !document.querySelector('.viewer-live').hidden }));
    ok('when it ends, the still comes back, ready to play again', l3.img && !l3.video && l3.btn, JSON.stringify(l3));
    await page.keyboard.press('Escape');
    ok('none of that raised an error, and the page\'s rules let the movies through', errs.filter((e) => !/Failed to load resource/.test(e)).length === 0, errs.join(' | ').slice(0, 300));
    await ctx.close();

    // A movie that can't be loaded says so, and the page stands.
    const broken = clone(moving);
    broken.media[MOV.clip] = { url: MOVIES + 'none.mp4?token=t', w: 1280, h: 720, duration_ms: 6000, audio: true };
    const b = await open(browser, { answer: () => ({ body: broken }) });
    await b.page.click(`[data-finding-card="${withTwo.id}"] .ph >> nth=0`);
    await b.page.waitForTimeout(300);
    await b.page.evaluate(() => document.querySelector('.viewer-video').play().catch(() => {}));
    await b.page.waitForTimeout(1200);
    const gone = await b.page.evaluate(() => ({ gone: !document.querySelector('.viewer-video-gone').hidden, video: !document.querySelector('.viewer-video').hidden, text: document.querySelector('.viewer-video-gone').textContent }));
    ok('a movie that can\'t be loaded says so in its place', gone.gone && !gone.video && gone.text === 'This video couldn’t be loaded.', JSON.stringify(gone));
    await b.ctx.close();

    // A movie from anywhere but Inspyx is never played or asked for: its still shows as a plain one.
    const foreign = clone(moving);
    foreign.media[MOV.clip] = { url: 'https://evil.example/steal.mp4', w: 1280, h: 720, duration_ms: 6000, audio: true };
    const fo = await open(browser, { answer: () => ({ body: foreign }) });
    await fo.page.click(`[data-finding-card="${withTwo.id}"] .ph >> nth=0`);
    await fo.page.waitForTimeout(400);
    const fr = await fo.page.evaluate(() => ({ video: !document.querySelector('.viewer-video').hidden, src: document.querySelector('.viewer-video').getAttribute('src'), img: !document.querySelector('.viewer-img').hidden }));
    const badge = await fo.page.evaluate((file) => { const b = Array.from(document.querySelectorAll('.ph')).find((x) => { const i = x.querySelector('img'); return i && i.getAttribute('data-file') === file; }); return b ? b.className : ''; }, withTwo.photos[0].file);
    ok('a movie from anywhere but Inspyx is never played or asked for: its still shows plain',
      !fr.video && fr.src === null && fr.img && !/ph-video/.test(badge) && fo.requests.every((u) => !u.includes('evil.example')), JSON.stringify({ fr, badge }));
    await fo.ctx.close();
  }

  // ---- the filter chips
  {
    const { ctx, page } = await open(browser);
    const before = await page.evaluate(() => document.querySelectorAll('#glance .row').length);
    await page.click('.chip[data-filter="SH"]');
    const sh = await page.evaluate(() => ({ rows: Array.from(document.querySelectorAll('#glance .row')).map((r) => r.dataset.finding), pressed: Array.from(document.querySelectorAll('.chip')).map((c) => c.getAttribute('aria-pressed')), groups: document.querySelectorAll('#glance .glance-list .group-t').length }));
    const want = report.glance.groups.find((g) => g.code === 'SH').rows.map((r) => r.id);
    ok('a chip shows that category alone, and says it is pressed', same(sh.rows, want) && same(sh.pressed, ['false', 'true', 'false', 'false']) && sh.groups === 1, sh.rows.join(','));
    await page.click('#glance .row');
    await page.waitForTimeout(200);
    const count = await page.evaluate(() => document.querySelector('.sheet-finding .sheet-n').textContent);
    ok('opened from a filtered list, a finding counts within that list', count === 'Finding 1 of ' + want.length, count);
    await page.keyboard.press('Escape');
    await page.waitForTimeout(200);
    await page.click('.chip[data-filter="all"]');
    ok('"All findings" brings them all back', (await page.evaluate(() => document.querySelectorAll('#glance .row').length)) === before && before === ranked().length);
    await ctx.close();
  }

  // ---- a finding in full, and a phone's Back
  {
    const { ctx, page, errs } = await open(browser);
    const order = ranked();
    const third = allFindings().find((f) => f.id === order[2]);
    // The row is put in plain view first (not under the sticky top bar), as a thumb would tap it: otherwise the test
    // tool itself scrolls the row out from under the bar before its click, and the page is blamed for that move.
    await page.evaluate((id) => document.querySelector(`#glance .row[data-finding="${id}"]`).scrollIntoView({ block: 'center' }), third.id);
    const y0 = await page.evaluate(() => window.scrollY);
    await page.click(`#glance .row[data-finding="${third.id}"]`);
    await page.waitForTimeout(250);
    const s1 = await page.evaluate(() => {
      const d = document.querySelector('.sheet-finding');
      return { open: d.open, n: d.querySelector('.sheet-n').textContent, title: d.querySelector('.fhead-t').textContent, crumb: (d.querySelector('.crumb') || {}).textContent, text: d.querySelector('.sheet-in').innerText, photos: d.querySelectorAll('.ph').length, inside: d.contains(document.activeElement), locked: document.documentElement.classList.contains('is-locked'), modal: d.matches(':modal') };
    });
    ok('a tap on a row opens the finding over the page: its number, title, place, words and photos',
      s1.open && s1.modal && s1.n === 'Finding 3 of ' + order.length && s1.title === third.number + ' ' + third.title && s1.crumb === report.glance2.groups.flatMap((g) => g.rows).find((r) => r.id === third.id).place && s1.text.includes(third.observed) && s1.text.includes(third.recommendation) && (third.trade ? s1.text.includes(third.trade) && s1.text.includes('WHO TO CALL') : !s1.text.includes('WHO TO CALL')) && s1.photos === third.photos.length,
      JSON.stringify([s1.n, s1.title, s1.photos]));
    ok('the sheet holds the keyboard, and the page behind stays put', s1.inside && s1.locked);
    await page.click('.sheet-finding .sheet-nav .ibtn:last-child');
    const s2 = await page.evaluate(() => document.querySelector('.sheet-finding .sheet-n').textContent + '|' + document.querySelector('.sheet-finding .fhead-t').textContent);
    const fourth = allFindings().find((f) => f.id === order[3]);
    ok('Next steps to the next finding in the ranking', s2 === 'Finding 4 of ' + order.length + '|' + fourth.number + ' ' + fourth.title, s2);
    await page.keyboard.press('ArrowLeft');
    await page.keyboard.press('ArrowLeft');
    const s3 = await page.evaluate(() => document.querySelector('.sheet-finding .sheet-n').textContent);
    ok('the arrow keys step too', s3 === 'Finding 2 of ' + order.length, s3);
    // a photo, full screen, over the sheet
    await page.keyboard.press('ArrowRight');
    await page.click('.sheet-finding .ph');
    await page.waitForTimeout(250);
    const v1 = await page.evaluate(() => { const v = document.querySelector('.viewer'); return { open: v.open, n: v.querySelector('.viewer-n').textContent, src: v.querySelector('.viewer-img').getAttribute('src'), dialogs: document.querySelectorAll('dialog[open]').length }; });
    ok('a tap on a photo opens it full screen, at full size', v1.open && v1.dialogs === 2 && v1.n === 'Photo 1 of ' + third.photos.length && v1.src.endsWith('/files/' + third.photos[0].file + '.jpg'), JSON.stringify(v1));
    if (third.photos.length > 1) {
      await page.keyboard.press('ArrowRight');
      const v2 = await page.evaluate(() => document.querySelector('.viewer-n').textContent + '|' + document.querySelector('.viewer-img').getAttribute('src'));
      ok('the arrow keys step through a finding\'s photos, and leave the finding where it was',
        v2.startsWith('Photo 2 of ') && v2.endsWith(third.photos[1].file + '.jpg') && (await page.evaluate(() => document.querySelector('.sheet-finding .sheet-n').textContent)) === 'Finding 3 of ' + order.length, v2);
    }
    await page.goBack();
    await page.waitForTimeout(250);
    const b1 = await page.evaluate(() => ({ viewer: document.querySelector('.viewer').open, sheet: document.querySelector('.sheet-finding').open }));
    ok('Back closes the photo and leaves the finding open', !b1.viewer && b1.sheet, JSON.stringify(b1));
    await page.goBack();
    await page.waitForTimeout(250);
    const b2 = await page.evaluate((id) => ({ dialogs: document.querySelectorAll('dialog[open]').length, locked: document.documentElement.classList.contains('is-locked'), y: window.scrollY, focus: document.activeElement && document.activeElement.dataset.finding === id, url: location.pathname }), third.id);
    ok('Back again closes the finding: still on the report, at the same place, with the row in focus',
      b2.dialogs === 0 && !b2.locked && Math.abs(b2.y - y0) < 2 && b2.focus && b2.url === '/r/sample', JSON.stringify(b2) + ' y0=' + y0);
    // the close button and Esc
    await page.click(`#glance .row[data-finding="${third.id}"]`);
    await page.click('.sheet-finding .ibtn[aria-label="Close"]');
    await page.waitForTimeout(250);
    const c1 = await page.evaluate(() => document.querySelectorAll('dialog[open]').length);
    await page.click(`#glance .row[data-finding="${third.id}"]`);
    await page.keyboard.press('Escape');
    await page.waitForTimeout(250);
    const c2 = await page.evaluate(() => document.querySelectorAll('dialog[open]').length);
    ok('the close button and Esc close it too', c1 === 0 && c2 === 0, c1 + ',' + c2);
    // "See it in its section"
    await page.click(`#glance .row[data-finding="${third.id}"]`);
    await page.click('.sheet-more .link');
    await page.waitForTimeout(150);
    await settle(page);
    const g = await page.evaluate((id) => { const el = document.getElementById('f-' + id); const r = el.getBoundingClientRect(); return { top: Math.round(r.top), dialogs: document.querySelectorAll('dialog[open]').length, focus: document.activeElement === el, flash: el.classList.contains('is-flash') }; }, third.id);
    ok('"See it in its section" closes the sheet and brings its card under the bar', g.dialogs === 0 && g.top >= 56 && g.top < 200 && g.focus && g.flash, JSON.stringify(g));
    ok('none of that raised an error', errs.length === 0, errs.join(' | '));
    await ctx.close();
  }

  // ---- photos in the sections, and the cover photo
  {
    const { ctx, page } = await open(browser);
    const withPhotos = report.sections.flatMap((s) => s.items).find((i) => i.photos.length > 1);
    const idx = await page.evaluate((title) => Array.from(document.querySelectorAll('#sections .item')).findIndex((i) => i.querySelector('.item-t').textContent === title), withPhotos.title);
    const item = page.locator('#sections .item').nth(idx);
    await item.locator('.ph').nth(1).scrollIntoViewIfNeeded();
    await item.locator('.ph').nth(1).click();
    await page.waitForTimeout(250);
    const v = await page.evaluate(() => ({ n: document.querySelector('.viewer-n').textContent, src: document.querySelector('.viewer-img').getAttribute('src'), prev: document.querySelector('.viewer-prev').disabled, next: document.querySelector('.viewer-next').disabled }));
    ok('an item\'s own photos open too, at the one tapped', v.n === 'Photo 2 of ' + withPhotos.photos.length && v.src.endsWith(withPhotos.photos[1].file + '.jpg') && !v.prev && v.next === (withPhotos.photos.length === 2), JSON.stringify(v));
    // a swipe steps back
    const box = await page.locator('.viewer-stage').boundingBox();
    const touches = await page.evaluate(() => { try { new Touch({ identifier: 1, target: document.body }); return true; } catch (e) { return false; } });
    if (!touches) console.log('SKIP  a swipe to the right steps back a photo  [' + engine.name() + ' cannot make a touch in a test]');
    if (touches) await page.evaluate(([x, y]) => {
      const stage = document.querySelector('.viewer-stage');
      const touch = (cx) => new Touch({ identifier: 1, target: stage, clientX: cx, clientY: y });
      stage.dispatchEvent(new TouchEvent('touchstart', { touches: [touch(x)], changedTouches: [touch(x)], bubbles: true }));
      stage.dispatchEvent(new TouchEvent('touchend', { touches: [], changedTouches: [touch(x + 140)], bubbles: true }));
    }, [box.x + 60, box.y + box.height / 2]);
    if (touches) ok('a swipe to the right steps back a photo', (await page.evaluate(() => document.querySelector('.viewer-n').textContent)) === 'Photo 1 of ' + withPhotos.photos.length);
    await page.keyboard.press('Escape');
    await page.waitForTimeout(200);
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.click('.hero');
    await page.waitForTimeout(250);
    const hero = await page.evaluate(() => ({ open: document.querySelector('.viewer').open, src: document.querySelector('.viewer-img').getAttribute('src'), arrows: document.querySelector('.viewer-next').hidden, cap: document.querySelector('.viewer-cap').textContent }));
    ok('the cover photo opens full screen, alone, with the address under it', hero.open && hero.src.endsWith(report.cover.photo + '.jpg') && hero.arrows && hero.cap === report.cover.address + ', ' + report.cover.locality, JSON.stringify(hero));
    const imgs = await page.evaluate(() => Array.from(document.querySelectorAll('img')).map((i) => ({ alt: i.hasAttribute('alt'), lazy: i.loading === 'lazy', sized: i.hasAttribute('width') && i.hasAttribute('height') })));
    ok('every picture has its alt text set, and every lazy one its size (so the page doesn\'t jump)', imgs.every((i) => i.alt) && imgs.filter((i) => i.lazy && !i.sized).length <= report.glance2.groups.reduce((a, g) => a + g.rows.length, 0), String(imgs.length));
    await ctx.close();
  }

  // ---- the contents: a sheet on a phone
  {
    const { ctx, page } = await open(browser);
    await page.click('.bar-toc');
    await page.waitForTimeout(250);
    const toc = await page.evaluate(() => ({ open: document.querySelector('.sheet-toc').open, entries: Array.from(document.querySelectorAll('.sheet-toc .toc a')).map((a) => a.querySelector('.toc-l').textContent), counts: Array.from(document.querySelectorAll('.sheet-toc .toc-n')).map((n) => n.textContent) }));
    const H = report.headings;
    const hasDetails = report.details.rows.length > 0 || !!report.details.property;
    const wantEntries = [H.glance, H.legend, ...(hasDetails ? [H.details] : []), ...report.sections.map((s) => s.number + '  ' + s.name), H.who_to_call, H.standards];
    const wantCounts = report.sections.map((s) => s.counts.SH + s.counts.MD + s.counts.MN + s.counts.NT).filter((x) => x > 0).map(String);
    ok('the contents list every part and section, each section with its number of findings', toc.open && same(toc.entries, wantEntries) && same(toc.counts, wantCounts), toc.entries.length + ' entries');
    await page.click('.sheet-toc .toc a[data-goto="s-C6"]');
    await page.waitForTimeout(150);
    await settle(page);
    const at = await page.evaluate(() => ({ top: Math.round(document.getElementById('s-C6').getBoundingClientRect().top), dialogs: document.querySelectorAll('dialog[open]').length, focus: document.activeElement.id }));
    ok('a tap on a section closes the contents and brings the section under the bar', at.dialogs === 0 && at.top >= 56 && at.top < 140 && at.focus === 's-C6', JSON.stringify(at));
    await ctx.close();
  }

  // ---- the PDF
  {
    const { ctx, page } = await open(browser);
    const links = await page.evaluate(() => Array.from(document.querySelectorAll('a[data-pdf]')).map((a) => ({ href: a.getAttribute('href'), name: a.getAttribute('download'), text: a.textContent.trim(), label: a.getAttribute('aria-label'), h: Math.round(a.getBoundingClientRect().height), shown: a.offsetParent !== null })));
    const shown = links.filter((l) => l.shown);
    ok('the PDF button is in the bar and again at the end, and downloads the file under the app\'s name for it',
      shown.length === 2 && shown.every((l) => l.href.endsWith(sample.pdf.url) && l.name === report.pdf_name && l.label === 'Download the PDF') && shown[0].text === 'PDF' && shown[1].text === 'Download the PDF', JSON.stringify(shown.map((l) => [l.text, l.name])));
    // the bar's look: the company's mark and name, then two quiet buttons of one kind and one height
    const bar = await page.evaluate(() => {
      const b = document.querySelector('.bar'), mark = b.querySelector('.bar-mark'), pdfB = b.querySelector('a[data-pdf]'), toc = b.querySelector('.bar-toc');
      const look = (e) => { const c = getComputedStyle(e), r = e.getBoundingClientRect(); return [c.backgroundColor, c.color, Math.round(r.height)].join(' '); };
      return { mark: mark ? Math.round(mark.getBoundingClientRect().width) + ' ' + getComputedStyle(mark).backgroundColor : null, logo: !!b.querySelector('img.bar-logo'), co: b.querySelector('.bar-co').textContent, pdf: look(pdfB), toc: look(toc), order: Array.from(b.querySelectorAll('.bar-in > *')).map((e) => e.className.split(' ').pop()).join(' ') };
    });
    const company = report.cover.inspector.company || report.cover.inspector.name || report.title;
    ok('the bar shows the company\'s mark beside its name, then the PDF and the contents as two quiet buttons of one kind',
      bar.mark === '32 rgb(31, 78, 121)' && bar.logo === !!report.cover.logo && bar.co === company && bar.pdf === bar.toc && !/^rgb\(31, 78, 121\)/.test(bar.pdf) && bar.order === 'bar-t bar-pdf bar-toc', JSON.stringify(bar));
    const pdf = await page.request.get(base + sample.pdf.url);
    const body = await pdf.body();
    ok('the file it points to is a PDF', pdf.status() === 200 && /application\/pdf/.test(pdf.headers()['content-type']) && body.slice(0, 5).toString() === '%PDF-', pdf.status() + ' ' + body.length + ' bytes');
    const [download] = await Promise.all([page.waitForEvent('download', { timeout: 8000 }).catch(() => null), page.click('.bar a[data-pdf]')]);
    ok('a click on it starts a download under that name', !!download && download.suggestedFilename() === report.pdf_name, download ? download.suggestedFilename() : 'no download');
    await ctx.close();
  }

  // ---- sideways scroll and tap targets, on small and large screens
  for (const [w, h] of [[320, 568], [360, 640], [390, 844], [430, 932], [640, 900], [700, 900], [768, 1024], [800, 900], [999, 800], [1024, 768], [1100, 800], [1180, 800], [1280, 900], [1600, 1000]]) {
    const { ctx, page } = await open(browser, { w, h, desktop: w >= 1000 });
    const m = await page.evaluate(() => {
      const wide = [];
      const vw = document.documentElement.clientWidth;
      for (const el of document.querySelectorAll('main *')) { const r = el.getBoundingClientRect(); if (r.width > 0 && (r.right > vw + 0.5 || r.left < -0.5)) wide.push(el.className || el.tagName); }
      const small = [];
      for (const el of document.querySelectorAll('.bar button, .bar a, .chip, .row, .call, .ph, .hero, .side a, .side .btn, .end .btn')) {
        if (el.offsetParent === null) continue;
        const r = el.getBoundingClientRect();
        const min = el.closest('.side') && el.tagName === 'A' && !el.classList.contains('btn') ? 36 : 44;
        if (r.height < min - 0.5 || r.width < 44 - 0.5) small.push((el.className || el.tagName) + ' ' + Math.round(r.width) + 'x' + Math.round(r.height));
      }
      const tiles = Array.from(document.querySelectorAll('.tile-l')).filter((t) => t.scrollWidth > t.parentElement.clientWidth + 0.5).length;
      return { sw: document.documentElement.scrollWidth, vw, wide: wide.slice(0, 4), small: small.slice(0, 4), tiles, side: getComputedStyle(document.querySelector('.side')).display, toc: getComputedStyle(document.querySelector('.bar-toc')).display };
    });
    ok(`${w}×${h}: nothing runs off the side, and everything to tap is big enough`, m.sw <= m.vw && m.wide.length === 0 && m.small.length === 0 && m.tiles === 0, JSON.stringify(m));
    ok(`${w}×${h}: the contents are ${w >= 1000 ? 'a column beside the report' : 'behind the bar\'s button'}`, w >= 1000 ? (m.side === 'block' && m.toc === 'none') : (m.side === 'none' && m.toc !== 'none'));
    // with a finding open
    await page.click('#glance .row');
    await page.waitForTimeout(200);
    const s = await page.evaluate(() => { const d = document.querySelector('.sheet-finding'); const r = d.getBoundingClientRect(); const inner = d.querySelector('.sheet-in'); return { l: Math.round(r.left), r: Math.round(r.right), t: Math.round(r.top), b: Math.round(r.bottom), vw: window.innerWidth, vh: window.innerHeight, sw: inner.scrollWidth, cw: inner.clientWidth }; });
    ok(`${w}×${h}: an open finding fits the screen`, s.l >= 0 && s.r <= s.vw && s.t >= 0 && s.b <= s.vh && s.sw <= s.cw, JSON.stringify(s));
    await ctx.close();
  }

  // ---- on a wide screen: the column of contents
  {
    const { ctx, page } = await open(browser, { w: 1280, h: 900, desktop: true });
    await page.click('.side a[data-goto="s-C9"]');
    await page.waitForTimeout(150);
    await settle(page);
    await page.waitForTimeout(150);
    const at = await page.evaluate(() => ({ top: Math.round(document.getElementById('s-C9').getBoundingClientRect().top), current: Array.from(document.querySelectorAll('.side a[aria-current="true"] .toc-l')).map((e) => e.textContent) }));
    ok('wide: a click in the contents brings that section up and marks it as the one being read', at.top >= 56 && at.top < 140 && at.current.length === 1 && /^\d+  Attic/.test(at.current[0]), JSON.stringify(at));
    await ctx.close();
  }

  // ---- the keyboard alone
  {
    const { ctx, page } = await open(browser, { w: 1280, h: 900, desktop: true });
    // Safari's Tab reaches links and buttons only with Option held (unless its setting says otherwise).
    await page.keyboard.press(engine.name() === 'webkit' ? 'Alt+Tab' : 'Tab');
    const first = await page.evaluate(() => document.activeElement.className + '|' + document.activeElement.textContent);
    await page.focus('#glance .row');
    await page.keyboard.press('Enter');
    await page.waitForTimeout(200);
    const opened = await page.evaluate(() => ({ open: document.querySelector('.sheet-finding').open, inside: document.querySelector('.sheet-finding').contains(document.activeElement) }));
    ok('keyboard: the first Tab offers to skip to the report, and Enter on a finding opens it with the focus inside', first === 'skip|Skip to the report' && opened.open && opened.inside, first);
    await ctx.close();
  }

  // ---- a link straight to one finding
  {
    const id = ranked()[5];
    const { ctx, page } = await open(browser, { path: '/r/sample#' + id });
    const s = await page.evaluate(() => { const d = document.querySelector('.sheet-finding'); return d && d.open ? d.querySelector('.fhead-t').textContent : ''; });
    ok('a link ending in a finding\'s id opens that finding', s.startsWith(numberOf(id) + ' '), s);
    await ctx.close();
    const byNumber = await open(browser, { path: '/r/sample#' + numberOf(id) });
    const s2 = await byNumber.page.evaluate(() => { const d = document.querySelector('.sheet-finding'); return d && d.open ? d.querySelector('.fhead-t').textContent : ''; });
    ok('a link ending in a finding\'s printed number ("#4.2") opens it too', s2.startsWith(numberOf(id) + ' '), s2);
    await byNumber.ctx.close();
  }

  // ---- a report's words are never run as code, and only Inspyx's own files are loaded
  {
    const evil = '<img src=x onerror="window.__pwned=1"><script>window.__pwned=2</script>';
    const hostile = clone(sample);
    hostile.report.cover.address = evil;
    hostile.report.cover.inspector.name = evil;
    hostile.report.cover.inspector.email = 'x@y.z"><script>window.__pwned=3</script>';
    hostile.report.cover.inspector.phone = 'javascript:window.__pwned=4';
    hostile.report.glance.lead = evil;
    hostile.report.sections[0].name = evil;
    hostile.report.sections[0].items[0].title = evil;
    hostile.report.sections[0].items[0].lines.unshift({ kind: 'information', label: evil, text: evil });
    hostile.report.sections[0].items[0].findings[0].title = evil;
    hostile.report.sections[0].items[0].findings[0].observed = evil;
    hostile.report.sections[0].items[0].findings[0].photos[0].caption = evil;
    hostile.report.pdf_name = evil;
    const firstPhoto = hostile.report.sections[0].items[0].findings[0].photos[0].file;
    hostile.files[firstPhoto] = { url: 'https://evil.example/steal.jpg', w: 800, h: 450, thumb: 'https://evil.example/steal-small.jpg' };
    hostile.files[hostile.report.cover.photo] = { url: 'javascript:window.__pwned=5', w: 10, h: 10 };
    hostile.pdf = { url: 'https://evil.example/report.pdf', name: 'x.pdf' };
    const { ctx, page, errs, requests } = await open(browser, { answer: () => ({ body: hostile }) });
    await page.click('[data-finding-card] .ph').catch(() => {});
    await page.waitForTimeout(300);
    const r = await page.evaluate(() => ({
      pwned: window.__pwned, scripts: document.querySelectorAll('main script, main img[src="x"]').length, h1: document.querySelector('h1').textContent,
      pdf: document.querySelectorAll('a[data-pdf]').length, hero: !!document.querySelector('.hero'), missing: document.querySelectorAll('.ph-missing').length,
      tel: Array.from(document.querySelectorAll('a[href^="tel:"], a[href^="javascript:"]')).map((a) => a.getAttribute('href')), mail: document.querySelectorAll('a[href^="mailto:x@y.z"]').length,
      viewerMissing: !document.querySelector('.viewer-missing').hidden,
    }));
    ok('markup in a report\'s words shows as the words it is, and nothing in it runs', r.pwned === undefined && r.scripts === 0 && r.h1 === evil, JSON.stringify(r));
    ok('a photo or PDF from anywhere but Inspyx is not loaded: the photo shows as missing, the PDF button is left out',
      requests.every((u) => !u.includes('evil.example')) && r.pdf === 0 && !r.hero && r.missing >= 1 && r.viewerMissing, JSON.stringify([r.pdf, r.hero, r.missing, r.viewerMissing]));
    ok('a phone number or email that is no such thing is not made into a link', r.tel.every((t) => !/javascript/i.test(t)) && r.mail === 0, JSON.stringify(r.tel));
    ok('and the page still stands, with no error', errs.filter((e) => !/Failed to load resource/.test(e)).length === 0, errs.join(' | '));
    await ctx.close();
  }

  // ---- the other states
  {
    const gone = await open(browser, { answer: () => ({ status: 404, body: { state: 'gone' } }) });
    const g = await gone.page.evaluate(() => ({ state: document.querySelector('[data-state]').dataset.state, text: document.querySelector('main').innerText, pdf: document.querySelectorAll('a[data-pdf]').length }));
    ok('a link that opens nothing says so, and says what to do', g.state === 'gone' && g.text.includes('This report link doesn’t work.') && g.text.includes('Please ask your inspector for a new one.') && g.pdf === 0, g.text.replace(/\n+/g, ' / '));
    await gone.ctx.close();

    const none = await open(browser, { path: '/r/not-a-key' });
    ok('an address that is no report link says the same', (await none.page.evaluate(() => document.querySelector('[data-state]').dataset.state)) === 'gone');
    await none.ctx.close();

    let tries = 0;
    const failing = await open(browser, { answer: () => (++tries === 1 ? { status: 500, body: {} } : { body: sample }) });
    const f1 = await failing.page.evaluate(() => ({ state: document.querySelector('[data-state]').dataset.state, text: document.querySelector('main').innerText }));
    await failing.page.click('main .btn');
    await failing.page.waitForSelector('#glance', { timeout: 5000 }).catch(() => {});
    const f2 = await failing.page.evaluate(() => !!document.querySelector('#glance') && document.querySelector('h1').textContent);
    ok('when the report can\'t be fetched the page says so, and "Try again" fetches it', f1.state === 'failed' && f1.text.includes('The report couldn’t be opened.') && f2 === report.cover.address, JSON.stringify(f1.text));
    await failing.ctx.close();

    const offline = await open(browser, { answer: () => ({ abort: true }) });
    ok('no connection: the same message', (await offline.page.evaluate(() => document.querySelector('[data-state]').dataset.state)) === 'failed');
    await offline.ctx.close();

    const about = { address: report.cover.address, locality: report.cover.locality, inspected: report.cover.inspected, inspector: report.cover.inspector.name, company: report.cover.inspector.company };
    const locked = await open(browser, { answer: () => ({ body: { state: 'locked', about, pay_url: '/pay/AAAAAAAAAAAAAAAAAAAAAA' } }) });
    const l = await locked.page.evaluate(() => ({ state: document.querySelector('[data-state]').dataset.state, text: document.querySelector('main').innerText, pay: (document.querySelector('main a.btn') || {}).href, findings: document.querySelectorAll('.card, .row').length, pdf: document.querySelectorAll('a[data-pdf]').length }));
    ok('a locked report shows where and when, says why it is closed, and offers the pay page; none of the report itself is there',
      l.state === 'locked' && l.text.includes(report.cover.address) && l.text.includes('This report opens once the inspection is paid.') && l.pay === base + '/pay/AAAAAAAAAAAAAAAAAAAAAA' && l.findings === 0 && l.pdf === 0, l.text.replace(/\n+/g, ' / ').slice(0, 120));
    await locked.ctx.close();

    const badPay = await open(browser, { answer: () => ({ body: { state: 'locked', about, pay_url: 'https://evil.example/pay' } }) });
    ok('a pay page anywhere but Inspyx is not offered', (await badPay.page.evaluate(() => document.querySelectorAll('main a.btn').length)) === 0);
    await badPay.ctx.close();

    const newer = clone(sample);
    newer.report.view = 'inspyx-report-view/2';
    const plain = await open(browser, { answer: () => ({ body: newer }) });
    const p = await plain.page.evaluate(() => ({ state: document.querySelector('[data-state]').dataset.state, text: document.querySelector('main').innerText, pdf: Array.from(document.querySelectorAll('a[data-pdf]')).map((a) => a.getAttribute('href')) }));
    ok('a report in a form this page doesn\'t know yet still gets its address and its PDF', p.state === 'plain' && p.text.includes(report.cover.address) && p.text.includes('The PDF has all of it.') && p.pdf.length === 1 && p.pdf[0].endsWith(sample.pdf.url), p.text.replace(/\n+/g, ' / ').slice(0, 120));
    await plain.ctx.close();

    const broken = clone(sample);
    delete broken.report.sections;
    const b = await open(browser, { answer: () => ({ body: broken }) });
    ok('a report the page can\'t lay out falls back to the PDF too, instead of a blank page', (await b.page.evaluate(() => document.querySelector('[data-state]').dataset.state)) === 'plain');
    await b.ctx.close();
  }

  // ---- a report with nothing wrong, and one with no PDF yet
  {
    const calm = clone(sample);
    calm.report.glance.groups = [];
    calm.report.glance.none = 'No deficiencies were observed in the inspected systems';
    calm.report.glance2.groups = [];
    calm.report.glance2.none = 'No deficiencies were observed in the inspected systems';
    calm.report.who_to_call = [];
    calm.report.who_to_call2 = [];
    calm.report.sections.forEach((s) => { s.counts = { SH: 0, MD: 0, MN: 0, NT: 0 }; s.items.forEach((i) => { i.findings = []; }); });
    calm.report.counts = Object.assign({}, calm.report.counts, { findings: 0, SH: 0, MD: 0, MN: 0 });
    calm.pdf = null;
    const { ctx, page, errs } = await open(browser, { answer: () => ({ body: calm }) });
    const r = await page.evaluate(() => ({ none: (document.querySelector('#glance .none') || {}).textContent, chips: document.querySelectorAll('.chip').length, call: !!document.getElementById('call'), pdf: document.querySelectorAll('a[data-pdf]').length, tocCall: Array.from(document.querySelectorAll('.side .toc-l')).some((e) => e.textContent === 'Who to call') }));
    ok('a report with no deficiencies says so in the report\'s words; no chips, no "Who to call"; and with no PDF, no PDF button',
      r.none === 'No deficiencies were observed in the inspected systems' && r.chips === 0 && !r.call && !r.tocCall && r.pdf === 0 && errs.length === 0, JSON.stringify(r));
    await ctx.close();
  }

  // ---- motion turned off
  {
    const { ctx, page } = await open(browser, { reduced: true });
    const id = ranked()[0];
    await page.click(`#glance .row[data-finding="${id}"]`);
    await page.click('.sheet-more .link');
    await page.waitForTimeout(250);
    const r = await page.evaluate((fid) => { const el = document.getElementById('f-' + fid); return { top: Math.round(el.getBoundingClientRect().top), anim: getComputedStyle(el).animationName }; }, id);
    ok('motion off: the page jumps to the card instead of gliding, and the card is marked without a pulse', r.top >= 56 && r.top < 200 && r.anim === 'none', JSON.stringify(r));
    await ctx.close();
  }

  // ---- a page left open past the life of its addresses
  {
    // The function signs new addresses at every visit: here, the same files with ?v=<visit> added.
    let visits = 0;
    const answer = () => {
      visits += 1;
      const a = clone(sample);
      const v = (u) => u + (u.includes('?') ? '&' : '?') + 'v=' + visits;
      for (const sha of Object.keys(a.files)) { a.files[sha].url = v(a.files[sha].url); if (a.files[sha].thumb) a.files[sha].thumb = v(a.files[sha].thumb); }
      if (a.pdf) a.pdf.url = v(a.pdf.url);
      return { body: a };
    };
    const { ctx, page, errs } = await open(browser, { answer });
    await page.waitForTimeout(500);
    const last = report.sections[report.sections.length - 1];
    const farPhoto = report.sections.flatMap((s) => s.items.flatMap((i) => i.findings.flatMap((f) => f.photos))).pop().file;
    const before = await page.evaluate((sha) => ({
      hero: document.querySelector('.hero-img').getAttribute('src'), heroLoaded: document.querySelector('.hero-img').naturalWidth > 0,
      far: Array.from(document.querySelectorAll('main img[data-file="' + sha + '"]')).map((i) => [i.getAttribute('src'), i.complete && i.naturalWidth > 0]),
      pdf: document.querySelector('.bar a[data-pdf]').getAttribute('href'),
    }), farPhoto);
    // Soon after, coming back to the page asks for nothing.
    await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
    await page.waitForTimeout(300);
    const soon = visits;
    // Two hours on, the reader comes back to it.
    await page.evaluate(() => { const real = Date.now.bind(Date); Date.now = () => real() + 2 * 60 * 60 * 1000; });
    await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
    await page.waitForFunction(() => document.querySelector('.bar a[data-pdf]').getAttribute('href').includes('v=2'), null, { timeout: 5000 }).catch(() => {});
    const after = await page.evaluate((sha) => ({
      hero: document.querySelector('.hero-img').getAttribute('src'),
      far: Array.from(document.querySelectorAll('main img[data-file="' + sha + '"]')).map((i) => i.getAttribute('src')),
      pdfs: Array.from(document.querySelectorAll('a[data-pdf]')).map((a) => a.getAttribute('href')),
    }), farPhoto);
    ok('a page left open two hours gets new addresses when its reader comes back: the PDF, and pictures not loaded yet; what is on screen stays',
      soon === 1 && visits === 2 && before.heroLoaded && after.hero === before.hero && before.far.length > 0 && before.far.every((f) => f[0].includes('v=1') && !f[1])
        && after.far.every((src) => src.includes('v=2')) && after.pdfs.length >= 2 && after.pdfs.every((p) => p.includes('v=2')),
      JSON.stringify({ soon, visits, hero: [before.hero.slice(-12), after.hero.slice(-12)], far: [before.far, after.far.map((x) => x.slice(-6))] }).slice(0, 400));
    // The picture loads at its new address once it is scrolled to, and opens full size at a new one too.
    await page.evaluate((sha) => document.querySelector('main img[data-file="' + sha + '"]').scrollIntoView({ block: 'center' }), farPhoto);
    await page.waitForFunction((sha) => { const i = document.querySelector('main img[data-file="' + sha + '"]'); return i.complete && i.naturalWidth > 0; }, farPhoto, { timeout: 5000 }).catch(() => {});
    await page.click('main img[data-file="' + farPhoto + '"]');
    await page.waitForTimeout(400);
    const view = await page.evaluate(() => { const i = document.querySelector('.viewer-img'); return { src: i.getAttribute('src'), ok: i.naturalWidth > 0 }; });
    ok('that picture then loads, and opens full size, at its new address', view.ok && view.src.includes('v=2') && errs.length === 0, JSON.stringify(view) + errs.join('|'));
    await ctx.close();
    void last;
  }
  {
    // A picture that fails once its address is old is asked for again at a new one.
    let visits = 0;
    const answer = () => {
      visits += 1;
      const a = clone(sample);
      const v = (u) => u + '?v=' + visits;
      for (const sha of Object.keys(a.files)) { a.files[sha].url = v(a.files[sha].url); if (a.files[sha].thumb) a.files[sha].thumb = v(a.files[sha].thumb); }
      if (a.pdf) a.pdf.url = v(a.pdf.url);
      return { body: a };
    };
    const { ctx, page } = await open(browser, { answer });
    await page.waitForTimeout(400);
    const farPhoto = report.sections.flatMap((s) => s.items.flatMap((i) => i.findings.flatMap((f) => f.photos))).pop().file;
    // The first addresses have stopped working.
    await page.route('**/sample-report/files/**v=1', (route) => route.abort('failed'));
    await page.evaluate(() => { const real = Date.now.bind(Date); Date.now = () => real() + 2 * 60 * 60 * 1000; });
    await page.evaluate((sha) => document.querySelector('main img[data-file="' + sha + '"]').scrollIntoView({ block: 'center' }), farPhoto);
    await page.waitForFunction((sha) => { const i = document.querySelector('main img[data-file="' + sha + '"]'); return i.getAttribute('src').includes('v=2') && i.complete && i.naturalWidth > 0; }, farPhoto, { timeout: 6000 }).catch(() => {});
    const r = await page.evaluate((sha) => { const i = document.querySelector('main img[data-file="' + sha + '"]'); return { src: i.getAttribute('src').slice(-6), loaded: i.naturalWidth > 0, missing: !!i.closest('.ph-missing') }; }, farPhoto);
    ok('a picture that fails once its address is old is asked for again at a new one, and shows', visits === 2 && r.loaded && !r.missing && r.src.includes('v=2'), JSON.stringify({ visits, r }));
    // The PDF, tapped with an old address: a new address first, then the download.
    await page.evaluate(() => { const now = Date.now; Date.now = () => now() + 2 * 60 * 60 * 1000; });
    await page.waitForTimeout(100);
    const [download] = await Promise.all([page.waitForEvent('download', { timeout: 8000 }).catch(() => null), page.click('.bar a[data-pdf]')]);
    ok('the PDF tapped with an old address is fetched at a new one', !!download && download.url().includes('v=3') && visits === 3, (download ? download.url().slice(-24) : 'no download') + ' visits=' + visits);
    await ctx.close();
  }

  // ---- a browser (or a frame) whose step back never arrives
  {
    const { ctx, page, errs } = await open(browser, { init: () => { History.prototype.go = function () {}; History.prototype.back = function () {}; } });
    const id = ranked()[2];
    await page.click(`#glance .row[data-finding="${id}"]`);
    await page.waitForTimeout(200);
    const opened = await page.evaluate(() => document.querySelectorAll('dialog[open]').length);
    await page.click('.sheet-finding .ibtn[aria-label="Close"]');
    await page.waitForTimeout(1000);
    const first = await page.evaluate(() => ({ dialogs: document.querySelectorAll('dialog[open]').length, locked: document.documentElement.classList.contains('is-locked') }));
    // from then on the page closes its sheets itself, at once
    await page.click(`#glance .row[data-finding="${id}"]`);
    await page.click('.sheet-finding .ph');
    await page.waitForTimeout(200);
    const two = await page.evaluate(() => document.querySelectorAll('dialog[open]').length);
    await page.click('.viewer .ibtn[aria-label="Close"]');
    await page.waitForTimeout(100);
    const one = await page.evaluate(() => document.querySelectorAll('dialog[open]').length);
    await page.click('.sheet-more .link');
    await page.waitForTimeout(150);
    await settle(page);
    const g = await page.evaluate((fid) => { const el = document.getElementById('f-' + fid); return { top: Math.round(el.getBoundingClientRect().top), dialogs: document.querySelectorAll('dialog[open]').length }; }, id);
    ok('where the step back never arrives, a sheet still closes (a moment later the first time, at once after that)',
      opened === 1 && first.dialogs === 0 && !first.locked && two === 2 && one === 1 && g.dialogs === 0 && g.top >= 56 && g.top < 200 && errs.length === 0,
      JSON.stringify({ opened, first, two, one, g, errs }));
    await ctx.close();
  }

  // ---- a preview that keeps samples beside it can show each of them
  {
    const { ctx, page, errs } = await open(browser, { init: () => { window.INSPYX_REPORT = { sample: '/sample-report/' }; }, path: '/report' });
    const start = await page.evaluate(() => ({ h1: document.querySelector('h1').textContent, rows: document.querySelectorAll('#glance .row').length }));
    await page.click('#glance .row');
    await page.waitForTimeout(200);
    await page.evaluate(() => window.INSPYX_REPORT.show('locked'));
    await page.waitForFunction(() => document.querySelector('[data-state="locked"]'), null, { timeout: 4000 }).catch(() => {});
    const locked = await page.evaluate(() => ({ state: (document.querySelector('[data-state]') || {}).dataset && document.querySelector('[data-state]').dataset.state, dialogs: document.querySelectorAll('dialog[open]').length, sheets: document.querySelectorAll('dialog.sheet').length, locked: document.documentElement.classList.contains('is-locked'), y: window.scrollY }));
    await page.evaluate(() => window.INSPYX_REPORT.show('report'));
    await page.waitForFunction(() => document.querySelector('#glance .row'), null, { timeout: 4000 }).catch(() => {});
    await page.click('#glance .row');
    await page.waitForTimeout(200);
    const back = await page.evaluate(() => ({ h1: document.querySelector('h1').textContent, rows: document.querySelectorAll('#glance .row').length, sheets: document.querySelectorAll('dialog.sheet').length, open: document.querySelectorAll('dialog[open]').length }));
    ok('a preview can ask for another of its samples, and for the report again, with nothing left over from the one before',
      start.rows === ranked().length && locked.state === 'locked' && locked.dialogs === 0 && locked.sheets === 0 && !locked.locked && locked.y === 0
        && back.h1 === start.h1 && back.rows === start.rows && back.sheets === 1 && back.open === 1 && errs.length === 0,
      JSON.stringify({ start, locked, back, errs }));
    await ctx.close();
  }

  await browser.close();
  console.log(failed ? '\n' + failed + ' CHECK(S) FAILED' : '\nall checks passed');
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
