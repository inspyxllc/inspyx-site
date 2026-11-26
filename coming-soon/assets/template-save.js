/* Save to template (2026-11-26, his list item 12, piece D): a finding written on the website goes into the inspector's
   template as a pre-written comment, so the next inspection offers it. His decision (2026-11-26): from Inspyx's own
   template, it goes into the inspector's OWN COPY of it.

   A template file the website writes must be one the phone takes, exactly as the phone would write it: the phone
   checks every pulled version (its bytes' hash, its own parser, its library's gates; template_sync_kind.dart). So
   this file is the website's copy of the phone's own rules, and nothing more:
     canonical          the phone's canonical JSON (report_content.dart canonicalReportJson): keys sorted by UTF-16
                        code unit, compact, whole numbers only. The same content gives the same bytes, so the same
                        hash, on both sides.
     makeCopy           the inspector's own copy of one of ours: the app's own copy code made it, under a placeholder
                        id and name (the app repo's test/tool/web_template_copies_test.dart, copied to
                        assets/template-copies/); this puts in the copy's id and name.
     newTemplateId      inspector_templates.dart newTemplateIdFor.
     nextVersionAfter   template_store.dart nextVersionAfter (with compareVersions).
     editedProvenance   template_draft.dart editedProvenance: the first source stays named.
     addLine            one deficiency comment appended to one item: name = the finding's title, text = its Details,
                        recommendation = "What to do", rating = the template's own rating for its code. Append only:
                        a finding names the comment it came from by kind and position (I2, 2026-11-24).
     contentKey         inspector_templates.dart contentKey: the content without its version number, for a row's base.
   ONE CONTRACT: tools/template_save_fixtures.js writes what these make into the app repo's
   test/fixtures/web_template_saves/, and its test/src/data/web_template_save_test.dart proves the phone takes each,
   holds the very same bytes, and gets the same content key.

   No words here: the page holds every sentence. Works in the browser (window.InspyxTemplateSave) and in Node. */
