/* Bring your business to Inspyx (/bring-business, 2026-11-27, the web half; the app's screen is I2's #805, and every
   word on the page is the app's own, in words.md). ONE box for the key the old platform gave (Spectora's API key, or
   ISN's access key, secret key and page address in any order), read by the app's own rules (inspyxImport.pastedKey);
   or a file. Then ONE preview of everything found, and nothing is kept before Bring in.
   - Spectora is read through the spectora-import function (the key in the request's body only; forgotten after);
     ISN is read through isn-import (the server asks ISN for each list and passes it on), mapped by the app's own reader
     (inspyxImport.isn, #811).
   - What is found is planned by the phone's own planners (inspyxImport.spectora / contacts / inspections), the people
     first and the past inspections against People as it would be after them, so nobody is planned twice.
   - Never from a People it couldn't read whole: People and the kept past inspections are read again, and everything
     planned again, right before anything is kept. Past inspections are kept first (under one import id), then people;
     Undo takes back both, as the old import pages did (people-import.js, retired into this page 2026-11-27).
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
  var ISN_WEB = true;    // isn-import is live (#804, 2026-11-27): ISN keys are read here too, through it
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
  /* The account the page opened for: its books hold that account's rows. If another tab signs in as someone else,
     nothing is planned or kept from these rows as the new account: the page starts again (its own adversarial pass). */
  var opened = null;
  function sameAccount() {
    var w = auth.who();
    if (w && opened && w.id === opened) return true;
    // The key goes before anything else: nothing of the first account's read is sent as the second (Codex on #133).
    picked++;
    if (keyBox) { keyBox.value = ''; }
    window.location.reload();
    return false;
  }

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
    var me = opened || STAND_IN, now = Date.now(), imp = window.inspyxImport;
    var rows = book.rows(), past = PS.keptForReader(pastBook.rows(), me);
    var people = { push: [], changes: [], plan: [] }, left = [], history = null, cuts = [];
    var runPeople = function () {
      if (source.file && source.kind === 'past') return null;
      var r = source.file
        ? parse(imp.contacts(source.file.name, source.file.bytes, withMatch({ kind: source.kind, existing: existingOf(rows), keep_unread: true })))
        : source.isn ? parse(imp.isn('people', source.isn, { existing: existingOf(rows) }))
        : parse(imp.spectora('people', { clients: source.clients, agents: source.agents, clients_cut: source.cuts.clients, agents_cut: source.cuts.agents }, { existing: existingOf(rows) }));
      return r;
    };
    var r1 = runPeople();
    if (r1 && r1.status !== 'ok') return { refused: r1.message };
    var unread = [], cols = null;
    if (r1) {
      unread = r1.unread || [];
      if (source.file) cols = { columns: r1.columns || [], fields: r1.fields || [], ok: !!r1.has_name };
      var a = CI.applyPlan(rows, r1.plan || [], me, now, newId);
      people = { push: a.push, changes: a.changes, plan: r1.plan || [] };
      left = left.concat(r1.skipped || []);
      if (r1.cut && r1.cut_message) cuts.push(r1.cut_message);
      rows = merged(rows, a.push);
    }
    if (source.file ? source.kind === 'past' : true) {
      var r2 = source.file
        ? parse(imp.inspections(source.file.name, source.file.bytes, withMatch({ existing: existingOf(rows), existing_past: past, keep_unread: true })))
        : source.isn ? parse(imp.isn('inspections', source.isn, { existing: existingOf(rows), existing_past: past }))
        : parse(imp.spectora('inspections', { records: source.records, cut: source.cuts.records }, { existing: existingOf(rows), existing_past: past }));
      if (r2.status !== 'ok') { if (!r1) return { refused: r2.message }; }
      else {
        var b = CI.applyPlan(rows, (r2.people && r2.people.plan) || [], me, now, newId);
        people.push = people.push.concat(b.push); people.changes = people.changes.concat(b.changes);
        people.plan = people.plan.concat((r2.people && r2.people.plan) || []);
        left = left.concat(r2.skipped || []).concat((r2.people && r2.people.skipped) || []);
        // A file past the reader's limit is read to there, and says so (Codex on #133): never cut quietly.
        if (r2.cut && r2.cut_message) cuts.push(r2.cut_message);
        if (source.file) { unread = r2.unread || []; cols = { columns: r2.columns || [], fields: r2.fields || [], ok: !!r2.can_file }; }
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
    return { people: people, history: history, prices: prices, left: left, cuts: cuts, unread: unread, cols: cols };
  }

  // His matches for the file's columns (the old import pages' table, 2026-11-27): field -> column, or null for none.
  function withMatch(opts) { if (source.file && source.match) opts.match = source.match; return opts; }

  /* ---- what each column holds: shown for any file ("Check the columns"), open by itself when a file reads badly ---- */
  var shownCols = null;
  function drawColumns(c, rowsRead) {
    var box = $('[data-cols-box]');
    shownCols = c;
    if (!c || !c.columns.length) { box.hidden = true; return; }
    box.hidden = false;
    // Read badly: nothing can be filed (no name column for people; no date, address or client for past inspections),
    // or nothing came out of it at all.
    var bad = !c.ok || rowsRead === 0;
    if (bad) box.open = true;
    $('[data-cols-bad]').hidden = !bad;
    $('[data-cols-bad]').textContent = bad ? words(source.kind === 'past' ? 'cols-bad-past' : 'cols-bad-people') : '';
    var tb = $('[data-cols]'); tb.textContent = '';
    c.columns.forEach(function (col) {
      var tr = el('tr'), sel = el('select');
      sel.setAttribute('data-col', String(col.index)); sel.setAttribute('aria-label', col.header || ('#' + (col.index + 1)));
      var none = el('option', null, words('not-used')); none.value = ''; sel.appendChild(none);
      c.fields.forEach(function (f) { var o = el('option', null, f.label); o.value = f.field; sel.appendChild(o); });
      sel.value = col.field || '';
      tr.appendChild(el('td', 'pi-h', col.header || ('#' + (col.index + 1))));
      var sample = el('td', 'pi-s', col.sample || ''); if (col.sample) sample.title = col.sample; tr.appendChild(sample);
      var td = el('td'); td.appendChild(sel); tr.appendChild(td);
      tb.appendChild(tr);
    });
  }
  main.addEventListener('change', function (e) {
    var sel = e.target.closest('[data-col]');
    if (!sel || !source || !source.file || !shownCols || busy) return;
    // The whole match as it stands, his change in it: every field to its column or to none, so a column he set to
    // "Not used" stays so when he changes another; built on his latest choice (the old pages' rule, Codex on #106).
    var m = {};
    if (source.match) Object.keys(source.match).forEach(function (f) { m[f] = source.match[f]; });
    else {
      shownCols.fields.forEach(function (f) { m[f.field] = null; });
      shownCols.columns.forEach(function (c) { if (c.field) m[c.field] = c.index; });
    }
    Object.keys(m).forEach(function (f) { if (m[f] === +sel.getAttribute('data-col')) m[f] = null; });
    if (sel.value) m[sel.value] = +sel.getAttribute('data-col');
    source.match = m;
    ++picked; done = null; $('[data-done]').hidden = true;
    preview();
  });

  /* ---- the preview ---- */
  function shown(p) {
    $('[data-preview]').hidden = false;
    $('[data-found]').textContent = source.file ? words('found-file', { file: source.file.name }) : words('found', { platform: source.platform });
    // The columns nothing reads (switch PR 8): named here, and where they go: each one's notes, unless that person
    // already has notes (People never writes over a note: Codex on #136).
    var un = $('[data-unread]'), cols = (source.file && p.unread) || [];
    un.textContent = cols.length === 0 ? '' : cols.length === 1 ? words('unread-1', { columns: cols[0] }) : words('unread-n', { n: cols.length, columns: cols.join(', ') });
    un.hidden = cols.length === 0;
    var rowsRead = source.kind === 'past' ? (p.history ? p.history.read.length : 0) : p.people.plan.length;
    drawColumns(source.file ? p.cols : null, rowsRead);
    var roles = { clients: 0, agents: 0 };
    p.people.changes.forEach(function (c) {
      var row = p.people.push.filter(function (r) { return r.id === c.id; })[0], role = row && row.data && row.data.role;
      if (role === 'client') roles.clients++; else roles.agents++;
    });
    // Only what was found (the lead, 2026-11-27): no "0 clients", no empty card.
    $('[data-count-people]').textContent = [roles.clients ? words('count-of', { n: roles.clients, what: words(roles.clients === 1 ? 'client-1' : 'client-n') }) : '',
      roles.agents ? words('count-of', { n: roles.agents, what: words(roles.agents === 1 ? 'agent-1' : 'agent-n') }) : ''].filter(Boolean).join(' · ');
    $('[data-card="people"]').hidden = roles.clients + roles.agents === 0;
    var lp = $('[data-list-people]'); lp.textContent = '';
    p.people.changes.slice(0, SHOWN).forEach(function (c) { lp.appendChild(el('li', null, c.name)); });
    var pastN = p.history ? p.history.push.length : 0;
    $('[data-count-past]').textContent = pastN ? plural('past', pastN) : '';
    $('[data-card="past"]').hidden = pastN === 0;
    var lpa = $('[data-list-past]'); lpa.textContent = '';
    (p.history ? p.history.push : []).slice(0, SHOWN).forEach(function (r) {
      var d = r.data || {}; lpa.appendChild(el('li', null, [dayText(d.date) || d.dateInFile, d.address].filter(Boolean).join(' · ')));
    });
    var priceN = p.prices.push.length, pc = $('[data-card="prices"]');
    $('[data-count-prices]').textContent = priceN ? plural('prices', priceN) : '';
    pc.hidden = priceN === 0;
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
    // Nothing to bring: Bring in can't be tapped (the lead, 2026-11-27).
    var go = $('[data-go]'); go.textContent = n ? words('bring-n', { n: n }) : words('bring-0'); go.disabled = busy || n === 0;
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
    if (!sameAccount()) return Promise.resolve();
    say(null);
    return fresh().then(function (ok) {
      if (mine !== picked) return;
      if (!ok) { say('no-people'); return; }
      var p = planAll(function () { return STAND_IN + Math.random(); }, STAND_IN);
      if (p.refused) { say(null, null, p.refused); return; }
      shown(p);
    }).catch(function () { if (mine === picked) say('failed'); });
  }

  /* ---- the key box: only what he typed or pasted is ever sent (the old import page's rule: a browser's autofill once put
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
    else if (k.kind === 'isn') { line.textContent = words('sees-isn', { company: k.company_key }); pasted = ISN_WEB ? k : null; }
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
      // Every request, retries too, as the account the page opened for: a sign-in switched in another tab mid-read ends
      // the read before the key is sent again (Codex on #133).
      if (mine !== picked || !sameAccount()) return Promise.resolve({ over: true });
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
  /* ---- read ISN: through isn-import, each list once, as the app reads it (the keys checked with "me" first) ---- */
  var ISN_SAYS = { bad_keys: 'isn-bad_keys', no_privilege: 'isn-no_privilege', bad_address: 'isn-bad_address', busy: 'isn-busy',
    unreadable: 'isn-unreadable', no_signal: 'isn-no_signal', unknown_host: 'isn-unknown', hour_full: 'isn-hour_full' };
  var isnSays = function (a) { return words(ISN_SAYS[a && a.refused] || 'isn-unreadable'); };
  function askIsn(keys, what, mine) {
    // Every request as the account the page opened for (Codex on #133): a sign-in switched in another tab ends the read.
    if (mine !== picked || !sameAccount()) return Promise.resolve({ over: true });
    var body = { access_key: keys.access_key, secret_key: keys.secret_key, host: keys.host, company_key: keys.company_key, what: what };
    // Past inspections only: the orders before now, as the app asks.
    if (what === 'orders') body.before = new Date().toISOString();
    return auth.ask('isn-import', body, ASK_DEADLINE).then(function (r) {
      if (r === null) { window.location.replace('/signin'); return { over: true }; }
      if (r.status === 429) return { refused: 'hour_full' };
      if (r.status === 503) return { refused: 'busy' };
      return r.json && typeof r.json === 'object' ? r.json : { refused: 'unreadable' };
    }, function () { return { refused: 'no_signal' }; }).then(function (a) { return mine !== picked ? { over: true } : a; });
  }
  function readIsn(keys, got, mine) {
    var k = keys;
    // Unlabelled keys may be the other way round: tried swapped once, on bad_keys from "me" only (as the app does).
    var check = function (swapped) {
      return askIsn(k, 'me', mine).then(function (a) {
        if (a.over) return a;
        if (a.me) return null;
        if (a.refused === 'bad_keys' && !keys.labelled && !swapped) {
          k = { access_key: keys.secret_key, secret_key: keys.access_key, host: keys.host, company_key: keys.company_key };
          return check(true);
        }
        return { message: isnSays(a) };
      });
    };
    var lists = ['clients', 'agents', 'agencies', 'users', 'orders'];
    var next = function (i) {
      if (i >= lists.length) return Promise.resolve(null);
      say(lists[i] === 'orders' ? 'reading-past' : 'reading-people');
      return askIsn(k, lists[i], mine).then(function (a) {
        if (a.over) return a;
        if (Array.isArray(a.records)) { got.isn[lists[i]] = a.records; return next(i + 1); }
        return { message: isnSays(a) };
      });
    };
    return check(false).then(function (end) { return end || next(0); });
  }

  var reading = false;   // Spectora is being read with the key now
  function lockKey(on) { reading = on; keyBox.disabled = on; $('[data-check]').disabled = on || !pasted; $('[data-stop]').hidden = !on; }
  $('[data-stop]').addEventListener('click', function () { picked++; lockKey(false); keyClear(); say('stopped'); });
  $('[data-key-form]').addEventListener('submit', function (e) {
    e.preventDefault();
    if (busy || !pasted || !sameAccount()) return;
    if (keyAutofilled()) { keyClear(); say('autofilled'); keyBox.focus(); return; }
    if (pasted.kind === 'isn') { readIsnKeys(pasted); return; }
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

  /* ISN's keys, read: nothing kept of them once read (the box emptied), then the ONE preview. */
  function readIsnKeys(k) {
    var keys = { access_key: k.access_key, secret_key: k.secret_key, host: k.host, company_key: k.company_key, labelled: k.labelled === true };
    done = null; $('[data-done]').hidden = true; $('[data-preview]').hidden = true; source = null;
    var mine = ++picked;
    var got = { platform: 'ISN', isn: { clients: [], agents: [], agencies: [], users: [], orders: [] } };
    say('checking'); lockKey(true);
    readIsn(keys, got, mine).catch(function () { return { message: words('failed') }; }).then(function (end) {
      keys = null;
      if (mine !== picked || (end && end.over)) return;
      keyClear(); lockKey(false);
      if (end && end.message) { say(null, null, end.message); return; }
      source = got;
      return preview();
    });
  }

  /* ---- a file: what it holds is his to say (clients, agents or past inspections), then it is read ---- */
  var pendingFile = null;
  function take(f) {
    if (!f || busy) return;
    var mine = ++picked;
    // A file instead of the key being read (Codex on #133): that read is over (picked moved on, so its answer never
    // lands), and the key goes with it: emptied, and the box his again.
    if (reading) { lockKey(false); keyClear(); }
    done = null; $('[data-done]').hidden = true; $('[data-preview]').hidden = true; source = null;
    if (f.size > MAX) { say('too-big'); return; }
    say('reading-file');
    var reader = new FileReader();
    reader.onload = function () {
      if (mine !== picked) return;
      var bytes = new Uint8Array(reader.result), imp = window.inspyxImport, guess = null;
      // The app's own guess (switch PR 8): what the file is by its name when Inspyx knows it (Horizon's exports,
      // HomeGauge's, ISN's), else by its columns. The chips still let him change it.
      try { guess = imp && typeof imp.bringKind === 'function' ? parse(imp.bringKind(f.name, bytes)) : null; } catch (e) { guess = null; }
      $('[data-file-name]').textContent = f.name;
      $('[data-file-what]').textContent = guess && guess.what ? guess.what : '';
      $('[data-file-what]').hidden = !(guess && guess.what);
      [].slice.call(main.querySelectorAll('[data-fk]')).forEach(function (b) { b.classList.remove('is-on'); b.setAttribute('aria-checked', 'false'); });
      // A known file that holds no people or inspections (Horizon's templates, its dashboard), or one the app's reader
      // refuses: said, never read.
      $('[data-to-converter]').hidden = true; toConvert = null;
      // A file the converter reads: Horizon's Company Templates, or a template spreadsheet (the app's drop installs
      // those; here the converter on Templates reads them). "Convert it now" takes this very file there.
      var sheet = guess && guess.status === 'ok' && guess.kind === 'template';
      if (sheet || (guess && guess.status === 'elsewhere' && guess.holds === 'templates')) {
        pendingFile = null; $('[data-file-kind]').hidden = true;
        toConvert = { name: f.name, bytes: bytes };
        say(null, null, sheet ? words('template-sheet') : words('to-converter', { what: guess.what }));
        $('[data-to-converter]').hidden = false;
        return;
      }
      if (guess && guess.status !== 'ok' && guess.message) {
        pendingFile = null; $('[data-file-kind]').hidden = true;
        say(null, null, guess.message);
        return;
      }
      pendingFile = { name: f.name, bytes: bytes };
      say(null);
      $('[data-file-kind]').hidden = false;
      if (guess && guess.kind) chooseKind(main.querySelector('[data-fk="' + guess.kind + '"]'));
    };
    reader.onerror = function () { if (mine === picked) say('failed'); };
    reader.readAsArrayBuffer(f);
  }
  // "Convert it now": the file goes to Templates through this browser's own storage, and Templates converts it at once.
  var toConvert = null;
  $('[data-convert-now]').addEventListener('click', function () {
    var file = toConvert, go = function () { window.location.assign('/templates?file=drop'); };
    if (!file || !window.inspyxHandoff) { window.location.assign('/templates'); return; }
    window.inspyxHandoff.put(file).then(go, function () { window.location.assign('/templates'); });
  });
  // What the file holds, chosen (by him, or by the app's guess): its chip on, and the preview read.
  function chooseKind(fk) {
    if (!fk || !pendingFile || busy) return;
    [].slice.call(main.querySelectorAll('[data-fk]')).forEach(function (b) { var on = b === fk; b.classList.toggle('is-on', on); b.setAttribute('aria-checked', on ? 'true' : 'false'); });
    ++picked; done = null; $('[data-done]').hidden = true;
    source = { file: pendingFile, kind: fk.getAttribute('data-fk') };
    preview();
  }
  $('[data-pick]').addEventListener('change', function (e) { take(e.target.files && e.target.files[0]); e.target.value = ''; });
  var drop = $('[data-drop]');
  drop.addEventListener('dragover', function (e) { e.preventDefault(); drop.classList.add('is-over'); });
  drop.addEventListener('dragleave', function () { drop.classList.remove('is-over'); });
  drop.addEventListener('drop', function (e) { e.preventDefault(); drop.classList.remove('is-over'); take(e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0]); });
  main.addEventListener('click', function (e) {
    var fk = e.target.closest('[data-fk]');
    if (fk && pendingFile && !busy) { chooseKind(fk); return; }
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
    // Unlocked, Bring in stays off when the plan shown brings nothing.
    if (!on) { seen(); keyBox.disabled = false; $('[data-go]').disabled = !plan || !plan.n; }
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
    if (busy || !source || !plan || !sameAccount()) return;
    var me = opened, mine = picked;
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
    if (busy || !done || !sameAccount()) return;
    var me = opened;
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
    opened = (auth.who() || {}).id || null;
    main.hidden = false;
    book.start(function () {});
    pastBook.start(function () {});
    priceBook.start(function () {});
  });
})();
