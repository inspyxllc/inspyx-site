/* The template editor's rules (2026-11-26, his 11-22 order: "full template editor on the web", "even more powerful than
   the app"). A template the website edits must be one the phone takes, made by the phone's own editing rules
   (template_draft.dart TemplateDraft): this file is those rules on the template file itself, and nothing more.
   As the phone does, the version is read into a draft (its stops, their items, their comments, each knowing the part
   it was made from), the edits change the draft, and the draft is built back (TemplateDraft._built):
     - Every ref a part had stays, wherever it moves, so what Spex, the report and started inspections know by ref
       keeps its meaning. A new stop or item is given a ref only when built, in walk order, from its name
       (<template id>.<words> for a stop, <stop ref>.<words> for an item; -2, -3... when taken by the version edited).
     - Stops and items are numbered again in their order; the front matter (Inspection details) stays first, as it was.
     - A kept comment keeps its position: a finding names the comment it was ticked from by kind and position. A new
       one takes the next free position after the item's kept comments. Comments aren't reordered.
     - Names and words are trimmed as Dart trims; an emptied text is dropped; only a finding has a category.
     - The report sections, the finding categories' ids and the legal text carry over; a category may be renamed.
     - Each save is the template's next version (template_store.dart nextVersionAfter), its source line edited from
       the one before (template_draft.dart editedProvenance: the first source stays named).
   Edits come as a list (apply), so the app repo's test can play the very same list through the phone's TemplateDraft
   and prove both give the same template (test/src/data/web_template_edit_test.dart, from tools/template_edit_fixtures.js).

   Piece A: rename the template, a stop, an item, a comment; a comment's words, category and "What to do".
   Piece B: add, move and delete stops and items, add and delete comments; an item's report section; rename a category.
   No words here: the page holds every sentence. Works in the browser (window.InspyxTemplateEdit) and in Node. */
