// Builds a private preview of the client's report page: the page's own stylesheet and script, unchanged,
// in one file that a claude.ai artifact (or any plain file host) can show, with a sample report beside it.
// It is how Moises looks at the page before it is live: nothing is put on inspyx.com.
//
// usage: node tools/report_preview.js <sample folder> <out folder>
//
// The sample folder is the one tools/report_serve.js takes with --sample: report.json (what the report
// function answers for an open report), files/ (its photos) and report.pdf. The preview adds the page's
// other states (not paid yet, PDF only, link not working) and a strip at the end to switch between them.
// Publish <out folder>/web-report-sample.html with everything under <out folder>/sample-report/ beside it.
// The sample is not kept in this repo, which is public.
const { readFileSync, writeFileSync, mkdirSync, copyFileSync, readdirSync, rmSync, existsSync } = require('fs');
const { join } = require('path');
const vm = require('vm');

const [sample, out] = process.argv.slice(2);
if (!sample || !out) { console.error('usage: node tools/report_preview.js <sample folder> <out folder>'); process.exit(2); }
const site = join(__dirname, '..');
const css = readFileSync(join(site, 'coming-soon/assets/report.css'), 'utf8');
const js = readFileSync(join(site, 'coming-soon/assets/report.js'), 'utf8');
if (/<\/script|<\/style/i.test(css + js)) throw new Error('the page code holds a closing tag: it cannot be put in one file as it is');

const previewCss = `
/* ---------------------------------------------------------------- this preview only (not part of the page) */
.bar{top:env(safe-area-inset-top, 0px); padding-top:0}
body::before{content:""; position:fixed; inset:0 0 auto; height:env(safe-area-inset-top, 0px); z-index:10; background:#FFFFFF}
.foot{padding-bottom:26px}
.state{min-height:54vh}
.pv{max-width:1188px; margin:0 auto; padding:18px var(--gr) 30px var(--gl)}
.pv-in{padding:14px 14px 16px; border:1px dashed #9AA5B1; border-radius:12px; background:#FAFBFC}
.pv-h{margin:0; font:650 12px/1.3 var(--sans); letter-spacing:.08em; text-transform:uppercase; color:var(--muted)}
.pv-t{margin:6px 0 0; font-size:15px; color:var(--ink)}
.pv-row{display:flex; flex-wrap:wrap; gap:8px; margin-top:10px}
.pv-b{min-height:44px; padding:0 14px; border:1px solid var(--line); border-radius:999px; background:#FFFFFF; color:var(--ink); font-size:15px; cursor:pointer}
.pv-b[aria-pressed="true"]{border-color:var(--navy); background:var(--navy); color:#FFFFFF}
.pv-diag{margin:12px 0 0; padding:10px; border-radius:8px; background:#FFFFFF; border:1px solid var(--line); color:var(--muted); font:12px/1.5 ui-monospace,Menlo,Consolas,monospace; white-space:pre-wrap; overflow-wrap:anywhere}
.pv-note{position:fixed; z-index:30; left:max(16px, env(safe-area-inset-left, 0px)); right:max(16px, env(safe-area-inset-right, 0px)); bottom:calc(16px + env(safe-area-inset-bottom, 0px)); max-width:460px; margin:0 auto; padding:12px 14px; border-radius:12px; background:#1B2430; color:#FFFFFF; font-size:15px; line-height:1.4; box-shadow:0 6px 24px rgba(16,22,30,.28)}
`;

