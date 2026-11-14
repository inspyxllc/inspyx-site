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
const { chromium } = require('playwright');

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
const allFindings = () => report.sections.flatMap((s) => s.items.flatMap((i) => i.findings));
const ranked = () => report.glance2.groups.flatMap((g) => g.rows.map((r) => r.id));
const numberOf = (id) => allFindings().find((f) => f.id === id).number;

(async () => {
  const browser = await chromium.launch();

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
    await page.evaluate(([x, y]) => {
      const stage = document.querySelector('.viewer-stage');
      const touch = (cx) => new Touch({ identifier: 1, target: stage, clientX: cx, clientY: y });
      stage.dispatchEvent(new TouchEvent('touchstart', { touches: [touch(x)], changedTouches: [touch(x)], bubbles: true }));
      stage.dispatchEvent(new TouchEvent('touchend', { touches: [], changedTouches: [touch(x + 140)], bubbles: true }));
    }, [box.x + 60, box.y + box.height / 2]);
    ok('a swipe to the right steps back a photo', (await page.evaluate(() => document.querySelector('.viewer-n').textContent)) === 'Photo 1 of ' + withPhotos.photos.length);
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
    await page.keyboard.press('Tab');
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
