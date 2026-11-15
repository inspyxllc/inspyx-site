/* Your numbers (2026-11-15, board item 32): the signed-in inspector's own numbers, from the numbers function
   (backend/supabase/functions/numbers in the app's repo), for the signed-in inspector only. Each group the server
   sends is shown; a group it leaves out (no records behind it) stays hidden, never a 0.
   This file says no words. The page holds every sentence; the script fills in only amounts and counts. */
(function () {
  'use strict';
  var main = document.querySelector('[data-numbers]');
  var auth = window.InspyxAuth;
  if (!main || !auth) return;
  var DEADLINE = 20000;          // an ask that takes longer counts as no answer
  var STALE = 5 * 60000;         // coming back to the page after this long counts again
  var GROUPS = ['money_in', 'owed', 'reports', 'emails', 'mia'];

  var one = function (sel, root) { return (root || main).querySelector(sel); };
  var all = function (sel, root) { return [].slice.call((root || main).querySelectorAll(sel)); };
  var states = all('[data-state]'), again = one('[data-again]');
  var asked = 0, lastLook = 0;

  function signedOut() { window.location.replace('/signin'); }
  function state(name) { states.forEach(function (p) { p.hidden = p.getAttribute('data-state') !== name; }); again.hidden = name !== 'failed'; }

  // "$1,250", "$349.50".
  function money(cents) {
    var digits = cents % 100 === 0 ? 0 : 2;
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: digits, maximumFractionDigits: digits }).format(cents / 100);
  }
  var count = function (n) { return new Intl.NumberFormat('en-US').format(n); };
  var whole = function (v) { return typeof v === 'number' && Math.floor(v) === v && v >= 0 && v <= Number.MAX_SAFE_INTEGER; };

  /* One group filled in; false when what the server sent isn't a whole set of counts (then it stays hidden). */
  function fill(tile, group) {
    if (!group || typeof group !== 'object') return false;
    var slots = all('[data-v]', tile);
    if (!slots.every(function (s) { return whole(group[s.getAttribute('data-v')]); })) return false;
    slots.forEach(function (s) {
      var name = s.getAttribute('data-v'), v = group[name];
      s.textContent = /cents$/.test(name) ? money(v) : count(v);
    });
    // "1 payment", "2 payments".
    all('[data-count]', tile).forEach(function (el) {
      var n = group[el.getAttribute('data-count')];
      all('[data-one]', el).forEach(function (o) { o.hidden = n !== 1; });
      all('[data-many]', el).forEach(function (o) { o.hidden = n === 1; });
    });
    // A part about something that never happened (no bounces, no client links) is left out.
    all('[data-when]', tile).forEach(function (el) { el.hidden = !(group[el.getAttribute('data-when')] > 0); });
    return true;
  }

  function show(numbers) {
    var shown = 0;
    GROUPS.forEach(function (g) {
      var tile = one('[data-group="' + g + '"]');
      tile.hidden = !(numbers && Object.prototype.hasOwnProperty.call(numbers, g) && fill(tile, numbers[g]));
      if (!tile.hidden) shown++;
    });
    state(shown ? null : 'empty');
  }

  function zone() {
    try { return Intl.DateTimeFormat().resolvedOptions().timeZone || ''; } catch (e) { return ''; }
  }

  function look() {
    var mine = ++asked;
    lastLook = Date.now();
    if (all('[data-group]:not([hidden])').length === 0) state('loading');
    var body = { action: 'read' };
    var z = zone();
    if (z) body.zone = z;
    return auth.ask('numbers', body, DEADLINE).then(function (r) {
      if (mine !== asked) return;
      if (r === null) { signedOut(); return; }
      if (r.status === 200 && r.json && r.json.numbers && typeof r.json.numbers === 'object') { show(r.json.numbers); return; }
      if (all('[data-group]:not([hidden])').length === 0) state('failed');
    }, function () {
      if (mine !== asked) return;
      if (all('[data-group]:not([hidden])').length === 0) state('failed');
    });
  }

  again.addEventListener('click', function () { look(); });
  function back() { if (document.visibilityState === 'visible' && Date.now() - lastLook > STALE) look(); }
  document.addEventListener('visibilitychange', back);
  window.addEventListener('focus', back);

  var me = auth.who();
  if (!me) { signedOut(); return; }
  all('[data-email]').forEach(function (e) { e.textContent = me.email; });
  main.hidden = false;
  look();
})();