const shim = `
/* This preview only. The page's own code is above, unchanged. Two things a page shown inside this preview
   can't do the way it does on inspyx.com: download a file from a link, and leave for the pay page. */
(function () {
  'use strict';
  var cfg = window.INSPYX_REPORT;
  var note = document.getElementById('pv-note');
  var timer = null;
  function say(text, stay) {
    clearTimeout(timer);
    note.textContent = text || '';
    note.hidden = !text;
    if (text && !stay) timer = setTimeout(function () { note.hidden = true; }, 7000);
  }

  // The page's other states.
  var buttons = Array.prototype.slice.call(document.querySelectorAll('.pv-b'));
  buttons.forEach(function (b) {
    b.addEventListener('click', function () {
      buttons.forEach(function (o) { o.setAttribute('aria-pressed', String(o === b)); });
      say('');
      cfg.show(b.getAttribute('data-show'));
    });
  });

  // Saving the PDF: asked of the viewer, who is shown the file's name and size and says yes or no.
  var saver;             // undefined until the viewer has answered whether it can save files here
  var asking = window.claude && typeof window.claude.use === 'function'
    ? window.claude.use('downloads').then(function (d) { saver = d || null; return saver; }, function () { saver = null; return null; })
    : Promise.resolve(null).then(function () { saver = null; return null; });
  var busy = false;
  var COVER = '__COVER__';
  var CANT = 'This preview can\\u2019t hand over a file here. On the real page, this button downloads the PDF.';

  function save(link) {
    if (busy) return;
    busy = true;
    say('Getting the PDF\\u2026', true);
    var name = link.getAttribute('data-name') || 'Inspection Report.pdf';
    fetch(link.href)
      .then(function (r) { if (!r.ok) throw new Error('pdf ' + r.status); return r.blob(); })
      .then(function (blob) { return saver.save({ filename: name, data: blob }); })
      .then(function () { say(''); }, function (err) {
        var code = err && err.code;
        if (code === 'declined') say('');
        else if (code === 'rate_limited') say('A save is already waiting for your answer.');
        else say(CANT);
      })
      .then(function () { busy = false; });
  }

  // If the sample can't be opened here, say what was tried (this preview only).
  setTimeout(function () {
    if (!document.querySelector('[data-state="failed"]')) return;
    var box = document.createElement('pre');
    box.className = 'pv-diag';
    document.querySelector('.pv-in').appendChild(box);
    var out = [];
    function add(line) { out.push(line); box.textContent = out.join('\\n'); }
    var base = '';
    try { base = new URL(document.baseURI); } catch (err) { /* none */ }
    add('page ' + location.pathname + ' | base ' + (base ? (base.origin === location.origin ? 'same place ' : 'elsewhere ') + base.pathname : 'none'));
    [['plain', {}], ['no-store', { cache: 'no-store' }], ['no cookies', { credentials: 'omit' }], ['no referrer', { referrerPolicy: 'no-referrer' }], ['accept', { headers: { Accept: 'application/json' } }]].forEach(function (t) {
      fetch('sample-report/gone.json', t[1]).then(function (r) { add(t[0] + ': ' + r.status + ' ' + (r.headers.get('content-type') || '')); }, function (e) { add(t[0] + ': ' + (e && e.message)); });
    });
    var img = new Image();
    img.onload = function () { add('picture: ok'); };
    img.onerror = function () { add('picture: failed'); };
    img.src = 'sample-report/files/' + COVER + '.t.jpg';
  }, 3000);

  document.addEventListener('click', function (e) {
    var t = e.target && e.target.closest ? e.target : null;
    if (!t) return;
    if (t.closest('.state-locked a.btn')) {
      e.preventDefault();
      say('Preview: on the real page, this opens the pay page for that inspection.');
      return;
    }
    var link = t.closest('a[data-pdf]');
    if (!link) return;
    if (link.hasAttribute('download')) { link.setAttribute('data-name', link.getAttribute('download')); link.removeAttribute('download'); }
    if (saver) { e.preventDefault(); save(link); return; }
    if (saver === null) {
      // No way to save here: let the link open the PDF in a new tab where the viewer allows that.
      link.setAttribute('target', '_blank');
      link.setAttribute('rel', 'noopener');
      say('If the PDF didn\\u2019t open: this preview can\\u2019t hand over a file here. On the real page, this button downloads it.');
      return;
    }
    e.preventDefault();
    say('One moment\\u2026', true);
    asking.then(function (d) { if (d) save(link); else say('Tap PDF once more to open it.'); });
  }, true);
})();
`;

const html = `<title>Web Report Sample</title>
<meta name="claude:viewport-fit-sides" content="cover">
<style>
${css}
${previewCss}</style>
<a class="skip" href="#report">Skip to the report</a>
<div id="app" aria-busy="true">
  <p class="state state-wait" role="status">Opening the report…</p>
</div>
<aside class="pv" aria-label="Preview only">
  <div class="pv-in">
    <p class="pv-h">Preview only · not part of the client’s page</p>
    <p class="pv-t">What a client sees when:</p>
    <div class="pv-row" role="group" aria-label="What a client sees when">
      <button class="pv-b" type="button" data-show="report" aria-pressed="true">The report is open</button>
      <button class="pv-b" type="button" data-show="locked" aria-pressed="false">It isn’t paid yet</button>
      <button class="pv-b" type="button" data-show="plain" aria-pressed="false">Only the PDF can be shown</button>
      <button class="pv-b" type="button" data-show="gone" aria-pressed="false">The link doesn’t work</button>
    </div>
  </div>
</aside>
<p class="pv-note" id="pv-note" role="status" hidden></p>
<script>window.INSPYX_REPORT = { sample: 'sample-report/' };</script>
<script>
${js}
</script>
<script>
${shim}
</script>
`;

if (existsSync(out)) rmSync(out, { recursive: true });
mkdirSync(join(out, 'sample-report/files'), { recursive: true });

// The sample's answers, with addresses that sit beside the page (the local server's start at /sample-report/).
const beside = (url) => String(url).replace(/^\/?sample-report\//, 'sample-report/');
const open = JSON.parse(readFileSync(join(sample, 'report.json'), 'utf8'));
for (const sha of Object.keys(open.files)) { open.files[sha].url = beside(open.files[sha].url); if (open.files[sha].thumb) open.files[sha].thumb = beside(open.files[sha].thumb); }
if (open.pdf) open.pdf.url = beside(open.pdf.url);
const cover = open.report.cover;
const about = { address: cover.address, locality: cover.locality, inspected: cover.inspected, inspector: cover.inspector.name, company: cover.inspector.company, photo: open.files[cover.photo].url };
writeFileSync(join(out, 'sample-report/report.json'), JSON.stringify(open));
writeFileSync(join(out, 'sample-report/locked.json'), JSON.stringify({ state: 'locked', sample: true, about, pay_url: 'https://inspyx.com/pay/sample' }));
writeFileSync(join(out, 'sample-report/plain.json'), JSON.stringify({ state: 'plain', sample: true, about, pdf: open.pdf }));
writeFileSync(join(out, 'sample-report/gone.json'), JSON.stringify({ state: 'gone' }));
for (const f of readdirSync(join(sample, 'files'))) copyFileSync(join(sample, 'files', f), join(out, 'sample-report/files', f));
copyFileSync(join(sample, 'report.pdf'), join(out, 'sample-report/report.pdf'));
writeFileSync(join(out, 'web-report-sample.html'), html.replace('__COVER__', cover.photo));

// Every script in the file must at least read as a script (a slip here would leave a page that does nothing).
const written = readFileSync(join(out, 'web-report-sample.html'), 'utf8');
for (const m of written.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script\s*>/gi)) new vm.Script(m[1]);
console.log('wrote', join(out, 'web-report-sample.html'), written.length, 'bytes, with', readdirSync(join(out, 'sample-report/files')).length, 'photo files beside it');
