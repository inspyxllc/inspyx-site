/* The template editor's rules (2026-11-26, his 11-22 order: "full template editor on the web", "even more powerful than
   the app"). A template the website edits must be one the phone takes, made by the phone's own editing rules
   (template_draft.dart TemplateDraft): this file is those rules on the template file itself, and nothing more.
     - Every ref stays, so what Spex, the report and started inspections know by ref keeps its meaning.
     - A kept comment keeps its position: a finding names the comment it was ticked from by kind and position.
     - The front matter (Inspection details), the report sections, the finding categories' ids and the legal text
       carry over unchanged.
     - Names and words are trimmed; an emptied text is dropped; only a finding has a category.
     - Each save is the template's next version (template_store.dart nextVersionAfter), its source line edited from
       the one before (template_draft.dart editedProvenance: the first source stays named).
   Edits come as a list (apply), so the app repo's test can play the very same list through the phone's TemplateDraft
   and prove both give the same template (test/src/data/web_template_edit_test.dart, from tools/template_edit_fixtures.js).

   Piece A (2026-11-26): rename the template, a stop, an item, a comment; a comment's words, category and "What to do".
   No words here: the page holds every sentence. Works in the browser (window.InspyxTemplateEdit) and in Node. */
(function (root, TS) {
  'use strict';

  function only(manifest) {
    if (!manifest || !Array.isArray(manifest.templates) || manifest.templates.length !== 1) throw new Error('one template');
    var t = manifest.templates[0];
    if (!Array.isArray(t.versions) || t.versions.length !== 1) throw new Error('one version');
    return { template: t, version: t.versions[0] };
  }
  var NAME_MAX = 120, BYTES_MAX = 5 * 1024 * 1024;
  var byPosition = function (a, b) { return a.position - b.position; };

  /* What the editor shows: the template's name and version, its stops in walk order (front matter left out: it is
     not edited here), each with its items and their comments, in order; the finding categories. */
  function outline(text) {
    var o = only(JSON.parse(text)), v = o.version;
    var stops = (v.sections || []).filter(function (s) { return s.section_class !== 'front_matter'; }).slice().sort(byPosition);
    return {
      id: o.template.id, name: o.template.name, version: String(v.version),
      ratings: (v.ratings || []).map(function (r) { return { id: r.id, label: r.label, category: r.category }; }),
      stops: stops.map(function (s) {
        return { ref: s.ref, name: s.name, items: (s.items || []).slice().sort(byPosition).map(function (i) {
          return { ref: i.ref, label: i.label, system: i.system || null,
            lines: (i.saved_lines || []).slice().sort(byPosition).map(function (l) {
              return { kind: l.kind, position: l.position, name: l.name, text: l.text == null ? '' : l.text,
                rating: l.rating || null, recommendation: l.recommendation == null ? '' : l.recommendation };
            }) };
        }) };
      })
    };
  }

  function findStop(v, ref) {
    return (v.sections || []).filter(function (s) { return s.ref === ref && s.section_class !== 'front_matter'; })[0] || null;
  }
  function findItem(v, ref) {
    var hit = null;
    (v.sections || []).forEach(function (s) {
      if (s.section_class === 'front_matter') return;
      (s.items || []).forEach(function (i) { if (i.ref === ref) hit = i; });
    });
    return hit;
  }
  function setText(o, key, value) {
    var w = TS.dartTrim(String(value == null ? '' : value));
    if (w) o[key] = w; else delete o[key];
  }

  /* [edits], in order, on the newest version [text]. Each edit:
       { op: 'template', name }                      the template's name
       { op: 'stop', ref, name }                     a stop's name
       { op: 'item', ref, label }                    an item's name
       { op: 'line', item, kind, position, name?, text?, rating?, recommendation? }
                                                     a comment of [item], by kind and position
     Answers { text, version, from, name } (the new version's file, its number, the one it was made from, the
     template's name) or { problem, at } with the edit's index: 'no_name' (an emptied name), 'no_part' (a stop, item or
     comment not there), 'no_rating' (a category the template hasn't), 'not_finding' (a category or "What to do" on a
     comment that isn't a finding), 'too_long' (a template name over 120 characters), 'unchanged' (nothing differs),
     'too_big' (over the 5 MB a template file may be). */
  function apply(text, edits) {
    var manifest = JSON.parse(text), o = only(manifest), v = o.version;
    var before = TS.canonical(manifest);
    for (var n = 0; n < edits.length; n++) {
      var e = edits[n], bad = function (p) { return { problem: p, at: n }; };
      if (e.op === 'template') {
        var tn = TS.dartTrim(String(e.name || ''));
        if (!tn) return bad('no_name');
        // The row carries the name: the server refuses one over 120 characters (template_row_rules.dart).
        if (tn.length > NAME_MAX) return bad('too_long');
        o.template.name = tn;
      } else if (e.op === 'stop') {
        var s = findStop(v, e.ref);
        if (!s) return bad('no_part');
        var sn = TS.dartTrim(String(e.name || ''));
        if (!sn) return bad('no_name');
        s.name = sn;
      } else if (e.op === 'item') {
        var i = findItem(v, e.ref);
        if (!i) return bad('no_part');
        var il = TS.dartTrim(String(e.label || ''));
        if (!il) return bad('no_name');
        i.label = il;
      } else if (e.op === 'line') {
        var it = findItem(v, e.item);
        var l = it && (it.saved_lines || []).filter(function (x) { return x.kind === e.kind && x.position === e.position; })[0];
        if (!l) return bad('no_part');
        if (e.name !== undefined) {
          var ln = TS.dartTrim(String(e.name || ''));
          if (!ln) return bad('no_name');
          l.name = ln;
        }
        if (e.text !== undefined) setText(l, 'text', e.text);
        if (e.rating !== undefined || e.recommendation !== undefined) {
          if (l.kind !== 'deficiency') return bad('not_finding');
          if (e.rating !== undefined) {
            if (e.rating === null) delete l.rating;
            else if ((v.ratings || []).some(function (r) { return r.id === e.rating; })) l.rating = e.rating;
            else return bad('no_rating');
          }
          if (e.recommendation !== undefined) setText(l, 'recommendation', e.recommendation);
        }
      } else {
        throw new Error('apply: ' + e.op);
      }
    }
    if (TS.canonical(manifest) === before) return { problem: 'unchanged', at: -1 };
    var out = TS.canonical(manifest);
    if (new TextEncoder().encode(out).length > BYTES_MAX) return { problem: 'too_big', at: -1 };
    var from = String(v.version);
    v.version = TS.nextVersionAfter([from]);
    v.provenance = TS.editedProvenance(v.provenance, from);
    return { text: TS.canonical(manifest), version: v.version, from: from, name: o.template.name };
  }

  var api = { outline: outline, apply: apply };
  if (typeof module === 'object' && module.exports) module.exports = api; else root.InspyxTemplateEdit = api;
})(typeof window !== 'undefined' ? window : this,
  typeof module === 'object' && module.exports ? require('./template-save.js') : (typeof window !== 'undefined' ? window.InspyxTemplateSave : null));
