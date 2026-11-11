// Serves coming-soon/ on this machine the way Vercel serves it, for checking the report page:
// clean URLs, and the rewrites and headers written in coming-soon/vercel.json (so /r/<key> opens
// report.html under the same Content-Security-Policy the live page gets).
//
// usage: node tools/report_serve.js [--sample <folder>] [--port 4174]
//
// --sample serves a folder at /sample-report/ : a sample report (report.json, its photos, its PDF).
// The sample is not kept in this repo, which is public.
const http = require('http');
const fs = require('fs');
const path = require('path');

const args = process.argv.slice(2);
const opt = (name, fallback) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : fallback; };
const ROOT = path.join(__dirname, '..', 'coming-soon');
const SAMPLE = opt('--sample', null);
const PORT = Number(opt('--port', 4174));
const config = JSON.parse(fs.readFileSync(path.join(ROOT, 'vercel.json'), 'utf8'));

const TYPES = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg',
  '.webp': 'image/webp', '.pdf': 'application/pdf', '.txt': 'text/plain; charset=utf-8', '.xml': 'application/xml',
};

// Vercel's source patterns, as far as vercel.json uses them: ":name" is one path part, "(.*)" anything.
const pattern = (source) => new RegExp('^' + source.replace(/:[A-Za-z]+/g, '([^/]+)') + '/?$');
const rewrites = (config.rewrites || []).map((r) => ({ re: pattern(r.source), to: r.destination }));
const headers = (config.headers || []).map((h) => ({ re: pattern(h.source), set: h.headers }));

function fileFor(urlPath) {
  if (SAMPLE && urlPath.startsWith('/sample-report/')) {
    const f = path.join(SAMPLE, urlPath.slice('/sample-report/'.length));
    return f.startsWith(path.resolve(SAMPLE)) || f.startsWith(SAMPLE) ? f : null;
  }
  let p = urlPath;
  for (const r of rewrites) if (r.re.test(p)) { p = r.to; break; }
  if (p.endsWith('/')) p += 'index';
  const direct = path.join(ROOT, p);
  if (!direct.startsWith(ROOT)) return null;
  if (fs.existsSync(direct) && fs.statSync(direct).isFile()) return direct;
  if (config.cleanUrls && fs.existsSync(direct + '.html')) return direct + '.html';
  return null;
}

http.createServer((req, res) => {
  const urlPath = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  for (const h of headers) if (h.re.test(urlPath)) for (const { key, value } of h.set) res.setHeader(key, value);
  const file = fileFor(urlPath);
  if (!file || !fs.existsSync(file)) {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Not found');
    return;
  }
  res.writeHead(200, { 'Content-Type': TYPES[path.extname(file).toLowerCase()] || 'application/octet-stream' });
  fs.createReadStream(file).pipe(res);
}).listen(PORT, () => console.log('report page at http://localhost:' + PORT + '/r/sample' + (SAMPLE ? '' : ' (no sample given)')));
