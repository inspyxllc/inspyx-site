/* Bring in your people (/people-import, 2026-11-26, the web importers: "set up everything from a laptop"). The
   inspector drops their old app's export; the phone's own reader (I2's engine, assets/import/inspyx_import.js, the
   app's Dart compiled for the web) reads it, matches its columns, and plans each person against People exactly as the
   phone's import does (planContactImport); this page shows that, lets him change a column or say who is in the file,
   then keeps the plan in People (contacts-import.js: the People rows the phone keeps), with Undo.
   Never from a People it couldn't read whole (the lesson of Save to template, #98): it reads People again, and plans
   again, right before it keeps anything.
   This file says no words: the page holds every one. */
(function () {
  'use strict';
  var auth = window.InspyxAuth, book = window.InspyxPeopleBook, CI = window.InspyxContactsImport;
  // Past inspections are kept too (the past_inspections sync kind, I2's schema v43): their book and their rules.
  var pastBook = window.InspyxPastBook, PS = window.InspyxPastStore;
  var main = document.querySelector('[data-pi]');
  if (!auth || !book || !CI || !main) return;
  var MAX = 10 * 1024 * 1024, BATCH = 200, SHOWN = 50;
  // /history-import (past inspections, 2026-11-26): the same page and the same rules, reading a history file
  // (inspyxImport.inspections); the people it names come into People. Storing the inspections themselves follows when
  // the past_inspections sync kind lands (I2, schema v43).
  var HISTORY = main.getAttribute('data-mode') === 'history';
  var read$ = HISTORY ? 'inspections' : 'contacts';
  var planOf = function (r) { return (HISTORY ? r && r.people && r.people.plan : r && r.plan) || []; };
  if (HISTORY && (!pastBook || !PS)) return;
  var donePast = null;   // { importId, n }: the inspections the last Bring in kept, for Undo
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
  function say(key, fill) { var p = $('[data-say]'); p.hidden = !key; p.textContent = key ? words(key, fill) : ''; p.setAttribute('data-said', key || ''); }

  var file = null;     // { name, bytes }
  // Or read straight from Spectora (2026-11-26, the web importers' piece 3: I2's spectora-import function and the
  // engine's spectora/spectoraStep): what was read, as the engine takes it. The inspector's key is never here.
  var spx = null;      // people: { clients, agents, clients_cut, agents_cut }; a history: { records, cut }
  var choice = { kind: null, match: null };
  var read = null;     // the engine's answer shown now
  var turn = 0, busy = false, done = null, picked = 0;

  /* The People rows held, as the engine takes them (the inspector's inspector_contacts, deleted ones too). */
  function existing() {
    return book.rows().map(function (r) {
      var d = r.data || {};
      return { id: r.id, name: d.name, role: d.role, phone: d.phone == null ? null : d.phone, email: d.email == null ? null : d.email,
        company: d.company == null ? null : d.company, note: d.note == null ? null : d.note,
        deleted_at: r.deleted_at != null ? r.deleted_at : (d.deletedAt == null ? null : d.deletedAt) };
    });
  }
  /* People read whole, now: true, or false when it couldn't be (then nothing is planned or kept). */
  /* People (and, for a history, the kept past inspections) read whole, now: true, or false when they couldn't be. */
  function freshPeople() {
    var books = HISTORY ? [book, pastBook] : [book];
    return Promise.all(books.map(function (b) { return Promise.resolve(b.pull()); })).then(function () {
      return books.every(function (b) { return b.loaded() && !b.failing(); });
    });
  }
  /* The engine on the file, with his choices and People as held. */
  function engine() {
    var opts = { existing: existing() };
    // Read from Spectora: nothing to match (no columns), and the engine's Spectora planner.
    if (spx) {
      if (HISTORY) opts.existing_past = PS.keptForReader(pastBook.rows(), auth.who().id);
      return Promise.resolve(window.inspyxImport.spectora(HISTORY ? 'inspections' : 'people', spx, opts)).then(function (t) { return typeof t === 'string' ? JSON.parse(t) : t; });
    }
    // A history: the inspections kept already, so the same one is never kept twice.
    if (HISTORY) opts.existing_past = PS.keptForReader(pastBook.rows(), auth.who().id);
    if (choice.kind) opts.kind = choice.kind;
    if (choice.match) opts.match = choice.match;
    return Promise.resolve(window.inspyxImport[read$](file.name, file.bytes, opts)).then(function (t) { return typeof t === 'string' ? JSON.parse(t) : t; });
  }

  /* ---- read the file (again, after a choice) ---- */
  function run() {
    var mine = ++turn;
    // While it reads (again), Bring in waits: it would keep a plan he hasn't seen.
    $('[data-go]').disabled = true;
    if (!window.inspyxImport || typeof window.inspyxImport[spx ? 'spectora' : read$] !== 'function') { say('no-engine'); return Promise.resolve(); }
    say('reading');
    return freshPeople().then(function (ok) {
      if (mine !== turn) return;
      if (!ok) { say('no-people'); $('[data-read]').hidden = true; return; }
      return engine().then(function (r) {
        if (mine !== turn) return;
        if (!r || r.status !== 'ok') { $('[data-read]').hidden = true; var p = $('[data-say]'); p.hidden = false; p.textContent = (r && r.message) || words('failed'); p.setAttribute('data-said', 'refused'); return; }
        say(null); read = r; choice.kind = r.kind; draw();
      });
    }).catch(function () { if (mine === turn) say('failed'); });
  }

  function counts(plan) {
    var c = { new: 0, fill: 0, bring_back: 0, unchanged: 0 };
    (plan || []).forEach(function (e) { if (c[e.action] != null) c[e.action]++; });
    return c;
  }
  function draw() {
    var r = read;
    if (!r) return;
    $('[data-read]').hidden = false; $('[data-done]').hidden = true;
    [].slice.call(main.querySelectorAll('[data-kind]')).forEach(function (b) {
      var on = b.getAttribute('data-kind') === r.kind;
      b.classList.toggle('is-on', on); b.setAttribute('aria-checked', on ? 'true' : 'false');
    });
    // Each column: its header, its first value, and what it holds (the reader's guess, or his choice).
    // Read from Spectora: no columns, and nobody to say who is in it (clients are clients, agents agents).
    var cols = r.columns || [];
    $('[data-cols-h]').hidden = !cols.length; $('[data-cols-wrap]').hidden = !cols.length;
    var kinds = main.querySelector('.pi-kind'); if (kinds) kinds.hidden = !!spx;
    var agentsNote = $('[data-spx-agents]');
    if (agentsNote) { agentsNote.hidden = !(spx && r.agents_read); agentsNote.textContent = spx && r.agents_read ? words('spx-agents') : ''; }
    $('[data-again]').textContent = words(spx ? 'again-spx' : 'again-file');
    var tb = $('[data-cols]'); tb.textContent = '';
    cols.forEach(function (c) {
      var tr = el('tr'), sel = el('select');
      sel.setAttribute('data-col', String(c.index)); sel.setAttribute('aria-label', c.header || ('#' + (c.index + 1)));
      var none = el('option', null, words('not-used')); none.value = ''; sel.appendChild(none);
      r.fields.forEach(function (f) { var o = el('option', null, f.label); o.value = f.field; sel.appendChild(o); });
      sel.value = c.field || '';
      tr.appendChild(el('td', 'pi-h', c.header || ('#' + (c.index + 1))));
      var sample = el('td', 'pi-s', c.sample || ''); if (c.sample) sample.title = c.sample; tr.appendChild(sample);
      var td = el('td'); td.appendChild(sel); tr.appendChild(td);
      tb.appendChild(tr);
    });
    // Nothing can be read yet: the column that holds the names (people), or a date, address or client (a history).
    $('[data-noname]').hidden = spx ? true : HISTORY ? !!r.can_file : !!r.has_name;
    var people = HISTORY ? (r.inspections || []) : (r.people || []);
    $('[data-count]').textContent = plural(spx ? 'count-spx' : 'count', people.length);
    if (HISTORY) {
      var cut = $('[data-cut]');
      cut.hidden = !r.cut; cut.textContent = r.cut ? (r.cut_message || '') : '';
      $('[data-people-n]').textContent = words('people-n', { clients: r.people ? r.people.clients : 0, agents: r.people ? r.people.agents : 0 });
    }
    var c = counts(planOf(r)), sum = $('[data-sum]'); sum.textContent = '';
    [['new', 'sum-new'], ['fill', 'sum-fill'], ['bring_back', 'sum-back'], ['unchanged', 'sum-same']].forEach(function (k) {
      if (c[k[0]]) { var s = el('span', 'pi-pill pi-' + k[0], words(k[1], { n: c[k[0]] })); s.setAttribute('data-sum-' + k[0], String(c[k[0]])); sum.appendChild(s); }
    });
    var pb = $('[data-people]'); pb.textContent = '';
    if (HISTORY) people.slice(0, SHOWN).forEach(function (x) {
      // A past inspection: its day (as the file wrote it when it isn't a date), the address, the client, the fee.
      var tr = el('tr');
      tr.appendChild(el('td', 'pi-d', x.date || x.date_in_file || ''));
      tr.appendChild(el('td', 'pi-n', x.address || ''));
      tr.appendChild(el('td', 'pi-c', x.client || ''));
      tr.appendChild(el('td', 'pi-f', typeof x.fee_cents === 'number' ? '$' + (x.fee_cents / 100).toLocaleString('en-US', { minimumFractionDigits: x.fee_cents % 100 ? 2 : 0, maximumFractionDigits: 2 }) : ''));
      pb.appendChild(tr);
    });
    else people.slice(0, SHOWN).forEach(function (p) {
      // The whole file has one role (the Clients / Agents switch says it). On a phone each person stacks: name, then
      // phone · email · company (the lead, 2026-11-26).
      var tr = el('tr');
      tr.appendChild(el('td', 'pi-n', p.name));
      [['pi-p', p.phone], ['pi-e', p.email], ['pi-c', p.company]].forEach(function (x) {
        var td = el('td', x[0], x[1] || ''); if (x[1]) td.title = x[1]; tr.appendChild(td);
      });
      pb.appendChild(tr);
    });
    $('[data-more]').hidden = people.length <= SHOWN;
    $('[data-more]').textContent = words('more', { shown: SHOWN, n: people.length });
    var sk = r.skipped || [], box = $('[data-skipped]'), list = $('[data-skipped-list]');
    box.hidden = !sk.length; $('[data-skipped-n]').textContent = plural('skipped', sk.length); list.textContent = '';
    // A line of a file by its number; a Spectora record (or a list cut short) by where it is.
    sk.forEach(function (x) { list.appendChild(el('li', null, x.where ? words('where', { where: x.where, reason: x.reason }) : words('line', { line: x.line, reason: x.reason }))); });
    var n = c.new + c.fill + c.bring_back, go = $('[data-go]');
    if (HISTORY) {
      // The inspections: new ones to keep, and how many are on his list already.
      // A new one the rules would refuse is never counted as one to keep: it is named, with its line (Codex on #110).
      var refused = refusedOf(r), k = Math.max(0, (r.new_count || 0) - refused.length), have = r.already_count || 0;
      var ins = $('[data-insp-sum]'); ins.textContent = '';
      if (k) { var a = el('span', 'pi-pill pi-new', plural('keep', k)); a.setAttribute('data-keep', String(k)); ins.appendChild(a); }
      if (refused.length) { var rf = el('span', 'pi-pill pi-refused', refusedWords(refused)); rf.setAttribute('data-refused', String(refused.length)); ins.appendChild(rf); }
      if (have) { var b2 = el('span', 'pi-pill pi-unchanged', plural('already', have)); b2.setAttribute('data-already', String(have)); ins.appendChild(b2); }
      go.textContent = k && n ? words('go-both', { k: k, n: n }) : k ? plural('go-insp', k) : n ? plural('go', n) : words('go-none');
      go.disabled = !(k || n) || busy;
    } else {
      go.textContent = n ? plural('go', n) : words('go-none'); go.disabled = !n || busy;
    }
  }

  /* ---- his choices: who is in the file; what a column holds ---- */
  main.addEventListener('click', function (e) {
    var k = e.target.closest('[data-kind]');
    // Who is in the file changes their role only: his column choices stay (built from his latest, not the screen).
    if (k && file && !busy && read && k.getAttribute('data-kind') !== (choice.kind || read.kind)) { choice.kind = k.getAttribute('data-kind'); run(); }
  });
  main.addEventListener('change', function (e) {
    var sel = e.target.closest('[data-col]');
    if (!sel || !read || busy) return;
    // The whole match as it stands, his change in it: EVERY field the reader offers, to its column or to none, so a
    // column he set to "Not used" stays so when he changes another (the reader guesses only fields it isn't told;
    // Codex on #106).
    // Built on his latest choice, even one still being read (two changes before the first answer: Codex on #106).
    var m = {};
    if (choice.match) Object.keys(choice.match).forEach(function (f) { m[f] = choice.match[f]; });
    else {
      read.fields.forEach(function (f) { m[f.field] = null; });
      read.columns.forEach(function (c) { if (c.field) m[c.field] = c.index; });
    }
    Object.keys(m).forEach(function (f) { if (m[f] === +sel.getAttribute('data-col')) m[f] = null; });
    if (sel.value) m[sel.value] = +sel.getAttribute('data-col');
    choice.match = m; run();
  });

  /* ---- the file ---- */
  function take(f) {
    if (!f || busy) return;
    // A new file: nothing of the last import is this one's to show or to undo (Codex on #110).
    done = null; donePast = null; $('[data-done]').hidden = true; spx = null; spxSay(null); spxLock(false);
    var kb = $('[data-spx-key]'); if (kb) kb.value = '';
    // Another file: any reading still on its way for the last one is over now, before this one is even read (Codex on
    // #106): it can't bring the last file's preview back.
    turn++; $('[data-go]').disabled = true;
    if (f.size > MAX) { picked++; file = null; read = null; $('[data-read]').hidden = true; say('too-big'); return; }
    var reader = new FileReader();
    // Another file: what was read from the last one goes at once, so nothing can bring in this one unseen (Codex on #106).
    read = null; $('[data-read]').hidden = true;
    // Only the last file picked counts: an earlier one that finishes reading later is dropped (Codex on #106).
    var mine = ++picked;
    reader.onload = function () { if (mine !== picked) return; spx = null; file = { name: f.name, bytes: new Uint8Array(reader.result) }; choice = { kind: null, match: null }; run(); };
    reader.onerror = function () { if (mine === picked) say('failed'); };
    reader.readAsArrayBuffer(f);
  }
  $('[data-pick]').addEventListener('change', function (e) { take(e.target.files && e.target.files[0]); e.target.value = ''; });
  var drop = $('[data-drop]');
  drop.addEventListener('dragover', function (e) { e.preventDefault(); drop.classList.add('is-over'); });
  drop.addEventListener('dragleave', function () { drop.classList.remove('is-over'); });
  drop.addEventListener('drop', function (e) { e.preventDefault(); drop.classList.remove('is-over'); take(e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0]); });
  $('[data-again]').addEventListener('click', function () {
    if (busy) return;
    if (spx) { showSrc('spectora'); var k = $('[data-spx-key]'); if (k) k.focus(); } else $('[data-pick]').click();
  });

  /* ---- where they come from: a file, or Spectora ---- */
  function showSrc(which) {
    [].slice.call(main.querySelectorAll('[data-src]')).forEach(function (b) {
      var on = b.getAttribute('data-src') === which; b.classList.toggle('is-on', on); b.setAttribute('aria-selected', on ? 'true' : 'false');
    });
    [].slice.call(main.querySelectorAll('[data-src-pane]')).forEach(function (p) { p.hidden = p.getAttribute('data-src-pane') !== which; });
  }
  main.addEventListener('click', function (e) { var b = e.target.closest('[data-src]'); if (b) showSrc(b.getAttribute('data-src')); });

  /* ---- read straight from Spectora (I2's spectora-import): every page, waiting or stopping as the app does ----
     The key goes only into each call's body (never kept: not in the page's state, storage, the address or a log), and
     its box is emptied when the reading ends. */
  var LIMIT = 100, ASK_DEADLINE = 60000;
  function spxSay(key, fill, text) { var p = $('[data-spx-say]'); if (!p) return; p.hidden = !key && !text; p.textContent = text || (key ? words(key, fill) : ''); p.setAttribute('data-said', key || (text ? 'stop' : '')); }
  var sleep = function (ms) { return new Promise(function (ok) { setTimeout(ok, ms); }); };
  /* One list ([what]) from page 1 on, into [got]. Answers null when it was read to its end (or cut at Spectora's
     limit: [got] says so), or { message } when it stopped (what was read stays in [got], said as cut). */
  function readList(key, what, got, mine, progress) {
    var list = what === 'inspections' ? 'records' : what, cutKey = what === 'inspections' ? 'cut' : what + '_cut', before = null;
    var page = function (n, attempt) {
      var body = { key: key, what: what, page: n };
      if (before) body.before = before;
      return auth.ask('spectora-import', body, ASK_DEADLINE).then(function (r) {
        if (r === null) { window.location.replace('/signin'); return { over: true }; }
        return r.status === 200 && r.json && Array.isArray(r.json.records) ? r.json : (r.json && typeof r.json === 'object' ? r.json : {});
      }, function () { return { refused: 'no_signal' }; }).then(function (a) {
        if (mine !== picked || a.over) return { over: true };
        if (Array.isArray(a.records)) {
          got[list] = got[list].concat(a.records); progress();
          if (what === 'inspections' && !before && typeof a.before === 'string') before = a.before;
          if (a.cut === true) { got[cutKey] = true; return null; }
          if (a.has_next === true) {
            if (n >= LIMIT) { got[cutKey] = true; return null; }
            return page(n + 1, 0);
          }
          return null;
        }
        // No records: the app's own rule says wait (then the same page again) or stop.
        var step = {};
        try { step = JSON.parse(window.inspyxImport.spectoraStep(a, attempt)); } catch (e) { step = {}; }
        if (typeof step.wait_seconds === 'number' && step.wait_seconds >= 0) {
          spxSay(null, null, plural('spx-wait', Math.ceil(step.wait_seconds)));
          return sleep(step.wait_seconds * 1000).then(function () { return mine !== picked ? { over: true } : page(n, attempt + 1); });
        }
        got[cutKey] = true;
        return { message: typeof step.message === 'string' && step.message ? step.message : words('failed') };
      });
    };
    return page(1, 0);
  }
  /* While Spectora is read, only its form waits (a wait Spectora asks for can be long): a file can still be picked,
     and Stop ends the reading; either way that reading never lands. */
  function spxLock(on) {
    var k = $('[data-spx-key]'), g = $('[data-spx-go]'), st = $('[data-spx-stop]');
    if (k) k.disabled = on; if (g) g.disabled = on; if (st) st.hidden = !on;
  }
  var spxStop = $('[data-spx-stop]');
  if (spxStop) spxStop.addEventListener('click', function () { picked++; spxLock(false); spxSay('spx-stopped'); var k = $('[data-spx-key]'); if (k) k.value = ''; });
  var spxForm = $('[data-spx]');
  if (spxForm) spxForm.addEventListener('submit', function (e) {
    e.preventDefault();
    var box = $('[data-spx-key]'), key = box ? box.value.trim() : '';
    if (busy) return;
    if (!key) { spxSay('spx-no-key'); if (box) box.focus(); return; }
    if (!window.inspyxImport || typeof window.inspyxImport.spectoraStep !== 'function' || typeof window.inspyxImport.spectora !== 'function') { spxSay('no-engine'); return; }
    // A new read: nothing of the last import (or file) is this one's to show, keep or undo.
    done = null; donePast = null; $('[data-done]').hidden = true;
    var mine = ++picked; turn++; read = null; file = null; spx = null; $('[data-read]').hidden = true; say(null);
    var got = HISTORY ? { records: [], cut: false } : { clients: [], agents: [], clients_cut: false, agents_cut: false };
    var progress = function () { spxSay(HISTORY ? 'spx-reading' : 'spx-reading', HISTORY ? { n: got.records.length } : { clients: got.clients.length, agents: got.agents.length }); };
    progress(); spxLock(true);
    var whats = HISTORY ? ['inspections'] : ['clients', 'agents'], stop = null;
    var next = function (i) {
      if (i >= whats.length) return Promise.resolve(null);
      return readList(key, whats[i], got, mine, progress).then(function (end) { return end ? end : next(i + 1); });
    };
    next(0).catch(function () { return { message: words('failed') }; }).then(function (end) {
      // The key is forgotten now, whatever happened.
      key = '';
      if (mine !== picked || (end && end.over)) return;
      if (box) box.value = '';
      spxLock(false);
      stop = end && end.message;
      var any = HISTORY ? got.records.length : got.clients.length + got.agents.length;
      if (stop && !any) { spxSay(null, null, stop); return; }
      // Stopped part way: what was read is offered, the stop said above it (the engine lists the rest as left out).
      if (stop) spxSay(null, null, stop + ' ' + words('spx-partial')); else spxSay(null);
      spx = got; choice = { kind: null, match: null };
      return run();
    });
  });
  window.addEventListener('pagehide', function () { var b = $('[data-spx-key]'); if (b) b.value = ''; });

  /* ---- keep them: People read whole and planned again now, then sent 200 at a time ---- */
  /* Sends [push] 200 at a time. Answers { kept: ids the server kept, broke: true when a batch didn't go through } (what
     earlier batches kept stays kept, and so stays undoable: Codex on #106). */
  function sendAll(push, progress, bk) {
    var kept = [], at = 0, to = bk || book;
    var next = function () {
      if (at >= push.length) return Promise.resolve({ kept: kept, broke: false });
      // 200 rows at most, and about 2 MB (a past inspection's row may be up to 256 KB).
      var part = [], bytes = 0;
      while (at + part.length < push.length && part.length < BATCH) {
        var size = JSON.stringify(push[at + part.length]).length;
        if (part.length && bytes + size > 2000000) break;
        part.push(push[at + part.length]); bytes += size;
      }
      return to.send(part).then(function (a) {
        if (!a) return { kept: kept, broke: true };
        kept = kept.concat(a.kept); at += part.length;
        if (progress) progress(at);
        return next();
      });
    };
    return next();
  }
  function lock(on) {
    busy = on;
    [].slice.call(main.querySelectorAll('button, select, input')).forEach(function (b) { b.disabled = on; });
    if (!on && read && !done) draw();
  }
  /* The lines the rules won't take, in his words: too long (the reason he can fix), or refused for another reason. */
  function refusedWords(problems) {
    if (!problems || !problems.length) return '';
    var long = problems.filter(function (p) { return p.problem === 'too_long'; }), other = problems.filter(function (p) { return p.problem !== 'too_long'; });
    var at = problems.some(function (p) { return !(p.line > 0); }) ? '-at' : '';
    var lines = function (l) { return l.map(function (p) { return p.line > 0 ? p.line : (p.address || p.date || '?'); }).join(at ? '; ' : ', '); };
    return [long.length ? plural('refused-long' + at, long.length, { lines: lines(long) }) : '', other.length ? plural('refused-other' + at, other.length, { lines: lines(other) }) : '']
      .filter(Boolean).join(' ');
  }
  /* The new inspections the rules would refuse, seen before he keeps anything (the same rows, stand-in ids and times). */
  var STAND_IN = '00000000-0000-0000-0000-000000000000';
  function refusedOf(r) {
    var me = (auth.who() || {}).id || STAND_IN;
    return PS.newRows(r.inspections || [], me, Date.now(), function () { return STAND_IN; }, STAND_IN).problems;
  }

  $('[data-go]').addEventListener('click', function () {
    if (busy || (!file && !spx) || !read) return;
    var me = auth.who().id;
    turn++; lock(true);
    freshPeople().then(function (ok) {
      if (!ok) { say('no-people'); return; }
      return engine().then(function (r) {
        if (!r || r.status !== 'ok') { say('failed'); return; }
        read = r;
        var made = CI.applyPlan(book.rows(), planOf(r), me, Date.now(), function () { return window.crypto.randomUUID(); });
        // Each Bring in is an import of its own: the last one's is not this one's (Codex on #110).
        donePast = null;
        // A history: its new inspections kept first, under one import id (Undo takes the import back).
        var past = HISTORY ? PS.newRows(r.inspections || [], me, Date.now(), function () { return window.crypto.randomUUID(); }, window.crypto.randomUUID()) : { push: [] };
        // A line the rules won't take (too long to keep): said by its line, never silently left out (Codex on #110).
        var refusedNote = refusedWords(past.problems);
        var tell = function (text) { return refusedNote ? (text ? text + ' ' : '') + refusedNote : text; };
        if (!made.push.length && !past.push.length) {
          if (!refusedNote) { draw(); return; }
          read = null; say(null); $('[data-read]').hidden = true; $('[data-done]').hidden = false;
          $('[data-done-t]').textContent = refusedNote; $('[data-undo]').hidden = true;
          return;
        }
        var keepPast = past.push.length ? sendAll(past.push, function (k) { say('keeping', { done: k, n: past.push.length }); }, pastBook) : Promise.resolve({ kept: [], broke: false });
        return keepPast.then(function (pr) {
          if (past.push.length) {
            donePast = pr.kept.length ? { importId: past.push[0].data.importId, n: pr.kept.length } : null;
            // The server took some, not all (it went through, and turned some rows down): the rest are said, never
            // left out of the count (the same class as Codex on #110).
            var left = pr.broke ? 0 : past.push.length - pr.kept.length;
            if (left > 0) refusedNote = (refusedNote ? refusedNote + ' ' : '') + plural('past-left', left);
            if (pr.broke) {
              read = null; say(null); $('[data-read]').hidden = true; $('[data-done]').hidden = false;
              $('[data-done-t]').textContent = tell(words('done-past-broke', { k: pr.kept.length, n: past.push.length }));
              $('[data-undo]').hidden = !donePast;
              return;
            }
          }
          return bringPeople();
        });
        function bringPeople() {
        var n = made.push.length;
        if (!n) {
          read = null; say(null); $('[data-read]').hidden = true; $('[data-done]').hidden = false;
          $('[data-done-t]').textContent = tell(plural('done-insp', donePast ? donePast.n : 0));
          $('[data-undo]').hidden = !donePast;
          return;
        }
        say('bringing', { done: 0, n: n });
        return sendAll(made.push, function (k) { say('bringing', { done: k, n: n }); }).then(function (res) {
          var kept = res.kept;
          if (!kept.length && res.broke) {
            // The inspections were kept, then the people didn't go through: say what was kept, with its Undo (Codex
            // on #110).
            if (!donePast) { say('failed'); return; }
            done = []; read = null; say(null); $('[data-read]').hidden = true; $('[data-done]').hidden = false;
            $('[data-done-t]').textContent = tell(plural('done-insp', donePast.n) + ' ' + words('people-broke'));
            $('[data-undo]').hidden = false;
            return;
          }
          var keptSet = {}; kept.forEach(function (id) { keptSet[id] = true; });
          done = made.changes.filter(function (c) { return keptSet[c.id]; });
          // Kept: what was read is spent (People has changed); a new file, or this one again, reads afresh.
          read = null;
          say(null);
          $('[data-read]').hidden = true; $('[data-done]').hidden = false;
          var said$ = kept.length === n ? words('done', { n: n }) : words(res.broke ? 'done-broke' : 'done-part', { kept: kept.length, n: n });
          if (donePast) said$ = plural('done-insp', donePast.n) + ' ' + said$;
          $('[data-done-t]').textContent = HISTORY ? tell(said$) : said$;
          $('[data-undo]').hidden = !done.length && !donePast;
        });
        }
      });
    }).catch(function () { say('failed'); }).then(function () { lock(false); });
  });

  /* ---- Undo: what it added deleted again, what it filled cleared (unless changed since), as the phone's Undo ---- */
  $('[data-undo]').addEventListener('click', function () {
    if (busy || ((!done || !done.length) && !donePast)) return;
    var me = auth.who().id;
    lock(true); say('undoing');
    freshPeople().then(function (ok) {
      if (!ok) { say('undo-failed'); return; }
      // The inspections this import kept: deleted (every row of its import id), as the phone takes an import back.
      var pastUndo = donePast ? sendAll(PS.undoImport(pastBook.rows(), donePast.importId, me, Date.now()), null, pastBook) : Promise.resolve({ kept: [], broke: false });
      return pastUndo.then(function (pr) {
        if (donePast) {
          var still = PS.undoImport(pastBook.rows(), donePast.importId, me, Date.now()).length;
          if (!still) donePast = null;
          if (pr.broke || still) { say('undo-failed'); return; }
        }
        if (!done || !done.length) { done = null; say('undone'); $('[data-undo]').hidden = true; return; }
      var push = CI.undo(book.rows(), done, me, Date.now());
      return sendAll(push).then(function (res) {
        // Only what the server took back is undone; a row it kept out (the phone changed that person meanwhile) stays
        // for another Undo (Codex on #106).
        var back = {}; res.kept.forEach(function (id) { back[id] = true; });
        var left = push.filter(function (r) { return !back[r.id]; }).map(function (r) { return r.id; });
        done = done.filter(function (c) { return left.indexOf(c.id) >= 0; });
        if (!done.length) { done = null; say('undone'); $('[data-undo]').hidden = true; }
        else say(res.broke ? 'undo-failed' : 'undo-part', { n: done.length });
      });
      });
    }).catch(function () { say('undo-failed'); }).then(function () { lock(false); $('[data-read]').hidden = true; });
  });

  auth.current().then(function (s) {
    if (!s) return;
    main.hidden = false;
    book.start(function () {});
    if (HISTORY) pastBook.start(function () {});
  });
})();
