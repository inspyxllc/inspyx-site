/* Keeping past inspections on the website (2026-11-26, the web importers, piece 2's store step). The reader (I2's
   engine, inspyxImport.inspections) says which inspections of a history file are new against the ones kept, and gives
   each new one's row; this file makes those rows the phone's own past_inspections rows (I2's schema v43, the same rules
   on the phone and the server: inspyx-mobile test/fixtures/past_inspection_rules.json), and takes an import back.
     - A new inspection: the reader's row, plus a fresh id, the account, ONE import id for the whole import, added and
       changed now, neither removed nor deleted. Every key present; texts strings ("" for none).
     - Undo of an import: every row of that import id, deleted now (a changed row's time is now, or just past its last).
     - The kept ones the reader compares against: neither removed nor deleted, as { date, date_in_file, address, client,
       reference } (the address exactly as the row holds it).
   No words here. Works in the browser (window.InspyxPastStore) and in Node. */
(function (root) {
  'use strict';
  var KIND = 'past_inspections';
  var TEXTS = ['source', 'date', 'dateInFile', 'address', 'client', 'clientEmail', 'clientPhone', 'buyerAgent', 'listingAgent', 'services', 'inspector', 'reference', 'notes'];
  var ID = /^[A-Za-z0-9_.:-]{1,64}$/, DATE = /^(\d{4}-\d{2}-\d{2})?$/, TEXT_MAX = 200000, ROW_MAX = 256 * 1024, FEE_MAX = 100000000;
  var changedAt = function (r, now) { return Math.max(now, (r.updated_at || 0) + 1); };
  function wire(data) { return { kind: KIND, id: data.id, updated_at: data.updatedAt, deleted_at: data.deletedAt, data: data }; }

  /* The rules' problem with [data], or null (past_inspection_rules.json, as the phone and the server answer): 'shape'
     (a key missing or one it doesn't have, a text that isn't text, a number that isn't whole), 'id', 'date', 'fee',
     'too_long' (a text over 200,000 characters, or a row over 256 KB). */
  var KEYS = ['id', 'ownerAccountId', 'importId', 'addedAt', 'removedAt', 'updatedAt', 'deletedAt', 'feeCents'].concat(TEXTS);
  var whole = function (v) { return Number.isSafeInteger(v); };
  function problem(data) {
    var keys = Object.keys(data);
    if (keys.length !== KEYS.length || !KEYS.every(function (k) { return keys.indexOf(k) >= 0; })) return 'shape';
    if (typeof data.id !== 'string' || typeof data.ownerAccountId !== 'string' || typeof data.importId !== 'string') return 'shape';
    if (!TEXTS.every(function (k) { return typeof data[k] === 'string'; })) return 'shape';
    if (!whole(data.addedAt) || !whole(data.updatedAt)) return 'shape';
    if ([data.removedAt, data.deletedAt, data.feeCents].some(function (v) { return v !== null && !whole(v); })) return 'shape';
    if (!ID.test(data.id)) return 'id';
    if (!DATE.test(data.date)) return 'date';
    if (data.feeCents !== null && (data.feeCents < 0 || data.feeCents > FEE_MAX)) return 'fee';
    if (TEXTS.some(function (k) { return data[k].length > TEXT_MAX; })) return 'too_long';
    if (new TextEncoder().encode(JSON.stringify(data)).length > ROW_MAX) return 'too_long';
    return null;
  }

  /* The rows for the reader's new inspections ([inspections]: its answer's list). Answers { push, problems: [{ line,
     problem }] } (a row the rules would refuse is never sent). */
  function newRows(inspections, me, now, newId, importId) {
    var push = [], problems = [];
    inspections.forEach(function (x) {
      if (!x.new || !x.row) return;
      var data = { id: newId(), ownerAccountId: me, importId: importId, addedAt: now };
      TEXTS.forEach(function (k) { data[k] = typeof x.row[k] === 'string' ? x.row[k] : ''; });
      data.feeCents = typeof x.row.feeCents === 'number' ? x.row.feeCents : null;
      data.removedAt = null; data.updatedAt = now; data.deletedAt = null;
      var p = problem(data);
      if (p) problems.push({ line: x.line, problem: p }); else push.push(wire(data));
    });
    return { push: push, problems: problems };
  }

  /* Undo of the import [importId]: its rows deleted. */
  function undoImport(rows, importId, me, now) {
    return rows.filter(function (r) { return r && r.data && r.data.ownerAccountId === me && r.data.importId === importId && r.deleted_at == null && r.data.deletedAt == null; })
      .map(function (r) { var d = JSON.parse(JSON.stringify(r.data)); d.deletedAt = now; d.updatedAt = changedAt(r, now); return wire(d); });
  }

  /* The kept ones, as the reader takes them (existing_past). */
  function keptForReader(rows, me) {
    return rows.filter(function (r) { return r && r.data && r.data.ownerAccountId === me && r.deleted_at == null && r.data.deletedAt == null && r.data.removedAt == null; })
      .map(function (r) { var d = r.data; return { date: d.date, date_in_file: d.dateInFile, address: d.address, client: d.client, reference: d.reference }; });
  }

  var api = { newRows: newRows, undoImport: undoImport, keptForReader: keptForReader, problem: problem };
  if (typeof module === 'object' && module.exports) module.exports = api; else root.InspyxPastStore = api;
})(typeof window !== 'undefined' ? window : this);
