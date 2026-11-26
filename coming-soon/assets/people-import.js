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
  var main = document.querySelector('[data-pi]');
  if (!auth || !book || !CI || !main) return;
  var MAX = 10 * 1024 * 1024, BATCH = 200, SHOWN = 50;
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
  var choice = { kind: null, match: null };
  var read = null;     // the engine's answer shown now
  var turn = 0, busy = false, done = null;

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
  function freshPeople() { return Promise.resolve(book.pull()).then(function () { return book.loaded() && !book.failing(); }); }
  /* The engine on the file, with his choices and People as held. */
  function engine() {
    var opts = { existing: existing() };
    if (choice.kind) opts.kind = choice.kind;
    if (choice.match) opts.match = choice.match;
    return Promise.resolve(window.inspyxImport.contacts(file.name, file.bytes, opts)).then(function (t) { return typeof t === 'string' ? JSON.parse(t) : t; });
  }

  /* ---- read the file (again, after a choice) ---- */
  function run() {
    var mine = ++turn;
    // While it reads (again), Bring in waits: it would keep a plan he hasn't seen.
    $('[data-go]').disabled = true;
    if (!window.inspyxImport || typeof window.inspyxImport.contacts !== 'function') { say('no-engine'); return Promise.resolve(); }
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
    var tb = $('[data-cols]'); tb.textContent = '';
    r.columns.forEach(function (c) {
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
    $('[data-noname]').hidden = !!r.has_name;
    var people = r.people || [];
    $('[data-count]').textContent = plural('count', people.length);
    var c = counts(r.plan), sum = $('[data-sum]'); sum.textContent = '';
    [['new', 'sum-new'], ['fill', 'sum-fill'], ['bring_back', 'sum-back'], ['unchanged', 'sum-same']].forEach(function (k) {
      if (c[k[0]]) { var s = el('span', 'pi-pill pi-' + k[0], words(k[1], { n: c[k[0]] })); s.setAttribute('data-sum-' + k[0], String(c[k[0]])); sum.appendChild(s); }
    });
    var pb = $('[data-people]'); pb.textContent = '';
    people.slice(0, SHOWN).forEach(function (p) {
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
    sk.forEach(function (x) { list.appendChild(el('li', null, words('line', { line: x.line, reason: x.reason }))); });
    var n = c.new + c.fill + c.bring_back, go = $('[data-go]');
    go.textContent = n ? plural('go', n) : words('go-none'); go.disabled = !n || busy;
  }

  /* ---- his choices: who is in the file; what a column holds ---- */
  main.addEventListener('click', function (e) {
    var k = e.target.closest('[data-kind]');
    if (k && file && !busy && read && k.getAttribute('data-kind') !== read.kind) { choice.kind = k.getAttribute('data-kind'); choice.match = null; run(); }
  });
  main.addEventListener('change', function (e) {
    var sel = e.target.closest('[data-col]');
    if (!sel || !read || busy) return;
    // The whole match as it stands, his change in it: EVERY field the reader offers, to its column or to none, so a
    // column he set to "Not used" stays so when he changes another (the reader guesses only fields it isn't told;
    // Codex on #106).
    var m = {};
    read.fields.forEach(function (f) { m[f.field] = null; });
    read.columns.forEach(function (c) { if (c.field) m[c.field] = c.index; });
    Object.keys(m).forEach(function (f) { if (m[f] === +sel.getAttribute('data-col')) m[f] = null; });
    if (sel.value) m[sel.value] = +sel.getAttribute('data-col');
    choice.match = m; run();
  });

  /* ---- the file ---- */
  function take(f) {
    if (!f || busy) return;
    done = null; $('[data-done]').hidden = true;
    if (f.size > MAX) { file = null; read = null; $('[data-read]').hidden = true; say('too-big'); return; }
    var reader = new FileReader();
    // Another file: what was read from the last one goes at once, so nothing can bring in this one unseen (Codex on #106).
    read = null; $('[data-read]').hidden = true;
    reader.onload = function () { file = { name: f.name, bytes: new Uint8Array(reader.result) }; choice = { kind: null, match: null }; run(); };
    reader.onerror = function () { say('failed'); };
    reader.readAsArrayBuffer(f);
  }
  $('[data-pick]').addEventListener('change', function (e) { take(e.target.files && e.target.files[0]); e.target.value = ''; });
  var drop = $('[data-drop]');
  drop.addEventListener('dragover', function (e) { e.preventDefault(); drop.classList.add('is-over'); });
  drop.addEventListener('dragleave', function () { drop.classList.remove('is-over'); });
  drop.addEventListener('drop', function (e) { e.preventDefault(); drop.classList.remove('is-over'); take(e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0]); });
  $('[data-again]').addEventListener('click', function () { if (!busy) $('[data-pick]').click(); });

  /* ---- keep them: People read whole and planned again now, then sent 200 at a time ---- */
  /* Sends [push] 200 at a time. Answers { kept: ids the server kept, broke: true when a batch didn't go through } (what
     earlier batches kept stays kept, and so stays undoable: Codex on #106). */
  function sendAll(push, progress) {
    var kept = [], at = 0;
    var next = function () {
      if (at >= push.length) return Promise.resolve({ kept: kept, broke: false });
      var part = push.slice(at, at + BATCH);
      return book.send(part).then(function (a) {
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
  $('[data-go]').addEventListener('click', function () {
    if (busy || !file || !read) return;
    var me = auth.who().id;
    turn++; lock(true);
    freshPeople().then(function (ok) {
      if (!ok) { say('no-people'); return; }
      return engine().then(function (r) {
        if (!r || r.status !== 'ok') { say('failed'); return; }
        read = r;
        var made = CI.applyPlan(book.rows(), r.plan || [], me, Date.now(), function () { return window.crypto.randomUUID(); });
        if (!made.push.length) { draw(); return; }
        var n = made.push.length;
        say('bringing', { done: 0, n: n });
        return sendAll(made.push, function (k) { say('bringing', { done: k, n: n }); }).then(function (res) {
          var kept = res.kept;
          if (!kept.length && res.broke) { say('failed'); return; }
          var keptSet = {}; kept.forEach(function (id) { keptSet[id] = true; });
          done = made.changes.filter(function (c) { return keptSet[c.id]; });
          // Kept: what was read is spent (People has changed); a new file, or this one again, reads afresh.
          read = null;
          say(null);
          $('[data-read]').hidden = true; $('[data-done]').hidden = false;
          $('[data-done-t]').textContent = kept.length === n ? words('done', { n: n }) : words(res.broke ? 'done-broke' : 'done-part', { kept: kept.length, n: n });
          $('[data-undo]').hidden = !done.length;
        });
      });
    }).catch(function () { say('failed'); }).then(function () { lock(false); });
  });

  /* ---- Undo: what it added deleted again, what it filled cleared (unless changed since), as the phone's Undo ---- */
  $('[data-undo]').addEventListener('click', function () {
    if (busy || !done || !done.length) return;
    var me = auth.who().id;
    lock(true); say('undoing');
    freshPeople().then(function (ok) {
      if (!ok) { say('undo-failed'); return; }
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
    }).catch(function () { say('undo-failed'); }).then(function () { lock(false); $('[data-read]').hidden = true; });
  });

  auth.current().then(function (s) {
    if (!s) return;
    main.hidden = false;
    book.start(function () {});
  });
})();
