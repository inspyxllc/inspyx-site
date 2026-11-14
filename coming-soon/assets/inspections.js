/* Your inspections, live (2026-11-14, Inspyx 4): the inspector's inspections as their phone has them, kept in step both
   ways. Moises's dashboard interview, answer 6: "Both stay in sync"; a change shows on the other within seconds, and the
   newest change wins when both touch the same thing.
   How: the server keeps one register per field of every inspection (the inspection-sync function, in the app's repo at
   backend/supabase/functions/inspection-sync). This page pulls every field once, then only what changed after its point;
   it sends each edit as one field with the time it was made; and it pulls again whenever the server pings "something
   changed" (InspyxAuth.listen), when the tab comes back into view, and once a minute as a fallback.
   An edit typed here is never overwritten while its box is being typed in: the newest value lands when the box is left.
   This file says no words. The page holds every sentence. */
(function () {
  'use strict';
  var main = document.querySelector('[data-insp]');
  var auth = window.InspyxAuth;
  if (!main || !auth) return;
  var DEADLINE = 20000, SETTLE = 700, FALLBACK = 60000;
  var DEVICE_KEY = 'inspyx.sync.device';

  var $ = function (sel, el) { return (el || main).querySelector(sel); };
  var all = function (sel, el) { return [].slice.call((el || main).querySelectorAll(sel)); };
  var tpl = function (name) { return document.querySelector('template[data-t="' + name + '"]').content.firstElementChild.cloneNode(true); };
  var show = function (attr, which) { all('[' + attr + ']').forEach(function (el) { el.hidden = el.getAttribute(attr) !== which; }); };

  /* This browser's sync name: "web-" and 18 hex digits, made once. */
  function device() {
    var name = null;
    try { name = window.localStorage.getItem(DEVICE_KEY); } catch (e) { name = null; }
    if (name && /^web-[0-9a-f]{18}$/.test(name)) return name;
    var bytes = new Uint8Array(9);
    window.crypto.getRandomValues(bytes);
    name = 'web-' + [].map.call(bytes, function (b) { return ('0' + b.toString(16)).slice(-2); }).join('');
    try { window.localStorage.setItem(DEVICE_KEY, name); } catch (e) { /* kept for this visit only */ }
    return name;
  }
  var me = device();

  // Every field the server holds for this inspector: "entity/id.field" -> { inspection, entity, id, field, value, at, device }
  var fields = Object.create(null);
  var point = null, offset = 0, pulling = null, again = false;
  var outbox = [];          // this page's edits not yet answered: { inspection, entity, id, field, value, at }
  var dirty = Object.create(null);   // keys being typed in right now
  var timers = Object.create(null);

  var key = function (entity, id, field) { return entity + '/' + id + '.' + field; };
  var val = function (entity, id, field) { var f = fields[key(entity, id, field)]; return f ? f.value : undefined; };
  var deleted = function (entity, id) { return val(entity, id, '_del') === true; };
  var later = function (a, b) { return a.at > b.at || (a.at === b.at && a.device > b.device); };

  var owner = Object.create(null);   // "entity/id" -> the inspection it belongs to
  function take(f) {
    var k = key(f.entity, f.id, f.field), held = fields[k];
    owner[f.entity + '/' + f.id] = f.inspection;
    if (!held || later(f, held)) fields[k] = f;
  }

  /* One exchange with the function: sends what waits, brings what changed. */
  function exchange() {
    var push = outbox.slice(0, 500);
    return auth.ask('inspection-sync', { device: me, push: push, after: point, limit: 1000 }, DEADLINE).then(function (r) {
      if (r === null) { window.location.replace('/signin'); return false; }
      if (r.status !== 200 || !r.json || !Array.isArray(r.json.fields)) throw new Error('sync');
      if (typeof r.json.now === 'number') offset = r.json.now - Date.now();
      var answered = Object.create(null);
      (r.json.results || []).forEach(function (x) { answered[x.i] = true; });
      (r.json.skipped || []).forEach(function (x) { answered[x.i] = true; });
      outbox = outbox.filter(function (w, i) { return i >= push.length || !answered[i]; });
      r.json.fields.forEach(take);
      if (typeof r.json.next === 'number') point = r.json.next;
      return r.json.more === true || outbox.length > 0;
    });
  }

  function sync() {
    if (pulling) { again = true; return pulling; }
    var loop = function () { return exchange().then(function (more) { return more ? loop() : null; }); };
    pulling = loop().then(function () {
      show('data-save', outbox.length ? 'saving' : (anyEdits ? 'saved' : ''));
      showLive(listening ? 'live' : 'connecting');
      render();
    }, function () {
      showLive('offline');
      if (point === null) show('data-list', 'failed');
      if (outbox.length) show('data-save', 'failed');
      setTimeout(sync, 5000);
    }).then(function () {
      pulling = null;
      if (again) { again = false; sync(); }
    });
    return pulling;
  }

  var anyEdits = false;
  function edit(inspection, entity, id, field, value) {
    anyEdits = true;
    var w = { inspection: inspection, entity: entity, id: id, field: field, value: value, at: Date.now() + offset };
    outbox = outbox.filter(function (o) { return !(o.entity === entity && o.id === id && o.field === field); });
    outbox.push(w);
    take({ inspection: inspection, entity: entity, id: id, field: field, value: value, at: w.at, device: me });
    show('data-save', 'saving');
    sync();
  }

  // ---- what shows ----------------------------------------------------------------------------------------------

  function parts(entity, where) {
    var seen = Object.create(null), out = [];
    Object.keys(fields).forEach(function (k) {
      var f = fields[k];
      if (f.entity !== entity || seen[f.id] || deleted(entity, f.id)) return;
      seen[f.id] = true;
      if (!where || where(f.id)) out.push(f.id);
    });
    return out;
  }
  var byPosition = function (entity) {
    return function (a, b) { return (val(entity, a, 'position') || 0) - (val(entity, b, 'position') || 0) || (a < b ? -1 : 1); };
  };
  var text = function (v) { return typeof v === 'string' ? v : ''; };

  function chosen() { var h = window.location.hash.slice(1); return /^[A-Za-z0-9_.:-]{1,64}$/.test(h) ? h : null; }

  function renderList() {
    var list = $('[data-list="items"]');
    var ids = parts('inspection').filter(function (id) { return typeof val('inspection', id, 'title') === 'string'; });
    ids.sort(function (a, b) {
      var ta = val('inspection', a, 'scheduled_at') || val('inspection', a, 'created_at') || 0;
      var tb = val('inspection', b, 'scheduled_at') || val('inspection', b, 'created_at') || 0;
      return tb - ta;
    });
    show('data-list', ids.length ? 'items' : 'empty');
    list.hidden = ids.length === 0;
    list.textContent = '';
    ids.forEach(function (id) {
      var row = tpl('row');
      var a = row.querySelector('a');
      a.href = '#' + id;
      if (id === chosen()) a.setAttribute('aria-current', 'page');
      row.querySelector('[data-v="title"]').textContent = text(val('inspection', id, 'title'));
      row.querySelector('[data-v="address"]').textContent = text(val('inspection', id, 'address'));
      list.appendChild(row);
    });
  }

  /* The shape of an inspection (its stops, items and findings, in order): rebuilt only when it changes, so a box
     being typed in keeps its place. Values are written into the boxes on every render, except a box being typed in. */
  var shape = null;
  function renderOne() {
    var id = chosen();
    var detail = $('[data-detail]'), pick = $('[data-pick]');
    if (!id || deleted('inspection', id) || val('inspection', id, 'title') === undefined) {
      detail.hidden = true; pick.hidden = false; shape = null; return;
    }
    pick.hidden = true; detail.hidden = false;
    var stops = parts('section', function (s) { return owner['section/' + s] === id; }).sort(byPosition('section'));
    var itemsOf = function (s) { return parts('item', function (i) { return val('item', i, 'section_id') === s && !val('item', i, 'parent_item_id'); }).sort(byPosition('item')); };
    var findingsOf = function (i) { return parts('item', function (f) { return val('item', f, 'parent_item_id') === i; }).sort(byPosition('item')); };
    var next = JSON.stringify([id, stops.map(function (s) {
      return [s, text(val('section', s, 'name')), itemsOf(s).map(function (i) { return [i, text(val('item', i, 'label')), findingsOf(i)]; })];
    })]);
    if (next !== shape) {
      var focus = document.activeElement && document.activeElement.getAttribute && document.activeElement.getAttribute('data-key');
      shape = next;
      var box = $('[data-stops]');
      box.textContent = '';
      stops.forEach(function (s) {
        var stop = tpl('stop');
        stop.querySelector('[data-v="name"]').textContent = text(val('section', s, 'name'));
        var ol = stop.querySelector('.insp-items');
        itemsOf(s).forEach(function (i) {
          var item = tpl('item');
          item.querySelector('[data-v="label"]').textContent = text(val('item', i, 'label'));
          bind(item, 'item', i, id);
          var fol = item.querySelector('.insp-findings');
          findingsOf(i).forEach(function (f) {
            var finding = tpl('finding');
            bind(finding, 'item', f, id);
            var photos = parts('photo', function (p) { return val('photo', p, 'item_id') === f; }).length;
            var line = finding.querySelector('[data-photos]');
            line.hidden = photos === 0;
            line.querySelector('[data-v="photos"]').textContent = String(photos);
            fol.appendChild(finding);
          });
          ol.appendChild(item);
        });
        box.appendChild(stop);
      });
      bind($('.insp-cover'), 'inspection', id, id);
      if (focus) { var back = main.querySelector('[data-key="' + focus + '"]'); if (back) back.focus(); }
    }
    all('[data-key]').forEach(function (el) {
      var k = el.getAttribute('data-key');
      if (dirty[k]) return;
      var f = fields[k], v = f ? f.value : null;
      var want = v === null || v === undefined ? '' : String(v);
      if (el.value !== want) el.value = want;
    });
  }

  /* Boxes and choices in [el] edit the part [entity]/[id]: each sends its field when it settles. */
  function bind(el, entity, id, inspection) {
    all('[data-field]', el).forEach(function (box) {
      var field = box.getAttribute('data-field');
      var k = key(entity, id, field);
      box.setAttribute('data-key', k);
      if (box.getAttribute('data-bound') === k) return;
      box.setAttribute('data-bound', k);
      var send = function () {
        clearTimeout(timers[k]);
        var v = box.value;
        var value = box.tagName === 'SELECT' && v === '' ? null : v;
        if (box.tagName !== 'SELECT' && v === '' && field !== 'title' && field !== 'address') value = null;
        var held = fields[k] ? fields[k].value : null;
        if ((held === undefined ? null : held) === value) return;
        if ((field === 'title' || field === 'address') && !value) return;   // the phone's inspection always has both
        edit(inspection, entity, id, field, value);
      };
      if (box.tagName === 'SELECT') {
        box.addEventListener('change', send);
      } else {
        box.addEventListener('input', function () { dirty[k] = true; clearTimeout(timers[k]); timers[k] = setTimeout(send, SETTLE); });
        box.addEventListener('blur', function () { send(); delete dirty[k]; render(); });
      }
    });
  }

  function render() { renderList(); renderOne(); }

  var listening = false;
  function showLive(which) { show('data-live', which); }

  window.addEventListener('hashchange', function () { shape = null; render(); });
  document.addEventListener('visibilitychange', function () { if (document.visibilityState === 'visible') sync(); });
  setInterval(function () { if (document.visibilityState === 'visible') sync(); }, FALLBACK);

  if (!auth.who()) { window.location.replace('/signin'); return; }
  main.hidden = false;
  auth.listen(function (ping) {
    if (ping && ping.signedOut) { window.location.replace('/signin'); return; }
    if (ping && ping.joined) { listening = true; showLive('live'); }
    sync();
  });
  sync();
})();
