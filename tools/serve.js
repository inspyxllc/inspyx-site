// Serves the coming-soon folder the way Vercel does (clean URLs), for local checks.
// usage: node tools/serve.js [port]     then open http://localhost:4173/
const http = require('http');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..', 'coming-soon');
const port = parseInt(process.argv[2] || '4173', 10);
const types = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp',
  '.json': 'application/json', '.txt': 'text/plain; charset=utf-8', '.xml': 'application/xml'
};

// The headers vercel.json asks for (the sign-in pages' rule about what may run and load), sent here too, so that a
// page is checked locally under the rule it will be served with. Only the plain form "/(a|b)" of a source is read.
const extra = (p) => {
  const out = {};
  let rules = [];
  try { rules = JSON.parse(fs.readFileSync(path.join(root, 'vercel.json'), 'utf8')).headers || []; } catch (e) { rules = []; }
  rules.forEach((r) => { if (new RegExp('^' + r.source + '$').test(p)) r.headers.forEach((h) => { out[h.key] = h.value; }); });
  return out;
};

// vercel.json's rewrites, as Vercel serves them: a plain source (/a is the agent page), or one whose last part is a
// ":name" standing for one path segment (/book/:slug is the booking page, 2026-11-21).
const rewritten = (p) => {
  let list = [];
  try { list = JSON.parse(fs.readFileSync(path.join(root, 'vercel.json'), 'utf8')).rewrites || []; } catch (e) { list = []; }
  const hit = list.find((r) => {
    if (!r.source.includes(':')) return r.source === p;
    const m = r.source.match(/^(\/[a-z0-9/-]*?)\/:[a-z]+$/);
    return m !== null && p.startsWith(m[1] + '/') && /^[^/]+$/.test(p.slice(m[1].length + 1));
  });
  return hit ? hit.destination : p;
};

// vercel.json's redirects (plain sources): the old import pages to Bring your business (2026-11-27). Vercel answers
// 307 for "permanent": false, with the query kept.
const redirected = (p) => {
  let list = [];
  try { list = JSON.parse(fs.readFileSync(path.join(root, 'vercel.json'), 'utf8')).redirects || []; } catch (e) { list = []; }
  const hit = list.find((r) => r.source === p || r.source + '.html' === p);
  return hit ? { to: hit.destination, code: hit.permanent ? 308 : 307 } : null;
};

http.createServer((req, res) => {
  const asked = decodeURIComponent(req.url.split('?')[0]);
  const away = redirected(asked);
  if (away) { const q = req.url.indexOf('?'); res.writeHead(away.code, { Location: away.to + (q >= 0 ? req.url.slice(q) : '') }); res.end(); return; }
  let p = rewritten(asked);
  if (p.endsWith('/')) p += 'index.html';
  // Only a file inside the folder, after every ".." is resolved: anything else is refused (code scanning's
  // path-injection rule, on main since this server was written).
  const inside = (f) => f.startsWith(root + path.sep);
  const asFile = path.resolve(root, '.' + p);
  const asPage = path.resolve(root, '.' + p + '.html');
  if (!inside(asFile) || !inside(asPage)) { res.writeHead(403); res.end(); return; }
  const file = !fs.existsSync(asFile) && fs.existsSync(asPage) ? asPage : asFile;
  if (!inside(file) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
    const missing = path.join(root, '404.html');
    // A wrong address gets the rules' headers too, as on Vercel: its header rules run before the file lookup
    // (routing-utils puts them ahead of "handle: filesystem"), whatever the lookup then finds.
    res.writeHead(404, Object.assign({ 'Content-Type': types['.html'] }, extra(asked)));
    res.end(fs.existsSync(missing) ? fs.readFileSync(missing) : 'Not found');
    return;
  }
  res.writeHead(200, Object.assign({ 'Content-Type': types[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store' }, extra(asked)));
  res.end(fs.readFileSync(file));
}).listen(port, () => console.log('serving ' + root + ' at http://localhost:' + port + '/'));
