/* Bring in your template (/templates, T4, 2026-11-23, Inspyx Spex & Converter). The inspector drops the template
   file of the tool they use now; the app's own converter, compiled for the web (assets/convert/inspyx_convert.js,
   from inspyx-mobile tool/web_convert, and the app's PDF reader, assets/convert/inspyx_pdf.js), reads it here:
     read      what kind of file it is, nothing sent: a scan or an RTF is converted on the phone (his decision,
               2026-11-22: no reading of pictures on the server or in the browser);
     convert   its lines go to the Spex server, which sorts them as on the phone; each template comes back as the
               app's own template file with its preview, in the phone's own words (convert_words.dart);
     add       (behind SAVE until the app's template sync, inspyx-mobile #694, is on every phone) its file goes to the
               private store business-templates, then its row (kind inspection_templates) through the sync
               function, as the phone sends its own: the file first, so the server finds it.
   The sign-in never reaches this file: auth.js hands it to the converter and to the store itself.
   This file says no words. The page holds every one; the converter's preview words come with each template. */
(function () {
  'use strict';
  var auth = window.InspyxAuth;
  var main = document.querySelector('[data-tpl]');
  if (!auth || !main) return;

  // Adding from the website waits for the phones to pull templates (inspyx-mobile #694).
  var SAVE = false;
  // The Spex server's chat address, as the app's Spex Chat uses it (spex_chat_brain.dart).
  var RELAY = 'wss://chat---spex-relay-yu5bdad2fa-uc.a.run.app/';
  var DEADLINE = 30000, KIND = 'inspection_templates', SHOWN = 200;

  var $ = function (sel, el) { return (el || document).querySelector(sel); };
  var all = function (sel, el) { return [].slice.call((el || document).querySelectorAll(sel)); };
  var words = (function () {
    var box = $('template[data-t="words"]').content;
    return function (key, fill) {
      var w = box.querySelector('[data-w="' + key + '"]'), text = w ? w.textContent : '';
      Object.keys(fill || {}).forEach(function (k) { text = text.split('{' + k + '}').join(String(fill[k])); });
      return text;
    };
  })();

  var drop = $('[data-drop]'), pick = $('[data-pick]'), results = $('[data-results]');
  var me = (auth.stored() || {}).id || null;
  var turn = 0;   // each file read is a turn; an answer from an older turn is dropped

  // ---- what shows -------------------------------------------------------------------------------------------------

  function status(which, text) {
    all('[data-st]').forEach(function (p) { p.hidden = p.getAttribute('data-st') !== which; });
    if (which === 'sorting') $('[data-sorting]').textContent = text;
  }
  function verdict(which, text) {
    all('[data-v]').forEach(function (p) { p.hidden = p.getAttribute('data-v') !== which; });
    if (which === 'unreadable') $('[data-unreadable]').textContent = text;
    if (which === 'refused') $('[data-refused]').textContent = text;
  }
  function busy(on) { drop.classList.toggle('is-busy', on); pick.disabled = on; }

  function lines(list, into, n) {
    into.textContent = '';
    var show = function (upTo) {
      into.textContent = '';
      list.slice(0, upTo).forEach(function (text) {
        var li = document.createElement('li'); li.textContent = text; into.appendChild(li);
      });
      if (list.length > upTo) {
        var li = document.createElement('li'), b = document.createElement('button');
        b.type = 'button'; b.className = 'tpl-more'; b.textContent = words('show-all', { n: list.length });
        b.addEventListener('click', function () { show(list.length); });
        li.appendChild(b); into.appendChild(li);
      }
    };
    show(n);
  }

  /* The template's name as the inspector would write it: the file's name without its kind, its dashes and
     underscores as spaces, and, when it's all small letters, each word capitalized ("roof_inspection" ->
     "Roof Inspection"). A name with capitals of its own is kept as it is. */
  function tidy(name) {
    var n = String(name || '').replace(/\.[a-z0-9]{1,5}$/i, '').replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').trim();
    if (n && n === n.toLowerCase()) n = n.replace(/(^|\s)([a-z])/g, function (m, a, c) { return a + c.toUpperCase(); });
    return n.slice(0, 120) || String(name || '');
  }

  function card(t, i, count) {
    var el = $('template[data-t="result"]').content.firstElementChild.cloneNode(true);
    var w = t.words || {};
    if (count > 1) { var part = $('[data-part]', el); part.hidden = false; part.textContent = words('part', { n: i + 1, count: count, name: tidy(t.name) }); }
    t.shown = tidy(t.name);
    var title = $('[data-name]', el), pen = $('[data-rename]', el), edit = $('[data-name-edit]', el);
    title.textContent = t.shown;
    pen.setAttribute('aria-label', words('rename'));
    var editing = function (on) { title.hidden = on; pen.hidden = on; edit.hidden = !on; if (on) { edit.value = t.shown; edit.focus(); edit.select(); } };
    var keep = function () {
      var v = edit.value.replace(/\s+/g, ' ').trim();
      if (v) { t.shown = v.slice(0, 120); title.textContent = t.shown; }
      editing(false);
    };
    pen.addEventListener('click', function () { editing(true); });
    edit.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') { e.preventDefault(); keep(); }
      if (e.key === 'Escape') { e.preventDefault(); editing(false); }
    });
    edit.addEventListener('blur', function () { if (!edit.hidden) keep(); });
    $('[data-summary]', el).textContent = t.summary || '';
    $('[data-sections-label]', el).textContent = w.sections_label || '';
    var list = $('[data-sections]', el);
    (t.outline || []).forEach(function (s) {
      var li = document.createElement('li'), head = document.createElement('strong'), items = document.createElement('span');
      head.textContent = s.name;
      if (s.dots > 0) { var dot = document.createElement('em'); dot.className = 'tpl-dot'; dot.textContent = '\u25CF ' + s.dots; head.appendChild(dot); }
      items.textContent = (s.items || []).join(', ');
      li.appendChild(head); li.appendChild(items); list.appendChild(li);
    });
    var dots = t.unsure_lines || [], left = t.left_out_lines || [];
    if (dots.length) {
      var d = $('[data-dots]', el); d.hidden = false;
      $('[data-dots-label]', el).textContent = w.unsure_label || ''; $('[data-dots-hint]', el).textContent = w.unsure_hint || '';
      lines(dots, $('[data-dot-lines]', el), SHOWN);
    }
    if (left.length) {
      var l = $('[data-left]', el); l.hidden = false;
      $('[data-left-label]', el).textContent = w.left_out_label || ''; $('[data-left-hint]', el).textContent = w.left_out_hint || '';
      lines(left, $('[data-left-lines]', el), SHOWN);
    }
    var add = $('[data-add]', el), saved = $('[data-saved]', el);
    if (SAVE) {
      add.textContent = words('add');
      add.addEventListener('click', function () { save(t, add, saved); });
    } else {
      add.hidden = true;
      saved.textContent = words('soon');
    }
    return el;
  }

  function show(templates) {
    results.textContent = '';
    templates.forEach(function (t, i) { results.appendChild(card(t, i, templates.length)); });
    var again = document.createElement('button');
    again.type = 'button'; again.className = 'btn quiet tpl-again'; again.textContent = words('another');
    again.addEventListener('click', function () { results.hidden = true; results.textContent = ''; verdict(null); drop.scrollIntoView({ block: 'center' }); pick.click(); });
    results.appendChild(again);
    results.hidden = false;
    results.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  // ---- reading and converting -------------------------------------------------------------------------------------

  function take(file) {
    if (!file) return;
    var mine = ++turn;
    results.hidden = true; results.textContent = '';
    verdict(null); status('reading'); busy(true);
    var name = file.name, bytes;
    var stale = function () { return mine !== turn; };
    file.arrayBuffer().then(function (buf) {
      bytes = new Uint8Array(buf);
      if (!window.inspyxConvert) throw new Error('converter');
      return window.inspyxConvert.read(name, bytes);
    }).then(function (text) {
      if (stale()) return null;
      var r = JSON.parse(text);
      if (r.status !== 'ok') return r;
      status('sorting', words('sorting'));
      return auth.convertTemplate(name, bytes, RELAY, function (done, total) {
        if (!stale()) status('sorting', total > 1 ? words('sorting-of', { done: done, total: total }) : words('sorting'));
      }).then(function (c) {
        if (c === null) { window.location.replace('/signin'); return null; }
        return c;
      });
    }).then(function (r) {
      if (stale() || r === null) return;
      status(null); busy(false);
      if (r.status === 'ok' && Array.isArray(r.templates) && r.templates.length) { show(r.templates); return; }
      if (r.status === 'scanned' || r.status === 'rtf' || r.status === 'unsupported') { verdict(r.status); return; }
      if (r.status === 'unreadable') { verdict('unreadable', r.message ? words('unreadable', { why: r.message }) : words('unreadable-plain')); return; }
      if (r.status === 'refused' && r.message) { verdict('refused', r.message); return; }
      verdict('failed');
    }).catch(function () {
      if (stale()) return;
      status(null); busy(false); verdict('failed');
    });
  }

  pick.addEventListener('change', function () { var f = pick.files && pick.files[0]; pick.value = ''; take(f); });
  ['dragenter', 'dragover'].forEach(function (type) {
    drop.addEventListener(type, function (e) { e.preventDefault(); drop.classList.add('is-over'); });
  });
  ['dragleave', 'dragend'].forEach(function (type) {
    drop.addEventListener(type, function () { drop.classList.remove('is-over'); });
  });
  drop.addEventListener('drop', function (e) {
    e.preventDefault(); drop.classList.remove('is-over');
    var f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
    if (f && !pick.disabled) take(f);
  });
  // A file dropped beside the box is not opened by the browser in place of the page.
  window.addEventListener('dragover', function (e) { e.preventDefault(); });
  window.addEventListener('drop', function (e) { e.preventDefault(); });

  // ---- adding (behind SAVE) ---------------------------------------------------------------------------------------

  var hex = function (buf) { return [].map.call(new Uint8Array(buf), function (b) { return ('0' + b.toString(16)).slice(-2); }).join(''); };

  /* The inspector's template rows as the server holds them: every page of the pull. */
  function held() {
    var rows = Object.create(null), point = null;
    var loop = function () {
      return auth.ask('sync', { push: [], after: point, limit: 500 }, DEADLINE).then(function (r) {
        if (r === null) return null;
        if (r.status !== 200 || !r.json || !Array.isArray(r.json.rows)) throw new Error('sync');
        r.json.rows.forEach(function (row) {
          if (row && row.kind === KIND && typeof row.id === 'string' && row.data && row.data.ownerAccountId === me) {
            var h = rows[row.id];
            if (!h || row.updated_at >= h.updated_at) rows[row.id] = row;
          }
        });
        if (r.json.next) point = r.json.next;
        return r.json.more ? loop() : rows;
      });
    };
    return loop().then(function (rs) { return rs === null ? null : { rows: rs, point: point }; });
  }

  function save(t, button, said) {
    button.disabled = true; button.textContent = words('adding'); said.textContent = '';
    var done = function (key) {
      said.textContent = words(key, { name: t.shown });
      button.textContent = words('add');
      button.disabled = key === 'added' || key === 'already';
    };
    var manifest, version, bytes;
    try {
      manifest = JSON.parse(t.manifest);
      var only = manifest.templates[0];
      version = String(only.versions[0].version);
      // The name the inspector sees (tidied or renamed) is the template's name, in its file too.
      var text = t.manifest;
      if (only.name !== t.shown) { only.name = t.shown; text = JSON.stringify(manifest); }
      bytes = new TextEncoder().encode(text);
      if (manifest.templates.length !== 1 || only.id !== t.template_id || only.versions.length !== 1) throw new Error('shape');
    } catch (e) { done('add-failed'); return; }
    var sha;
    crypto.subtle.digest('SHA-256', bytes).then(function (d) {
      sha = hex(d);
      return held();
    }).then(function (h) {
      if (h === null) { window.location.replace('/signin'); return null; }
      var was = h.rows[t.template_id];
      if (was && was.deleted_at === null && was.data.deletedAt == null) return 'already';
      // The file first: the server keeps a row only when its file is there.
      return auth.templateFile(me + '/' + t.template_id + '/' + sha + '.json', bytes, DEADLINE).then(function (f) {
        if (f === null) { window.location.replace('/signin'); return null; }
        var there = f.status === 200 || f.inner === '409' || f.status === 409;
        // The store's own refusal of his folder (its 200 files) comes as 403; anything else, a plain failure.
        if (!there) return f.status === 403 || f.inner === '403' ? 'full' : 'add-failed';
        var at = Math.max(Date.now(), was ? was.updated_at + 1 : 0);
        var data = { id: t.template_id, ownerAccountId: me, name: t.shown, version: version, source: 'converted',
          sha256: sha, byteLength: bytes.length, createdAt: at, updatedAt: at, deletedAt: null };
        var row = { kind: KIND, id: t.template_id, updated_at: at, deleted_at: null, data: data };
        return auth.ask('sync', { push: [row], after: h.point, limit: 1 }, DEADLINE).then(function (r) {
          if (r === null) { window.location.replace('/signin'); return null; }
          if (r.status !== 200 || !r.json) return 'add-failed';
          var skipped = (r.json.skipped || []).filter(function (s) { return s.kind === KIND && s.id === t.template_id; });
          if (!skipped.length) return 'added';
          return skipped.some(function (s) { return s.reason === 'template:full'; }) ? 'full' : 'add-failed';
        });
      });
    }).then(function (key) { if (key) done(key); }, function () { done('add-failed'); });
  }
})();
