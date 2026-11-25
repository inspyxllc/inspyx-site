// Self-checks for coming-soon/assets/agreement-fill.js (2026-11-24, Inspyx 4): the shared rulebook
// (tools/agreement_fill.json, a copy of the app repo's test/fixtures/agreement_fill.json), and "Agreements outdated".
// usage: node tools/check_fill.js
const fs = require('fs');
const path = require('path');
const F = require('../coming-soon/assets/agreement-fill.js');
let failed = 0;
const ok = (name, cond, extra) => { if (!cond) failed++; console.log((cond ? 'PASS  ' : 'FAIL  ') + name + (extra ? '  [' + extra + ']' : '')); };
const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);

const book = JSON.parse(fs.readFileSync(path.join(__dirname, 'agreement_fill.json'), 'utf8'));
for (const c of book.cases) {
  const got = F.fillAgreement(c.text, c.facts);
  const want = c.want;
  ok('rulebook: ' + c.name, got.text === want.text && eq(got.empty, want.empty || []) && eq(got.unknown, want.unknown || []),
    got.text === want.text ? JSON.stringify([got.empty, got.unknown]) : JSON.stringify(got.text).slice(0, 120));
}

const facts = (o) => Object.assign({
  clientNames: ['Ana Diaz'], clientPhone: '', clientEmail: 'ana@example.com', street: '1 Main St, Apt 103', city: 'Miami',
  state: 'FL', zip: '33169', inspectionDate: null, today: '2026-11-24', feeCents: 42500, services: ['Home inspection'],
  feeLines: [{ name: 'Home inspection', cents: 42500 }], inspectorName: '', company: '', licenseNumber: '', companyPhone: '',
}, o || {});
const S1 = 's1', S2 = 's2';
const sig = (id, status, sentAt) => ({ id, status, sentAt, deletedAt: null });
const det = (filled, supersededBy) => ({ filled: filled || {}, supersededBy: supersededBy || null });
const snap = (f) => { const o = {}; ['clientName', 'clientFirstName', 'clientEmail', 'propertyAddress', 'street', 'city', 'state', 'zip', 'fee', 'services', 'feeLines'].forEach((b) => { o[b] = F.valueOf(b, f); }); return o; };

ok('outdated: nothing to say with no signing, an unsigned one, or no snapshot',
  F.standing([], {}, facts()).kind === 'holds' &&
  F.standing([sig(S1, 'opened', 1)], { s1: det(snap(facts({ feeCents: 1 }))) }, facts()).kind === 'holds' &&
  F.standing([sig(S1, 'signed', 1)], {}, facts({ feeCents: 1 })).kind === 'holds');
const moved = F.standing([sig(S1, 'signed', 1)], { s1: det(snap(facts())) }, facts({ clientNames: ['Bo Lee'], feeCents: 47500, feeLines: [{ name: 'Home inspection', cents: 47500 }] }));
ok('outdated: each moved blank named, in the blanks\' order', moved.kind === 'outdated' &&
  eq(moved.changes.map((c) => c.blank), ['clientName', 'fee', 'feeLines', 'clientFirstName']), JSON.stringify(moved.changes.map((c) => c.blank)));
ok('outdated: the price change reads old and new', eq(moved.changes[1], { blank: 'fee', was: '$425.00', now: '$475.00' }));
ok('outdated: case, commas and spaces aside for words', F.standing([sig(S1, 'signed', 1)],
  { s1: det({ clientName: 'ana  DIAZ', propertyAddress: '1 Main St Apt 103, Miami, FL 33169' }) }, facts()).kind === 'holds');
ok('outdated: price lines exactly', F.standing([sig(S1, 'signed', 1)],
  { s1: det({ feeLines: 'HOME INSPECTION: $425.00' }) }, facts()).kind === 'outdated');
const waiting = F.standing([sig(S2, 'sent', 2), sig(S1, 'signed', 1)], { s1: det(snap(facts()), S2) }, facts({ feeCents: 1 }));
ok('outdated: an update sent waits', waiting.kind === 'updateSent' && waiting.signing.id === S2);
const again = F.standing([sig(S2, 'void', 2), sig(S1, 'signed', 1)], { s1: det(snap(facts()), S2) }, facts({ feeCents: 47500 }));
ok('outdated: a cancelled update leaves the change named again', again.kind === 'outdated' && again.signing.id === S1);
ok('outdated: the signing that stands is one no update replaced, then the newest',
  F.currentSigning([sig(S2, 'signed', 2), sig(S1, 'signed', 1)], { s1: det({}, S2) }).id === S2 &&
  F.currentSigning([sig(S2, 'signed', 2), sig(S1, 'signed', 1)], { s2: det({}, 'x') }).id === S1);

console.log(failed ? `\n${failed} FAILED` : '\nall passed');
process.exit(failed ? 1 : 0);
