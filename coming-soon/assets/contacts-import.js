/* Bringing people in on the website (2026-11-26, the web importers: "set up everything from a laptop"). The phone's
   own reader and planner (I2's engine, assets/import/inspyx_import.js: planContactImport, the same Dart the phone's
   InspectionStore.importContacts runs) decides, person by person, what each line does to People; this file keeps that
   plan in People's rows (inspector_contacts, which the website and the phone share), and takes it back (the phone's
   undoContactImport), and nothing more.
     - new: a row of its own (a fresh id), the plan's row as it is.
     - fill: only the boxes the plan lists; everything else as it was.
     - bring_back: the plan's whole row (the phone's store writes this same row), deleted no more.
     - unchanged: nothing.
     - A changed row's time is now, or just past its last (two changes never share a time).
     - Undo: the people it added (or brought back) are deleted again, and each box it filled is cleared, unless it has
       been changed since.
   No words here. Works in the browser (window.InspyxContactsImport) and in Node. */
(function (root) {
  'use strict';
  var ROLES = ['client', 'buyer_agent', 'listing_agent'];
  var BOXES = ['phone', 'email', 'company', 'note'];

  /* Dart's String.trim. */
  var SPACE = [0x09, 0x0a, 0x0b, 0x0c, 0x0d, 0x20, 0x85, 0xa0, 0x1680, 0x2000, 0x2001, 0x2002, 0x2003, 0x2004, 0x2005,
    0x2006, 0x2007, 0x2008, 0x2009, 0x200a, 0x2028, 0x2029, 0x202f, 0x205f, 0x3000, 0xfeff];
  function dartTrim(s) {
    var start = 0, end = s.length;
    while (start < end && SPACE.indexOf(s.charCodeAt(start)) >= 0) start++;
    while (end > start && SPACE.indexOf(s.charCodeAt(end - 1)) >= 0) end--;
    return s.slice(start, end);
  }
  /* inspection_store.dart _tidy: trimmed, and blank is none. */
  function tidy(v) { if (typeof v !== 'string') return null; var t = dartTrim(v); return t === '' ? null : t; }
  var box = function (d, b) { return d && typeof d[b] === 'string' ? d[b] : null; };
  var gone = function (r) { return r.deleted_at != null || (r.data && r.data.deletedAt != null); };
  var changedAt = function (r, now) { return Math.max(now, (r.updated_at || 0) + 1); };
  function rowOf(data) { return { kind: 'inspector_contacts', id: data.id, updated_at: data.updatedAt, deleted_at: data.deletedAt == null ? null : data.deletedAt, data: data }; }

  /* The engine's plan (I2: inspyxImport.contacts(..., { existing }).plan, the phone's own planContactImport) as the
     People rows to send, with the changes Undo needs. Each entry: { action: 'new' | 'fill' | 'bring_back' |
     'unchanged', id, row: { role, name, phone, email, company, note }, fills: { box: value } }. */
  function applyPlan(rows, entries, me, now, newId) {
    var byId = {}; rows.forEach(function (r) { if (r && r.data && r.data.ownerAccountId === me) byId[r.id] = r; });
    var push = [], changes = [], unchanged = 0;
    entries.forEach(function (e) {
      if (e.action === 'unchanged') { unchanged++; return; }
      if (e.action === 'new') {
        var nr = e.row, data = { id: newId(), ownerAccountId: me, role: nr.role, name: nr.name, phone: tidy(nr.phone), email: tidy(nr.email),
          company: tidy(nr.company), note: tidy(nr.note), lastUsedAt: now, createdAt: now, updatedAt: now, deletedAt: null };
        if (ROLES.indexOf(data.role) < 0 || !data.name) throw new Error('plan: new');
        var filled = {}; BOXES.forEach(function (b) { if (data[b] !== null) filled[b] = data[b]; });
        push.push(rowOf(data)); changes.push({ id: data.id, name: data.name, added: true, filled: filled });
        return;
      }
      var held = byId[e.id];
      if (!held || (e.action === 'fill' && gone(held)) || (e.action === 'bring_back' && !gone(held))) throw new Error('plan: ' + e.action + ' ' + e.id);
      var d = JSON.parse(JSON.stringify(held.data)), fills = e.fills || {};
      Object.keys(fills).forEach(function (b) { if (BOXES.indexOf(b) < 0) throw new Error('plan: box ' + b); d[b] = fills[b]; });
      // Brought back: the whole row the plan names (I2: the phone's store writes this same row), deleted no more.
      if (e.action === 'bring_back') {
        if (!e.row || ROLES.indexOf(e.row.role) < 0 || !e.row.name) throw new Error('plan: bring_back row');
        d.role = e.row.role; d.name = e.row.name;
        BOXES.forEach(function (b) { d[b] = tidy(e.row[b]); });
        d.deletedAt = null;
      }
      d.updatedAt = changedAt(held, now);
      push.push(rowOf(d));
      changes.push({ id: d.id, name: d.name, added: e.action === 'bring_back', filled: fills });
    });
    return { push: push, changes: changes, unchanged: unchanged };
  }

  /* Undo of [changes] (plan's), on the People rows held now. Answers the rows to send. */
  function undo(rows, changes, me, now) {
    var byId = {}; rows.forEach(function (r) { if (r && r.data && r.data.ownerAccountId === me) byId[r.id] = r; });
    var push = [];
    changes.forEach(function (c) {
      var r = byId[c.id];
      if (!r || gone(r)) return;
      var d = JSON.parse(JSON.stringify(r.data)), touched = false;
      if (c.added) { d.deletedAt = now; touched = true; }
      Object.keys(c.filled || {}).forEach(function (b) { if (box(r.data, b) === c.filled[b]) { d[b] = null; touched = true; } });
      if (!touched) return;
      d.updatedAt = changedAt(r, now);
      push.push(rowOf(d));
    });
    return push;
  }

  var api = { applyPlan: applyPlan, undo: undo, dartTrim: dartTrim };
  if (typeof module === 'object' && module.exports) module.exports = api; else root.InspyxContactsImport = api;
})(typeof window !== 'undefined' ? window : this);
