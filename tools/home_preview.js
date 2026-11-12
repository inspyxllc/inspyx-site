// Builds a private preview of the new home page (site repo, branch claude/new-home-page)
// as an artifact bundle: the page itself, its other pages and its assets.
//
//   node tools/home_preview.js . <out folder>
//
// What changes, and nothing else:
//   - the site's absolute addresses (/assets/…, /pricing) become addresses next to the page;
//   - the waitlist form is marked data-preview, so it shows its thank-you and sends nothing;
//   - the page itself loses its <!doctype>, <html>, <head> and <body> wrappers, because the
//     artifact wraps the file it is given. The other pages keep theirs: they are served whole.
const fs = require('fs');
const path = require('path');

const repo = process.argv[2];
const out = process.argv[3];
if (!repo || !out) { console.error('usage: node tools/home_preview.js . <out folder>'); process.exit(2); }

const src = path.join(repo, 'coming-soon');
const PAGES = { 'index.html': 'index.html', 'pricing.html': 'pricing.html', 'privacy.html': 'privacy.html', 'terms.html': 'terms.html', 'refunds.html': 'refunds.html', '404.html': '404.html' };

/** The site's addresses, as they are on inspyx.com, become addresses next to this page. */
function here(html) {
  return html
    .replace(/(["'(\s])\/assets\//g, '$1assets/')
    .replace(/href="\/"/g, 'href="index.html"')
    .replace(/href="\/([a-z0-9-]+)"/g, (m, name) => (PAGES[name + '.html'] ? `href="${name}.html"` : m));
}

fs.rmSync(out, { recursive: true, force: true });
fs.mkdirSync(path.join(out, 'assets'), { recursive: true });

// the assets, as they are
let assets = 0;
for (const name of fs.readdirSync(path.join(src, 'assets'))) {
  fs.copyFileSync(path.join(src, 'assets', name), path.join(out, 'assets', name));
  assets++;
}

// the page: its wrappers off, its form in preview
let page = here(fs.readFileSync(path.join(src, 'index.html'), 'utf8'));
const before = page.length;
page = page
  .replace(/^[\s\S]*?<head>\s*/i, '')
  .replace(/<\/head>\s*<body[^>]*>\s*/i, '\n')
  .replace(/\s*<\/body>\s*<\/html>\s*$/i, '\n');
if (page.length >= before || /<\/head>|<body|<\/html>/i.test(page)) { console.error('the page still has a wrapper'); process.exit(1); }
page = page.replace('<form class="join" data-join', '<form class="join" data-join data-preview');
if (!page.includes('data-preview')) { console.error('the waitlist form was not found'); process.exit(1); }
fs.writeFileSync(path.join(out, 'index.html'), page);

// the other pages, whole
let pages = 1;
for (const name of Object.keys(PAGES)) {
  if (name === 'index.html') continue;
  const from = path.join(src, name);
  if (!fs.existsSync(from)) continue;
  fs.writeFileSync(path.join(out, name), here(fs.readFileSync(from, 'utf8')));
  pages++;
}

const left = (fs.readFileSync(path.join(out, 'index.html'), 'utf8').match(/["'(]\/[a-z]/g) || []).length;
console.log(`${out}: the page (${page.length} characters), ${pages} pages in all, ${assets} assets; addresses still starting at the site's root: ${left}`);
