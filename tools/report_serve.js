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
  '.webp': 'image/webp', '.pdf': 'application/pdf', '.mp4': 'video/mp4', '.txt': 'text/plain; charset=utf-8', '.xml': 'application/xml',
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
  const type = TYPES[path.extname(file).toLowerCase()] || 'application/octet-stream';
  // A byte range, as Supabase's file store answers one: Safari asks a movie for its bytes this way, and plays
  // nothing from a server that won't.
  const size = fs.statSync(file).size;
  const range = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range || '');
  if (range && (range[1] !== '' || range[2] !== '')) {
    let start = range[1] === '' ? size - Number(range[2]) : Number(range[1]);
    let end = range[1] === '' || range[2] === '' ? size - 1 : Math.min(Number(range[2]), size - 1);
    if (start < 0) start = 0;
    if (start > end || start >= size) {
      res.writeHead(416, { 'Content-Range': `bytes */${size}` });
      res.end();
      return;
    }
    res.writeHead(206, { 'Content-Type': type, 'Accept-Ranges': 'bytes', 'Content-Range': `bytes ${start}-${end}/${size}`, 'Content-Length': end - start + 1 });
    fs.createReadStream(file, { start, end }).pipe(res);
    return;
  }
  res.writeHead(200, { 'Content-Type': type, 'Accept-Ranges': 'bytes', 'Content-Length': size });
  fs.createReadStream(file).pipe(res);
}).listen(PORT, () => console.log('report page at http://localhost:' + PORT + '/r/sample' + (SAMPLE ? '' : ' (no sample given)')));
