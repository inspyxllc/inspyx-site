/* The People book on the website (job 7, W19, 2026-11-23): the clients and agents an inspector keeps on the phone
   (inspector_contacts, schema v19/v24), synced through the sync function since the People sync (contact_rules.ts),
   read here and added to. A person added here is the same row the phone keeps: its rules are the server's
   (contact_rules.ts) and the phone's (contact_row_rules.dart), one rulebook (test/fixtures/contact_rules.json).
   This file says no words. The page holds every sentence. */
(function () {
  'use strict';
  var auth = window.InspyxAuth;
  if (!auth) return;
  var DEADLINE = 20000, KIND = 'inspector_contacts';
  var ROLES = ['client', 'buyer_agent', 'listing_agent'];
  // The page's own limits, in characters (the sync's rules take any length the phone holds; these keep a typed
  // person tidy).
  var CAPS = { name: 200, phone: 100, email: 254, company: 200, note: 10000 };

  var me = null, rows = Object.create(null), point = null, loaded = false, failing = false, listeners = [];

  /* Dart's String.trim, which the phone uses (agreements.js has the same). */
  var SPACE = [0x09, 0x0a, 0x0b, 0x0c, 0x0d, 0x20, 0x85, 0xa0, 0x1680, 0x2000, 0x2001, 0x2002, 0x2003, 0x2004, 0x2005,
    0x2006, 0x2007, 0x2008, 0x2009, 0x200a, 0x2028, 0x2029, 0x202f, 0x205f, 0x3000, 0xfeff];
  function dartTrim(s) {
    var start = 0, end = s.length;
    while (start < end && SPACE.indexOf(s.charCodeAt(start)) >= 0) start++;
    while (end > start && SPACE.indexOf(s.charCodeAt(end - 1)) >= 0) end--;
    return s.slice(start, end);
  }
  var characters = function (s) { return Array.from(s).length; };

  function take(r) {
    if (!r || r.kind !== KIND || typeof r.id !== 'string' || !r.data || r.data.ownerAccountId !== me) return;
    var held = rows[r.id];
    if (!held || r.updated_at >= held.updated_at) rows[r.id] = r;
  }
  function tell() { listeners.forEach(function (f) { f(); }); }

  /* One exchange: sends [push], brings what changed after the point (agreements.js does the same). */
  function exchange(push) {
    return auth.ask('sync', { push: push, after: point, limit: 500 }, DEADLINE).then(function (r) {
      if (r === null) { window.location.replace('/signin'); return null; }
      if (r.status !== 200 || !r.json || !Array.isArray(r.json.rows)) throw new Error('sync');
      r.json.rows.forEach(take);
      if (r.json.next) point = r.json.next;
      failing = false;
      return r.json;
    });
  }
  function pull() {
    var loop = function () { return exchange([]).then(function (a) { return a && a.more ? loop() : null; }); };
    return loop().then(function () { loaded = true; }, function () { failing = true; }).then(tell);
  }

  /* The people kept, standing: [{ role, name, email, phone, company, note, at }]. */
  function people() {
    return Object.keys(rows).map(function (k) { return rows[k]; }).filter(function (r) {
      return r.deleted_at === null && r.data.deletedAt == null && ROLES.indexOf(r.data.role) >= 0 && typeof r.data.name === 'string';
    }).map(function (r) {
      var d = r.data, s = function (v) { return typeof v === 'string' ? v : ''; };
      return { role: d.role, name: d.name, email: s(d.email), phone: s(d.phone), company: s(d.company), note: s(d.note), at: d.lastUsedAt || 0 };
    });
  }

  /* [form]'s person as the rules want it, or { problem } naming the box that breaks them. */
  function personOf(form) {
    var get = function (n) { return dartTrim(form.elements[n].value || ''); };
    var role = form.elements.role.value;
    if (ROLES.indexOf(role) < 0) return { problem: 'role' };
    var name = get('name');
    if (name === '') return { problem: 'name' };
    var p = { role: role, name: name };
    var boxes = ['name', 'phone', 'email', 'company', 'note'];
    for (var i = 0; i < boxes.length; i++) {
      var b = boxes[i], v = get(b);
      if (characters(v) > CAPS[b]) return { problem: b + '_long' };
      if (b !== 'name') p[b] = v === '' ? null : v;
    }
    return p;
  }

  /* Keeps [p] as a new person; [draft] holds its id for every try of one Add, so a retry after an answer that was
     lost changes that same row, never makes a second. Answers 'saved', 'refused' or 'failed'. */
  function add(p, draft) {
    var now = Date.now();
    if (!draft.at) draft.at = now;
    // Past the newest copy held too: after a refusal for a newer copy (the phone's clock ahead of this one), the next
    // try is newer still, so "try again" can save (Codex on #87, r2; agreements.js does the same).
    var held = rows[draft.id];
    var at = Math.max(now, draft.last ? draft.last + 1 : 0, held ? held.updated_at + 1 : 0);
    draft.last = at;
    var data = { id: draft.id, ownerAccountId: me, role: p.role, name: p.name, phone: p.phone, email: p.email, company: p.company, note: p.note,
      lastUsedAt: at, createdAt: draft.at, updatedAt: at, deletedAt: null };
    var row = { kind: KIND, id: draft.id, updated_at: at, deleted_at: null, data: data };
    return exchange([row]).then(function (answer) {
      if (!answer) return 'failed';
      var mine = function (s) { return s.kind === KIND && s.id === draft.id; };
      // Kept only if the server applied it: a row skipped, or one it didn't apply because it holds a newer copy (the
      // phone changed it after an answer here was lost), is not saved (Codex on #87; agreements.js does the same).
      var kept = !(answer.skipped || []).some(mine) && !(answer.applied || []).some(function (a) { return a.applied === false && mine(a); });
      if (kept) take(row);
      return (answer.more ? pull() : Promise.resolve()).then(function () { tell(); return kept ? 'saved' : 'refused'; });
    }, function () { return 'failed'; });
  }

  window.InspyxPeopleBook = {
    start: function (onChange) {
      var who = auth.who();
      if (!who) return;
      me = who.id;
      listeners.push(onChange);
      pull();
      setInterval(function () { if (document.visibilityState === 'visible') pull(); }, 30000);
    },
    people: people,
    loaded: function () { return loaded; },
    failing: function () { return failing; },
    personOf: personOf,
    add: add,
    // For bringing people in (people-import.js): every row held, deleted ones too; and a batch sent as one exchange,
    // answering which rows were kept ('kept' ids), or null when it didn't go through.
    rows: function () { return Object.keys(rows).map(function (k) { return rows[k]; }); },
    send: function (push) {
      return exchange(push).then(function (answer) {
        if (!answer) return null;
        var refused = {};
        (answer.skipped || []).forEach(function (x) { if (x.kind === KIND) refused[x.id] = true; });
        (answer.applied || []).forEach(function (a) { if (a.kind === KIND && a.applied === false) refused[a.id] = true; });
        var kept = push.filter(function (r) { return !refused[r.id]; });
        kept.forEach(take);
        return (answer.more ? pull() : Promise.resolve()).then(function () { tell(); return { kept: kept.map(function (r) { return r.id; }) }; });
      }, function () { return null; });
    },
    pull: pull,
    newDraft: function () { return { id: window.crypto.randomUUID(), at: 0, last: 0 }; },
  };
})();
