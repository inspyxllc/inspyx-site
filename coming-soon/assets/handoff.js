/* One file handed from one page of this site to another, in this browser only (switch PR 8, 2026-11-27): Bring your
   business's "Convert it now" puts the file here and opens Templates, which takes it once and converts it, so the
   inspector never picks it again. Kept in this browser's own storage for this site (IndexedDB), never sent anywhere,
   taken out as it is read, and taken only while fresh (10 minutes): an old one left behind is dropped.
   This file says no words. */
window.inspyxHandoff = (function () {
  var DB = 'inspyx-handoff', STORE = 'files', KEY = 'convert', FRESH = 10 * 60 * 1000;
  function open() {
    return new Promise(function (ok, no) {
      if (!window.indexedDB) { no(new Error('storage')); return; }
      var r = window.indexedDB.open(DB, 1);
      r.onupgradeneeded = function () { r.result.createObjectStore(STORE); };
      r.onsuccess = function () { ok(r.result); };
      r.onerror = function () { no(r.error); };
    });
  }
  /* Keeps {name, bytes} for the next page. */
  function put(file) {
    return open().then(function (db) {
      return new Promise(function (ok, no) {
        var t = db.transaction(STORE, 'readwrite');
        t.objectStore(STORE).put({ name: file.name, bytes: file.bytes, at: Date.now() }, KEY);
        t.oncomplete = function () { db.close(); ok(); };
        t.onerror = t.onabort = function () { db.close(); no(t.error); };
      });
    });
  }
  /* The file kept, taken out as it is read: {name, bytes}, or null (none, or not fresh). */
  function take() {
    return open().then(function (db) {
      return new Promise(function (ok, no) {
        var t = db.transaction(STORE, 'readwrite'), s = t.objectStore(STORE), got = null;
        var g = s.get(KEY);
        g.onsuccess = function () { got = g.result || null; s.delete(KEY); };
        t.oncomplete = function () {
          db.close();
          ok(got && typeof got.name === 'string' && got.bytes instanceof Uint8Array && Date.now() - got.at < FRESH
            ? { name: got.name, bytes: got.bytes } : null);
        };
        t.onerror = t.onabort = function () { db.close(); no(t.error); };
      });
    });
  }
  return { put: put, take: take };
})();
