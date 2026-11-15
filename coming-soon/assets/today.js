/* What needs you (2026-11-14, board item 32): the signed-in inspector's main page. Moises's interview of 2026-11-14:
   when he sits down he sees only the jobs waiting on him (Q1), of four kinds (Q2); done = an empty list. The list
   comes from the needs function (backend/supabase/functions/needs in the app's repo), for the signed-in inspector
   only; "Done" ticks one off there, and Undo puts it back.
   This file says no words. The page holds every sentence; the script shows the ones that are true and writes only a
   name, an address, a date, an amount or a phone number into them. */
(function () {
  'use strict';
  var main = document.querySelector('[data-today]');
  var auth = window.InspyxAuth;
  if (!main || !auth) return;
  var DEADLINE = 20000;          // an ask that takes longer counts as no answer
  var STALE = 60000;             // coming back to the page after this long looks again
  var EVERY = 5 * 60000;         // and while it is open, this often
  var KINDS = ['money', 'not_opened', 'bounced', 'callback'];

  var one = function (sel, root) { return (root || main).querySelector(sel); };
  var all = function (sel, root) { return [].slice.call((root || main).querySelectorAll(sel)); };
  var list = one('[data-items]'), again = one('[data-again]'), undoBar = one('[data-undo-bar]'), undoButton = one('[data-undo]');
  var states = all('[data-state]'), says = all('[data-say]');
  var asked = 0;          // goes up with every look, so an older answer never replaces a newer one
  var lastLook = 0;       // when the list was last read
  var lastDone = null;    // the job last ticked off, for Undo
  var timer = null;

  function signedOut() { window.location.replace('/signin'); }
  function state(name) { states.forEach(function (p) { p.hidden = p.getAttribute('data-state') !== name; }); again.hidden = name !== 'failed'; }
  function say(name) { says.forEach(function (p) { p.hidden = p.getAttribute('data-say') !== name; }); }

  // "Nov 12", or "Nov 12, 2025" when not this year, on the inspector's own calendar.
  function shortDate(iso) {
    var t = typeof iso === 'string' ? Date.parse(iso) : NaN;
    if (isNaN(t)) return '';
    var d = new Date(t);
    var o = { month: 'short', day: 'numeric' };
    if (d.getFullYear() !== new Date().getFullYear()) o.year = 'numeric';
    return new Intl.DateTimeFormat('en-US', o).format(d);
  }
  // "$350", "$349.50".
  function money(cents) {
    var digits = cents % 100 === 0 ? 0 : 2;
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: digits, maximumFractionDigits: digits }).format(cents / 100);
  }
  // A number to dial: digits and a leading +, or none. A US number reads "(555) 555-0142".
  function dialable(v) { var s = typeof v === 'string' ? v.replace(/[\s().-]/g, '') : ''; return /^\+?[0-9]{7,15}$/.test(s) ? s : ''; }
  function phoneText(s) { var m = s.match(/^(?:\+?1)?([0-9]{3})([0-9]{3})([0-9]{4})$/); return m ? '(' + m[1] + ') ' + m[2] + '-' + m[3] : s; }
  var text = function (v) { return typeof v === 'string' ? v : ''; };

  /* One job as the page shows it, or null for a kind this page doesn't know (a newer server). */
  function row(need) {
    if (!need || KINDS.indexOf(need.kind) < 0 || typeof need.ref !== 'string') return null;
    var t = document.querySelector('template[data-t="' + need.kind + '"]');
    if (!t) return null;
    var li = t.content.firstElementChild.cloneNode(true);
    var fill = function (name, value) { all('[data-v="' + name + '"]', li).forEach(function (e) { e.textContent = value; }); };
    fill('date', shortDate(need.at));
    ['title', 'client_email', 'to_name', 'to_address', 'place', 'caller_name', 'reason', 'property_address'].forEach(function (k) { fill(k, text(need[k])); });
    if (need.kind === 'money') {
      if (typeof need.owed_cents !== 'number' || need.owed_cents <= 0) return null;
      fill('owed', money(need.owed_cents));
      var copy = one('[data-copy]', li), copied = one('[data-copied]', li);
      var url = text(need.pay_url);
      if (!/^https:\/\//.test(url)) copy.hidden = true;
      copy.addEventListener('click', function () {
        say(null);
        var done = function () { copied.hidden = false; setTimeout(function () { copied.hidden = true; }, 2500); };
        var clip = navigator.clipboard;
        if (!clip || typeof clip.writeText !== 'function') { say('copy'); return; }
        clip.writeText(url).then(done, function () { say('copy'); });
      });
    }
    if (need.kind === 'bounced') {
      all('[data-why]', li).forEach(function (p) { p.hidden = p.getAttribute('data-why') !== need.why; });
    }
    if (need.kind === 'callback') {
      var dial = dialable(need.callback_number), call = one('[data-call]', li);
      if (dial) { call.href = 'tel:' + dial; fill('phone', phoneText(dial)); call.hidden = false; }
    }
    // A part with nothing in it is not shown (and takes no separator).
    all('.bit', li).forEach(function (b) { b.hidden = b.textContent.trim() === '' || all('[data-v]', b).some(function (v) { return v.textContent === ''; }); });
    var head = one('.need-head [data-v]', li);
    if (head && head.textContent === '') head.hidden = true;
    one('[data-done]', li).addEventListener('click', function () { tick(need, li); });
    return li;
  }

  function show(needs) {
    while (list.firstChild) list.removeChild(list.firstChild);
    var rows = needs.map(row).filter(Boolean);
    rows.forEach(function (li) { list.appendChild(li); });
    state(rows.length ? null : 'empty');
  }

  function look() {
    var mine = ++asked;
    lastLook = Date.now();
    if (!list.firstChild) state('loading');
    return auth.ask('needs', { action: 'list' }, DEADLINE).then(function (r) {
      if (mine !== asked) return;
      if (r === null) { signedOut(); return; }
      if (r.status === 200 && r.json && Array.isArray(r.json.needs)) { show(r.json.needs); return; }
      if (!list.firstChild) state('failed');
    }, function () {
      if (mine !== asked) return;
      if (!list.firstChild) state('failed');
    });
  }

  function tick(need, li) {
    say(null);
    var buttons = all('button, a', li);
    buttons.forEach(function (b) { b.disabled = true; });
    auth.ask('needs', { action: 'done', kind: need.kind, ref: need.ref }, DEADLINE).then(function (r) {
      if (r === null) { signedOut(); return; }
      if (r.status === 200 && r.json && r.json.done === true) {
        asked++;   // a look already on its way may still hold this job: it is not shown
        if (li.parentNode) li.parentNode.removeChild(li);
        lastDone = need;
        undoBar.hidden = false;
        undoButton.disabled = false;
        if (!list.firstChild) state('empty');
        return;
      }
      buttons.forEach(function (b) { b.disabled = false; });
      say(r.status === 409 ? 'full' : 'done');
    }, function () {
      buttons.forEach(function (b) { b.disabled = false; });
      say('done');
    });
  }

  undoButton.addEventListener('click', function () {
    var need = lastDone;
    if (!need) return;
    say(null);
    undoButton.disabled = true;
    auth.ask('needs', { action: 'undo', kind: need.kind, ref: need.ref }, DEADLINE).then(function (r) {
      if (r === null) { signedOut(); return; }
      if (r.status === 200 && r.json && r.json.undone === true) {
        lastDone = null;
        undoBar.hidden = true;
        look();
        return;
      }
      undoButton.disabled = false;
      say('undo');
    }, function () { undoButton.disabled = false; say('undo'); });
  });

  again.addEventListener('click', function () { say(null); look(); });

  function soon() {
    clearTimeout(timer);
    timer = setTimeout(function () { if (document.visibilityState === 'visible') look(); soon(); }, EVERY);
  }
  function back() { if (document.visibilityState === 'visible' && Date.now() - lastLook > STALE) look(); }
  document.addEventListener('visibilitychange', back);
  window.addEventListener('focus', back);

  var me = auth.who();
  if (!me) { signedOut(); return; }
  all('[data-email]').forEach(function (e) { e.textContent = me.email; });
  main.hidden = false;
  look();
  soon();
})();
