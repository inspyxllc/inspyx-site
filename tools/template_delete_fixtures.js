// Writes what the website's "Delete this template" and its Undo send (coming-soon/assets/template-save.js removalRow,
// restoreRow and defaultRow, the very functions the page calls) into the app repo, where
// test/src/data/web_template_delete_test.dart proves the phone takes them as its own Remove and Undo (2026-11-26).
// usage: node tools/template_delete_fixtures.js <app repo>/test/fixtures/web_template_deletes
//        node tools/template_delete_fixtures.js --check <that folder>   (fails when what is there is not what this makes)
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const S = require('../coming-soon/assets/template-save.js');

const check = process.argv[2] === '--check';
const out = process.argv[check ? 3 : 2];
if (!out) { console.error('usage: node tools/template_delete_fixtures.js [--check] <folder>'); process.exit(2); }

// The app's template sync harness's owner (test/src/data/template_sync_harness.dart).
const OWNER = '11111111-2222-4333-8444-555555555555';
// After the harness phone's own clock (2026-11-22 12:00Z), so the website's changes are the newer ones.
const T_DELETE = 1795600000000, T_UNDO = 1795600030000;
const sha = (text) => crypto.createHash('sha256').update(Buffer.from(text, 'utf8')).digest('hex');
const digest = (text) => Promise.resolve(sha(text));
const copyFile = JSON.parse(fs.readFileSync(path.join(__dirname, '../coming-soon/assets/template-copies/inspyx.walkthrough.json'), 'utf8'));

(async () => {
  const name = copyFile.copyName, id = S.newTemplateId(name, []), text = S.makeCopy(copyFile, id, name);
  // The template's live row as the server holds it (the phone's own, from its first sync; the website reads it).
  const live = { kind: 'inspection_templates', id, updated_at: 1, deleted_at: null, data: { id, ownerAccountId: OWNER, name,
    version: JSON.parse(text).templates[0].versions[0].version, source: 'copied', sha256: sha(text), byteLength: Buffer.byteLength(text, 'utf8'),
    createdAt: 1, updatedAt: 1, deletedAt: null } };
  const base = await S.contentKey(text, digest);
  const fixture = {
    owner: OWNER,
    templateId: id,
    name,
    copyText: text,
    base,
    removal: S.removalRow(live, OWNER, T_DELETE, base),
    defaultNone: S.defaultRow(OWNER, T_DELETE, null),
    restore: S.restoreRow(live, OWNER, T_UNDO, base),
  };
  const json = JSON.stringify(fixture, null, 2) + '\n';
  const readme = '# What the website\'s Delete this template sends, and its Undo\n\nMade by inspyx-site `tools/template_delete_fixtures.js` from `coming-soon/assets/template-save.js` (removalRow, restoreRow, defaultRow: the functions the page calls). Do not edit: make them again. Run by `test/src/data/web_template_delete_test.dart`.\n';
  if (check) {
    const was = fs.readFileSync(path.join(out, 'cases.json'), 'utf8');
    if (was !== json) { console.error('the fixture is not what the website makes now: make it again'); process.exit(1); }
    console.log('the fixture is what the website makes');
    return;
  }
  fs.mkdirSync(out, { recursive: true });
  fs.writeFileSync(path.join(out, 'cases.json'), json);
  fs.writeFileSync(path.join(out, 'README.md'), readme);
  console.log('wrote ' + path.join(out, 'cases.json'));
})();