(function (root, TS) {
  'use strict';

  var NAME_MAX = 120, BYTES_MAX = 5 * 1024 * 1024;
  var KINDS = ['information', 'limitation', 'deficiency'];
  // template_manifest.dart AnswerType.values; the ones a field may be given here are the phone editor's _newAnswers
  // (the rest come only in imports, and a field that has one may keep it). Choices: template_editor.dart _takesChoices.
  var ANSWERS = ['condition', 'boolean', 'checkbox', 'date', 'number', 'range', 'text', 'choice', 'multi_choice'];
  var NEW_ANSWERS = ['choice', 'multi_choice', 'boolean', 'text', 'number', 'date'];
  var takesChoices = function (a) { return a === 'choice' || a === 'multi_choice' || a === 'checkbox'; };
  var cleanChoices = function (list) { return (Array.isArray(list) ? list : []).map(trim).filter(function (o) { return o; }); };
  var byPosition = function (a, b) { return a.position - b.position; };
  var copy = function (o) { return JSON.parse(JSON.stringify(o)); };
  var trim = function (v) { return TS.dartTrim(String(v == null ? '' : v)); };

  function only(manifest) {
    if (!manifest || !Array.isArray(manifest.templates) || manifest.templates.length !== 1) throw new Error('one template');
    var t = manifest.templates[0];
    if (!Array.isArray(t.versions) || t.versions.length !== 1) throw new Error('one version');
    return { template: t, version: t.versions[0] };
  }
  var front = function (s) { return s.section_class === 'front_matter'; };

  /* What the editor shows: the template's name and version, its stops in walk order (front matter left out: it is
     not edited here), each with its items and their comments, in order; the finding categories; the report sections. */
  function outline(text) {
    var o = only(JSON.parse(text)), v = o.version;
    var stops = (v.sections || []).filter(function (s) { return !front(s); }).slice().sort(byPosition);
    return {
      id: o.template.id, name: o.template.name, version: String(v.version),
      ratings: (v.ratings || []).map(function (r) { return { id: r.id, label: r.label, category: r.category }; }),
      systems: (v.systems || []).slice().sort(byPosition).map(function (s) { return { id: s.id, name: s.name }; }),
      stops: stops.map(function (s) {
        return { ref: s.ref, name: s.name, items: (s.items || []).slice().sort(byPosition).map(function (i) {
          return { ref: i.ref, label: i.label, system: i.system || null,
            lines: (i.saved_lines || []).slice().sort(byPosition).map(function (l) {
              return { kind: l.kind, position: l.position, name: l.name, text: l.text == null ? '' : l.text,
                rating: l.rating || null, recommendation: l.recommendation == null ? '' : l.recommendation,
                answerType: l.answer_type || null, options: (l.options || []).slice() };
            }) };
        }) };
      })
    };
  }

  /* ---- the draft (TemplateDraft.of) ---- */
  function draftOf(manifest) {
    var o = only(manifest), v = o.version, sorted = (v.sections || []).slice().sort(byPosition);
    return {
      manifest: manifest, template: o.template, version: v,
      name: o.template.name,
      fixed: sorted.filter(front),
      ratingLabels: {},
      rooms: sorted.filter(function (s) { return !front(s); }).map(function (s) {
        return { key: s.ref, base: s, name: s.name, items: (s.items || []).slice().sort(byPosition).map(function (i) {
          return { key: i.ref, base: i, label: i.label, system: i.system == null ? null : i.system,
            lines: (i.saved_lines || []).slice().sort(byPosition).map(function (l) {
              return { key: i.ref + '|' + l.kind + '|' + l.position, base: l, kind: l.kind, name: l.name,
                text: l.text == null ? null : l.text, rating: l.rating == null ? null : l.rating,
                recommendation: l.recommendation == null ? null : l.recommendation,
                answerType: l.answer_type == null ? null : l.answer_type, options: (l.options || []).slice() };
            }) };
        }) };
      })
    };
  }
  function roomOf(d, key) { return d.rooms.filter(function (r) { return r.key === key; })[0] || null; }
  function itemOf(d, key) {
    var hit = null;
    d.rooms.forEach(function (r) { r.items.forEach(function (i) { if (i.key === key) hit = { room: r, item: i }; }); });
    return hit;
  }
  function lineOf(d, e) {
    var key = e.key || (e.item + '|' + e.kind + '|' + e.position), hit = null;
    d.rooms.forEach(function (r) { r.items.forEach(function (i) { i.lines.forEach(function (l) { if (l.key === key) hit = { item: i, line: l }; }); }); });
    return hit;
  }
  var place = function (list, x, at) {
    var n = typeof at === 'number' && at >= 0 && at <= list.length ? at : list.length;
    list.splice(n, 0, x);
  };

  /* ---- the build (TemplateDraft._built) ---- */
  function build(d, versionNumber) {
    var v = d.version, t = d.template, systems = v.systems || [];
    var taken = {};
    (v.sections || []).forEach(function (s) { taken[s.ref] = true; (s.items || []).forEach(function (i) { taken[i.ref] = true; }); });
    var fresh = function (prefix, words) {
      var slug = String(words).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
      if (!slug) slug = 'part';
      var ref = prefix + '.' + slug;
      for (var n = 2; taken[ref]; n++) ref = prefix + '.' + slug + '-' + n;
      taken[ref] = true;
      return ref;
    };
    var sections = [];
    d.fixed.forEach(function (s) { var c = copy(s); c.position = sections.length; sections.push(c); });
    d.rooms.forEach(function (room) {
      var was = room.base, ref = was ? was.ref : fresh(t.id, room.name);
      var s = was ? copy(was) : { ref: ref, report_section_id: null, section_class: 'own_chapter' };
      s.name = trim(room.name);
      s.position = sections.length;
      s.items = room.items.map(function (item, n) { return builtItem(item, n, ref, fresh, systems); });
      sections.push(s);
    });
    var built = copy(v);
    built.version = versionNumber;
    built.sections = sections;
    if (built.ratings) built.ratings = built.ratings.map(function (r) {
      return Object.prototype.hasOwnProperty.call(d.ratingLabels, r.id) ? Object.assign({}, r, { label: d.ratingLabels[r.id] }) : r;
    });
    var manifest = copy(d.manifest);
    manifest.templates[0].name = trim(d.name);
    manifest.templates[0].versions = [built];
    return manifest;
  }
  function builtItem(item, position, roomRef, fresh, systems) {
    var was = item.base;
    var i = was ? copy(was) : { ref: fresh(roomRef, item.label), content_ref: null, check: null, guidance: null };
    i.label = trim(item.label);
    i.position = position;
    if (systems.length && item.system) i.system = item.system; else delete i.system;
    // A kept comment keeps its position; a new one takes the next free.
    var next = 0;
    item.lines.forEach(function (l) { if (l.base && l.base.position >= next) next = l.base.position + 1; });
    var lines = item.lines.map(function (l) {
      var c = l.base ? copy(l.base) : { kind: l.kind };
      c.name = trim(l.name);
      c.position = l.base ? l.base.position : next++;
      var words = trim(l.text);
      if (words) c.text = words; else delete c.text;
      if (l.kind === 'deficiency') { if (l.rating) c.rating = l.rating; else delete c.rating; }
      // A field's answer and choices (DraftLine._build): its kind of answer; its choices, trimmed, blanks dropped; a
      // field whose kind of answer changed drops the old units and defaults.
      if (l.answerType) c.answer_type = l.answerType; else delete c.answer_type;
      var choices = cleanChoices(l.options);
      if (choices.length) c.options = choices; else delete c.options;
      if (!l.base || (l.base.answer_type || null) !== (l.answerType || null)) {
        delete c.units; delete c.default_value; delete c.default_value2; delete c.default_unit;
      }
      // "What to do" the phone carries over as it was (DraftLine._build); only an edit here changes it.
      if (l.todoEdited) { var todo = trim(l.recommendation); if (todo) c.recommendation = todo; else delete c.recommendation; }
      return c;
    }).sort(byPosition);
    if (lines.length) i.saved_lines = lines; else delete i.saved_lines;
    return i;
  }

  /* What is missing before the draft can be saved (TemplateDraft.problem); null when nothing is. */
  function problem(d) {
    if (!trim(d.name)) return 'no_name';
    if (trim(d.name).length > NAME_MAX) return 'too_long';
    if (!d.rooms.length) return 'no_stops';
    var systems = d.version.systems || [];
    for (var r = 0; r < d.rooms.length; r++) {
      var room = d.rooms[r];
      if (!trim(room.name)) return 'no_name';
      for (var n = 0; n < room.items.length; n++) {
        var item = room.items[n];
        if (!trim(item.label)) return 'no_name';
        if (systems.length && !item.system) return 'no_system';
        for (var k = 0; k < item.lines.length; k++) if (!trim(item.lines[k].name)) return 'no_name';
      }
    }
    return null;
  }

  /* [edits], in order, on the newest version [text]. Parts are named by ref (a stop, an item), by item, kind and
     position (a kept comment), or by the key an add gave them ('new:…', any string the page picks, unique).
       { op: 'template', name }                           the template's name
       { op: 'stop', ref, name }                          a stop's name
       { op: 'item', ref, label }                         an item's name
       { op: 'line', item, kind, position | key, name?, text?, rating?, recommendation? }
       { op: 'add-stop', key, name, at? }                 a new stop, at index [at] of the stops (default: last)
       { op: 'add-item', key, stop, label, system?, at? } a new item in [stop]
       { op: 'add-line', key, item, kind, name, text?, rating?, recommendation? }
       { op: 'move-stop', ref, to }                       to index [to] of the stops
       { op: 'move-item', ref, stop, to }                 into [stop], at index [to] of its items
       { op: 'delete-stop', ref } | { op: 'delete-item', ref } | { op: 'delete-line', item, kind, position | key }
       { op: 'system', ref, system }                      an item's report section
       { op: 'rating-label', id, label }                  a finding category's name
     A line edit or add may also carry answerType and options (an information field's kind of answer and choices).
     Answers { text, version, from, name } (the new version's file, its number, the one it was made from, the
     template's name) or { problem, at } with the edit's index (-1: the whole):
       'no_name' (an emptied name), 'too_long' (a template name over 120 characters), 'no_part' (a part that isn't
       there), 'no_rating' (a category the template hasn't), 'not_finding' (a category or "What to do" on a comment
       that isn't a finding), 'no_system' (an item without a report section, in a template that has them),
       'no_stops' (none left), 'not_field' (an answer or choices on a comment that isn't an information field),
       'no_answer' (a kind of answer a field can't be given here), 'unchanged' (nothing differs), 'too_big' (over the 5 MB a template file may be). */
  function apply(text, edits) {
    var manifest = JSON.parse(text), d = draftOf(manifest), v = d.version;
    var ratingIds = (v.ratings || []).map(function (r) { return r.id; });
    var systemIds = (v.systems || []).map(function (s) { return s.id; });
    var keys = {};
    for (var n = 0; n < edits.length; n++) {
      var e = edits[n], bad = function (p) { return { problem: p, at: n }; }, hit;
      switch (e.op) {
        case 'template': d.name = String(e.name == null ? '' : e.name); break;
        case 'stop':
          if (!(hit = roomOf(d, e.ref))) return bad('no_part');
          hit.name = String(e.name == null ? '' : e.name); break;
        case 'item':
          if (!(hit = itemOf(d, e.ref))) return bad('no_part');
          hit.item.label = String(e.label == null ? '' : e.label); break;
        case 'line':
          if (!(hit = lineOf(d, e))) return bad('no_part');
          var l = hit.line;
          if (e.name !== undefined) l.name = String(e.name == null ? '' : e.name);
          if (e.text !== undefined) l.text = e.text;
          if (e.answerType !== undefined || e.options !== undefined) {
            if (l.kind !== 'information') return bad('not_field');
            var answer = e.answerType !== undefined ? e.answerType : l.answerType;
            var had = l.base ? (l.base.answer_type || null) : null;
            if (answer !== had && NEW_ANSWERS.indexOf(answer) < 0) return bad('no_answer');
            if (answer !== null && ANSWERS.indexOf(answer) < 0) return bad('no_answer');
            l.answerType = answer;
            // As the phone's field editor keeps it: choices only for an answer that takes them.
            l.options = takesChoices(answer) ? cleanChoices(e.options !== undefined ? e.options : l.options) : [];
          }
          if (e.rating !== undefined || e.recommendation !== undefined) {
            if (l.kind !== 'deficiency') return bad('not_finding');
            if (e.rating !== undefined) {
              if (e.rating !== null && ratingIds.indexOf(e.rating) < 0) return bad('no_rating');
              l.rating = e.rating;
            }
            if (e.recommendation !== undefined) { l.recommendation = e.recommendation; l.todoEdited = true; }
          }
          break;
        case 'add-stop':
          if (!e.key || keys[e.key]) return bad('no_part');
          keys[e.key] = true;
          place(d.rooms, { key: e.key, base: null, name: String(e.name == null ? '' : e.name), items: [] }, e.at); break;
        case 'add-item':
          if (!e.key || keys[e.key] || !(hit = roomOf(d, e.stop))) return bad('no_part');
          if (e.system != null && systemIds.indexOf(e.system) < 0) return bad('no_part');
          keys[e.key] = true;
          place(hit.items, { key: e.key, base: null, label: String(e.label == null ? '' : e.label), system: e.system == null ? null : e.system, lines: [] }, e.at); break;
        case 'add-line':
          if (!e.key || keys[e.key] || !(hit = itemOf(d, e.item)) || KINDS.indexOf(e.kind) < 0) return bad('no_part');
          if ((e.rating != null || trim(e.recommendation)) && e.kind !== 'deficiency') return bad('not_finding');
          if (e.rating != null && ratingIds.indexOf(e.rating) < 0) return bad('no_rating');
          if ((e.answerType !== undefined || e.options !== undefined) && e.kind !== 'information') return bad('not_field');
          // A new field starts as "Pick one", as on the phone.
          var na = e.kind === 'information' ? (e.answerType === undefined ? 'choice' : e.answerType) : null;
          if (e.kind === 'information' && NEW_ANSWERS.indexOf(na) < 0) return bad('no_answer');
          keys[e.key] = true;
          hit.item.lines.push({ key: e.key, base: null, kind: e.kind, name: String(e.name == null ? '' : e.name),
            answerType: na, options: na && takesChoices(na) ? cleanChoices(e.options) : [],
            text: e.text == null ? null : e.text, rating: e.rating == null ? null : e.rating, recommendation: e.recommendation == null ? null : e.recommendation,
            todoEdited: true });
          break;
        case 'move-stop':
          if (!(hit = roomOf(d, e.ref))) return bad('no_part');
          d.rooms.splice(d.rooms.indexOf(hit), 1); place(d.rooms, hit, e.to); break;
        case 'move-item':
          var to = roomOf(d, e.stop);
          if (!(hit = itemOf(d, e.ref)) || !to) return bad('no_part');
          hit.room.items.splice(hit.room.items.indexOf(hit.item), 1); place(to.items, hit.item, e.to); break;
        case 'delete-stop':
          if (!(hit = roomOf(d, e.ref))) return bad('no_part');
          d.rooms.splice(d.rooms.indexOf(hit), 1); break;
        case 'delete-item':
          if (!(hit = itemOf(d, e.ref))) return bad('no_part');
          hit.room.items.splice(hit.room.items.indexOf(hit.item), 1); break;
        case 'delete-line':
          if (!(hit = lineOf(d, e))) return bad('no_part');
          hit.item.lines.splice(hit.item.lines.indexOf(hit.line), 1); break;
        case 'system':
          if (!(hit = itemOf(d, e.ref)) || (e.system != null && systemIds.indexOf(e.system) < 0)) return bad('no_part');
          hit.item.system = e.system == null ? null : e.system; break;
        case 'rating-label':
          if (ratingIds.indexOf(e.id) < 0) return bad('no_rating');
          if (!trim(e.label)) return bad('no_name');
          d.ratingLabels[e.id] = trim(e.label); break;
        default:
          throw new Error('apply: ' + e.op);
      }
    }
    var p = problem(d);
    if (p) return { problem: p, at: -1 };
    var from = String(v.version);
    var out = build(d, from);
    if (TS.canonical(out) === TS.canonical(manifest)) return { problem: 'unchanged', at: -1 };
    var ov = out.templates[0].versions[0];
    ov.version = TS.nextVersionAfter([from]);
    ov.provenance = TS.editedProvenance(v.provenance, from);
    var text2 = TS.canonical(out);
    if (new TextEncoder().encode(text2).length > BYTES_MAX) return { problem: 'too_big', at: -1 };
    return { text: text2, version: ov.version, from: from, name: out.templates[0].name };
  }

  /* The name an exported template's file takes (export_everything.dart safeFileName), with .inspyx. */
  function fileName(name) {
    var out = String(name).replace(/[\\/:*?"<>|\u0000-\u001f]/g, '-').replace(/\s+/g, ' ');
    out = trim(out);
    if (out.charAt(0) === '.') out = '-' + out.slice(1);
    if (out.length > 80) out = trim(out.slice(0, 80));
    return (out || 'Untitled') + '.inspyx';
  }

  var api = { outline: outline, apply: apply, fileName: fileName, ANSWERS: NEW_ANSWERS, takesChoices: takesChoices };
  if (typeof module === 'object' && module.exports) module.exports = api; else root.InspyxTemplateEdit = api;
})(typeof window !== 'undefined' ? window : this,
  typeof module === 'object' && module.exports ? require('./template-save.js') : (typeof window !== 'undefined' ? window.InspyxTemplateSave : null));
