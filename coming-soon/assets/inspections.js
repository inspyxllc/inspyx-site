/* Your inspections, live (2026-11-14, Inspyx 4): the inspector's inspections as their phone has them, kept in step both
   ways. Moises's dashboard interview, answer 6: "Both stay in sync"; a change shows on the other within seconds, and the
   newest change wins when both touch the same thing.
   How: the server keeps one register per field of every inspection (the inspection-sync function, in the app's repo at
   backend/supabase/functions/inspection-sync). This page pulls every field once, then only what changed after its point;
   it sends each edit as one field with the time it was made; and it pulls again whenever the server pings "something
   changed" (InspyxAuth.listen), when the tab comes back into view, and once a minute as a fallback.
   An edit typed here is never overwritten while its box is being typed in: the newest value lands when the box is left.
   Desk finishing (2026-11-16): the cover's city, state, ZIP and booked time (a reschedule), each finding's location and
   who should fix it, and why an item wasn't inspected: every field the phone applies from elsewhere
   (inspection_sync_apply.dart). A booked time travels as the phone keeps it, UTC milliseconds; the box shows it in this
   browser's time zone, to the minute. The start is the phone's alone (write-once there): shown, never sent.
   Renames and Find (2026-11-16): a stop's and an item's names are boxes (the phone applies both from elsewhere); a
   box marked data-required (title, address, a name) is never sent empty. The list is in the phone's day order (its
   start, else its booked time, else when it was made; newest first), each with its day, and Find keeps the ones whose
   title, address or city has what is typed.
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
  var two = function (n) { return (n < 10 ? '0' : '') + n; };
  /* A time box's value ("YYYY-MM-DDTHH:MM", this browser's time) from UTC milliseconds, and back (NaN if malformed). */
  function toBox(ms) { var d = new Date(ms); return d.getFullYear() + '-' + two(d.getMonth() + 1) + '-' + two(d.getDate()) + 'T' + two(d.getHours()) + ':' + two(d.getMinutes()); }
  function fromBox(v) { var m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(v); return m ? new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]).getTime() : NaN; }
  // The date and the time apart: engines join the two differently (Safari writes " at "), so the page joins them itself.
  var DAY = new Intl.DateTimeFormat('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
  var CLOCK = new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit' });

  function chosen() { var h = window.location.hash.slice(1); return /^[A-Za-z0-9_.:-]{1,64}$/.test(h) ? h : null; }

  /* An inspection's day, by the phone's own rule (HomeInspection.day); timed: false when only its making is known. */
  function dayOf(id) {
    var n = function (f) { var v = val('inspection', id, f); return typeof v === 'number' && isFinite(v) ? v : null; };
    var started = n('inspection_at'), booked = n('scheduled_at'), made = n('created_at');
    var at = started !== null ? started : booked !== null ? booked : made;
    return at === null ? null : { at: at, timed: started !== null || booked !== null };
  }

  function renderList() {
    var list = $('[data-list="items"]');
    var ids = parts('inspection').filter(function (id) { return typeof val('inspection', id, 'title') === 'string'; });
    ids.sort(function (a, b) { var da = dayOf(a), db = dayOf(b); return (db ? db.at : 0) - (da ? da.at : 0) || (a < b ? -1 : 1); });
    var q = $('[data-find]').value.toLowerCase().replace(/\s+/g, ' ').trim();
    var them = !q ? ids : ids.filter(function (id) {
      return ['title', 'address', 'city'].some(function (f) { return text(val('inspection', id, f)).toLowerCase().replace(/\s+/g, ' ').indexOf(q) >= 0; });
    });
    show('data-list', ids.length === 0 ? 'empty' : them.length === 0 ? 'nomatch' : 'items');
    $('[data-findbox]').hidden = ids.length === 0;
    list.hidden = them.length === 0;
    list.textContent = '';
    them.forEach(function (id) {
      var row = tpl('row');
      var a = row.querySelector('a'), day = row.querySelector('[data-v="day"]'), d = dayOf(id);
      a.href = '#' + id;
      if (id === chosen()) a.setAttribute('aria-current', 'page');
      row.querySelector('[data-v="title"]').textContent = text(val('inspection', id, 'title'));
      row.querySelector('[data-v="address"]').textContent = text(val('inspection', id, 'address'));
      day.hidden = !d;
      if (d) {
        day.textContent = DAY.format(new Date(d.at)) + (d.timed ? ', ' + CLOCK.format(new Date(d.at)) : '');
        day.setAttribute('datetime', new Date(d.at).toISOString());
      }
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
    // Structure only (ids, order, nesting): a name is a box like any other, filled below, so a rename never
    // rebuilds the page under someone typing.
    var next = JSON.stringify([id, stops.map(function (s) {
      return [s, itemsOf(s).map(function (i) { return [i, findingsOf(i)]; })];
    })]);
    if (next !== shape) {
      var focus = document.activeElement && document.activeElement.getAttribute && document.activeElement.getAttribute('data-key');
      shape = next;
      var box = $('[data-stops]');
      box.textContent = '';
      stops.forEach(function (s) {
        var stop = tpl('stop');
        bind(stop.querySelector('h2'), 'section', s, id);   // its name box only: the items below are bound as items
        var ol = stop.querySelector('.insp-items');
        itemsOf(s).forEach(function (i) {
          var item = tpl('item');
          bind(item, 'item', i, id);
          var fol = item.querySelector('.insp-findings');
          findingsOf(i).forEach(function (f) {
            var finding = tpl('finding');
            bind(finding, 'item', f, id);
            var photos = parts('photo', function (p) { return val('photo', p, 'item_id') === f; }).length;
            var line = finding.querySelector('[data-photos]');
            line.hidden = photos === 0;
            line.querySelector('[data-v="photos"]').textContent = String(photos);
            line.querySelector('[data-v="photos-word"]').textContent = word(photos === 1 ? 'photo-one' : 'photo-many');
            wireAI(finding, f, i, s);
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
      var want = el.getAttribute('data-kind') === 'time' ? (typeof v === 'number' && isFinite(v) ? toBox(v) : '') : v === null || v === undefined ? '' : String(v);
      if (el.value !== want) el.value = want;
    });
    renderPeople(id);
    renderAgreement(id);
    var started = val('inspection', id, 'inspection_at'), line = $('[data-started]');
    line.hidden = !(typeof started === 'number' && isFinite(started));
    if (!line.hidden) { var t = line.querySelector('[data-v="started"]'); t.textContent = DAY.format(new Date(started)) + ', ' + CLOCK.format(new Date(started)); t.setAttribute('datetime', new Date(started).toISOString()); }
    // Why an item wasn't inspected: shown for an item marked so, or one that already has its words.
    all('[data-ni]').forEach(function (label) {
      var box = label.querySelector('[data-key]');
      if (!box) return;
      var k = box.getAttribute('data-key'), status = fields[k.replace(/\.ni_note$/, '.status')];
      label.hidden = !((status && status.value === 'not_inspected') || text(fields[k] && fields[k].value) !== '' || dirty[k]);
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
        if (box.tagName !== 'SELECT' && v === '' && !box.hasAttribute('data-required')) value = null;
        var held = fields[k] ? fields[k].value : null;
        if (box.getAttribute('data-kind') === 'time') {
          value = v === '' ? null : fromBox(v);
          if (value !== null && !isFinite(value)) return;   // half typed: wait for a whole time
          // The box shows minutes; a held time may carry seconds. The same minute is no change.
          if (value !== null && typeof held === 'number' && Math.floor(value / 60000) === Math.floor(held / 60000)) return;
        }
        if ((held === undefined ? null : held) === value) return;
        if (box.hasAttribute('data-required') && !value) return;   // a title, address or name: the phone's always has one
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

  /* The inspection's people, each with a button that opens the inspection as they see it (Client View / Agent View,
     2026-11-24): a new tab at /look, where a one-time ticket is asked for as this inspector (look.js). */
  var ROLES = { client: 'client', buyer_agent: 'agent', listing_agent: 'agent' };
  var word = function (w) { var el = document.querySelector('[data-words] [data-w="' + w + '"]'); return el ? el.textContent : ''; };
  function renderPeople(id) {
    var box = $('[data-people]'), list = $('[data-people-list]');
    var people = parts('person', function (p) { return owner['person/' + p] === id && Object.prototype.hasOwnProperty.call(ROLES, val('person', p, 'role')); }).sort(byPosition('person'));
    var next = JSON.stringify(people.map(function (p) { return [p, val('person', p, 'role'), text(val('person', p, 'name'))]; }));
    box.hidden = people.length === 0;
    if (list.getAttribute('data-shape') === id + next) return;
    list.setAttribute('data-shape', id + next);
    list.textContent = '';
    people.forEach(function (p) {
      var role = val('person', p, 'role'), as = ROLES[role];
      var row = tpl('person');
      row.querySelector('[data-v="name"]').textContent = text(val('person', p, 'name')).trim() || word('noname');
      row.querySelector('[data-v="role"]').textContent = word(role);
      row.querySelector('[data-v="look"]').textContent = word('look-' + as);
      var a = row.querySelector('[data-look]');
      a.setAttribute('href', '/look#i=' + encodeURIComponent(id) + '&as=' + as);
      a.setAttribute('data-as', as);
      list.appendChild(row);
    });
  }

  /* ---- Agreements outdated (2026-11-24, his Spectora list item 10): whether the agreement the client signed still
     says what is true today, and "Send the updated agreement". The signings, what their blanks were filled with
     (signing_details), the fee and the bookings come from the business sync, read only (as calendar.js); the
     inspection's own fields come from this page's inspection sync. The rulebook is agreement-fill.js, the phone's
     agreement_outdated.dart in JS. ---- */
  var Fill = window.InspyxFill;
  var BIZ = { signings: true, signing_details: true, inspection_fees: true, bookings: true };
  var biz = Object.create(null), bizPoint = null, bizPulling = null;
  function pullBusiness() {
    if (bizPulling) return bizPulling;
    var loop = function () {
      return auth.ask('sync', { push: [], after: bizPoint, limit: 500 }, DEADLINE).then(function (r) {
        if (!r || r.status !== 200 || !r.json || !Array.isArray(r.json.rows)) return null;
        r.json.rows.forEach(function (row) {
          if (!row || !BIZ[row.kind] || typeof row.id !== 'string') return;
          var k = row.kind + '/' + row.id, held = biz[k];
          if (!held || row.updated_at >= held.updated_at) biz[k] = row;
        });
        if (r.json.next) bizPoint = r.json.next;
        return r.json.more ? loop() : null;
      });
    };
    bizPulling = loop().then(function () { bizPulling = null; renderOne(); }, function () { bizPulling = null; });
    return bizPulling;
  }
  function bizData(kind) {
    return Object.keys(biz).filter(function (k) { return k.indexOf(kind + '/') === 0; }).map(function (k) { return biz[k]; })
      .filter(function (r) { return r.deleted_at == null && r.data && typeof r.data === 'object'; }).map(function (r) { return r.data; });
  }
  var json = function (v, empty) { try { var o = JSON.parse(v); return o && typeof o === 'object' ? o : empty; } catch (e) { return empty; } };

  /* The inspection's fee as the phone reads it (InspectionFeeStore.feeFor): its newest row, unless that one is deleted. */
  function feeOf(id) {
    var rows = Object.keys(biz).filter(function (k) { return k.indexOf('inspection_fees/') === 0; }).map(function (k) { return biz[k]; })
      .filter(function (r) { return r.data && r.data.inspectionId === id; });
    rows.sort(function (a, b) { return (b.data.updatedAt || 0) - (a.data.updatedAt || 0) || (a.id < b.id ? 1 : -1); });
    var r = rows[0], f = r && r.data;
    if (!f || r.deleted_at != null || f.deletedAt != null || typeof f.totalCents !== 'number') return null;
    var lines = json(f.linesJson, []);
    if (!Array.isArray(lines)) return null;
    return { lines: lines.filter(function (l) { return l && typeof l.name === 'string' && typeof l.cents === 'number'; }),
      totalCents: f.totalCents, byHand: Object.keys(json(f.selectionJson, {})).length === 0 };
  }

  /* What the inspection puts into the blanks today, as the phone's _agreementFacts. */
  function factsOf(id) {
    var clients = parts('person', function (p) { return owner['person/' + p] === id && val('person', p, 'role') === 'client'; }).sort(byPosition('person'));
    var first = function (field) { for (var i = 0; i < clients.length; i++) { var v = Fill.dartTrim(text(val('person', clients[i], field))); if (v) return v; } return ''; };
    var fee = feeOf(id);
    var st = Fill.dartTrim(text(val('inspection', id, 'state')));
    return {
      clientNames: clients.map(function (p) { return text(val('person', p, 'name')); }),
      clientPhone: first('phone'), clientEmail: first('email'),
      street: text(val('inspection', id, 'address')), city: text(val('inspection', id, 'city')),
      state: /^[A-Za-z]{2}$/.test(st) ? st.toUpperCase() : st, zip: text(val('inspection', id, 'zip_code')),
      inspectionDate: null, today: '', feeCents: fee ? fee.totalCents : null,
      services: !fee || fee.byHand ? [] : fee.lines.filter(function (l) { return l.kind !== 'discount' && l.kind !== 'tax'; }).map(function (l) { return l.name; }),
      feeLines: fee ? fee.lines.map(function (l) { return { name: l.name, cents: l.cents }; }) : [],
      inspectorName: '', company: '', licenseNumber: '', companyPhone: '', fee: fee
    };
  }

  /* The inspection's signings: by the id the server copied onto them, or through its booking. */
  function signingsOf(id) {
    var booked = bizData('bookings').filter(function (b) { return b.inspectionId === id; }).map(function (b) { return b.id; });
    return bizData('signings').filter(function (s) { return s.inspectionId === id || booked.indexOf(s.bookingId) >= 0; });
  }

  var agrSaid = null;     // {id, words}: what the last send said, for that inspection
  var agrAsking = null;   // the inspection whose "Send?" is open
  var agrBusy = false;
  function renderAgreement(id) {
    var box = $('[data-agr]');
    if (!Fill) { box.hidden = true; return; }
    var signings = signingsOf(id), details = Object.create(null);
    bizData('signing_details').forEach(function (d) { details[d.id] = d; });
    var facts = factsOf(id);
    var st = Fill.standing(signings, details, facts);
    var said = $('[data-agr-said]');
    said.hidden = !(agrSaid && agrSaid.id === id);
    if (!said.hidden) said.textContent = agrSaid.words;
    box.hidden = st.kind === 'holds' && said.hidden;
    show('data-agr-state', st.kind);
    if (st.kind !== 'outdated') return;
    box.setAttribute('data-signing', st.signing.id);
    var list = $('[data-agr-changes]'), shape = JSON.stringify(st.changes);
    if (list.getAttribute('data-shape') !== shape) {
      list.setAttribute('data-shape', shape);
      list.textContent = '';
      var shown = function (v) { return Fill.dartTrim(v) === '' ? word('agr-none') : Fill.dartTrim(v).replace(/\n/g, '; '); };
      st.changes.forEach(function (c) {
        var li = document.createElement('li');
        var name = document.createElement('strong'); name.textContent = word('agr-' + c.blank) + ':';
        var was = document.createElement('s'); was.textContent = shown(c.was);
        var now = document.createElement('b'); now.textContent = shown(c.now);
        li.setAttribute('data-blank', c.blank);
        li.append(name, ' ', was, ' → ', now);
        list.appendChild(li);
      });
    }
    // No price on record, or one taken off: an updated agreement carries the price, and none would send it as zero
    // (Codex on #89), whatever else changed.
    var needsFee = !facts.fee || st.changes.some(function (c) { return (c.blank === 'fee' || c.blank === 'feeLines') && Fill.dartTrim(c.now) === ''; });
    $('[data-agr-needsfee]').hidden = !needsFee;
    var send = $('[data-agr-send]');
    send.hidden = needsFee || agrAsking === id;
    send.disabled = agrBusy;
    $('[data-agr-ask]').hidden = needsFee || agrAsking !== id;
  }

  /* The booking function's request, as the phone's agreementUpdateBody: the same facts the banner compared. */
  function updateBody(signingId, f) {
    var orNull = function (v) { v = Fill.dartTrim(v || ''); return v === '' ? null : v; };
    var KIND = { service: 'service', addOn: 'add_on', discount: 'discount', tax: 'tax' };
    return {
      action: 'agreement_update', signing_id: signingId,
      details: {
        client: { name: orNull(Fill.valueOf('clientName', f)), email: orNull(f.clientEmail), phone: orNull(f.clientPhone) },
        property: { street: orNull(f.street), unit: null, city: orNull(f.city), state: orNull(f.state), zip: orNull(f.zip) }
      },
      lines: f.fee ? f.fee.lines.filter(function (l) { return Fill.dartTrim(l.name) !== ''; }).map(function (l) {
        return { kind: f.fee.byHand ? 'by_hand' : (KIND[l.kind] || 'service'), name: Fill.dartTrim(l.name), cents: l.cents };
      }) : [],
      totalCents: f.fee ? f.fee.totalCents : 0
    };
  }
  /* The answer, as the phone's agreementUpdateOutcome. */
  function outcome(r) {
    var j = r && r.json, err = j && j.error;
    if (r && r.status === 200 && j && j.state === 'sent') {
      return j.email === 'queued' || j.email === 'already' || j.email === undefined || j.email === null ? 'sent'
        : j.email === 'held' ? 'held' : j.email === 'no_address' ? 'no_address' : 'email_failed';
    }
    if (r && r.status === 409 && err === 'agreement') return 'no_agreement';
    if (r && (r.status === 409 || (r.status === 404 && err === 'signing'))) return 'refused';
    if (r && r.status === 400 && err === 'details') return 'details';
    return 'failed';
  }
  $('[data-agr-send]').addEventListener('click', function () { agrAsking = chosen(); renderOne(); var go = $('[data-agr-go]'); if (go) go.focus(); });
  $('[data-agr-no]').addEventListener('click', function () { agrAsking = null; renderOne(); });
  $('[data-agr-go]').addEventListener('click', function () {
    var id = chosen(), signing = $('[data-agr]').getAttribute('data-signing');
    if (!id || !signing || agrBusy) return;
    agrAsking = null; agrBusy = true;
    agrSaid = { id: id, words: word('agr-sending') }; renderOne();
    auth.ask('booking', updateBody(signing, factsOf(id)), DEADLINE).then(outcome, function () { return 'failed'; }).then(function (o) {
      agrBusy = false;
      agrSaid = { id: id, words: word('agr-' + o) };
      renderOne();
      pullBusiness();
    });
  });

  /* ---- Edit with AI (2026-11-24, his decision after the Spectora walk; the relay's contract EDIT_WITH_AI.md v1):
     Spex's version of one finding's details, shown beside the inspector's with Keep or Discard. Nothing changes
     without Keep, and Keep only fills the Details box, which then saves as typing does. The button shows only when the
     relay says this inspector may use it ("edit": true); asking is a hello alone, never billed. The sign-in stays in
     auth.js (InspyxAuth.editFinding). ---- */
  var RELAY = 'wss://chat---spex-relay-yu5bdad2fa-uc.a.run.app/';
  var aiOpen = null;   // null: not known yet; true or false once the relay answered
  function checkAI() {
    if (aiOpen !== null || typeof auth.editFinding !== 'function') return;
    aiOpen = false;
    auth.editFinding(null, RELAY).then(function (a) {
      aiOpen = !!(a && a.admitted);
      all('[data-ai]').forEach(function (el) { el.hidden = !aiOpen; });
    }, function () { aiOpen = null; });   // unreachable: asked again on the next visit
  }
  var cut = function (v, n) { v = Fill ? Fill.dartTrim(text(v)) : text(v).trim(); return v.length > n ? v.slice(0, n) : v; };
  function wireAI(el, finding, item, stop) {
    var box = el.querySelector('[data-ai]'), details = el.querySelector('[data-details]');
    var q = function (sel) { return box.querySelector(sel); };
    box.hidden = aiOpen !== true;
    var shown = function (which) {
      q('[data-ai-actions]').hidden = which !== 'actions';
      q('[data-ai-working]').hidden = which !== 'working';
      q('[data-ai-version]').hidden = which !== 'version';
      q('[data-ai-error]').hidden = which !== 'error';
      q('[data-ai-open]').setAttribute('aria-expanded', which === 'actions' ? 'true' : 'false');
      q('[data-ai-open]').disabled = which === 'working';
      details.disabled = which === 'working';   // no half-applied text while Spex works
    };
    q('[data-ai-open]').addEventListener('click', function () { shown(q('[data-ai-actions]').hidden ? 'actions' : 'none'); });
    all('[data-ai-action]', box).forEach(function (b) {
      b.addEventListener('click', function () {
        var title = el.querySelector('[data-field="finding_title"]');
        var request = { action: b.getAttribute('data-ai-action'),
          title: cut(title ? title.value : val('item', finding, 'finding_title'), 200), text: cut(details.value, 4000) };
        var itemName = cut(val('item', item, 'label'), 100), stopName = cut(val('section', stop, 'name'), 100);
        if (itemName) request.item = itemName;
        if (stopName) request.stop = stopName;
        var asked = details.value;
        shown('working');
        auth.editFinding(request, RELAY).then(function (a) {
          if (a && typeof a.text === 'string') {
            if (details.value !== asked) { shown('none'); return; }   // the details changed meanwhile: nothing to offer
            q('[data-ai-text]').textContent = a.text;
            box.setAttribute('data-for', asked);
            return shown('version');
          }
          q('[data-ai-error]').textContent = a && typeof a.error === 'string' && a.error ? a.error : word('ai-unreachable');
          shown('error');
        }, function () { q('[data-ai-error]').textContent = word('ai-unreachable'); shown('error'); });
      });
    });
    q('[data-ai-keep]').addEventListener('click', function () {
      // Only over the words Spex was given: details changed since are never overwritten.
      if (details.value !== box.getAttribute('data-for')) { shown('none'); return; }
      details.value = q('[data-ai-text]').textContent;
      shown('none');
      details.dispatchEvent(new Event('input', { bubbles: true }));
      details.dispatchEvent(new Event('blur'));
      details.focus();
    });
    q('[data-ai-discard]').addEventListener('click', function () { shown('none'); });
  }

  function render() { renderList(); renderOne(); }

  var listening = false;
  function showLive(which) { show('data-live', which); }

  window.addEventListener('hashchange', function () { shape = null; render(); });
  var finding = null;
  $('[data-find]').addEventListener('input', function () { clearTimeout(finding); finding = setTimeout(renderList, 120); });
  document.addEventListener('visibilitychange', function () { if (document.visibilityState === 'visible') { sync(); pullBusiness(); } });
  // The business pull rides the same clock (Codex on inspyx-site #89): a fee changed on the phone or an updated
  // agreement signed reaches an open tab within a minute, never only on a tab switch. It asks from where it left off.
  setInterval(function () { if (document.visibilityState === 'visible') { sync(); pullBusiness(); } }, FALLBACK);

  if (!auth.who()) { window.location.replace('/signin'); return; }
  main.hidden = false;
  auth.listen(function (ping) {
    if (ping && ping.signedOut) { window.location.replace('/signin'); return; }
    if (ping && ping.joined) { listening = true; showLive('live'); }
    else pullBusiness();
    sync();
  });
  sync();
  pullBusiness();
  checkAI();
})();
