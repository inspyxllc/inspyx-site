// Does Vercel's own route reader accept coming-soon/vercel.json, and does its headers rule catch the three
// signed-in addresses and nothing else? And (2026-11-17) do the public pages get their own rule, and every address
// the two headers every page sends? A rule Vercel refuses fails the whole build, so run this before any
// publish that changes vercel.json.
// It needs Vercel's reader, which this repo does not carry:
//   mkdir /tmp/vercelcheck && cd /tmp/vercelcheck && npm init -y && npm i @vercel/routing-utils
//   NODE_PATH=/tmp/vercelcheck/node_modules node tools/check_rules.js
const fs = require('fs');
const path = require('path');
const { getTransformedRoutes } = require('@vercel/routing-utils');

let failed = 0;
const ok = (name, cond, extra) => { if (!cond) failed++; console.log((cond ? 'PASS  ' : 'FAIL  ') + name + (extra ? '  [' + extra + ']' : '')); };
const read = (cfg) => getTransformedRoutes(cfg);

const cfg = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'coming-soon', 'vercel.json'), 'utf8'));
const out = read(cfg);
ok('Vercel\'s reader accepts vercel.json', !out.error, out.error ? out.error.message : out.routes.length + ' routes');
// The private pages' rules (signed in, the report, the agent page): each says Cache-Control: no-store. The public
// pages' rules (below) never do, so these checks look at the private ones alone.
const ruled = (out.routes || []).filter((r) => r.headers && r.headers['Content-Security-Policy'] && r.headers['Cache-Control'] === 'no-store');
const applies = (p) => ruled.some((r) => new RegExp(r.src).test(p));
const yes = ['/signin', '/account', '/plan', '/today', '/numbers', '/reports', '/prices', '/agreements', '/profile'], no = ['/', '/agreements/x', '/agreement', '/assets/agreements.js', '/profile/x', '/profiles', '/assets/profile.js', '/pricing', '/prices/x', '/price', '/assets/prices.js', '/refunds', '/terms', '/privacy', '/signin/x', '/accounts', '/plans', '/plan/x', '/myplan', '/assets/auth.js', '/assets/plan.js', '/today/x', '/todays', '/assets/today.js', '/numbers/x', '/number', '/assets/numbers.js', '/reports/x', '/report-sent', '/assets/reports.js'];
ok('the rule catches the signed-in addresses', yes.every(applies), yes.filter((p) => !applies(p)).join(' '));
ok('the rule catches no other address', !no.some(applies), no.filter(applies).join(' '));
// Your inspections, live (2026-11-14): its own rule, the signed-in pages' rule plus the live socket to Inspyx's server.
const wss = (p) => ruled.some((r) => new RegExp(r.src).test(p) && /connect-src https:\/\/btxlrfvqifnrnxffohsz\.supabase\.co wss:\/\/btxlrfvqifnrnxffohsz\.supabase\.co;/.test(r.headers['Content-Security-Policy']));
// The calendar and people pages (2026-11-16) read the same live inspections, so they share that rule.
const live = ['/inspections', '/calendar', '/people'];
ok('the inspections, calendar and people pages have the rule, with the live socket', live.every((p) => applies(p) && wss(p)), live.filter((p) => !applies(p) || !wss(p)).join(' '));
ok('no other page may open the live socket', !['/signin', '/account', '/plan', '/reset', '/signup', '/today', '/numbers', '/reports', '/prices', '/agreements', '/profile', '/', '/inspections/x', '/inspection', '/calendar/x', '/people/x', '/calendars', '/peoples'].some(wss));
ok('the live pages\' rule catches nothing else', !['/inspection', '/inspections/x', '/myinspections', '/assets/inspections.js', '/calendar/x', '/mycalendar', '/assets/calendar.js', '/people/x', '/person', '/assets/people.js', '/assets/insp-read.js'].some(applies));
// Your company's pictures (2026-11-16, phase 2c): /profile shows the photo, logo and signature from copies held in
// the page (blob:), so it has a rule of its own: the signed-in pages' rule, plus img-src blob:. No other page may.
const blobs = (p) => ruled.some((r) => new RegExp(r.src).test(p) && /img-src 'self' blob:; connect-src https:\/\/btxlrfvqifnrnxffohsz\.supabase\.co;/.test(r.headers['Content-Security-Policy']));
ok('/profile may show pictures held in the page (img-src blob:), under one rule only', blobs('/profile') && ruled.filter((r) => new RegExp(r.src).test('/profile')).length === 1);
const others = ['/', '/signin', '/account', '/plan', '/reset', '/signup', '/today', '/numbers', '/reports', '/prices', '/agreements', '/inspections', '/calendar', '/people', '/r', '/a', '/agent', '/report', '/profile/x', '/profiles', '/assets/profile.js'];
ok('no other page may show blob: pictures', !ruled.some((r) => /blob:/.test(r.headers['Content-Security-Policy']) && others.some((p) => new RegExp(r.src).test(p))), others.filter((p) => ruled.some((r) => /blob:/.test(r.headers['Content-Security-Policy']) && new RegExp(r.src).test(p))).join(' '));
// The client's report page (2026-11-14): a new link is /r#<key> (the browser asks for /r alone), an old one
// /r/<key>. Both must open the report page, under the report page's own rules.
const opensReport = (p) => (out.routes || []).some((r) => r.dest && /^\/report(\?|$)/.test(r.dest) && new RegExp(r.src).test(p));
const reportRules = (p) => ruled.some((r) => new RegExp(r.src).test(p) && /img-src 'self' https:\/\/btxlrfvqifnrnxffohsz\.supabase\.co;/.test(r.headers['Content-Security-Policy']) && /noindex/.test(r.headers['X-Robots-Tag'] || ''));
const key = 'AbCdEfGhIjKlMnOpQrStUv';
ok('a new link\'s address (/r) and an old one (/r/<key>) both open the report page, under its own rules', ['/r', '/r/' + key].every((p) => opensReport(p) && reportRules(p)), ['/r', '/r/' + key].filter((p) => !opensReport(p) || !reportRules(p)).join(' '));
// Movies (2026-11-14): the report page may play them from Inspyx's file store, and from nowhere else: not even
// this site, not blob:, never *.
const movies = (p) => ruled.some((r) => new RegExp(r.src).test(p) && /media-src https:\/\/btxlrfvqifnrnxffohsz\.supabase\.co;/.test(r.headers['Content-Security-Policy']));
ok('the report page may play movies from Inspyx\'s file store, under both of its addresses', ['/r', '/r/' + key, '/report'].every(movies), ['/r', '/r/' + key, '/report'].filter((p) => !movies(p)).join(' '));
ok('the movies\' rule names the file store alone', ruled.filter((r) => /media-src/.test(r.headers['Content-Security-Policy'])).every((r) => /media-src https:\/\/btxlrfvqifnrnxffohsz\.supabase\.co;/.test(r.headers['Content-Security-Policy'])));
ok('no other page may play movies', !['/', '/signin', '/account', '/plan', '/inspections', '/pricing'].some(movies));
ok('the report page\'s route takes no other address', !['/', '/refunds', '/rr', '/report-x', '/r/a/b', '/reports'].some(opensReport), ['/', '/refunds', '/rr', '/report-x', '/r/a/b', '/reports'].filter(opensReport).join(' '));
// An agent's private page (2026-11-15): /a (its key after the "#", so the browser asks for /a alone) opens the
// agent page, under the report page's own strict rules (it draws reports, movies too), and takes no other address.
const opensAgent = (p) => (out.routes || []).some((r) => r.dest && /^\/agent(\?|$)/.test(r.dest) && new RegExp(r.src).test(p));
const signedInRule = (p) => ruled.some((r) => new RegExp(r.src).test(p) && /img-src 'self'; connect-src https:/.test(r.headers['Content-Security-Policy']));
ok('/a opens the agent page, under the report page\'s own rules (noindex, the file store, movies), as does /agent', opensAgent('/a') && ['/a', '/agent'].every((p) => reportRules(p) && movies(p)));
ok('the agent page\'s route takes no other address', !['/', '/about', '/account', '/a/x', '/ab', '/r', '/r/' + key, '/agents', '/reports'].some(opensAgent), ['/', '/about', '/account', '/a/x', '/ab', '/r', '/r/' + key, '/agents', '/reports'].filter(opensAgent).join(' '));
ok('/a never opens the client report route, and no signed-in rule reaches it', !opensReport('/a') && !signedInRule('/a') && !signedInRule('/agent'));
ok('the agent rule reaches no other page (/about, /account, /assets/agent.js)', !['/about', '/account', '/assets/agent.js', '/ab'].some((p) => ruled.some((r) => new RegExp(r.src).test(p) && r.src.includes('agent'))));
// ---- The public pages (2026-11-17): the headers each address gets, worked out as Vercel does: every rule whose
// address matches adds its headers, in the file's order.
const got = (p) => {
  const h = {};
  (out.routes || []).filter((r) => r.headers && new RegExp(r.src).test(p)).forEach((r) => Object.assign(h, r.headers));
  return h;
};
const SUPA = 'https://btxlrfvqifnrnxffohsz.supabase.co';
const HOME_CSP = "default-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self'; connect-src " + SUPA + "; base-uri 'none'; form-action 'none'; frame-ancestors 'none'";
const PAGE_CSP = "default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self' data:; base-uri 'none'; form-action 'none'; frame-ancestors 'none'";
const POLICY = ['/about', '/founders', '/pricing', '/privacy', '/refunds', '/support', '/terms'];
const PUBLIC = ['/'].concat(POLICY);
const PRIVATE = ['/signin', '/account', '/plan', '/reset', '/signup', '/today', '/numbers', '/reports', '/inspections', '/calendar', '/people', '/r', '/r/' + key, '/report', '/a', '/agent'];
ok('the home page: scripts from this site only; its own inline styles; it may send only to Inspyx\'s server (the waitlist)', got('/')['Content-Security-Policy'] === HOME_CSP, got('/')['Content-Security-Policy']);
ok('the policy pages, About, Founders and Support: this site\'s own scripts and style sheets only, and they send nowhere', POLICY.every((p) => got(p)['Content-Security-Policy'] === PAGE_CSP), POLICY.filter((p) => got(p)['Content-Security-Policy'] !== PAGE_CSP).join(' '));
ok('every public page: nosniff, never in a frame, and the address alone (no path) sent to other sites', PUBLIC.every((p) => { const h = got(p); return h['X-Content-Type-Options'] === 'nosniff' && h['X-Frame-Options'] === 'DENY' && h['Referrer-Policy'] === 'strict-origin-when-cross-origin'; }), PUBLIC.filter((p) => { const h = got(p); return h['X-Content-Type-Options'] !== 'nosniff' || h['X-Frame-Options'] !== 'DENY' || h['Referrer-Policy'] !== 'strict-origin-when-cross-origin'; }).join(' '));
ok('the public pages stay public: no noindex, and no no-store', PUBLIC.every((p) => !got(p)['X-Robots-Tag'] && !got(p)['Cache-Control']));
ok('no public rule allows inline script, eval, or any site but Inspyx\'s server', PUBLIC.every((p) => { const c = got(p)['Content-Security-Policy']; return !/'unsafe-eval'|\*|'unsafe-hashes'|'strict-dynamic'|\bhttp:|https:(\s|;|$)/.test(c) && !/script-src[^;]*'unsafe-inline'/.test(c) && (c.match(/https:\/\/[^\s;]+/g) || []).every((u) => u === SUPA); }));
// Matched at all, not only outdone: which of two rules Vercel lets win for the same header isn't something to
// rest on, so no public rule may even match a private address.
const publicRules = (out.routes || []).filter((r) => r.headers && r.headers['Content-Security-Policy'] && r.headers['Cache-Control'] !== 'no-store');
ok('no public rule matches a private page at all', PRIVATE.every((p) => !publicRules.some((r) => new RegExp(r.src).test(p))), PRIVATE.filter((p) => publicRules.some((r) => new RegExp(r.src).test(p))).join(' '));
ok('the public rules reach no private page: each keeps its own rule, word for word', PRIVATE.every((p) => { const h = got(p), mine = ruled.filter((r) => new RegExp(r.src).test(p)); return mine.length > 0 && h['Content-Security-Policy'] === mine[mine.length - 1].headers['Content-Security-Policy'] && h['Referrer-Policy'] === 'no-referrer'; }), PRIVATE.filter((p) => got(p)['Referrer-Policy'] !== 'no-referrer').join(' '));
ok('the public rules reach no file and no other address (/assets/home.js, /pricing/x, /privacy-old, /aboutx)', !['/assets/home.js', '/assets/page.css', '/pricing/x', '/privacy-old', '/aboutx', '/no-such-page', '/index'].some((p) => got(p)['Content-Security-Policy']));
const EVERY = ['/', '/pricing', '/signin', '/r', '/r/' + key, '/a', '/no-such-page', '/assets/home.js', '/assets/page.css', '/.well-known/apple-app-site-association'];
ok('every address, files and a wrong address too: nosniff and never in a frame', EVERY.every((p) => got(p)['X-Content-Type-Options'] === 'nosniff' && got(p)['X-Frame-Options'] === 'DENY'), EVERY.filter((p) => got(p)['X-Content-Type-Options'] !== 'nosniff' || got(p)['X-Frame-Options'] !== 'DENY').join(' '));
// The rule for every address sends only those two, with the same values every other rule sends: so it doesn't
// matter which of two rules Vercel lets win for the same header.
const all = cfg.headers.filter((r) => r.source === '/(.*)');
const same = cfg.headers.every((r) => r.headers.every((x) => !['X-Content-Type-Options', 'X-Frame-Options'].includes(x.key) || x.value === (x.key === 'X-Frame-Options' ? 'DENY' : 'nosniff')));
ok('the rule for every address sends nosniff and DENY alone, and no rule sends them otherwise', all.length === 1 && all[0].headers.map((x) => x.key).join(',') === 'X-Content-Type-Options,X-Frame-Options' && same);
// What the rules allow is what the pages hold: no script written into a page (the home page's runs from
// /assets/home-early.js), no style written into a policy page, no on...= handler anywhere.
{
  const dir = path.join(__dirname, '..', 'coming-soon');
  const read2 = (n) => fs.readFileSync(path.join(dir, n + '.html'), 'utf8');
  const inlineScript = (h) => (h.match(/<script\b[^>]*>/g) || []).filter((t) => !/\ssrc=/.test(t) && !/type="application\/ld\+json"/.test(t));
  const names = ['index'].concat(POLICY.map((p) => p.slice(1)), ['404']);
  ok('no public page has a script written into it, or an on...= handler', names.every((n) => inlineScript(read2(n)).length === 0 && !/\son[a-z]+=/i.test(read2(n))), names.filter((n) => inlineScript(read2(n)).length || /\son[a-z]+=/i.test(read2(n))).join(' '));
  ok('no policy page (nor About, Founders, Support, the wrong-address page) has a style written into it', names.slice(1).every((n) => !/<style\b/.test(read2(n)) && !/\sstyle=/.test(read2(n))), names.slice(1).filter((n) => /<style\b/.test(read2(n)) || /\sstyle=/.test(read2(n))).join(' '));
  ok('the home page runs its early script from this site, in its head, before its style', /<head>[\s\S]*<script src="\/assets\/home-early\.js"><\/script>[\s\S]*<style>[\s\S]*<\/head>/.test(read2('index')));
}

// The reader must be able to say no, or its yes means nothing: a pattern that is wrong on purpose.
const bad = read({ headers: [{ source: '/(?!x)', headers: [{ key: 'A', value: 'b' }] }] });
ok('a pattern that is wrong on purpose is refused by the same reader', !!bad.error, bad.error ? bad.error.code : 'it was accepted');

console.log(failed ? '\n' + failed + ' CHECK(S) FAILED' : '\nall checks passed');
process.exit(failed ? 1 : 0);
