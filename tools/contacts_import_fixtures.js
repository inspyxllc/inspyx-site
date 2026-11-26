// Writes what the website's people import does (coming-soon/assets/contacts-import.js) into the app repo, where
// test/src/data/web_contacts_import_test.dart runs the phone's own InspectionStore.importContacts and
// undoContactImport on the same People and the same file, and must end with the same People (2026-11-26, the web
// importers, contacts first).
// usage: node tools/contacts_import_fixtures.js <app repo>/test/fixtures/web_contacts_import
//        node tools/contacts_import_fixtures.js --check <that folder>
const fs = require('fs');
const path = require('path');
const C = require('../coming-soon/assets/contacts-import.js');

const check = process.argv[2] === '--check';
const out = process.argv[check ? 3 : 2];
if (!out) { console.error('usage: node tools/contacts_import_fixtures.js [--check] <folder>'); process.exit(2); }

const ME = 'owner-web-contacts';
// People before the import, in the order the phone makes them (add, then delete when deleted: ones deleted later are
// newer). Bob Lane is deleted twice (his second, newer, keeps his email): he comes back as that one.
const seed = [
  { role: 'buyer_agent', name: 'Ana Reyes', phone: '305-555-0101' },
  { role: 'client', name: 'Bob Lane', phone: '111', deleted: true },
  { role: 'client', name: 'Bob Lane', email: 'bob@old.com', deleted: true },
  { role: 'listing_agent', name: 'José Peña', company: 'Casa Realty', note: 'Prefers texts' },
  { role: 'client', name: 'Kim Ho', email: 'kim@x.com' },
];
// The file's people, in its order.
const people = [
  { role: 'client', name: 'Daniel Ortiz', phone: '305-555-0142', note: 'Address: 1 Main St' },
  { role: 'client', name: 'ana reyes', phone: '999', email: 'ana@x.com', company: ' Sunline ' },
  { role: 'client', name: 'DANIEL ORTIZ', email: 'dan@x.com' },
  { role: 'client', name: '   ' },
  { role: 'buyer_agent', name: '  Bob Lane ', phone: '222', email: 'bob@new.com', company: 'Lane & Co' },
  { role: 'client', name: 'JOSÉ PEÑA', phone: '\u00a0786-555-0199\u00a0', note: 'Other note' },
  { role: 'client', name: 'Kim Ho', email: 'kim@new.com' },
  { role: 'listing_agent', name: 'Zoë “Z” Park', email: 'zoe@x.com', phone: '' },
];

function seedRows() {
  const rows = []; let t = 1000;
  seed.forEach((s, i) => {
    const data = { id: 'seed-' + i, ownerAccountId: ME, role: s.role, name: s.name, phone: s.phone || null, email: s.email || null,
      company: s.company || null, note: s.note || null, lastUsedAt: t, createdAt: t, updatedAt: t, deletedAt: null };
    t += 10;
    if (s.deleted) { data.deletedAt = t; data.updatedAt = t; t += 10; }
    rows.push({ kind: 'inspector_contacts', id: data.id, updated_at: data.updatedAt, deleted_at: data.deletedAt, data });
  });
  return rows;
}
const apply = (rows, push) => { const m = new Map(rows.map((r) => [r.id, r])); push.forEach((r) => m.set(r.id, r)); return [...m.values()]; };
const keptOf = (rows) => {
  const o = {};
  rows.filter((r) => r.deleted_at == null && r.data.deletedAt == null).forEach((r) => {
    o[r.data.name] = { role: r.data.role, phone: r.data.phone, email: r.data.email, company: r.data.company, note: r.data.note };
  });
  return Object.fromEntries(Object.entries(o).sort(([a], [b]) => (a < b ? -1 : 1)));
};

let n = 0;
const start = seedRows();
const p = C.plan(start, people, ME, 5000, () => 'new-' + (++n));
const after = apply(start, p.push);
const undone = apply(after, C.undo(after, p.changes, ME, 6000));
const fixture = {
  seed, people,
  after: { kept: keptOf(after), changes: p.changes.map((c) => ({ name: c.name, added: c.added, filled: c.filled })), unchanged: p.unchanged },
  afterUndo: { kept: keptOf(undone) },
};
const files = {
  'README.md': '# What the website\'s people import does\n\nMade by inspyx-site `tools/contacts_import_fixtures.js` from ' +
    '`coming-soon/assets/contacts-import.js`. Do not edit: make them again. Run by `test/src/data/web_contacts_import_test.dart`.\n',
  'cases.json': JSON.stringify(fixture, null, 2).replace(/[\u0080-\u009f\u00a0\u200b-\u200f\u2028\u2029\u2060\ufeff]/g, (c) => '\\u' + c.charCodeAt(0).toString(16).padStart(4, '0')) + '\n',
};
let bad = 0;
for (const [f, body] of Object.entries(files)) {
  const fp = path.join(out, f);
  if (check) { const have = fs.existsSync(fp) ? fs.readFileSync(fp, 'utf8') : ''; if (have !== body) { bad++; console.log('DIFFERS  ' + fp); } }
  else { fs.mkdirSync(out, { recursive: true }); fs.writeFileSync(fp, body); console.log('wrote ' + fp); }
}
console.log(check ? (bad ? 'FIXTURES DIFFER' : 'FIXTURES MATCH') : JSON.stringify(fixture.after, null, 1).slice(0, 1500));
process.exit(bad ? 1 : 0);
