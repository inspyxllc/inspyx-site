// Writes what the website's template editor makes (coming-soon/assets/template-edit.js) into the app repo, where
// test/src/data/web_template_edit_test.dart plays each list of edits through the phone's own TemplateDraft and proves
// both give the same template, and that the phone takes each file and row (2026-11-26, the web template editor, A).
// usage: node tools/template_edit_fixtures.js <app repo>/test/fixtures/web_template_edits
//        node tools/template_edit_fixtures.js --check <that folder>   (fails when what is there is not what this makes)
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const S = require('../coming-soon/assets/template-save.js');
const E = require('../coming-soon/assets/template-edit.js');

const check = process.argv[2] === '--check';
const out = process.argv[check ? 3 : 2];
if (!out) { console.error('usage: node tools/template_edit_fixtures.js [--check] <folder>'); process.exit(2); }

// The app's template sync harness's owner (test/src/data/template_sync_harness.dart).
const OWNER = '11111111-2222-4333-8444-555555555555';
const T0 = 1795600000000;
const sha = (text) => crypto.createHash('sha256').update(Buffer.from(text, 'utf8')).digest('hex');
const digest = (text) => Promise.resolve(sha(text));
const copyFile = JSON.parse(fs.readFileSync(path.join(__dirname, '../coming-soon/assets/template-copies/inspyx.walkthrough.json'), 'utf8'));

function row(id, name, text, at, base) {
  const data = { id, ownerAccountId: OWNER, name, version: JSON.parse(text).templates[0].versions[0].version, source: 'copied',
    sha256: sha(text), byteLength: Buffer.byteLength(text, 'utf8'), createdAt: T0, updatedAt: at, deletedAt: null };
  if (base) data.base = base;
  return { kind: 'inspection_templates', id, updated_at: at, deleted_at: null, data };
}

(async () => {
  const name = copyFile.copyName, id = S.newTemplateId(name, []);
  const start = S.makeCopy(copyFile, id, name);
  const o = E.outline(start);
  // Real parts of it: the first stop, its first item with each kind of comment, another stop's item.
  const stop = o.stops[0];
  const item = o.stops.flatMap((s) => s.items).find((i) => ['deficiency', 'limitation', 'information'].every((k) => i.lines.some((l) => l.kind === k)));
  if (!item) throw new Error('no item with every kind of comment');
  const of = (k) => item.lines.find((l) => l.kind === k);
  const def = of('deficiency'), lim = of('limitation'), info = of('information');
  const other = o.stops[o.stops.length - 1].items[0];

  const lists = [
    { name: 'renames and a comment\'s words: the template, a stop, two items, every kind of comment',
      replay: true, edits: [
        { op: 'template', name: '\u0085 Oak Street Walkthrough \u{1F3E0} ' },
        { op: 'stop', ref: stop.ref, name: 'Outside, all around' },
        { op: 'item', ref: item.ref, label: '  Grading “and” drainage\t' },
        { op: 'item', ref: other.ref, label: other.label + ' (café)' },
        { op: 'line', item: item.ref, kind: 'deficiency', position: def.position, name: '\tNegative grade at the wall  ', text: '  Soil slopes toward the house on the [side].  ', rating: 'safety' },
        { op: 'line', item: item.ref, kind: 'limitation', position: lim.position, text: '   ' },
        { op: 'line', item: item.ref, kind: 'information', position: info.position, name: 'Grade type' },
      ] },
    { name: 'on top of that: a finding\'s category cleared, its words emptied', replay: true, edits: [
        { op: 'line', item: item.ref, kind: 'deficiency', position: def.position, rating: null, text: '' },
      ] },
    { name: 'on top of that: a finding\'s "What to do" (the phone keeps it; the website edits it)', replay: false, edits: [
        { op: 'line', item: item.ref, kind: 'deficiency', position: def.position, recommendation: '  Have a grading contractor correct the slope.  ' },
      ] },
  ];
  const cases = [];
  let text = start, at = T0;
  for (const l of lists) {
    const r = E.apply(text, l.edits);
    if (r.problem) throw new Error(l.name + ': ' + r.problem + ' at ' + r.at);
    at += 60000;
    const key = await S.contentKey(text, digest);
    cases.push({ name: l.name, replay: l.replay, edits: l.edits, text: r.text, row: row(id, r.name, r.text, at, key),
      contentKey: await S.contentKey(r.text, digest) });
    text = r.text;
  }
  const problems = [
    ['no_name', [{ op: 'stop', ref: stop.ref, name: '  ' }]],
    ['no_part', [{ op: 'item', ref: id + '.nowhere.nothing', label: 'X' }]],
    ['no_rating', [{ op: 'line', item: item.ref, kind: 'deficiency', position: def.position, rating: 'urgent' }]],
    ['not_finding', [{ op: 'line', item: item.ref, kind: 'limitation', position: lim.position, rating: 'safety' }]],
    ['too_long', [{ op: 'template', name: 'x'.repeat(121) }]],
    ['unchanged', [{ op: 'stop', ref: stop.ref, name: stop.name }]],
  ].map(([want, edits]) => ({ want, got: E.apply(start, edits).problem || null, edits }));
  for (const p of problems) if (p.want !== p.got) throw new Error('problem ' + p.want + ' gave ' + p.got);

  const files = {
    'README.md': '# What the website\'s template editor writes\n\nMade by inspyx-site `tools/template_edit_fixtures.js` from ' +
      '`coming-soon/assets/template-edit.js`. Do not edit: make them again. Run by `test/src/data/web_template_edit_test.dart`.\n',
    // Control characters written as escapes (the same strings when read), never raw in the file.
    'cases.json': JSON.stringify({ owner: OWNER, templateId: id, start, startRow: row(id, name, start, T0, null), cases, problems }, null, 2)
      .replace(/[\u0080-\u009f\u200b-\u200f\u2028\u2029\u2060\ufeff]/g, (c) => '\\u' + c.charCodeAt(0).toString(16).padStart(4, '0')) + '\n',
  };
  let bad = 0;
  for (const [f, body] of Object.entries(files)) {
    const p = path.join(out, f);
    if (check) {
      const have = fs.existsSync(p) ? fs.readFileSync(p, 'utf8') : '';
      if (have !== body) { bad++; console.log('DIFFERS  ' + p); }
    } else {
      fs.mkdirSync(out, { recursive: true });
      fs.writeFileSync(p, body);
      console.log('wrote ' + p);
    }
  }
  console.log(check ? (bad ? 'FIXTURES DIFFER' : 'FIXTURES MATCH') : cases.map((c) => 'v' + c.row.data.version).join(', ') + '; problems ' + problems.length);
  process.exit(bad ? 1 : 0);
})().catch((e) => { console.error('FAILED', e.message); process.exit(1); });
