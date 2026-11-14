// Does Vercel's own route reader accept coming-soon/vercel.json, and does its headers rule catch the three
// signed-in addresses and nothing else? A rule Vercel refuses fails the whole build, so run this before any
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
const ruled = (out.routes || []).filter((r) => r.headers && r.headers['Content-Security-Policy']);
const applies = (p) => ruled.some((r) => new RegExp(r.src).test(p));
const yes = ['/signin', '/account', '/plan'], no = ['/', '/pricing', '/refunds', '/terms', '/privacy', '/signin/x', '/accounts', '/plans', '/plan/x', '/myplan', '/assets/auth.js', '/assets/plan.js'];
ok('the rule catches the three signed-in addresses', yes.every(applies), yes.filter((p) => !applies(p)).join(' '));
ok('the rule catches no other address', !no.some(applies), no.filter(applies).join(' '));
// Your inspections, live (2026-11-14): its own rule, the signed-in pages' rule plus the live socket to Inspyx's server.
const wss = (p) => ruled.some((r) => new RegExp(r.src).test(p) && /connect-src https:\/\/btxlrfvqifnrnxffohsz\.supabase\.co wss:\/\/btxlrfvqifnrnxffohsz\.supabase\.co;/.test(r.headers['Content-Security-Policy']));
ok('the inspections page has its rule, with the live socket', applies('/inspections') && wss('/inspections'));
ok('no other page may open the live socket', !['/signin', '/account', '/plan', '/reset', '/signup', '/', '/inspections/x', '/inspection'].some(wss));
ok('the inspections rule catches nothing else', !['/inspection', '/inspections/x', '/myinspections', '/assets/inspections.js'].some(applies));
// The client's report page (2026-11-14): a new link is /r#<key> (the browser asks for /r alone), an old one
// /r/<key>. Both must open the report page, under the report page's own rules.
const opensReport = (p) => (out.routes || []).some((r) => r.dest && /^\/report(\?|$)/.test(r.dest) && new RegExp(r.src).test(p));
const reportRules = (p) => ruled.some((r) => new RegExp(r.src).test(p) && /img-src 'self' https:\/\/btxlrfvqifnrnxffohsz\.supabase\.co;/.test(r.headers['Content-Security-Policy']) && /noindex/.test(r.headers['X-Robots-Tag'] || ''));
const key = 'AbCdEfGhIjKlMnOpQrStUv';
ok('a new link\'s address (/r) and an old one (/r/<key>) both open the report page, under its own rules', ['/r', '/r/' + key].every((p) => opensReport(p) && reportRules(p)), ['/r', '/r/' + key].filter((p) => !opensReport(p) || !reportRules(p)).join(' '));
ok('the report page\'s route takes no other address', !['/', '/refunds', '/rr', '/report-x', '/r/a/b'].some(opensReport), ['/', '/refunds', '/rr', '/report-x', '/r/a/b'].filter(opensReport).join(' '));
// The reader must be able to say no, or its yes means nothing: a pattern that is wrong on purpose.
const bad = read({ headers: [{ source: '/(?!x)', headers: [{ key: 'A', value: 'b' }] }] });
ok('a pattern that is wrong on purpose is refused by the same reader', !!bad.error, bad.error ? bad.error.code : 'it was accepted');

console.log(failed ? '\n' + failed + ' CHECK(S) FAILED' : '\nall checks passed');
process.exit(failed ? 1 : 0);
