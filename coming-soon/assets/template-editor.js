/* Edit your templates (/template, 2026-11-26, his 11-22 order: "full template editor on the web", "even more powerful
   than the app"). Piece A: open a template, rename it, its stops, items and comments, change a comment's words, its
   category and "What to do"; make your own copy of Inspyx's; choose the one new inspections start from.
   The same templates as the phone's (business sync, kinds inspection_templates and template_default; the file in the
   private store business-templates), changed by the phone's own editing rules (template-edit.js). A change applies to
   new inspections only: each save is the next version (his 11-22 "New only").
   Never from a library it couldn't read (Codex on inspyx-site #98): every save first pulls the whole feed, then makes
   its changes on the newest version there, so a change made meanwhile on the phone is kept.
   No words here: the page holds every sentence. */
(function () {
  'use strict';
  var auth = window.InspyxAuth, TS = window.InspyxTemplateSave, TE = window.InspyxTemplateEdit;
  var main = document.querySelector('[data-te]');
  if (!auth || !TS || !TE || !main) return;

  var TPL = 'inspection_templates', TPL_DEFAULT = 'template_default', OURS = 'inspyx.walkthrough';
  var DEADLINE = 30000, FALLBACK = 60000;
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
  var plural = function (key, n) { return words(key + (n === 1 ? '-1' : '-n'), { n: n }); };
  function el(tag, cls, text) { var e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }
  function hex(buf) { return [].map.call(new Uint8Array(buf), function (b) { return ('0' + b.toString(16)).slice(-2); }).join(''); }
  function digest(text) { return crypto.subtle.digest('SHA-256', new TextEncoder().encode(text)).then(hex); }

  /* ---- the business feed: rows of the two kinds, as the server holds them ---- */
  var biz = {}, point = null, pulling = null;
  function take(row) {
    if (!row || (row.kind !== TPL && row.kind !== TPL_DEFAULT) || typeof row.id !== 'string') return;
    var k = row.kind + '/' + row.id, held = biz[k];
    if (!held || row.updated_at >= held.updated_at) biz[k] = row;
  }
  /* Answers whether the whole feed came in. */
  function pull() {
    if (pulling) return pulling;
    var loop = function () {
      return auth.ask('sync', { push: [], after: point, limit: 500 }, DEADLINE).then(function (r) {
        if (r === null) { window.location.replace('/signin'); return false; }
        if (!r || r.status !== 200 || !r.json || !Array.isArray(r.json.rows)) return false;
        r.json.rows.forEach(take);
        if (r.json.next) point = r.json.next;
        return r.json.more ? loop() : true;
      });
    };
    pulling = loop().then(function (ok) { pulling = null; return ok === true; }, function () { pulling = null; return false; });
    return pulling;
  }
  function standing(r) { return !!(r && r.deleted_at == null && r.data && r.data.deletedAt == null); }
  function mine() {
    return Object.keys(biz).filter(function (k) { return k.indexOf(TPL + '/') === 0 && standing(biz[k]); }).map(function (k) { return biz[k]; })
      .sort(function (a, b) { return String(a.data.name).localeCompare(String(b.data.name)) || (a.id < b.id ? -1 : 1); });
  }
  function usedId() { var d = biz[TPL_DEFAULT + '/default']; return standing(d) ? d.data.templateId : null; }
  /* A template's file, checked against its row; null when it can't be read now. */
  function readFile(row) {
    var me = auth.who().id, d = row.data;
    return auth.templateRead(me + '/' + row.id + '/' + d.sha256 + '.json', DEADLINE).then(function (r) {
      if (r === null) { window.location.replace('/signin'); return null; }
      if (r.status !== 200 || !r.blob) return null;
      return r.blob.text().then(function (text) { return digest(text).then(function (h) { return h === d.sha256 ? text : null; }); });
    }, function () { return null; });
  }
  var copyFile = null;
  function ours() {
    if (copyFile) return Promise.resolve(copyFile);
    return window.fetch('/assets/template-copies/' + OURS + '.json', { cache: 'no-store', credentials: 'omit' }).then(function (res) {
      if (!res.ok) throw new Error('copy');
      return res.json();
    }).then(function (c) { if (c.source !== OURS) throw new Error('copy'); copyFile = c; return c; });
  }
  /* [push] through the sync function. Answers 'ok', 'changed' (a newer row won), 'full' or 'failed'. */
  function send(push, id) {
    return auth.ask('sync', { push: push, after: point, limit: 500 }, DEADLINE).then(function (r) {
      if (r === null) { window.location.replace('/signin'); return 'failed'; }
      if (!r || r.status !== 200 || !r.json || !Array.isArray(r.json.rows)) return 'failed';
      r.json.rows.forEach(take);
      if (r.json.next) point = r.json.next;
      if (r.json.more) pull();
      var hit = function (x) { return push.some(function (p) { return p.kind === x.kind && p.id === x.id; }); };
      var skipped = (r.json.skipped || []).filter(hit);
      if (skipped.length) return skipped.some(function (x) { return x.reason === 'template:full'; }) ? 'full' : 'failed';
      if ((r.json.applied || []).some(function (a) { return a.applied === false && hit(a); })) return 'changed';
      push.forEach(take);
      return 'ok';
    }, function () { return 'failed'; });
  }
  /* The file [text] of template [id] into the store, then its row: { row } or { problem }. */
  function store(id, text, version, name, source, base, also) {
    var me = auth.who().id, bytes = new TextEncoder().encode(text);
    return digest(text).then(function (sha) {
      return auth.templateFile(me + '/' + id + '/' + sha + '.json', bytes, DEADLINE).then(function (f) {
        if (f === null) { window.location.replace('/signin'); return { problem: 'failed' }; }
        var there = f.status === 200 || f.inner === '409' || f.status === 409;
        if (!there) return { problem: f.status === 403 || f.inner === '403' ? 'full' : 'failed' };
        var was = biz[TPL + '/' + id], d = biz[TPL_DEFAULT + '/default'];
        var at = Math.max(Date.now(), was ? was.updated_at + 1 : 0, also && d ? d.updated_at + 1 : 0);
        var data = { id: id, ownerAccountId: me, name: name, version: version, source: source, sha256: sha,
          byteLength: bytes.length, createdAt: at, updatedAt: at, deletedAt: null };
        if (base) data.base = base;
        var row = { kind: TPL, id: id, updated_at: at, deleted_at: null, data: data };
        var push = [row];
        if (also) push.push({ kind: TPL_DEFAULT, id: 'default', updated_at: at, deleted_at: null,
          data: { id: 'default', ownerAccountId: me, templateId: id, updatedAt: at, deletedAt: null } });
        return send(push, id).then(function (k) { return k === 'ok' ? { row: row } : { problem: k }; });
      });
    }, function () { return { problem: 'failed' }; });
  }

  /* ---- what shows ---- */
  var mineList = $('[data-mine]'), oursList = $('[data-ours]'), edit = $('[data-edit]'), stops = $('[data-stops]');
  var nameIn = $('[data-name]'), findIn = $('[data-find]'), bar = $('[data-bar]'), sayEl = $('[data-say]');
  var open = null;   // { id (null: ours), row, text, outline, readOnly }
  var busy = false, queue = Promise.resolve();
  function state(which) { all('[data-state]').forEach(function (p) { p.hidden = p.getAttribute('data-state') !== which; }); }
  function say(key, fill) {
    sayEl.hidden = !key; sayEl.textContent = key ? words(key, fill) : '';
    sayEl.setAttribute('data-said', key || '');
  }

  function card(title, sub, on, id, isOurs) {
    var li = el('li'), b = el('button', 'te-card' + (on ? ' is-open' : ''));
    b.type = 'button'; b.setAttribute('data-open', isOurs ? 'ours' : id);
    b.appendChild(el('b', null, title)); b.appendChild(el('em', null, sub));
    b.addEventListener('click', function () {
      var p = choose(isOurs ? null : id);
      // On a narrow screen the editor is under the list: take him to it.
      if (p && window.innerWidth < 1000) p.then(function () {
        var still = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        if (!edit.hidden) edit.scrollIntoView({ block: 'start', behavior: still ? 'auto' : 'smooth' });
      });
    });
    li.appendChild(b); return li;
  }
  function renderList() {
    var used = usedId(), rows = mine();
    mineList.textContent = '';
    rows.forEach(function (r) {
      var sub = words('version', { v: r.data.version }) + (r.id === used ? ' · ' + words('used') : '');
      mineList.appendChild(card(r.data.name, sub, open && open.id === r.id, r.id, false));
    });
    $('[data-mine-none]').hidden = rows.length > 0;
    oursList.textContent = '';
    oursList.appendChild(card(copyFile ? copyFile.sourceName : 'Walkthrough', words('ours') + (used === OURS || used === null ? ' · ' + words('used') : ''),
      open && open.id === null, null, true));
  }

  /* One field: an input or a box of words, holding what it started as, and what edit it makes. */
  function field(label, value, key, long, ro) {
    var wrap = el('label', 'te-f'), cap = el('span', null, label), box = el(long ? 'textarea' : 'input');
    if (!long) box.autocomplete = 'off'; else box.rows = 2;
    box.value = value; box.setAttribute('data-k', JSON.stringify(key)); box.setAttribute('data-was', value);
    box.disabled = !!ro;
    wrap.appendChild(cap); wrap.appendChild(box); return wrap;
  }
  function ratingField(line, ratings, key, ro) {
    var wrap = el('label', 'te-f te-f-rating'), sel = el('select');
    wrap.appendChild(el('span', null, words('f-rating')));
    var none = el('option', null, words('no-rating')); none.value = ''; sel.appendChild(none);
    ratings.forEach(function (r) { var o = el('option', null, r.label); o.value = r.id; sel.appendChild(o); });
    sel.value = line.rating || '';
    sel.setAttribute('data-k', JSON.stringify(key)); sel.setAttribute('data-was', line.rating || '');
    sel.disabled = !!ro; wrap.appendChild(sel); return wrap;
  }
  /* A box of words as tall as its words (measured only when shown: a closed stop has no height). */
  function grow(t) { if (!t.offsetParent) return; t.style.height = 'auto'; t.style.height = (t.scrollHeight + 2) + 'px'; }
  function growIn(root) { all('textarea', root).forEach(grow); }
  /* ---- the parts, kept or new. A kept part is named by its ref (a comment: its item, kind and position); a new
     one by a key of its own ('new:N'), as the edit list names it. ---- */
  var ops = [], nextKey = 0;
  var newKey = function () { return 'new:' + (++nextKey); };
  function button(label, attr, cls) { var b = el('button', 'te-mini' + (cls ? ' ' + cls : ''), label); b.type = 'button'; b.setAttribute(attr, ''); return b; }
  function systemField(value, key, ro) {
    var wrap = el('label', 'te-f te-f-system'), sel = el('select');
    wrap.appendChild(el('span', null, words('f-system')));
    open.outline.systems.forEach(function (x) { var o = el('option', null, x.name); o.value = x.id; sel.appendChild(o); });
    sel.value = value || ''; sel.setAttribute('data-k', JSON.stringify(key)); sel.setAttribute('data-was', value || ''); sel.setAttribute('data-sys', '');
    sel.disabled = !!ro; wrap.appendChild(sel); return wrap;
  }
  function answerField(value, key, ro) {
    var wrap = el('label', 'te-f te-f-answer'), sel = el('select');
    wrap.appendChild(el('span', null, words('f-answer')));
    // The kinds a field may be given here; one it came with (from an import) stays offered.
    var list = TE.ANSWERS.slice();
    if (value && list.indexOf(value) < 0) list.push(value);
    list.forEach(function (a) { var o = el('option', null, words('ans-' + a) || a); o.value = a; sel.appendChild(o); });
    sel.value = value || ''; sel.setAttribute('data-k', JSON.stringify(key)); sel.setAttribute('data-was', value || ''); sel.setAttribute('data-answer', '');
    sel.disabled = !!ro; wrap.appendChild(sel); return wrap;
  }
  function lineEl(itemKey, l, isNew, ro) {
    var kind = l.kind, c = el('div', 'te-line');
    var k = function (f) { return isNew ? { op: 'line', key: l.key, f: f } : { op: 'line', item: itemKey, kind: kind, position: l.position, f: f }; };
    c.setAttribute('data-line', isNew ? l.key : itemKey + '|' + kind + '|' + l.position);
    c.appendChild(field(words('f-name'), l.name, k('name'), false, ro));
    if (kind !== 'information') c.appendChild(field(words('f-text'), l.text, k('text'), true, ro));
    if (kind === 'information') {
      // A field: its kind of answer, and its choices (one a line) when that answer takes them.
      c.appendChild(answerField(l.answerType, k('answerType'), ro));
      var ch = field(words('f-options'), (l.options || []).join('\n'), k('options'), true, ro);
      ch.classList.add('te-f-options'); ch.hidden = !TE.takesChoices(l.answerType);
      c.appendChild(ch);
    }
    if (kind === 'deficiency') {
      c.appendChild(ratingField(l, open.outline.ratings, k('rating'), ro));
      c.appendChild(field(words('f-todo'), l.recommendation, k('recommendation'), true, ro));
    }
    if (!ro) c.appendChild(button(words('delete-line'), 'data-del-line', 'danger'));
    return c;
  }
  function groupEl(kind) { var g = el('div', 'te-group te-' + kind); g.setAttribute('data-group', kind); g.appendChild(el('h4', null, words('kind-' + kind))); return g; }
  function itemEl(i, isNew, ro) {
    var it = el('div', 'te-item');
    it.setAttribute('data-item', i.ref);
    var head = el('div', 'te-item-head');
    if (!ro) { var grip = el('span', 'te-grip'); grip.setAttribute('aria-hidden', 'true'); grip.title = words('drag'); grip.draggable = true; head.appendChild(grip); }
    head.appendChild(field(words('f-item'), i.label, { op: 'item', ref: i.ref }, false, ro));
    if (open.outline.systems.length) { head.appendChild(systemField(i.system, { op: 'system', ref: i.ref }, ro)); head.classList.add('sys'); }
    if (!ro) head.classList.add('grip');
    it.appendChild(head);
    if (!ro) {
      var tools = el('div', 'te-tools');
      tools.appendChild(button(words('up'), 'data-item-up')); tools.appendChild(button(words('down'), 'data-item-down'));
      var to = el('select', 'te-moveto'); to.setAttribute('data-item-to', ''); to.setAttribute('aria-label', words('move-to'));
      tools.appendChild(to);
      tools.appendChild(button(words('delete-item'), 'data-del-item', 'danger'));
      it.appendChild(tools);
    }
    if (open.outline.ratings) {
      var see = button(words('see-report'), 'data-see', 'see');
      (it.querySelector('.te-tools') || it.appendChild(el('div', 'te-tools'))).appendChild(see);
    }
    ['information', 'limitation', 'deficiency'].forEach(function (kind) {
      var lines = i.lines.filter(function (l) { return l.kind === kind; });
      var g = groupEl(kind);
      lines.forEach(function (l) { g.appendChild(lineEl(i.ref, l, isNew, ro)); });
      g.hidden = !lines.length;
      it.appendChild(g);
    });
    if (!ro) {
      var add = el('div', 'te-add-line');
      ['information', 'limitation', 'deficiency'].forEach(function (kind) { var b = button(words('add-' + kind), 'data-add-line', 'add'); b.setAttribute('data-kind', kind); add.appendChild(b); });
      it.appendChild(add);
    }
    return it;
  }
  function stopEl(s, isNew, ro, opened) {
    var d = el('details', 'te-stop'), sum = el('summary');
    d.setAttribute('data-stop', s.ref);
    if (opened) d.open = true;
    sum.appendChild(el('b', null, s.name || words('new-stop'))); sum.appendChild(el('em', null, plural('items', s.items.length)));
    if (!ro) sum.draggable = true;
    d.appendChild(sum);
    d.addEventListener('toggle', function () { if (d.open) growIn(d); });
    var head = el('div', 'te-stop-head');
    head.appendChild(field(words('f-stop'), s.name, { op: 'stop', ref: s.ref }, false, ro));
    if (!ro) {
      var tools = el('div', 'te-tools');
      tools.appendChild(button(words('up'), 'data-stop-up')); tools.appendChild(button(words('down'), 'data-stop-down'));
      tools.appendChild(button(words('delete-stop'), 'data-del-stop', 'danger'));
      head.appendChild(tools);
    }
    d.appendChild(head);
    var list = el('div', 'te-items'); list.setAttribute('data-items', '');
    s.items.forEach(function (i) { list.appendChild(itemEl(i, isNew, ro)); });
    d.appendChild(list);
    if (!ro) d.appendChild(button(words('add-item'), 'data-add-item', 'add wide'));
    return d;
  }
  function ratingsEl(ro) {
    var box = $('[data-cats]');
    box.textContent = '';
    box.hidden = !open.outline.ratings.length;
    box.appendChild(el('h3', null, words('cats')));
    box.appendChild(el('p', 'te-cats-lede', words('cats-lede')));
    var grid = el('div', 'te-cats-grid');
    open.outline.ratings.forEach(function (r) { grid.appendChild(field(words('cat', { name: r.label }), r.label, { op: 'rating-label', id: r.id }, false, ro)); });
    box.appendChild(grid);
  }
  function stopLabels() {
    // Each item's "Move to" choices: every stop, by the name it has now; and each stop's count.
    var names = all('.te-stop', stops).map(function (d) {
      var box = d.querySelector('.te-stop-head [data-k]');
      return { key: d.getAttribute('data-stop'), name: (box && box.value.trim()) || words('new-stop') };
    });
    all('.te-stop', stops).forEach(function (d) {
      d.querySelector('summary b').textContent = names.filter(function (n) { return n.key === d.getAttribute('data-stop'); })[0].name;
      d.querySelector('summary em').textContent = plural('items', d.querySelectorAll('.te-item').length);
    });
    all('[data-item-to]', stops).forEach(function (sel) {
      var here = sel.closest('.te-stop').getAttribute('data-stop');
      sel.textContent = '';
      var first = el('option', null, words('move-to')); first.value = ''; sel.appendChild(first);
      names.forEach(function (n) { if (n.key !== here) { var o = el('option', null, n.name); o.value = n.key; sel.appendChild(o); } });
    });
  }
  function defaultControls() {
    var ro = open.readOnly, used = usedId(), isUsed = ro ? (used === OURS || used === null) : used === open.id;
    $('[data-use]').hidden = ro || isUsed;
    $('[data-used]').hidden = !isUsed;
  }
  function renderOpen() {
    var o = open.outline, ro = open.readOnly;
    ops = [];
    edit.hidden = false;
    nameIn.value = o.name; nameIn.setAttribute('data-was', o.name); nameIn.disabled = ro;
    nameIn.setAttribute('data-k', JSON.stringify({ op: 'template' }));
    $('[data-ver]').textContent = words('version', { v: o.version });
    $('[data-ro]').hidden = !ro;
    $('[data-copy]').hidden = !ro;
    defaultControls();
    $('[data-export]').hidden = ro;
    ratingsEl(ro);
    // Drawn again after a save: the stops he had open stay open (by ref), where he was.
    var wasOpen = all('.te-stop[open]', stops).map(function (d) { return d.getAttribute('data-stop'); });
    stops.textContent = '';
    o.stops.forEach(function (s) { stops.appendChild(stopEl(s, false, ro, wasOpen.indexOf(s.ref) >= 0)); });
    $('[data-add-stop]').hidden = ro;
    stopLabels();
    find();
    changed();
    renderList();
    pvItem = null; renderPreview();
  }

  /* ---- what he does to the parts: each a step of the edit list, done on the page at once ---- */
  var stopIndex = function (d) { return all('.te-stop', stops).indexOf(d); };
  var itemIndex = function (it) { return all('.te-item', it.parentNode).indexOf(it); };
  function moveStop(d, to) {
    var list = all('.te-stop', stops), from = list.indexOf(d);
    if (to < 0 || to >= list.length || to === from) return;
    d.remove();
    var rest = all('.te-stop', stops);
    if (to >= rest.length) stops.appendChild(d); else stops.insertBefore(d, rest[to]);
    ops.push({ op: 'move-stop', ref: d.getAttribute('data-stop'), to: to });
    changed();
  }
  function moveItem(it, stopD, to) {
    var list = stopD.querySelector('[data-items]');
    it.remove();
    var rest = all('.te-item', list);
    if (to >= rest.length) list.appendChild(it); else list.insertBefore(it, rest[to]);
    ops.push({ op: 'move-item', ref: it.getAttribute('data-item'), stop: stopD.getAttribute('data-stop'), to: Math.min(to, rest.length) });
    stopD.open = true; growIn(it);
    stopLabels(); changed();
  }
  stops.addEventListener('click', function (e) {
    var see = e.target.closest('[data-see]');
    if (see) { pvItem = see.closest('.te-item'); pvOpen = true; renderPreview(); if (!wideQ.matches) $('[data-preview-close]').focus(); return; }
    var t = e.target.closest('button');
    if (!t || busy || !open || open.readOnly) return;
    cancelLoads();
    var d = t.closest('.te-stop'), it = t.closest('.te-item'), line = t.closest('.te-line');
    if (t.hasAttribute('data-stop-up')) moveStop(d, stopIndex(d) - 1);
    else if (t.hasAttribute('data-stop-down')) moveStop(d, stopIndex(d) + 1);
    else if (t.hasAttribute('data-del-stop')) { ops.push({ op: 'delete-stop', ref: d.getAttribute('data-stop') }); d.remove(); stopLabels(); changed(); }
    else if (t.hasAttribute('data-item-up')) { if (itemIndex(it) > 0) moveItem(it, d, itemIndex(it) - 1); }
    else if (t.hasAttribute('data-item-down')) { if (itemIndex(it) < all('.te-item', it.parentNode).length - 1) moveItem(it, d, itemIndex(it) + 1); }
    else if (t.hasAttribute('data-del-item')) { ops.push({ op: 'delete-item', ref: it.getAttribute('data-item') }); it.remove(); stopLabels(); changed(); }
    else if (t.hasAttribute('data-del-line')) {
      var at = line.getAttribute('data-line'), p = at.split('|');
      ops.push(p.length === 3 ? { op: 'delete-line', item: p[0], kind: p[1], position: +p[2] } : { op: 'delete-line', key: at });
      var g = line.parentNode; line.remove(); g.hidden = !g.querySelector('.te-line'); changed();
    } else if (t.hasAttribute('data-add-line')) {
      var kind = t.getAttribute('data-kind'), key = newKey(), ref = it.getAttribute('data-item');
      ops.push({ op: 'add-line', key: key, item: ref, kind: kind, name: '' });
      var g2 = it.querySelector('[data-group="' + kind + '"]');
      var l = lineEl(ref, { key: key, kind: kind, name: '', text: '', rating: null, recommendation: '',
        answerType: kind === 'information' ? 'choice' : null, options: [] }, true, false);
      g2.appendChild(l); g2.hidden = false;
      l.querySelector('input').focus(); changed();
    } else if (t.hasAttribute('data-add-item')) {
      // A new item takes the report section of the item before it (or the stop's first), as most of a stop prints
      // under one; he can change it.
      var items = all('.te-item', d), last = items[items.length - 1];
      var sysBox = last && last.querySelector('[data-sys]');
      var system = open.outline.systems.length ? ((sysBox && sysBox.value) || open.outline.systems[0].id) : null;
      var ikey = newKey();
      ops.push({ op: 'add-item', key: ikey, stop: d.getAttribute('data-stop'), label: '', system: system });
      var node = itemEl({ ref: ikey, label: '', system: system, lines: [] }, true, false);
      d.querySelector('[data-items]').appendChild(node);
      // Its section is part of the add: shown as set, not as a change of its own.
      var sb = node.querySelector('[data-sys]'); if (sb) sb.setAttribute('data-was', sb.value);
      stopLabels(); node.querySelector('input').focus(); changed();
    }
  });
  stops.addEventListener('change', function (e) {
    var sel = e.target;
    if (busy || !sel.hasAttribute('data-item-to') || !sel.value) return;
    cancelLoads();
    var it = sel.closest('.te-item'), target = stops.querySelector('.te-stop[data-stop="' + CSS.escape(sel.value) + '"]');
    if (target) moveItem(it, target, all('.te-item', target).length);
  });
  $('[data-add-stop]').addEventListener('click', function () {
    if (busy || !open || open.readOnly) return;
    cancelLoads();
    var key = newKey();
    ops.push({ op: 'add-stop', key: key, name: '' });
    var d = stopEl({ ref: key, name: '', items: [] }, true, false, true);
    stops.appendChild(d); stopLabels(); d.querySelector('input').focus(); changed();
  });

  /* Drag to move (a wide screen): a stop among the stops, an item before another item or onto a stop. What is
     dragged is the handle (an item's grip, a stop's title), never a box of words, so words stay selectable. */
  var dragging = null;
  stops.addEventListener('dragstart', function (e) {
    if (!open || open.readOnly || busy || !e.target.closest) return;
    var grip = e.target.closest('.te-grip'), sum = e.target.closest('.te-stop > summary');
    dragging = grip ? grip.closest('.te-item') : sum ? sum.parentNode : null;
    if (!dragging) return;
    if (e.dataTransfer) {
      e.dataTransfer.effectAllowed = 'move';
      try { e.dataTransfer.setData('text/plain', ''); e.dataTransfer.setDragImage(dragging, 24, 24); } catch (x) { /* none */ }
    }
    dragging.classList.add('is-dragging');
  });
  stops.addEventListener('dragend', function () { if (dragging) dragging.classList.remove('is-dragging'); dragging = null; all('.is-over', stops).forEach(function (x) { x.classList.remove('is-over'); }); });
  // Taken first, before a box of words under the pointer can take it as a text drop (and refuse a move).
  var overOf = function (e) {
    if (!dragging || !e.target.closest) return null;
    var over = dragging.classList.contains('te-item') ? (e.target.closest('.te-item') || e.target.closest('.te-stop')) : e.target.closest('.te-stop');
    return over && over !== dragging ? over : null;
  };
  var accept = function (e) {
    var over = overOf(e);
    if (!over) return;
    e.preventDefault();
    if (e.dataTransfer) e.dataTransfer.dropEffect = 'move';
    all('.is-over', stops).forEach(function (x) { if (x !== over) x.classList.remove('is-over'); });
    over.classList.add('is-over');
  };
  stops.addEventListener('dragenter', accept, true);
  stops.addEventListener('dragover', accept, true);
  stops.addEventListener('drop', function (e) {
    if (!dragging) return;
    cancelLoads();
    e.preventDefault(); e.stopPropagation();
    var d = dragging;
    if (d.classList.contains('te-item')) {
      var onItem = e.target.closest('.te-item'), onStop = e.target.closest('.te-stop');
      if (onItem && onItem !== d) moveItem(d, onStop, itemIndex(onItem) - (onItem.parentNode === d.parentNode && itemIndex(d) < itemIndex(onItem) ? 1 : 0));
      else if (onStop && !onItem) moveItem(d, onStop, all('.te-item', onStop).length);
    } else {
      var target = e.target.closest('.te-stop');
      if (target && target !== d) moveStop(d, stopIndex(target));
    }
    stops.dispatchEvent(new Event('dragend'));
  }, true);

  /* ---- changes: the steps done, then every field that differs from what it started as, as the edit list ---- */
  function edits() {
    var out = ops.slice(), lines = {};
    all('[data-k]', edit).forEach(function (box) {
      if (box.value === box.getAttribute('data-was')) return;
      var k = JSON.parse(box.getAttribute('data-k'));
      if (k.op === 'template') out.push({ op: 'template', name: box.value });
      else if (k.op === 'stop') out.push({ op: 'stop', ref: k.ref, name: box.value });
      else if (k.op === 'item') out.push({ op: 'item', ref: k.ref, label: box.value });
      else if (k.op === 'system') out.push({ op: 'system', ref: k.ref, system: box.value || null });
      else if (k.op === 'rating-label') out.push({ op: 'rating-label', id: k.id, label: box.value });
      else {
        var id = k.key || (k.item + '|' + k.kind + '|' + k.position);
        var e = lines[id] || (lines[id] = k.key ? { op: 'line', key: k.key } : { op: 'line', item: k.item, kind: k.kind, position: k.position });
        if (!e.added) { out.push(e); e.added = true; }
        e[k.f] = k.f === 'rating' || k.f === 'answerType' ? (box.value || null) : k.f === 'options' ? box.value.split('\n') : box.value;
      }
    });
    out.forEach(function (e) { delete e.added; });
    return out;
  }
  /* The bar's height plus the gap under it (above a phone's tab bar), as room under the editor. */
  function roomForBar() {
    var room = 0;
    if (!bar.hidden) room = Math.ceil(bar.getBoundingClientRect().height + (parseFloat(getComputedStyle(bar).bottom) || 0) + 12);
    document.documentElement.style.setProperty('--te-bar', room + 'px');
  }
  window.addEventListener('resize', function () { roomForBar(); });
  function changed() {
    var boxes = all('[data-k]', edit), diff = boxes.filter(function (b) { return b.value !== b.getAttribute('data-was'); });
    var n = open && !open.readOnly ? diff.length + ops.length : 0;
    boxes.forEach(function (b) { b.classList.toggle('is-changed', b.value !== b.getAttribute('data-was')); });
    bar.hidden = n === 0;
    $('[data-count]').textContent = plural('changes', n);
    roomForBar();
    return n;
  }
  edit.addEventListener('input', function (e) {
    if (!e.target.hasAttribute('data-k')) return;
    cancelLoads();
    if (e.target.tagName === 'TEXTAREA') grow(e.target);
    if (e.target.closest('.te-stop-head')) stopLabels();
    if (e.target.closest('[data-cats]')) {
      // A category renamed: every finding's list says the new name at once.
      var id = JSON.parse(e.target.getAttribute('data-k')).id, name = e.target.value.trim() || e.target.getAttribute('data-was');
      all('select[data-k] option[value="' + CSS.escape(id) + '"]', stops).forEach(function (o) { o.textContent = name; });
    }
    changed(); if (e.target.value) say(null);
  });
  window.addEventListener('resize', function () { all('.te-stop[open]', stops).forEach(growIn); });
  edit.addEventListener('change', function (e) {
    if (!e.target.hasAttribute('data-k')) return;
    cancelLoads();
    if (e.target.hasAttribute('data-answer')) {
      var box = e.target.closest('.te-line').querySelector('.te-f-options');
      box.hidden = !TE.takesChoices(e.target.value);
      if (!box.hidden) growIn(box);
    }
    changed();
  });
  window.addEventListener('beforeunload', function (e) { if (open && changed()) { e.preventDefault(); e.returnValue = ''; } });

  /* ---- the item as the report prints it (piece D): docked beside the editor on a wide screen, opened by "See it
     in the report" on a smaller one. It reads the boxes as they are now, so it follows every change as typed. ---- */
  var preview = $('[data-preview]'), pvBody = $('[data-preview-body]'), pvEmpty = $('[data-preview-empty]');
  var wideQ = window.matchMedia ? window.matchMedia('(min-width: 1440px)') : { matches: false };
  var pvItem = null, pvOpen = false;
  function blanks(text) {
    // [blanks] marked: Spex fills them in at the inspection.
    var p = el('p', 'te-pv-prose');
    String(text).split(/(\[[^\]\n]{1,80}\])/).forEach(function (part, n) { p.appendChild(n % 2 ? el('mark', null, part) : document.createTextNode(part)); });
    return p;
  }
  function valueOf(root, sel) { var b = root.querySelector(sel); return b ? b.value.trim() : ''; }
  function renderPreview() {
    var docked = !!open && wideQ.matches, shown = !!open && (docked || pvOpen);
    preview.hidden = !shown;
    preview.classList.toggle('is-docked', docked);
    $('.te-grid').classList.toggle('has-preview', docked);
    main.classList.toggle('has-preview', docked);
    $('[data-preview-close]').hidden = docked;
    if (!shown) return;
    var it = pvItem && stops.contains(pvItem) ? pvItem : null;
    pvEmpty.hidden = !!it; pvBody.textContent = '';
    if (!it) return;
    var stop = it.closest('.te-stop'), sys = it.querySelector('[data-sys]');
    if (sys && sys.selectedIndex >= 0) pvBody.appendChild(el('p', 'te-pv-sys', sys.options[sys.selectedIndex].text));
    pvBody.appendChild(el('h4', 'te-pv-item', [valueOf(stop, '.te-stop-head [data-k]'), valueOf(it, '.te-item-head input[data-k]')].filter(Boolean).join(', ') || words('pv-untitled')));
    var cats = {}; open.outline.ratings.forEach(function (r) { cats[r.id] = r.category; });
    all('.te-line', it).forEach(function (line) {
      var kind = line.closest('[data-group]').getAttribute('data-group'), name = valueOf(line, 'input[data-k]') || words('pv-untitled');
      if (kind === 'information') {
        var a = line.querySelector('[data-answer]'), answer = a && a.selectedIndex >= 0 ? a.options[a.selectedIndex].text : '';
        var choices = a && TE.takesChoices(a.value) ? valueOf(line, '.te-f-options textarea').split('\n').map(function (x) { return x.trim(); }).filter(Boolean).join(' / ') : '';
        var kv = el('div', 'te-pv-kv'); kv.appendChild(el('dt', null, name));
        kv.appendChild(el('dd', null, choices ? words('pv-answer', { answer: answer, choices: choices }) : answer));
        pvBody.appendChild(kv);
      } else if (kind === 'limitation') {
        var p = blanks(' ' + valueOf(line, 'textarea[data-k]')); p.classList.add('te-pv-ln');
        p.insertBefore(el('b', null, words('pv-limitation')), p.firstChild);
        pvBody.appendChild(p);
      } else {
        var r = line.querySelector('select[data-k*="rating"]'), id = r ? r.value : '';
        var card = el('article', 'te-pv-card cat-' + (cats[id] || 'none')), head = el('header', 'te-pv-card-h');
        if (id) head.appendChild(el('span', 'te-pv-pill', r.options[r.selectedIndex].text));
        head.appendChild(el('h5', null, name)); card.appendChild(head);
        var body = el('div', 'te-pv-card-b'), boxes = line.querySelectorAll('textarea[data-k]');
        var observed = boxes[0] ? boxes[0].value.trim() : '', todo = boxes[1] ? boxes[1].value.trim() : '';
        if (observed) { body.appendChild(el('h6', null, words('pv-observed'))); body.appendChild(blanks(observed)); }
        if (todo) { body.appendChild(el('h6', null, words('pv-recommended'))); body.appendChild(blanks(todo)); }
        card.appendChild(body); pvBody.appendChild(card);
      }
    });
  }
  edit.addEventListener('focusin', function (e) {
    var it = e.target.closest && e.target.closest('.te-item');
    if (it && it !== pvItem) { pvItem = it; renderPreview(); }
  });
  edit.addEventListener('input', function () { if (!preview.hidden) renderPreview(); });
  edit.addEventListener('change', function () { if (!preview.hidden) renderPreview(); });
  $('[data-preview-close]').addEventListener('click', function () { pvOpen = false; renderPreview(); });
  if (wideQ.addEventListener) wideQ.addEventListener('change', renderPreview);

  /* ---- find ---- */
  function find() {
    var q = findIn.value.trim().toLowerCase(), hits = 0;
    all('.te-stop', stops).forEach(function (d) {
      var stopHit = !q || d.querySelector('summary b').textContent.toLowerCase().indexOf(q) >= 0, any = false;
      all('.te-item', d).forEach(function (it) {
        var hit = !q || stopHit || all('[data-k]', it).some(function (b) { return b.value.toLowerCase().indexOf(q) >= 0; });
        it.hidden = !hit; if (hit && q) hits++;
        any = any || hit;
      });
      d.hidden = !!q && !any && !stopHit;
      if (q) d.open = any || stopHit;
    });
    var f = $('[data-found]');
    f.hidden = !q; f.textContent = hits === 0 ? words('found-0') : plural('found', hits);
    // Replace (piece D): every box of words that holds what he's finding, in the whole template.
    var can = !!q && !!open && !open.readOnly, n = can ? replaceable(q).length : 0;
    $('[data-replace-box]').hidden = !can;
    $('.te-findbar').classList.toggle('with-replace', can);
    var go = $('[data-replace-go]');
    go.hidden = !can || n === 0; go.textContent = words('replace-all', { n: n });
  }
  var escapeRe = function (t) { return t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); };
  function replaceable(q) {
    var low = q.toLowerCase();
    return all('input[data-k], textarea[data-k]', edit).filter(function (b) { return !b.disabled && b.value.toLowerCase().indexOf(low) >= 0; });
  }
  findIn.addEventListener('input', find);
  $('[data-replace-go]').addEventListener('click', function () {
    var q = findIn.value.trim();
    if (busy || !open || open.readOnly || !q) return;
    var by = $('[data-replace]').value, re = new RegExp(escapeRe(q), 'gi'), boxes = replaceable(q);
    if (!boxes.length) return;
    cancelLoads();
    // The words put in as typed (a function: a "$" in them is a "$").
    boxes.forEach(function (b) { b.value = b.value.replace(re, function () { return by; }); if (b.tagName === 'TEXTAREA') grow(b); });
    stopLabels(); changed(); renderPreview();
    findIn.value = by.trim(); find();
    say(boxes.length === 1 ? 'replaced-1' : 'replaced-n', { n: boxes.length });
  });

  /* ---- open one ---- */
  /* Opens [id] (null: Inspyx's). An answer that comes back late is shown only if it is still the last one asked for,
     and, for a reload in the background ([quiet]: changed on another device), only if nothing was changed here
     meanwhile (Codex on #101). */
  var showing = 0, waiting = null;
  // He changed something while another template (or a reload) was on its way: that one isn't shown (Codex on #102).
  function cancelLoads() { showing++; }
  function choose(id, force, quiet) {
    if (busy && !force) return;
    if (!force && open && changed() && !window.confirm(words('leave'))) return;
    var mine = ++showing;
    // A template he chose, on its way: a reload in the background waits for it (refresh), never cancels it.
    if (!quiet) waiting = mine;
    var done = function () { if (waiting === mine) waiting = null; };
    var still = function () { done(); return mine === showing && !(quiet && open && changed()); };
    if (!quiet) say(null);
    if (id === null) {
      return ours().then(function (c) {
        if (!still()) return;
        open = { id: null, row: null, text: c.text, outline: TE.outline(c.text), readOnly: true };
        renderOpen();
      }, function () { if (still()) say('p-failed'); });
    }
    var row = biz[TPL + '/' + id];
    if (!standing(row)) return;
    return readFile(row).then(function (text) {
      if (!still()) return;
      if (text === null) { say('p-failed'); return; }
      open = { id: id, row: row, text: text, outline: TE.outline(text), readOnly: false };
      renderOpen();
    });
  }

  /* ---- save: on the newest version there, after a whole pull; once more when another device won the race ---- */
  /* While a save (or a copy, or a switch) is on its way, nothing in the editor can change: the save carries the
     changes as they were when tapped, and draws the editor again from what it saved (Codex on #101). */
  function lock(on) {
    busy = on;
    // Nothing still on its way may open while a save, copy or switch is under way (Codex on #102).
    if (on) cancelLoads();
    all('[data-save],[data-discard],[data-copy],[data-use],[data-export]', main).forEach(function (b) { b.disabled = on; });
    all('[data-k], [data-find]', edit).forEach(function (b) { b.disabled = on || (open && open.readOnly && b.hasAttribute('data-k')); });
    // The steps too: add, move, delete.
    all('.te-mini, [data-item-to]', edit).forEach(function (b) { b.disabled = on; });
    edit.classList.toggle('is-busy', on);
  }
  /* [target]: the template open when Save was tapped ({ id, row, text }), held for the whole save whatever opens
     meanwhile (Codex on #102). */
  function saveOnce(list, first, target) {
    return pull().then(function (ok) {
      if (!ok) return { problem: 'failed' };
      var row = biz[TPL + '/' + target.id];
      if (!standing(row)) return { problem: 'failed' };
      var same = row.data.sha256 === target.row.data.sha256;
      return (same ? Promise.resolve(target.text) : readFile(row)).then(function (text) {
        if (text === null) return { problem: 'failed' };
        var made = TE.apply(text, list);
        if (made.problem) return { problem: made.problem };
        return TS.contentKey(text, digest).then(function (base) {
          return store(target.id, made.text, made.version, made.name, row.data.source, base, false).then(function (r) {
            if (r.problem === 'changed' && first) return saveOnce(list, false, target);
            return r.problem ? r : { row: r.row, text: made.text };
          });
        });
      });
    });
  }
  $('[data-save]').addEventListener('click', function () {
    if (busy || !open || open.readOnly) return;
    var list = edits();
    if (!list.length) return;
    var target = { id: open.id, row: open.row, text: open.text };
    lock(true); say('saving');
    var run = queue.then(function () { return saveOnce(list, true, target); });
    queue = run.catch(function () { return null; });
    run.then(function (r) {
      // The newest there already says all of it (made the same elsewhere): show it.
      if (r.problem === 'unchanged') return choose(target.id, true);
      if (r.problem) { say('p-' + r.problem); return; }
      open = { id: target.id, row: r.row, text: r.text, outline: TE.outline(r.text), readOnly: false };
      renderOpen();
      say(usedId() === open.id ? 'saved' : 'saved-other', { v: r.row.data.version });
    }, function () { say('p-failed'); }).then(function () { lock(false); });
  });
  $('[data-discard]').addEventListener('click', function () {
    if (busy || !open) return;
    renderOpen(); say(null);
  });

  /* ---- his own copy of ours: new inspections start from it only when they start from ours now (or from nothing
     he chose), never over a default he picked himself (the lead's condition, 2026-11-26) ---- */
  $('[data-copy]').addEventListener('click', function () {
    if (busy) return;
    lock(true); say('copying');
    var run = queue.then(function () {
      return Promise.all([pull(), ours()]).then(function (got) {
        if (!got[0]) return { problem: 'failed' };
        var c = got[1], taken = Object.keys(biz).filter(function (k) { return k.indexOf(TPL + '/') === 0; }).map(function (k) { return biz[k].id; });
        var id = TS.newTemplateId(c.copyName, taken), text = TS.makeCopy(c, id, c.copyName);
        var now = usedId(), also = now === null || now === OURS;
        return store(id, text, '1', c.copyName, 'copied', null, also).then(function (r) {
          return r.problem ? r : { row: r.row, text: text, also: also };
        });
      });
    });
    queue = run.catch(function () { return null; });
    run.then(function (r) {
      if (r.problem) { say('p-' + (r.problem === 'changed' ? 'failed' : r.problem)); return; }
      open = { id: r.row.id, row: r.row, text: r.text, outline: TE.outline(r.text), readOnly: false };
      renderOpen();
      say(r.also ? 'copied-default' : 'copied');
    }, function () { say('p-failed'); }).then(function () { lock(false); });
  });

  /* ---- export: his template's saved version, as the phone exports it (the file itself, named as the phone names
     it), to keep or to bring into another account ---- */
  $('[data-export]').addEventListener('click', function () {
    if (!open || open.readOnly || !open.text) return;
    var url = URL.createObjectURL(new Blob([open.text], { type: 'application/json' }));
    var a = document.createElement('a');
    a.href = url; a.download = TE.fileName(open.outline.name);
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 10000);
    say(changed() ? 'exported-saved' : 'exported', { name: a.download });
  });

  /* ---- the one new inspections start from ---- */
  $('[data-use]').addEventListener('click', function () {
    if (busy || !open || open.readOnly) return;
    lock(true); say('using');
    var id = open.id, me = auth.who().id, before = null;
    var run = queue.then(function () {
      return pull().then(function (ok) {
        if (!ok) return 'failed';
        var d = biz[TPL_DEFAULT + '/default'], at = Math.max(Date.now(), d ? d.updated_at + 1 : 0);
        // The one it replaces, named when it says so: never a silent change of the one he chose (the lead, 2026-11-26).
        var was = standing(d) ? d.data.templateId : null;
        before = was === null || was === OURS ? (copyFile ? copyFile.sourceName : null)
          : (standing(biz[TPL + '/' + was]) ? biz[TPL + '/' + was].data.name : null);
        return send([{ kind: TPL_DEFAULT, id: 'default', updated_at: at, deleted_at: null,
          data: { id: 'default', ownerAccountId: me, templateId: id, updatedAt: at, deletedAt: null } }]);
      });
    });
    queue = run.catch(function () { return null; });
    run.then(function (k) {
      if (k !== 'ok') { say('p-' + (k === 'changed' ? 'failed' : k)); return; }
      // Only what says which one new inspections use: his unsaved changes stay as they are (Codex on #101).
      defaultControls(); renderList();
      if (before && before !== open.outline.name) say('now-used-instead', { name: open.outline.name, was: before });
      else say('now-used', { name: open.outline.name });
    }, function () { say('p-failed'); }).then(function () { lock(false); });
  });

  /* ---- start, and keep in step with the phone ---- */
  function refresh() {
    return pull().then(function (ok) {
      if (!ok) { if (!Object.keys(biz).length) state('failed'); return; }
      state(null);
      // The open one changed on another device and nothing is changed here: show the newest.
      if (open && open.id && !busy && waiting === null && !changed()) {
        var row = biz[TPL + '/' + open.id];
        if (standing(row) && row.data.sha256 !== open.row.data.sha256) choose(open.id, true, true);
      }
      renderList();
    });
  }
  /* /template#<id>: that template opens (from /templates after an import), unless he opened one himself first. */
  function fromAddress() {
    var id = decodeURIComponent((window.location.hash || '').slice(1));
    if (!id || open || showing) return;
    if (id === OURS) { choose(null); return; }
    if (standing(biz[TPL + '/' + id])) choose(id);
  }
  auth.current().then(function (s) {
    if (!s) return;
    main.hidden = false;
    ours().catch(function () { return null; }).then(refresh).then(fromAddress);
  });
  document.addEventListener('visibilitychange', function () { if (document.visibilityState === 'visible') refresh(); });
  setInterval(function () { if (document.visibilityState === 'visible') refresh(); }, FALLBACK);
})();
