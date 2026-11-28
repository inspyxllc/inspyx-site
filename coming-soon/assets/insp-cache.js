/* What this browser keeps of the inspector's inspections between visits, so a page opens at once and then asks the
   server only for what changed: the list's fields (each inspection's own row and its people) with the point the list
   was pulled to, and each opened inspection's fields with its own point. It lives in IndexedDB, one record per part,
   named by the account, so one account never reads another's. Everything is deleted when nobody is signed in: at
   sign-out, when a sign-in ends elsewhere, and when a page opens with no one signed in. A browser without IndexedDB,
   or one that refuses it (a private window), keeps nothing, and the pages pull everything as before.
   This file says no words. */
(function (root) {
  'use strict';
  // The name is auth.js's, which deletes it whenever no one is signed in.
  var NAME = root.InspyxAuth && root.InspyxAuth.kept, STORE = 'parts', VERSION = 1;
  // A record written by another shape of this file is not read: the page pulls it again.
  var SHAPE = 1;
  var opening = null;

  function db() {
    if (opening) return opening;
    opening = new Promise(function (resolve) {
      var req;
      if (!NAME) { resolve(null); return; }
      try { req = root.indexedDB.open(NAME, VERSION); } catch (e) { resolve(null); return; }
      req.onupgradeneeded = function () { req.result.createObjectStore(STORE, { keyPath: 'key' }); };
      req.onsuccess = function () {
        // auth.js deleting it (a sign-out in this or another tab) closes this connection, so the delete goes through.
        req.result.onversionchange = function () { req.result.close(); opening = null; };
        resolve(req.result);
      };
      req.onerror = function () { resolve(null); };
      req.onblocked = function () { resolve(null); };
    });
    return opening;
  }

  var keyOf = function (account, part) { return account + '|' + part; };
  // Whether [account] is still the one signed in on this browser: a pull that ends after a sign-out keeps nothing.
  var signedIn = function (account) { var me = root.InspyxAuth && root.InspyxAuth.who(); return !!me && me.id === account; };

  /* The part's { point, fields }, or null: none kept, another shape, or no store. part is 'list' or an inspection's id. */
  function read(account, part) {
    return db().then(function (d) {
      if (!d) return null;
      return new Promise(function (resolve) {
        try {
          var req = d.transaction(STORE, 'readonly').objectStore(STORE).get(keyOf(account, part));
          req.onsuccess = function () {
            var r = req.result;
            resolve(r && r.shape === SHAPE && r.account === account && Array.isArray(r.fields) ? { point: r.point, fields: r.fields } : null);
          };
          req.onerror = function () { resolve(null); };
        } catch (e) { resolve(null); }
      });
    });
  }

  /* Keeps the part's fields as pulled to point. Answers whether it was kept; a refusal (a full disk) keeps nothing. */
  function write(account, part, point, fields) {
    if (!signedIn(account)) return Promise.resolve(false);
    return db().then(function (d) {
      if (!d || !signedIn(account)) return false;
      return new Promise(function (resolve) {
        try {
          var t = d.transaction(STORE, 'readwrite');
          t.objectStore(STORE).put({ key: keyOf(account, part), shape: SHAPE, account: account, point: point, fields: fields });
          t.oncomplete = function () {
            // Signed out while it was being written (the delete may have run first): it goes again, with all of it.
            if (!signedIn(account)) { forget(); resolve(false); return; }
            resolve(true);
          };
          t.onerror = function () { resolve(false); };
          t.onabort = function () { resolve(false); };
        } catch (e) { resolve(false); }
      });
    });
  }

  /* Deletes everything this file ever kept, for every account. */
  function forget() {
    var gone = function () {
      opening = null;
      return new Promise(function (resolve) {
        try {
          var req = root.indexedDB.deleteDatabase(NAME);
          req.onsuccess = req.onerror = req.onblocked = function () { resolve(); };
        } catch (e) { resolve(); }
      });
    };
    // An open connection would hold the delete back until it closes.
    return (opening || Promise.resolve(null)).then(function (d) { if (d) d.close(); }, function () {}).then(gone);
  }

  root.InspyxInspCache = { read: read, write: write, forget: forget };
})(window);
