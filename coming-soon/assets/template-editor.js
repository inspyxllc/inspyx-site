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
  function renderOpen() {
    var o = open.outline, ro = open.readOnly;
    edit.hidden = false;
    nameIn.value = o.name; nameIn.setAttribute('data-was', o.name); nameIn.disabled = ro;
    nameIn.setAttribute('data-k', JSON.stringify({ op: 'template' }));
    $('[data-ver]').textContent = words('version', { v: o.version });
    $('[data-ro]').hidden = !ro;
    $('[data-copy]').hidden = !ro;
    var used = usedId(), isUsed = ro ? (used === OURS || used === null) : used === open.id;
    $('[data-use]').hidden = ro || isUsed;
    $('[data-used]').hidden = !isUsed;
    // Drawn again after a save: the stops he had open stay open (by ref), where he was.
    var wasOpen = all('.te-stop[open]', stops).map(function (d) { return d.getAttribute('data-stop'); });
    stops.textContent = '';
    o.stops.forEach(function (s) {
      var d = el('details', 'te-stop'), sum = el('summary');
      d.setAttribute('data-stop', s.ref);
      if (wasOpen.indexOf(s.ref) >= 0) d.open = true;
      sum.appendChild(el('b', null, s.name)); sum.appendChild(el('em', null, plural('items', s.items.length)));
      d.appendChild(sum);
      d.addEventListener('toggle', function () { if (d.open) growIn(d); });
      d.appendChild(field(words('f-stop'), s.name, { op: 'stop', ref: s.ref }, false, ro));
      s.items.forEach(function (i) {
        var it = el('div', 'te-item');
        it.setAttribute('data-item', i.ref);
        it.appendChild(field(words('f-item'), i.label, { op: 'item', ref: i.ref }, false, ro));
        ['information', 'limitation', 'deficiency'].forEach(function (kind) {
          var lines = i.lines.filter(function (l) { return l.kind === kind; });
          if (!lines.length) return;
          var g = el('div', 'te-group te-' + kind);
          g.appendChild(el('h4', null, words('kind-' + kind)));
          lines.forEach(function (l) {
            var k = function (f) { return { op: 'line', item: i.ref, kind: kind, position: l.position, f: f }; };
            var c = el('div', 'te-line');
            c.appendChild(field(words('f-name'), l.name, k('name'), false, ro));
            if (kind !== 'information') c.appendChild(field(words('f-text'), l.text, k('text'), true, ro));
            if (kind === 'deficiency') {
              c.appendChild(ratingField(l, o.ratings, k('rating'), ro));
              c.appendChild(field(words('f-todo'), l.recommendation, k('recommendation'), true, ro));
            }
            g.appendChild(c);
          });
          it.appendChild(g);
        });
        d.appendChild(it);
      });
      stops.appendChild(d);
    });
    find();
    changed();
    renderList();
  }

  /* ---- changes: every field that differs from what it started as, as the edit list ---- */
  function edits() {
    var out = [], lines = {};
    all('[data-k]', edit).forEach(function (box) {
      if (box.value === box.getAttribute('data-was')) return;
      var k = JSON.parse(box.getAttribute('data-k'));
      if (k.op === 'template') out.push({ op: 'template', name: box.value });
      else if (k.op === 'stop') out.push({ op: 'stop', ref: k.ref, name: box.value });
      else if (k.op === 'item') out.push({ op: 'item', ref: k.ref, label: box.value });
      else {
        var id = k.item + '|' + k.kind + '|' + k.position;
        var e = lines[id] || (lines[id] = { op: 'line', item: k.item, kind: k.kind, position: k.position });
        if (!e.added) { out.push(e); e.added = true; }
        e[k.f] = k.f === 'rating' ? (box.value || null) : box.value;
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
    var n = open && !open.readOnly ? all('[data-k]', edit).filter(function (b) { return b.value !== b.getAttribute('data-was'); }).length : 0;
    all('[data-k]', edit).forEach(function (b) { b.classList.toggle('is-changed', b.value !== b.getAttribute('data-was')); });
    bar.hidden = n === 0;
    $('[data-count]').textContent = plural('changes', n);
    roomForBar();
    return n;
  }
  edit.addEventListener('input', function (e) {
    if (!e.target.hasAttribute('data-k')) return;
    if (e.target.tagName === 'TEXTAREA') grow(e.target);
    changed(); if (e.target.value) say(null);
  });
  window.addEventListener('resize', function () { all('.te-stop[open]', stops).forEach(growIn); });
  edit.addEventListener('change', function (e) { if (e.target.hasAttribute('data-k')) changed(); });
  window.addEventListener('beforeunload', function (e) { if (open && changed()) { e.preventDefault(); e.returnValue = ''; } });

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
  }
  findIn.addEventListener('input', find);

  /* ---- open one ---- */
  function choose(id, force) {
    if (busy && !force) return;
    if (!force && open && changed() && !window.confirm(words('leave'))) return;
    say(null);
    if (id === null) {
      return ours().then(function (c) {
        open = { id: null, row: null, text: c.text, outline: TE.outline(c.text), readOnly: true };
        renderOpen();
      }, function () { say('p-failed'); });
    }
    var row = biz[TPL + '/' + id];
    if (!standing(row)) return;
    return readFile(row).then(function (text) {
      if (text === null) { say('p-failed'); return; }
      open = { id: id, row: row, text: text, outline: TE.outline(text), readOnly: false };
      renderOpen();
    });
  }

  /* ---- save: on the newest version there, after a whole pull; once more when another device won the race ---- */
  function lock(on) { busy = on; all('[data-save],[data-discard],[data-copy],[data-use]', main).forEach(function (b) { b.disabled = on; }); }
  function saveOnce(list, first) {
    return pull().then(function (ok) {
      if (!ok) return { problem: 'failed' };
      var row = biz[TPL + '/' + open.id];
      if (!standing(row)) return { problem: 'failed' };
      var same = row.data.sha256 === open.row.data.sha256;
      return (same ? Promise.resolve(open.text) : readFile(row)).then(function (text) {
        if (text === null) return { problem: 'failed' };
        var made = TE.apply(text, list);
        if (made.problem) return { problem: made.problem };
        return TS.contentKey(text, digest).then(function (base) {
          return store(open.id, made.text, made.version, made.name, row.data.source, base, false).then(function (r) {
            if (r.problem === 'changed' && first) return saveOnce(list, false);
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
    lock(true); say('saving');
    var run = queue.then(function () { return saveOnce(list, true); });
    queue = run.catch(function () { return null; });
    run.then(function (r) {
      // The newest there already says all of it (made the same elsewhere): show it.
      if (r.problem === 'unchanged') return choose(open.id, true);
      if (r.problem) { say('p-' + r.problem); return; }
      open = { id: open.id, row: r.row, text: r.text, outline: TE.outline(r.text), readOnly: false };
      renderOpen();
      say(usedId() === open.id ? 'saved' : 'saved-other', { v: r.row.data.version });
    }, function () { say('p-failed'); }).then(function () { lock(false); });
  });
  $('[data-discard]').addEventListener('click', function () {
    if (busy || !open) return;
    all('[data-k]', edit).forEach(function (b) { b.value = b.getAttribute('data-was'); });
    changed(); say(null);
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
      renderOpen();
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
      if (open && open.id && !busy && !changed()) {
        var row = biz[TPL + '/' + open.id];
        if (standing(row) && row.data.sha256 !== open.row.data.sha256) choose(open.id, true);
      }
      renderList();
    });
  }
  auth.current().then(function (s) {
    if (!s) return;
    main.hidden = false;
    ours().catch(function () { return null; }).then(refresh);
  });
  document.addEventListener('visibilitychange', function () { if (document.visibilityState === 'visible') refresh(); });
  setInterval(function () { if (document.visibilityState === 'visible') refresh(); }, FALLBACK);
})();
