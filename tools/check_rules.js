// Does Vercel's own route reader accept coming-soon/vercel.json, and does its headers rule catch the two
// sign-in addresses and nothing else? A rule Vercel refuses fails the whole build, so run this before any
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
const yes = ['/signin', '/account'], no = ['/', '/pricing', '/refunds', '/terms', '/privacy', '/signin/x', '/accounts', '/assets/auth.js'];
ok('the rule catches the two sign-in addresses', yes.every(applies), yes.filter((p) => !applies(p)).join(' '));
ok('the rule catches no other address', !no.some(applies), no.filter(applies).join(' '));
// The reader must be able to say no, or its yes means nothing: a pattern that is wrong on purpose.
const bad = read({ headers: [{ source: '/(?!x)', headers: [{ key: 'A', value: 'b' }] }] });
ok('a pattern that is wrong on purpose is refused by the same reader', !!bad.error, bad.error ? bad.error.code : 'it was accepted');

console.log(failed ? '\n' + failed + ' CHECK(S) FAILED' : '\nall checks passed');
process.exit(failed ? 1 : 0);
