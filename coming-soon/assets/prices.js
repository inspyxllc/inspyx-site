/* Prices (2026-11-16, Inspyx 4): the inspector's price list on the web, the same list as on their phone. Moises's
   dashboard interview, answer 5: "business setup (services, prices, discounts...)". Phase 1: services and their
   add-ons, and discount codes, read and edited here; price changes are shown, and made on the phone for now.
   How: the sync function (inspyx-mobile, backend/supabase/functions/sync) keeps each price row as the phone's own
   row, newest change wins. This page pulls every row once, then what changed after its point, every half minute
   while it is in view and when it comes back into view. It writes a row whole, as the phone's store would
   (price_list_store.dart): trimmed name, a description or none, fee and time, a minimum only on a service, a new
   change time past the row's last one; deleting a service deletes its add-ons and price changes at the same time.
   It checks the phone's own rules before it sends (price_list.dart's problems, and a code no other standing
   discount holds); the server holds the same rules and has the last word: a change it keeps out is said so.
   This file says no words. The page holds every sentence and unit. */
(function () {
  'use strict';
  var main = document.querySelector('[data-prc]');
  var auth = window.InspyxAuth;
  if (!main || !auth) return;
  var DEADLINE = 20000, POLL = 30000, MAX_CENTS = 100000000;
  var KINDS = ['price_services', 'price_modifiers', 'price_discounts'];

  var $ = function (sel, el) { return (el || document).querySelector(sel); };
  var all = function (sel, el) { return [].slice.call((el || document).querySelectorAll(sel)); };
  var tpl = function (name) { return document.querySelector('template[data-t="' + name + '"]').content.firstElementChild.cloneNode(true); };
  var showOne = function (el, attr, which) { all('[' + attr + ']', el).forEach(function (x) { x.hidden = x.getAttribute(attr) !== which; }); };
  var words = (function () {
    var box = document.querySelector('template[data-t="words"]').content;
    return function (key) { var w = box.querySelector('[data-w="' + key + '"]'); return w ? w.textContent : ''; };
  })();

  // ---- the rows, as the server keeps them ------------------------------------------------------------------------

  var me = null;
  var rows = Object.create(null);   // "kind/id" -> {kind, id, updated_at, deleted_at, data}
  var point = null, loaded = false, pulling = null, again = false, failing = false;

  function take(r) {
    if (!r || KINDS.indexOf(r.kind) < 0 || typeof r.id !== 'string' || !r.data || r.data.ownerAccountId !== me) return;
    var k = r.kind + '/' + r.id, held = rows[k];
    if (!held || r.updated_at >= held.updated_at) rows[k] = r;
  }

  /* One exchange: sends [push], brings what changed after the point. */
  function exchange(push) {
    return auth.ask('sync', { push: push, after: point, limit: 500 }, DEADLINE).then(function (r) {
      if (r === null) { window.location.replace('/signin'); return null; }
      if (r.status !== 200 || !r.json || !Array.isArray(r.json.rows)) throw new Error('sync');
      r.json.rows.forEach(take);
      if (r.json.next) point = r.json.next;
      return r.json;
    });
  }

  function pull() {
    if (pulling) { again = true; return pulling; }
    var loop = function () { return exchange([]).then(function (a) { return a && a.more ? loop() : null; }); };
    pulling = loop().then(function () {
      loaded = true; failing = false;
    }, function () {
      failing = true;
    }).then(function () {
      pulling = null;
      render();
      if (again) { again = false; pull(); }
    });
    return pulling;
  }

  /* Sends [push] (rows of one change), then pulls the rest. Answers 'saved', 'taken', 'refused' or 'failed'. */
  function send(push) {
    return exchange(push).then(function (answer) {
      if (answer === null) return 'failed';
      var mine = (answer.skipped || []).filter(function (s) {
        return push.some(function (p) { return p.kind === s.kind && p.id === s.id; });
      });
      var outcome = mine.length === 0 ? 'saved' : mine.some(function (s) { return s.reason === 'price:code_taken'; }) ? 'taken' : 'refused';
      return (answer.more ? pull() : Promise.resolve()).then(function () { render(); return outcome; });
    }, function () { return 'failed'; });
  }

  var standing = function (kind) {
    return Object.keys(rows).map(function (k) { return rows[k]; }).filter(function (r) {
      return r.kind === kind && r.deleted_at === null && r.data.deletedAt == null;
    }).map(function (r) { return r.data; });
  };
  var byPlace = function (a, b) { return (a.position - b.position) || (a.createdAt - b.createdAt) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0); };
  var byMade = function (a, b) { return (a.createdAt - b.createdAt) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0); };
  var services = function () { return standing('price_services').filter(function (s) { return s.parentId == null; }).sort(byPlace); };
  var addOnsOf = function (id) { return standing('price_services').filter(function (s) { return s.parentId === id; }).sort(byPlace); };
  var changesOf = function (id) { return standing('price_modifiers').filter(function (m) { return m.serviceId === id; }).sort(byPlace); };
  var discounts = function () { return standing('price_discounts').sort(byMade); };
  var held = function (kind, id) { var r = rows[kind + '/' + id]; return r ? r.data : null; };

  /* A new change time: now, or just past the row's last one (the store's _after). */
  var nextAt = function (data) { var t = Date.now(); return data && data.updatedAt >= t ? data.updatedAt + 1 : t; };
  var wire = function (kind, data) { return { kind: kind, id: data.id, updated_at: data.updatedAt, deleted_at: data.deletedAt, data: data }; };
  var newId = function () { return window.crypto.randomUUID(); };
  var tidy = function (text) { var t = (text || '').trim(); return t === '' ? null : t; };

  // ---- money, time and words (price_list.dart's formats) ---------------------------------------------------------

  function groupDigits(n) {
    var d = String(Math.abs(n)), out = n < 0 ? '-' : '';
    for (var i = 0; i < d.length; i++) { if (i > 0 && (d.length - i) % 3 === 0) out += ','; out += d[i]; }
    return out;
  }
  function formatCents(cents) {
    var sign = cents < 0 ? '-' : '', whole = Math.floor(Math.abs(cents) / 100), part = Math.abs(cents) % 100;
    return sign + '$' + groupDigits(whole) + (part === 0 ? '' : '.' + (part < 10 ? '0' : '') + part);
  }
  var formatSignedCents = function (c) { return c < 0 ? formatCents(c) : '+' + formatCents(c); };
  function formatMinutes(minutes) {
    var h = Math.floor(Math.abs(minutes) / 60), m = Math.abs(minutes) % 60, sign = minutes < 0 ? '-' : '';
    if (h === 0) return sign + m + ' ' + words('min');
    if (m === 0) return sign + h + ' ' + words('h');
    return sign + h + ' ' + words('h') + ' ' + m + ' ' + words('min');
  }
  function formatPercent(hundredths) {
    var whole = Math.floor(hundredths / 100), part = hundredths % 100;
    return part === 0 ? whole + '%' : whole + '.' + String(part < 10 ? '0' + part : part).replace(/0$/, '') + '%';
  }
  var DATE = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

  /* parseCents in price_list.dart: dollars as typed, in cents; null when it isn't an amount up to $1,000,000. */
  function parseCents(text) {
    var t = String(text).trim().replace(/,/g, '').replace(/ /g, '');
    if (t.charAt(0) === '$') t = t.slice(1);
    var m = /^(\d{0,9})(?:\.(\d{0,2}))?$/.exec(t);
    if (!m || (m[1] === '' && (m[2] || '') === '')) return null;
    var cents = (m[1] === '' ? 0 : parseInt(m[1], 10)) * 100 + parseInt(((m[2] || '') + '00').slice(0, 2), 10);
    return cents > MAX_CENTS ? null : cents;
  }
  /* parseHours: hours as typed, in whole minutes; null unless from 0 to 24. */
  function parseHours(text) {
    var t = String(text).trim().replace(',', '.');
    if (t === '' || !/^\d*\.?\d+$|^\d+\.$/.test(t)) return null;
    var h = parseFloat(t);
    return isNaN(h) || h < 0 || h > 24 ? null : Math.round(h * 60);
  }
  /* parsePercent: a percent as typed, in hundredths; null unless from 0.01 to 100. */
  function parsePercent(text) {
    var m = /^(\d{1,3})(?:\.(\d{1,2}))?$/.exec(String(text).replace(/%/g, '').trim());
    if (!m) return null;
    var v = parseInt(m[1], 10) * 100 + parseInt(((m[2] || '') + '00').slice(0, 2), 10);
    return v < 1 || v > 10000 ? null : v;
  }
  var hoursText = function (minutes) { return String(Math.round(minutes / 60 * 100) / 100); };
  var centsText = function (cents) { return cents % 100 === 0 ? String(cents / 100) : (cents / 100).toFixed(2); };

  function serviceSummary(s) {
    var addOns = addOnsOf(s.id).length, changes = changesOf(s.id).length;
    return [
      formatCents(s.feeCents),
      s.minutes > 0 ? formatMinutes(s.minutes) : null,
      s.minimumFeeCents != null ? words('at_least') + ' ' + formatCents(s.minimumFeeCents) : null,
      addOns ? addOns + ' ' + words(addOns === 1 ? 'addon' : 'addons') : null,
      changes ? changes + ' ' + words(changes === 1 ? 'change' : 'changes') : null,
    ].filter(Boolean).join(' · ');
  }
  function changeSummary(m) {
    var label = words(m.basis) || m.basis, json = null;
    try { json = JSON.parse(m.tiersJson); } catch (e) { return label; }
    if (m.mode === 'per_unit_over') {
      if (!json || typeof json.fee_cents !== 'number') return label;
      return label + ': ' + formatSignedCents(json.fee_cents) + ' ' + words('for_each') + ' ' + groupDigits(json.unit) + ' ' + words('past') + ' ' + groupDigits(json.over);
    }
    var numeric = m.basis !== 'zip' && m.basis !== 'foundation';
    var parts = ((json && json.tiers) || []).map(function (t) {
      if (!numeric) return (t.values || []).join(', ') + ' ' + formatSignedCents(t.fee_cents);
      var from = t.from == null ? null : t.from, to = t.to == null ? null : t.to, range;
      if (from === null && to === null) range = words('any');
      else if (from === null || (from === 0 && to !== null)) range = words('up_to_range') + ' ' + groupDigits(to);
      else if (to === null) range = groupDigits(from) + ' ' + words('and_up');
      else range = groupDigits(from) + ' ' + words('to') + ' ' + groupDigits(to);
      return range + ' ' + formatSignedCents(t.fee_cents);
    });
    return label + ': ' + parts.join(' · ');
  }
  function discountSummary(d) {
    var off = (d.kind === 'percent' ? formatPercent(d.value) : formatCents(d.value)) + ' ' + words('off_percent');
    if (!d.active) return off + ' · ' + words('is_off');
    var ids = [];
    try { ids = JSON.parse(d.appliesToJson) || []; } catch (e) { ids = []; }
    var names = ids.map(function (id) { var s = held('price_services', id); return s ? s.name : null; }).filter(Boolean).sort();
    return [
      off,
      ids.length === 0 ? words('all_services') : names.join(', '),
      d.expiresAt != null ? words('until') + ' ' + DATE.format(new Date(d.expiresAt)) : null,
      d.maxUses != null ? words('up_to') + ' ' + d.maxUses + ' ' + words(d.maxUses === 1 ? 'use' : 'uses') : null,
    ].filter(Boolean).join(' · ');
  }

  // ---- what shows ------------------------------------------------------------------------------------------------

  function say(which) { showOne(main, 'data-say', which || ''); }

  function render() {
    showOne(main, 'data-live', failing ? 'offline' : loaded ? 'live' : 'connecting');
    if (!loaded) { showOne(main, 'data-state', failing ? 'failed' : 'loading'); return; }
    showOne(main, 'data-state', '');
    all('[data-group]', main).forEach(function (g) { g.hidden = false; });

    var list = $('[data-list="services"]', main), svc = services();
    $('[data-empty="services"]', main).hidden = svc.length > 0;
    list.textContent = '';
    svc.forEach(function (s) {
      var card = tpl('service');
      card.setAttribute('data-id', s.id);
      $('[data-v="name"]', card).textContent = s.name;
      $('[data-v="summary"]', card).textContent = serviceSummary(s);
      $('[data-v="description"]', card).textContent = s.description || '';
      $('[data-edit]', card).addEventListener('click', function () { openService(s, null); });
      $('[data-add="addon"]', card).addEventListener('click', function () { openService(null, s.id); });
      var ol = $('[data-list="addons"]', card);
      addOnsOf(s.id).forEach(function (a) {
        var li = tpl('addon');
        $('[data-v="name"]', li).textContent = a.name;
        $('[data-v="summary"]', li).textContent = [formatCents(a.feeCents), a.minutes > 0 ? formatMinutes(a.minutes) : null].filter(Boolean).join(' · ');
        $('[data-edit]', li).addEventListener('click', function () { openService(a, s.id); });
        ol.appendChild(li);
      });
      var changes = changesOf(s.id), cl = $('[data-list="changes"]', card);
      $('[data-changes]', card).hidden = changes.length === 0;
      changes.forEach(function (m) { var li = tpl('change'); li.textContent = changeSummary(m); cl.appendChild(li); });
      list.appendChild(card);
    });

    var dl = $('[data-list="discounts"]', main), disc = discounts();
    $('[data-empty="discounts"]', main).hidden = disc.length > 0;
    dl.textContent = '';
    disc.forEach(function (d) {
      var li = tpl('discount');
      li.setAttribute('data-id', d.id);
      $('[data-v="code"]', li).textContent = d.code;
      $('[data-v="summary"]', li).textContent = discountSummary(d);
      $('[data-edit]', li).addEventListener('click', function () { openDiscount(d); });
      dl.appendChild(li);
    });
  }

  // ---- a service or an add-on ------------------------------------------------------------------------------------

  var svcDialog = $('[data-dialog="service"]'), svcForm = $('[data-form="service"]');
  var editing = null;   // {data: the row being changed or null, parentId}

  function armDelete(form, armed) {
    var b = $('[data-delete]', form);
    b.setAttribute('data-armed', armed ? '1' : '0');
    showOne(b, 'data-arm', armed ? '1' : '0');
  }

  function openService(data, parentId) {
    editing = { data: data, parentId: data ? data.parentId : parentId };
    var addOn = editing.parentId != null;
    showOne(svcForm, 'data-title', (data ? 'edit-' : 'new-') + (addOn ? 'addon' : 'service'));
    showOne(svcForm, 'data-time', addOn ? 'addon' : 'service');
    all('[data-only="service"]', svcForm).forEach(function (x) { x.hidden = addOn; });
    $('[data-only="delete-service"]', svcForm).hidden = !data || addOn;
    svcForm.elements.name.value = data ? data.name : '';
    svcForm.elements.description.value = data && data.description ? data.description : '';
    svcForm.elements.fee.value = data ? centsText(data.feeCents) : '';
    svcForm.elements.hours.value = data ? hoursText(data.minutes) : '';
    svcForm.elements.minimum.value = data && data.minimumFeeCents != null ? centsText(data.minimumFeeCents) : '';
    $('[data-delete]', svcForm).hidden = !data;
    armDelete(svcForm, false);
    showOne(svcForm, 'data-problem', '');
    say('');
    svcDialog.showModal();
    svcForm.elements.name.focus();
  }

  /* The form's fields, or the first problem, in the phone's order. */
  function serviceFields() {
    var f = svcForm.elements, addOn = editing.parentId != null;
    var name = f.name.value.trim();
    if (name === '') return { problem: 'name' };
    var fee = parseCents(f.fee.value);
    if (fee === null) return { problem: 'fee' };
    var minutes = parseHours(f.hours.value === '' ? '0' : f.hours.value);
    if (minutes === null) return { problem: 'hours' };
    var minimum = null;
    if (!addOn && f.minimum.value.trim() !== '') {
      minimum = parseCents(f.minimum.value);
      if (minimum === null) return { problem: 'minimum' };
    }
    return { name: name, description: tidy(f.description.value), feeCents: fee, minutes: minutes, minimumFeeCents: minimum };
  }

  function nextPosition(parentId) {
    var siblings = standing('price_services').filter(function (s) { return (s.parentId == null ? null : s.parentId) === parentId; });
    return siblings.reduce(function (most, s) { return s.position > most ? s.position : most; }, -1) + 1;
  }

  svcForm.addEventListener('submit', function (e) {
    e.preventDefault();
    var f = serviceFields();
    // The problem now, or none: an earlier try's must not stay on screen while this one is sent.
    showOne(svcForm, 'data-problem', f.problem || '');
    if (f.problem) return;
    var was = editing.data, at = nextAt(was);
    var data = {
      id: was ? was.id : newId(),
      ownerAccountId: me,
      parentId: editing.parentId == null ? null : editing.parentId,
      name: f.name,
      description: f.description,
      feeCents: f.feeCents,
      minutes: f.minutes,
      minimumFeeCents: editing.parentId == null ? f.minimumFeeCents : null,
      position: was ? was.position : nextPosition(editing.parentId == null ? null : editing.parentId),
      createdAt: was ? was.createdAt : at,
      updatedAt: at,
      deletedAt: null,
    };
    finish(svcDialog, [wire('price_services', data)], 'saved');
  });

  $('[data-delete]', svcForm).addEventListener('click', function () {
    var b = $('[data-delete]', svcForm);
    if (b.getAttribute('data-armed') !== '1') { armDelete(svcForm, true); return; }
    var was = editing.data, when = Date.now();
    var gone = function (kind, d) {
      var copy = Object.assign({}, d);
      copy.updatedAt = d.updatedAt >= when ? d.updatedAt + 1 : when;
      copy.deletedAt = when;
      return wire(kind, copy);
    };
    var push = [gone('price_services', was)];
    if (was.parentId == null) {
      addOnsOf(was.id).forEach(function (a) { push.push(gone('price_services', a)); });
      changesOf(was.id).forEach(function (m) { push.push(gone('price_modifiers', m)); });
    }
    finish(svcDialog, push, 'deleted');
  });

  // ---- a discount code -------------------------------------------------------------------------------------------

  var discDialog = $('[data-dialog="discount"]'), discForm = $('[data-form="discount"]');
  var editingDisc = null;

  function kindShown() {
    var kind = discForm.querySelector('input[name="kind"]:checked').value;
    showOne(discForm, 'data-value', kind);
    return kind;
  }
  discForm.addEventListener('change', function (e) {
    if (e.target.name === 'kind') kindShown();
    if (e.target.name === 'all' && e.target.checked) all('input[name="applies"]', discForm).forEach(function (x) { x.checked = false; });
    if (e.target.name === 'applies' && e.target.checked) discForm.elements.all.checked = false;
  });

  function openDiscount(d) {
    editingDisc = d;
    showOne(discForm, 'data-title', d ? 'edit-discount' : 'new-discount');
    discForm.elements.code.value = d ? d.code : '';
    discForm.querySelector('input[name="kind"][value="' + (d ? d.kind : 'percent') + '"]').checked = true;
    kindShown();
    discForm.elements.value.value = !d ? '' : d.kind === 'percent' ? String(d.value / 100) : centsText(d.value);
    var ids = [];
    try { ids = d ? JSON.parse(d.appliesToJson) || [] : []; } catch (e) { ids = []; }
    var box = $('[data-applies]', discForm);
    box.textContent = '';
    services().forEach(function (s) {
      [s].concat(addOnsOf(s.id)).forEach(function (x) {
        var row = tpl('applies'), input = $('input', row);
        input.value = x.id;
        input.checked = ids.indexOf(x.id) >= 0;
        $('[data-v="name"]', row).textContent = x.parentId == null ? x.name : x.name + ' (' + s.name + ')';
        box.appendChild(row);
      });
    });
    discForm.elements.all.checked = ids.length === 0;
    discForm.elements.uses.value = d && d.maxUses != null ? String(d.maxUses) : '';
    var end = d && d.expiresAt != null ? new Date(d.expiresAt) : null;
    discForm.elements.ends.value = end ? end.getFullYear() + '-' + ('0' + (end.getMonth() + 1)).slice(-2) + '-' + ('0' + end.getDate()).slice(-2) : '';
    discForm.elements.active.checked = d ? d.active : true;
    $('[data-delete]', discForm).hidden = !d;
    armDelete(discForm, false);
    showOne(discForm, 'data-problem', '');
    say('');
    discDialog.showModal();
    discForm.elements.code.focus();
  }

  function discountFields() {
    var f = discForm.elements, code = f.code.value.trim();
    if (code === '') return { problem: 'code' };
    if (code.length > 30) return { problem: 'code_long' };
    if (!/^[A-Za-z0-9_-]+$/.test(code)) return { problem: 'code_letters' };
    var except = editingDisc ? editingDisc.id : null;
    var taken = discounts().some(function (d) { return d.id !== except && d.code.trim().toUpperCase() === code.toUpperCase(); });
    if (taken) return { problem: 'code_taken' };
    var kind = kindShown();
    var value = kind === 'percent' ? parsePercent(f.value.value) : parseCents(f.value.value);
    if (value === null) return { problem: 'value' };
    if (kind === 'amount' && value < 1) return { problem: 'amount' };
    var uses = null;
    if (f.uses.value.trim() !== '') {
      if (!/^\d{1,9}$/.test(f.uses.value.trim())) return { problem: 'uses' };
      uses = parseInt(f.uses.value.trim(), 10);
      if (uses < 1) return { problem: 'uses_one' };
    }
    var ends = null, m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(f.ends.value);
    // The end of the chosen day, where the inspector is (as the phone sets it).
    if (m) ends = new Date(+m[1], +m[2] - 1, +m[3], 23, 59, 59).getTime();
    var applies = f.all.checked ? [] : all('input[name="applies"]', discForm).filter(function (x) { return x.checked; }).map(function (x) { return x.value; }).sort();
    return { code: code, kind: kind, value: value, maxUses: uses, expiresAt: ends, active: f.active.checked, appliesTo: applies };
  }

  discForm.addEventListener('submit', function (e) {
    e.preventDefault();
    var f = discountFields();
    showOne(discForm, 'data-problem', f.problem || '');
    if (f.problem) return;
    var was = editingDisc, at = nextAt(was);
    var data = {
      id: was ? was.id : newId(),
      ownerAccountId: me,
      code: f.code,
      kind: f.kind,
      value: f.value,
      appliesToJson: JSON.stringify(f.appliesTo),
      maxUses: f.maxUses,
      expiresAt: f.expiresAt,
      active: f.active,
      createdAt: was ? was.createdAt : at,
      updatedAt: at,
      deletedAt: null,
    };
    finish(discDialog, [wire('price_discounts', data)], 'saved');
  });

  $('[data-delete]', discForm).addEventListener('click', function () {
    var b = $('[data-delete]', discForm);
    if (b.getAttribute('data-armed') !== '1') { armDelete(discForm, true); return; }
    var copy = Object.assign({}, editingDisc), when = Date.now();
    copy.updatedAt = copy.updatedAt >= when ? copy.updatedAt + 1 : when;
    copy.deletedAt = when;
    finish(discDialog, [wire('price_discounts', copy)], 'deleted');
  });

  /* Sends one change; closes its dialog and says so when it is kept, else keeps the dialog open and says why. */
  var busy = false;
  function finish(dialog, push, done) {
    if (busy) return;
    busy = true;
    all('button', dialog).forEach(function (b) { b.disabled = true; });
    send(push).then(function (outcome) {
      busy = false;
      all('button', dialog).forEach(function (b) { b.disabled = false; });
      if (outcome === 'saved') { dialog.close(); say(done); return; }
      say(outcome);
    });
  }

  all('[data-close]').forEach(function (b) { b.addEventListener('click', function () { b.closest('dialog').close(); }); });
  all('[data-add="service"]').forEach(function (b) { b.addEventListener('click', function () { openService(null, null); }); });
  all('[data-add="discount"]').forEach(function (b) { b.addEventListener('click', function () { openDiscount(null); }); });

  // ---- start -----------------------------------------------------------------------------------------------------

  var who = auth.who();
  if (!who) { window.location.replace('/signin'); return; }
  me = who.id;
  main.hidden = false;
  render();
  pull();
  document.addEventListener('visibilitychange', function () { if (document.visibilityState === 'visible') pull(); });
  setInterval(function () { if (document.visibilityState === 'visible') pull(); }, POLL);
})();
