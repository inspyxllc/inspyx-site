// Serves the coming-soon folder the way Vercel does (clean URLs), for local checks.
// usage: node tools/serve.js [port]     then open http://localhost:4173/
const http = require('http');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..', 'coming-soon');
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

http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]);
  const asked = p;
  if (p.endsWith('/')) p += 'index.html';
  let file = path.join(root, p);
  if (!file.startsWith(root)) { res.writeHead(403); res.end(); return; }
  if (!fs.existsSync(file) && fs.existsSync(file + '.html')) file += '.html';
  if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) {
    const missing = path.join(root, '404.html');
    res.writeHead(404, { 'Content-Type': types['.html'] });
    res.end(fs.existsSync(missing) ? fs.readFileSync(missing) : 'Not found');
    return;
  }
  res.writeHead(200, Object.assign({ 'Content-Type': types[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store' }, extra(asked)));
  res.end(fs.readFileSync(file));
}).listen(port, () => console.log('serving ' + root + ' at http://localhost:' + port + '/'));
