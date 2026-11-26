// Writes what the website's Save to template makes (coming-soon/assets/template-save.js) into the app repo, where
// test/src/data/web_template_save_test.dart proves the phone takes each file and row, holds the very same bytes and
// gets the same content key (2026-11-26, his list item 12, piece D).
// usage: node tools/template_save_fixtures.js <app repo>/test/fixtures/web_template_saves
//        node tools/template_save_fixtures.js --check <that folder>   (fails when what is there is not what this makes)
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const S = require('../coming-soon/assets/template-save.js');

const check = process.argv[2] === '--check';
const out = process.argv[check ? 3 : 2];
if (!out) { console.error('usage: node tools/template_save_fixtures.js [--check] <folder>'); process.exit(2); }

// The app's template sync harness's owner (test/src/data/template_sync_harness.dart).
const OWNER = '11111111-2222-4333-8444-555555555555';
const T1 = 1795600000000, T2 = 1795600060000;
const sha = (text) => crypto.createHash('sha256').update(Buffer.from(text, 'utf8')).digest('hex');
const digest = (text) => Promise.resolve(sha(text));
const copyFile = JSON.parse(fs.readFileSync(path.join(__dirname, '../coming-soon/assets/template-copies/inspyx.walkthrough.json'), 'utf8'));

function firstItemRef(text) {
  const v = JSON.parse(text).templates[0].versions[0];
  for (const s of v.sections) for (const i of s.items || []) if ((i.saved_lines || []).some((l) => l.kind === 'deficiency')) return i.ref;
  throw new Error('no item with a comment');
}
function lineAt(text, ref) {
  const v = JSON.parse(text).templates[0].versions[0];
  for (const s of v.sections) for (const i of s.items || []) if (i.ref === ref) return i.saved_lines[i.saved_lines.length - 1];
  return null;
}
function row(id, name, text, at, base) {
  const data = { id, ownerAccountId: OWNER, name, version: JSON.parse(text).templates[0].versions[0].version, source: 'copied',
    sha256: sha(text), byteLength: Buffer.byteLength(text, 'utf8'), createdAt: at, updatedAt: at, deletedAt: null };
  if (base) data.base = base;
  return { kind: 'inspection_templates', id, updated_at: at, deleted_at: null, data };
}

(async () => {
  const name = copyFile.copyName;
  const id = S.newTemplateId(name, []);
  const copy = S.makeCopy(copyFile, id, name);
  // An item of ours, as an inspection made from it names it, moved into the copy.
  const oursRef = firstItemRef(copyFile.text).replace(copyFile.placeholderId + '.', copyFile.source + '.');
  const itemRef = S.refIn(oursRef, copyFile.source, id);

  const first = S.addLine(copy, { itemRef, title: '  Missing "GFCI" protection \u{1F50C}  ',
    details: 'Outlets near the sink\tare not protected. Café counter.', recommendation: 'Have an electrician add GFCI protection.', code: 'SH' });
  if (first.problem) throw new Error(first.problem);
  const second = S.addLine(first.text, { itemRef, title: 'Loose cover plate', details: '', recommendation: '', code: 'XX' });
  if (second.problem) throw new Error(second.problem);
  const again = S.addLine(second.text, { itemRef, title: 'Loose cover plate', details: '  ', code: 'MN' });

  const cases = [
    { name: 'the first save makes his own copy of ours, with the comment, as one version', templateId: id, itemRef, oursRef,
      text: first.text, row: row(id, name, first.text, T1, null), line: lineAt(first.text, itemRef), contentKey: await S.contentKey(first.text, digest),
      copyContentKey: await S.contentKey(copy, digest), copyText: copy },
    { name: 'a second save, on top of the first: the next version, its base the first', templateId: id, itemRef, oursRef,
      text: second.text, row: row(id, name, second.text, T2, await S.contentKey(first.text, digest)), line: lineAt(second.text, itemRef),
      contentKey: await S.contentKey(second.text, digest) },
  ];
  const files = {
    'README.md': '# What the website\'s Save to template writes\n\nMade by inspyx-site `tools/template_save_fixtures.js` from ' +
      '`coming-soon/assets/template-save.js`. Do not edit: make them again. Run by `test/src/data/web_template_save_test.dart`.\n',
    'cases.json': JSON.stringify({ owner: OWNER, again: again.problem || null, cases }, null, 2) + '\n',
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
  console.log(check ? (bad ? 'FIXTURES DIFFER' : 'FIXTURES MATCH') : 'v' + first.version + ', v' + second.version + ', again: ' + again.problem);
  process.exit(bad ? 1 : 0);
})().catch((e) => { console.error('FAILED', e.message); process.exit(1); });