(function (root) {
  'use strict';

  /* ---- the phone's canonical JSON ---- */
  function canonical(value) {
    if (value === null || typeof value === 'string' || typeof value === 'boolean') return JSON.stringify(value);
    if (typeof value === 'number') {
      if (!Number.isSafeInteger(value)) throw new Error('canonical: whole numbers only');
      return String(value);
    }
    if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']';
    if (typeof value === 'object') {
      // JS sorts strings by UTF-16 code unit, as Dart's String.compareTo.
      var keys = Object.keys(value).filter(function (k) { return value[k] !== undefined; }).sort();
      return '{' + keys.map(function (k) { return JSON.stringify(k) + ':' + canonical(value[k]); }).join(',') + '}';
    }
    throw new Error('canonical: not JSON');
  }

  /* Dart's String.trim (the phone trims what it keeps; agreement-fill.js has the same). */
  var SPACE = [0x09, 0x0a, 0x0b, 0x0c, 0x0d, 0x20, 0x85, 0xa0, 0x1680, 0x2000, 0x2001, 0x2002, 0x2003, 0x2004, 0x2005,
    0x2006, 0x2007, 0x2008, 0x2009, 0x200a, 0x2028, 0x2029, 0x202f, 0x205f, 0x3000, 0xfeff];
  function dartTrim(s) {
    var start = 0, end = s.length;
    while (start < end && SPACE.indexOf(s.charCodeAt(start)) >= 0) start++;
    while (end > start && SPACE.indexOf(s.charCodeAt(end - 1)) >= 0) end--;
    return s.slice(start, end);
  }

  /* ---- versions (template_store.dart) ---- */
  var WHOLE = /^[+-]?\d+$/;
  function compareVersions(a, b) {
    var ai = WHOLE.test(a) ? parseInt(a, 10) : null, bi = WHOLE.test(b) ? parseInt(b, 10) : null;
    if (ai !== null && bi !== null) return ai < bi ? -1 : ai > bi ? 1 : 0;
    if (ai !== null) return -1;
    if (bi !== null) return 1;
    return a < b ? -1 : a > b ? 1 : 0;
  }
  function nextVersionAfter(versions) {
    var ordered = versions.slice().sort(compareVersions);
    if (!ordered.length) return '1';
    var highest = ordered[ordered.length - 1];
    if (WHOLE.test(highest)) return String(parseInt(highest, 10) + 1);
    var m = /^([\s\S]*)~(\d+)$/.exec(highest);
    if (m) {
      var next = String(parseInt(m[2], 10) + 1);
      while (next.length < m[2].length) next = '0' + next;
      if (next.length === m[2].length) return m[1] + '~' + next;
    }
    return highest + '~0001';
  }

  /* ---- ids (inspector_templates.dart newTemplateIdFor) ---- */
  var ID = /^inspector\.[a-z0-9]+(-[a-z0-9]+)*$/;
  function newTemplateId(name, taken) {
    var words = String(name).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
    if (words.length > 40) words = words.slice(0, 40).replace(/-+$/, '');
    if (!words) words = 'template';
    var base = 'inspector.' + words, id = base;
    for (var n = 2; taken.indexOf(id) >= 0; n++) id = base + '-' + n;
    if (!ID.test(id)) throw new Error('newTemplateId: ' + id);
    return id;
  }

  /* ---- provenance (template_draft.dart editedProvenance) ---- */
  function editedProvenance(was, fromVersion) {
    var prefix = 'Edited by the inspector from version', marker = '(first: ';
    var before = (was && typeof was.source_identity === 'string') ? was.source_identity : 'the inspector\'s own template';
    var at = before.indexOf(marker);
    var first = before.indexOf(prefix) === 0 && at >= 0 && before.slice(-1) === ')' ? before.slice(at + marker.length, -1) : before;
    return {
      source_identity: prefix + ' ' + fromVersion + ' (first: ' + first + ')',
      ownership: 'The inspector',
      rights_basis: (was && typeof was.rights_basis === 'string') ? was.rights_basis : 'The inspector\'s own template',
      content_mapping: 'Version ' + fromVersion + ' with the inspector\'s edits',
      transformation: 'Edited by the inspector on the phone',
      restrictions: 'For the inspector\'s own inspections',
      register_kind: 'inspector_owned'
    };
  }

  /* The source a template's newest version names first ("Copied from Inspyx template inspyx.walkthrough version 10
     (content hash ...)"), through any number of edits. */
  function firstSource(text) {
    var v = only(JSON.parse(text)).version;
    var s = v.provenance && typeof v.provenance.source_identity === 'string' ? v.provenance.source_identity : '';
    var marker = '(first: ', at = s.indexOf(marker);
    return s.indexOf('Edited by the inspector from version') === 0 && at >= 0 && s.slice(-1) === ')' ? s.slice(at + marker.length, -1) : s;
  }
  /* Whether [text] is the inspector's own copy of our [sourceId] (its first source names it). */
  function isCopyOf(text, sourceId) {
    return firstSource(text).indexOf('Copied from Inspyx template ' + sourceId + ' version ') === 0;
  }

  function only(manifest) {
    if (!manifest || !Array.isArray(manifest.templates) || manifest.templates.length !== 1) throw new Error('one template');
    var t = manifest.templates[0];
    if (!Array.isArray(t.versions) || t.versions.length !== 1) throw new Error('one version');
    return { template: t, version: t.versions[0] };
  }

  /* ---- the copy ---- */
  /* [copy]: the generated file (assets/template-copies/<ours>.json). The copy as text, named [name], id [id]. */
  function makeCopy(copy, id, name) {
    if (!ID.test(id)) throw new Error('makeCopy: id');
    var text = copy.text.split(JSON.stringify(copy.placeholderName)).join(JSON.stringify(name));
    text = text.split(copy.placeholderId).join(id);
    var manifest = JSON.parse(text), o = only(manifest);
    if (o.template.id !== id || o.template.name !== name) throw new Error('makeCopy: placeholders');
    return canonical(manifest);
  }

  /* The ref an inspection's item has in the template [targetId]: the same, or, for an inspection made from our
     [fromId] going into a copy of it, moved into the copy's namespace (copyFromOurs's rewrite). */
  function refIn(itemRef, fromId, targetId) {
    if (typeof itemRef !== 'string' || !itemRef) return null;
    if (fromId === targetId) return itemRef;
    var from = fromId + '.';
    return itemRef.indexOf(from) === 0 ? targetId + '.' + itemRef.slice(from.length) : null;
  }

  /* ---- one comment, appended ---- */
  /* [line]: { itemRef, title, details, recommendation, code }. Answers { text, version, from } (the new version's
     file, its number, the number it was made from) or { problem }: 'no_title', 'no_item', 'already'. */
  function addLine(text, line) {
    var manifest = JSON.parse(text), o = only(manifest), v = o.version;
    var title = dartTrim(String(line.title || ''));
    if (!title) return { problem: 'no_title' };
    var item = null;
    (v.sections || []).forEach(function (s) { (s.items || []).forEach(function (i) { if (i.ref === line.itemRef) item = i; }); });
    if (!item) return { problem: 'no_item' };
    var details = dartTrim(String(line.details || '')), what = dartTrim(String(line.recommendation || ''));
    var lines = Array.isArray(item.saved_lines) ? item.saved_lines : [];
    var same = lines.some(function (l) {
      return l.kind === 'deficiency' && l.name === title && (l.text == null ? '' : l.text) === details;
    });
    if (same) return { problem: 'already' };
    var next = 0;
    lines.forEach(function (l) { if (typeof l.position === 'number' && l.position >= next) next = l.position + 1; });
    var rating = (v.ratings || []).filter(function (r) { return r.category === line.code; })[0];
    var added = { kind: 'deficiency', name: title, position: next };
    if (details) added.text = details;
    if (rating) added.rating = rating.id;
    if (what) added.recommendation = what;
    item.saved_lines = lines.concat([added]);
    var from = String(v.version);
    v.version = nextVersionAfter([from]);
    v.provenance = editedProvenance(v.provenance, from);
    return { text: canonical(manifest), version: v.version, from: from };
  }

  /* ---- a row's base (inspector_templates.dart contentKey) ---- */
  /* [digest]: text -> Promise of its SHA-256 in lower-case hex (the browser's or Node's). */
  function contentKey(text, digest) {
    var o = only(JSON.parse(text)), v = o.version, content = { template_id: o.template.id };
    Object.keys(v).forEach(function (k) { if (k !== 'provenance') content[k] = v[k]; });
    content.version = '0';
    return digest(canonical(content)).then(function (hash) {
      return digest(canonical({ content: hash, name: o.template.name }));
    });
  }

  var api = { canonical: canonical, dartTrim: dartTrim, compareVersions: compareVersions, nextVersionAfter: nextVersionAfter,
    newTemplateId: newTemplateId, editedProvenance: editedProvenance, firstSource: firstSource, isCopyOf: isCopyOf,
    makeCopy: makeCopy, refIn: refIn, addLine: addLine, contentKey: contentKey };
  if (typeof module === 'object' && module.exports) module.exports = api; else root.InspyxTemplateSave = api;
})(typeof window !== 'undefined' ? window : this);
