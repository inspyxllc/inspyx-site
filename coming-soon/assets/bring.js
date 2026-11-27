/* Bring your business to Inspyx (/bring-business, 2026-11-27, the web half; the app's screen is I2's #805, and every
   word on the page is the app's own, in words.md). ONE box for the key the old platform gave (Spectora's API key, or
   ISN's access key, secret key and page address in any order), read by the app's own rules (inspyxImport.pastedKey);
   or a file. Then ONE preview of everything found, and nothing is kept before Bring in.
   - Spectora is read through the spectora-import function (the key in the request's body only; forgotten after);
     ISN waits for isn-import: until it is live the page says to use the app.
   - What is found is planned by the phone's own planners (inspyxImport.spectora / contacts / inspections), the people
     first and the past inspections against People as it would be after them, so nobody is planned twice.
   - Never from a People it couldn't read whole: People and the kept past inspections are read again, and everything
     planned again, right before anything is kept. Past inspections are kept first (under one import id), then people;
     Undo takes back both, as the import pages do (people-import.js, whose rules this follows).
   This file says no words: the page holds every one. */
(function () {
  'use strict';
  var auth = window.InspyxAuth, book = window.InspyxPeopleBook, CI = window.InspyxContactsImport;
  var pastBook = window.InspyxPastBook, PS = window.InspyxPastStore, priceBook = window.InspyxPriceBook;
  var main = document.querySelector('[data-br]');
  if (!auth || !book || !CI || !pastBook || !PS || !priceBook || !main) return;
  var DAY = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  /* A past inspection's day as the dashboard says it ("Nov 3, 2026"); a day the file wrote its own way stays so. */
  function dayText(d) {
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(d || '');
    return m ? DAY.format(new Date(+m[1], +m[2] - 1, +m[3])) : d;
  }
  var MONEY = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });
  var MAX = 10 * 1024 * 1024, BATCH = 200, SHOWN = 8, LIMIT = 100, ASK_DEADLINE = 60000;
  var ISN_WEB = false;   // isn-import live: then ISN keys are read here too
  var STAND_IN = '00000000-0000-0000-0000-000000000000';
  var $ = function (sel) { return main.querySelector(sel); };
  var words = (function () {
    var box = document.querySelector('template[data-t="words"]').content;
    return function (key, fill) {
      var w = box.querySelector('[data-w="' + key + '"]'), text = w ? w.textContent : '';
      Object.keys(fill || {}).forEach(function (k) { text = text.split('{' + k + '}').join(String(fill[k])); });
      return text;
    };
  })();
  var plural = function (key, n, fill) { return words(key + (n === 1 ? '-1' : '-n'), Object.assign({ n: n }, fill || {})); };
  function el(tag, cls, text) { var e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }
  function say(key, fill, text) { var p = $('[data-say]'); p.hidden = !key && !text; p.textContent = text || (key ? words(key, fill) : ''); p.setAttribute('data-said', key || (text ? 'text' : '')); }
  var sleep = function (ms) { return new Promise(function (ok) { setTimeout(ok, ms); }); };
  var parse = function (t) { return typeof t === 'string' ? JSON.parse(t) : t; };

  /* What was found, as the planners take it: from Spectora { platform, clients, agents, records, cuts } or a file
     { file: {name, bytes}, kind: 'clients' | 'agents' | 'past' }. The key is never kept here. */
  var source = null;
  var plan = null;       // the last plan shown (counts), for Bring in to compare
  var done = null;       // { people: changes[], past: { importId, n } | null } for Undo
  var busy = false, picked = 0;

  /* ---- People, as the planners take it ---- */
  function existingOf(rows) {
    return rows.map(function (r) {
      var d = r.data || {};
      return { id: r.id, name: d.name, role: d.role, phone: d.phone == null ? null : d.phone, email: d.email == null ? null : d.email,
        company: d.company == null ? null : d.company, note: d.note == null ? null : d.note,
        deleted_at: r.deleted_at != null ? r.deleted_at : (d.deletedAt == null ? null : d.deletedAt) };
    });
  }
  /* [rows] with [push] written over them (by id), as People would be once they are kept. */
  function merged(rows, push) {
    var byId = {}, order = [];
    rows.forEach(function (r) { byId[r.id] = r; order.push(r.id); });
    push.forEach(function (r) { if (!byId[r.id]) order.push(r.id); byId[r.id] = r; });
    return order.map(function (id) { return byId[id]; });
  }
  function fresh() {
    var books = [book, pastBook, priceBook];
    return Promise.all(books.map(function (b) { return Promise.resolve(b.pull()); })).then(function () {
      return books.every(function (b) { return b.loaded() && !b.failing(); });
    });
  }
  /* The price list's standing services: their names (any case is the same service) and the next place on the list. */
  function standingPrices() {
    return priceBook.rows().filter(function (r) { return r.deleted_at == null && r.data && r.data.deletedAt == null; }).map(function (r) { return r.data; });
  }
  /* The rows the price list keeps for [lines] (price_list_store.dart's insertService, as Prices writes a new one): a
     service of its own, no minimum or tax, after the ones there. */
  function priceRows(lines, me, now, newId) {
    var top = standingPrices().filter(function (s) { return s.parentId == null; });
    var place = top.reduce(function (m, s) { return Math.max(m, typeof s.position === 'number' ? s.position : -1); }, -1);
    return lines.map(function (p) {
      var data = { id: newId(), ownerAccountId: me, parentId: null, name: p.name, description: p.description == null ? null : p.description,
        feeCents: p.fee_cents, minutes: p.minutes, minimumFeeCents: null, taxName: null, taxRate: null, position: ++place,
        createdAt: now, updatedAt: now, deletedAt: null };
      return { kind: 'price_services', id: data.id, updated_at: now, deleted_at: null, data: data };
    });
  }

  /* The whole plan, from what was found and People and the kept past inspections now: the people first, then the past
     inspections planned against People as it would be after them. [newId] makes the ids (stand-ins for the preview). */
  function planAll(newId, importId) {
    var me = (auth.who() || {}).id || STAND_IN, now = Date.now(), imp = window.inspyxImport;
    var rows = book.rows(), past = PS.keptForReader(pastBook.rows(), me);
    var people = { push: [], changes: [], plan: [] }, left = [], history = null, cuts = [];
    var runPeople = function () {
      if (source.file && source.kind === 'past') return null;
      var r = source.file
        ? parse(imp.contacts(source.file.name, source.file.bytes, { kind: source.kind, existing: existingOf(rows) }))
        : parse(imp.spectora('people', { clients: source.clients, agents: source.agents, clients_cut: source.cuts.clients, agents_cut: source.cuts.agents }, { existing: existingOf(rows) }));
      return r;
    };
    var r1 = runPeople();
    if (r1 && r1.status !== 'ok') return { refused: r1.message };
    if (r1) {
      var a = CI.applyPlan(rows, r1.plan || [], me, now, newId);
      people = { push: a.push, changes: a.changes, plan: r1.plan || [] };
      left = left.concat(r1.skipped || []);
      if (r1.cut && r1.cut_message) cuts.push(r1.cut_message);
      rows = merged(rows, a.push);
    }
    if (source.file ? source.kind === 'past' : true) {
      var r2 = source.file
        ? parse(imp.inspections(source.file.name, source.file.bytes, { existing: existingOf(rows), existing_past: past }))
        : parse(imp.spectora('inspections', { records: source.records, cut: source.cuts.records }, { existing: existingOf(rows), existing_past: past }));
      if (r2.status !== 'ok') { if (!r1) return { refused: r2.message }; }
      else {
        var b = CI.applyPlan(rows, (r2.people && r2.people.plan) || [], me, now, newId);
        people.push = people.push.concat(b.push); people.changes = people.changes.concat(b.changes);
        people.plan = people.plan.concat((r2.people && r2.people.plan) || []);
        left = left.concat(r2.skipped || []).concat((r2.people && r2.people.skipped) || []);
        // A file past the reader's limit is read to there, and says so (Codex on #133): never cut quietly.
        if (r2.cut && r2.cut_message) cuts.push(r2.cut_message);
        history = PS.newRows(r2.inspections || [], me, now, newId, importId);
        history.read = r2.inspections || [];
      }
    }
    var prices = { push: [], lines: [] };
    if (!source.file && source.services) {
      var r3 = parse(imp.spectora('prices', { records: source.services, cut: source.cuts.services }, { existing_prices: standingPrices().map(function (s) { return s.name; }) }));
      if (r3.status === 'ok') {
        prices = { push: priceRows(r3.prices || [], me, now, newId), lines: r3.prices || [] };
        left = left.concat(r3.skipped || []);
      }
    }
    return { people: people, history: history, prices: prices, left: left, cuts: cuts };
  }

  /* ---- the preview ---- */
  function shown(p) {
    $('[data-preview]').hidden = false;
    $('[data-found]').textContent = source.file ? words('found-file', { file: source.file.name }) : words('found', { platform: source.platform });
    var roles = { clients: 0, agents: 0 };
    p.people.changes.forEach(function (c) {
      var row = p.people.push.filter(function (r) { return r.id === c.id; })[0], role = row && row.data && row.data.role;
      if (role === 'client') roles.clients++; else roles.agents++;
    });
    $('[data-count-people]').textContent = words('people-count', { clients: roles.clients, agents: roles.agents,
      clientsWord: words(roles.clients === 1 ? 'client-1' : 'client-n'), agentsWord: words(roles.agents === 1 ? 'agent-1' : 'agent-n') });
    var lp = $('[data-list-people]'); lp.textContent = '';
    p.people.changes.slice(0, SHOWN).forEach(function (c) { lp.appendChild(el('li', null, c.name)); });
    var pastN = p.history ? p.history.push.length : 0;
    $('[data-count-past]').textContent = pastN ? plural('past', pastN) : words('none-here');
    var lpa = $('[data-list-past]'); lpa.textContent = '';
    (p.history ? p.history.push : []).slice(0, SHOWN).forEach(function (r) {
      var d = r.data || {}; lpa.appendChild(el('li', null, [dayText(d.date) || d.dateInFile, d.address].filter(Boolean).join(' · ')));
    });
    var priceN = p.prices.push.length, pc = $('[data-card="prices"]');
    pc.classList.toggle('is-later', !!source.file);
    $('[data-count-prices]').textContent = source.file ? words('prices-file') : priceN ? plural('prices', priceN) : words('none-here');
    var lpr = $('[data-list-prices]'); lpr.textContent = '';
    p.prices.lines.slice(0, SHOWN).forEach(function (x) { lpr.appendChild(el('li', null, x.name + ' · ' + MONEY.format(x.fee_cents / 100))); });
    var left = p.left.concat(p.history ? p.history.problems.map(function (x) { return { line: x.line, reason: x.problem }; }) : []);
    var cutNote = $('[data-cut]'); cutNote.hidden = !p.cuts.length; cutNote.textContent = p.cuts.join(' ');
    var det = $('[data-left]'); det.hidden = !left.length;
    if (left.length) {
      $('[data-left-n]').textContent = plural('left', left.length);
      var ul = $('[data-left-list]'); ul.textContent = '';
      left.slice(0, 200).forEach(function (x) { ul.appendChild(el('li', null, x.where ? words('where', x) : words('line', x))); });
    }
    var n = p.people.push.length + pastN + priceN;
    var go = $('[data-go]'); go.textContent = n ? words('bring-n', { n: n }) : words('bring-0'); go.disabled = busy;
    go.setAttribute('data-n', String(n));
    plan = { n: n, sig: signature(p) };
  }
  /* What a plan would change, without its new ids and times: who gets added, filled (with what) or brought back, which
     past inspections, which services at what price. Bring in keeps only a plan that says exactly what was shown (Codex
     on #133: the same total can be other changes). */
  function signature(p) {
    var person = function (e) { return [e.action, e.action === 'new' ? null : e.id, e.row ? [e.row.role, e.row.name, e.row.phone, e.row.email, e.row.company, e.row.note] : null, e.fills || null]; };
    var day = function (r) { var d = r.data || {}; return [d.date, d.dateInFile, d.address, d.client, d.reference, d.feeCents]; };
    return JSON.stringify({
      people: p.people.plan.filter(function (e) { return e.action !== 'unchanged'; }).map(person),
      past: (p.history ? p.history.push : []).map(day),
      prices: p.prices.lines.map(function (x) { return [x.name, x.fee_cents, x.minutes, x.description]; }),
    });
  }
  function preview() {
    var mine = picked;
    say(null);
    return fresh().then(function (ok) {
      if (mine !== picked) return;
      if (!ok) { say('no-people'); return; }
      var p = planAll(function () { return STAND_IN + Math.random(); }, STAND_IN);
      if (p.refused) { say(null, null, p.refused); return; }
      shown(p);
    }).catch(function () { if (mine === picked) say('failed'); });
  }

  /* ---- the key box: only what he typed or pasted is ever sent (people-import.js's rule: a browser's autofill once put
     his saved password in such a box) ---- */
  var keyBox = $('[data-key]'), keyHis = '', keyTainted = false, pasted = null;
  var HIS = /^(insertText|insertFromPaste|insertFromDrop|insertFromYank|insertCompositionText|insertLineBreak|delete|historyUndo|historyRedo)/;
  function keyClear() { keyBox.value = ''; keyHis = ''; keyTainted = false; seen(); }
  function keyAutofilled() {
    var auto = false;
    try { auto = keyBox.matches(':autofill'); } catch (e) { try { auto = keyBox.matches(':-webkit-autofill'); } catch (e2) { auto = false; } }
    return auto || keyTainted || keyBox.value !== keyHis;
  }
  /* What the box holds, said under it as he pastes: what Inspyx sees, or what is missing (the app's words). */
  function seen() {
    var line = $('[data-sees]'), check = $('[data-check]');
    pasted = null;
    if (!keyBox.value.trim()) { line.textContent = ''; line.removeAttribute('data-kind'); check.disabled = true; return; }
    var k = null;
    try { k = parse(window.inspyxImport.pastedKey(keyBox.value)); } catch (e) { k = null; }
    if (!k) { line.textContent = ''; check.disabled = true; return; }
    line.setAttribute('data-kind', k.kind);
    if (k.kind === 'spectora') { line.textContent = words('sees-spectora'); pasted = k; }
    else if (k.kind === 'isn') { line.textContent = words('sees-isn', { company: k.company_key }) + (ISN_WEB ? '' : ' ' + words('isn-later')); pasted = ISN_WEB ? k : null; }
    else line.textContent = k.message;
    check.disabled = !pasted || busy;
  }
  keyBox.addEventListener('beforeinput', function (e) {
    if (!e.isTrusted) return;
    var all = keyBox.selectionStart === 0 && keyBox.selectionEnd === keyBox.value.length;
    if (keyBox.value !== keyHis && !all) keyTainted = true;
    else if (all) keyTainted = false;
  });
  keyBox.addEventListener('input', function (e) {
    if (e.isTrusted && typeof e.inputType === 'string' && HIS.test(e.inputType)) { keyHis = keyBox.value; if (keyBox.value === '') keyTainted = false; }
    seen();
  });
  keyClear();
  setTimeout(function () { if (keyBox.value !== keyHis) keyClear(); }, 400);
  window.addEventListener('pageshow', keyClear);
  window.addEventListener('pagehide', keyClear);

  /* ---- read Spectora: every page of each list, waiting or stopping as the app does ---- */
  function readList(key, what, got, mine) {
    var list = what === 'inspections' ? 'records' : what, before = null;
    var reading = what === 'inspections' ? 'reading-past' : what === 'services' ? 'reading-prices' : 'reading-people';
    var page = function (n, attempt) {
      var body = { key: key, what: what, page: n };
      if (before) body.before = before;
      return auth.ask('spectora-import', body, ASK_DEADLINE).then(function (r) {
        if (r === null) { window.location.replace('/signin'); return { over: true }; }
        return r.json && typeof r.json === 'object' ? (r.status === 429 ? { refused: 'hour_full' } : r.json) : {};
      }, function () { return { refused: 'no_signal' }; }).then(function (a) {
        if (mine !== picked || a.over) return { over: true };
        if (Array.isArray(a.records)) {
          got[list] = got[list].concat(a.records);
          say(reading);
          if (what === 'inspections' && !before && typeof a.before === 'string') before = a.before;
          if (a.cut === true) { got.cuts[list] = true; return null; }
          if (a.has_next === true) { if (n >= LIMIT) { got.cuts[list] = true; return null; } return page(n + 1, 0); }
          return null;
        }
        if (a.refused === 'hour_full') return { message: words('spx-hour_full') };
        var step = {};
        try { step = JSON.parse(window.inspyxImport.spectoraStep(a, attempt)); } catch (e) { step = {}; }
        if (typeof step.wait_seconds === 'number' && step.wait_seconds >= 0) {
          say(null, null, plural('wait', Math.ceil(step.wait_seconds)));
          return sleep(step.wait_seconds * 1000).then(function () { return mine !== picked ? { over: true } : page(n, attempt + 1); });
        }
        got.cuts[list] = true;
        // The first answer says the key is no good: the app's own words, with the ISN hint (spectoraKeyRefused).
        if (a.refused === 'bad_key' && n === 1 && !got.clients.length) return { message: words('spx-bad_key'), bad: true };
        return { message: typeof step.message === 'string' && step.message ? step.message : words('failed') };
      });
    };
    return page(1, 0);
  }
  function lockKey(on) { keyBox.disabled = on; $('[data-check]').disabled = on || !pasted; $('[data-stop]').hidden = !on; }
  $('[data-stop]').addEventListener('click', function () { picked++; lockKey(false); keyClear(); say('stopped'); });
  $('[data-key-form]').addEventListener('submit', function (e) {
    e.preventDefault();
    if (busy || !pasted) return;
    if (keyAutofilled()) { keyClear(); say('autofilled'); keyBox.focus(); return; }
    var key = pasted.key;
    done = null; $('[data-done]').hidden = true; $('[data-preview]').hidden = true; source = null;
    var mine = ++picked;
    var got = { platform: 'Spectora', clients: [], agents: [], records: [], services: [], cuts: { clients: false, agents: false, records: false, services: false } };
    say('checking'); lockKey(true);
    var whats = ['clients', 'agents', 'inspections', 'services'];
    var next = function (i) {
      if (i >= whats.length) return Promise.resolve(null);
      return readList(key, whats[i], got, mine).then(function (end) { return end ? end : next(i + 1); });
    };
    next(0).catch(function () { return { message: words('failed') }; }).then(function (end) {
      key = '';
      if (mine !== picked || (end && end.over)) return;
      keyClear(); lockKey(false);
      var any = got.clients.length + got.agents.length + got.records.length + got.services.length;
      if (end && end.message && (!any || end.bad)) { say(null, null, end.message); return; }
      source = got;
      return preview().then(function () { if (end && end.message) say(null, null, end.message); });
    });
  });

  /* ---- a file: what it holds is his to say (clients, agents or past inspections), then it is read ---- */
  var pendingFile = null;
  function take(f) {
    if (!f || busy) return;
    var mine = ++picked;
    done = null; $('[data-done]').hidden = true; $('[data-preview]').hidden = true; source = null;
    if (f.size > MAX) { say('too-big'); return; }
    say('reading-file');
    var reader = new FileReader();
    reader.onload = function () {
      if (mine !== picked) return;
      pendingFile = { name: f.name, bytes: new Uint8Array(reader.result) };
      say(null);
      $('[data-file-name]').textContent = f.name;
      [].slice.call(main.querySelectorAll('[data-fk]')).forEach(function (b) { b.classList.remove('is-on'); b.setAttribute('aria-checked', 'false'); });
      $('[data-file-kind]').hidden = false;
    };
    reader.onerror = function () { if (mine === picked) say('failed'); };
    reader.readAsArrayBuffer(f);
  }
  $('[data-pick]').addEventListener('change', function (e) { take(e.target.files && e.target.files[0]); e.target.value = ''; });
  var drop = $('[data-drop]');
  drop.addEventListener('dragover', function (e) { e.preventDefault(); drop.classList.add('is-over'); });
  drop.addEventListener('dragleave', function () { drop.classList.remove('is-over'); });
  drop.addEventListener('drop', function (e) { e.preventDefault(); drop.classList.remove('is-over'); take(e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0]); });
  main.addEventListener('click', function (e) {
    var fk = e.target.closest('[data-fk]');
    if (fk && pendingFile && !busy) {
      [].slice.call(main.querySelectorAll('[data-fk]')).forEach(function (b) { var on = b === fk; b.classList.toggle('is-on', on); b.setAttribute('aria-checked', on ? 'true' : 'false'); });
      ++picked; done = null; $('[data-done]').hidden = true;
      source = { file: pendingFile, kind: fk.getAttribute('data-fk') };
      preview();
      return;
    }
    var tab = e.target.closest('[data-tab]');
    if (tab) {
      var which = tab.getAttribute('data-tab');
      [].slice.call(main.querySelectorAll('[data-tab]')).forEach(function (b) { var on = b === tab; b.classList.toggle('is-on', on); b.setAttribute('aria-selected', on ? 'true' : 'false'); });
      [].slice.call(main.querySelectorAll('[data-tab-pane]')).forEach(function (p) { p.hidden = p.getAttribute('data-tab-pane') !== which; });
    }
  });

  /* ---- Bring in: read everything again, plan again, keep the past inspections then the people ---- */
  function sendAll(push, bk, progress) {
    var kept = [], at = 0;
    var next = function () {
      if (at >= push.length) return Promise.resolve({ kept: kept, broke: false });
      var part = [], bytes = 0;
      while (at + part.length < push.length && part.length < BATCH) {
        var size = JSON.stringify(push[at + part.length]).length;
        if (part.length && bytes + size > 2000000) break;
        part.push(push[at + part.length]); bytes += size;
      }
      return bk.send(part).then(function (a) {
        if (!a) return { kept: kept, broke: true };
        kept = kept.concat(a.kept); at += part.length;
        if (progress) progress(at);
        return next();
      });
    };
    return next();
  }
  /* After a batch whose answer was lost (it may have been kept): the rows of [push] the server now holds as sent, read
     again from it (Codex on #133). Their Undo is kept, and nothing kept is said to be unchanged. */
  function landed(push, bk) {
    if (!push.length) return Promise.resolve([]);
    return Promise.resolve(bk.pull()).then(function () {
      var held = {}; bk.rows().forEach(function (r) { held[r.id] = r; });
      return push.filter(function (r) { var h = held[r.id]; return h && h.updated_at === r.updated_at; }).map(function (r) { return r.id; });
    }, function () { return []; });
  }
  /* sendAll, then, if a batch's answer was lost, what landed anyway counted as kept. */
  function sendSure(push, bk, progress) {
    return sendAll(push, bk, progress).then(function (r) {
      if (!r.broke) return r;
      return landed(push, bk).then(function (ids) {
        var all = {}; r.kept.concat(ids).forEach(function (id) { all[id] = true; });
        return { kept: Object.keys(all), broke: true };
      });
    });
  }
  function lock(on) {
    busy = on;
    [].slice.call(main.querySelectorAll('button, textarea, input')).forEach(function (b) { b.disabled = on; });
    if (!on) { seen(); keyBox.disabled = false; }
  }
  function finished(people, past, nothing, prices, refused) {
    $('[data-preview]').hidden = true; say(null);
    var ul = $('[data-done-list]'); ul.textContent = '';
    if (nothing) ul.appendChild(el('li', null, words('done-nothing')));
    if (people) ul.appendChild(el('li', null, plural('done-people', people)));
    if (past) ul.appendChild(el('li', null, plural('done-past', past)));
    if (prices) ul.appendChild(el('li', null, plural('done-prices', prices)));
    // What the server kept out (a change from the phone was newer: Codex on #133): said, never passed off as done.
    if (refused) ul.appendChild(el('li', 'br-refused', plural('refused', refused)));
    $('[data-done]').hidden = false;
    $('[data-undo]').hidden = !(done && ((done.people && done.people.length) || done.past || (done.prices && done.prices.length)));
  }
  $('[data-go]').addEventListener('click', function () {
    if (busy || !source || !plan) return;
    var me = auth.who().id, mine = picked;
    lock(true);
    fresh().then(function (ok) {
      if (!ok) { say('no-people'); return; }
      var p = planAll(function () { return window.crypto.randomUUID(); }, window.crypto.randomUUID());
      if (p.refused) { say(null, null, p.refused); return; }
      var n = p.people.push.length + (p.history ? p.history.push.length : 0) + p.prices.push.length;
      // What he saw is not what would be kept now (People changed meanwhile): shown again, nothing kept.
      if (n !== plan.n || signature(p) !== plan.sig) { shown(p); return; }
      if (!n) { done = null; finished(0, 0, true); return; }
      done = { people: [], past: null, prices: [] };
      var past = p.history && p.history.push.length ? p.history.push : [];
      var all = n;
      say('bringing', { done: 0, n: all });
      return sendSure(past, pastBook, function (k) { say('bringing', { done: k, n: all }); }).then(function (pr) {
        if (past.length && pr.kept.length) done.past = { importId: past[0].data.importId, n: pr.kept.length };
        if (pr.broke) { if (pr.kept.length) finished(0, pr.kept.length, false, 0); say('failed'); return; }
        return sendSure(p.people.push, book, function (k) { say('bringing', { done: pr.kept.length + k, n: all }); }).then(function (res) {
          var keptSet = {}; res.kept.forEach(function (id) { keptSet[id] = true; });
          done.people = p.people.changes.filter(function (c) { return keptSet[c.id]; });
          if (res.broke) { finished(done.people.length, done.past ? done.past.n : 0, false, 0); say('failed'); return; }
          var keptSoFar = pr.kept.length + res.kept.length;
          var refused = (past.length - pr.kept.length) + (p.people.push.length - res.kept.length);
          return sendSure(p.prices.push, priceBook, function (k) { say('bringing', { done: keptSoFar + k, n: all }); }).then(function (rp) {
            done.prices = rp.kept;
            if (!rp.broke) refused += p.prices.push.length - rp.kept.length;
            finished(done.people.length, done.past ? done.past.n : 0, false, done.prices.length, refused);
            if (rp.broke) say('failed');
          });
        });
      });
    }).catch(function () { say('failed'); }).then(function () { if (mine === picked) lock(false); });
  });

  /* ---- Undo: the past inspections of this import deleted, the people put back as they were ---- */
  $('[data-undo]').addEventListener('click', function () {
    if (busy || !done) return;
    var me = auth.who().id;
    lock(true); say('undoing');
    fresh().then(function (ok) {
      if (!ok) { say('undo-failed'); return; }
      return (done.prices && done.prices.length ? priceBook.mark(done.prices, true) : Promise.resolve({ outcome: 'saved', kept: [] })).then(function (pm) {
        if (done.prices && done.prices.length) {
          done.prices = done.prices.filter(function (id) { return pm.kept.indexOf(id) < 0; });
          if (done.prices.length) { say('undo-failed'); return; }
        }
      var pastUndo = done.past ? sendAll(PS.undoImport(pastBook.rows(), done.past.importId, me, Date.now()), pastBook) : Promise.resolve({ kept: [], broke: false });
      return pastUndo.then(function (pr) {
        if (done.past) {
          var still = PS.undoImport(pastBook.rows(), done.past.importId, me, Date.now()).length;
          if (pr.broke || still) { say('undo-failed'); return; }
          done.past = null;
        }
        if (!done.people.length) { done = null; say('undone'); $('[data-undo]').hidden = true; return; }
        var push = CI.undo(book.rows(), done.people, me, Date.now());
        return sendAll(push, book).then(function (res) {
          var back = {}; res.kept.forEach(function (id) { back[id] = true; });
          done.people = done.people.filter(function (c) { return !back[c.id] && push.some(function (r) { return r.id === c.id; }); });
          if (!done.people.length) { done = null; say('undone'); $('[data-undo]').hidden = true; }
          else say('undo-failed');
        });
      });
      });
    }).catch(function () { say('undo-failed'); }).then(function () { lock(false); });
  });

  auth.current().then(function (s) {
    if (!s) return;
    main.hidden = false;
    book.start(function () {});
    pastBook.start(function () {});
    priceBook.start(function () {});
  });
})();
