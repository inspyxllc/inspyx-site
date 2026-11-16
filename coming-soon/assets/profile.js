/* Your company (2026-11-16, Inspyx 4): the inspector's company profile on the web, the same as on their phone.
   Moises's dashboard interview, answer 5: "business setup (... company profile, logo, signature)"; business setup
   phase 2b (the lead's order of 2026-11-16: agreements, then the profile's words, then its pictures).
   How: the sync function keeps the profile as one row (inspector_profile, id "profile"), newest change wins; the
   phone writes a pulled one only through its profile service (every report's cover prints it). This page pulls
   once, then what changed after its point, every half minute while in view and when it comes back into view.
   It writes the row whole, as the phone's profile screen saves it: each field trimmed as Dart trims, an empty one
   as none, the phone number tidied as the phone tidies it, the email checked as the phone checks it; the
   association numbers and the second inspector, which this page doesn't show, go back as they were. A new change
   time comes after the row's last one. A form being typed in is never refilled under the typing; a save over a
   change made elsewhere since the form was filled is refused once, and says so.
   This file says no words. The page holds every sentence. */
(function () {
  'use strict';
  var main = document.querySelector('[data-prf]');
  var auth = window.InspyxAuth;
  if (!main || !auth) return;
  var DEADLINE = 20000, POLL = 30000, KIND = 'inspector_profile', ID = 'profile';
  var FIELDS = ['inspectorName', 'licenseNumber', 'companyName', 'companyPhone', 'companyEmail'];

  var $ = function (sel, el) { return (el || document).querySelector(sel); };
  var all = function (sel, el) { return [].slice.call((el || document).querySelectorAll(sel)); };
  var showOne = function (el, attr, which) { all('[' + attr + ']', el).forEach(function (x) { x.hidden = x.getAttribute(attr) !== which; }); };

  // ---- the row, as the server keeps it ---------------------------------------------------------------------------

  var me = null, row = null;
  var point = null, loaded = false, pulling = null, again = false, failing = false;

  function take(r) {
    if (!r || r.kind !== KIND || r.id !== ID || !r.data || r.data.ownerAccountId !== me) return;
    if (!row || r.updated_at >= row.updated_at) row = r;
  }

  function exchange(push) {
    return auth.ask('sync', { push: push, after: point, limit: 500 }, DEADLINE).then(function (r) {
      if (r === null) { window.location.replace('/signin'); return null; }
      if (r.status !== 200 || !r.json || !Array.isArray(r.json.rows)) throw new Error('sync');
      r.json.rows.forEach(take);
      if (r.json.next) point = r.json.next;
      return r.json;
    });
  }

  function pull() {
    if (pulling) { again = true; return pulling; }
    var loop = function () { return exchange([]).then(function (a) { return a && a.more ? loop() : null; }); };
    pulling = loop().then(function () {
      loaded = true; failing = false;
    }, function () {
      failing = true;
    }).then(function () {
      pulling = null;
      render();
      if (again) { again = false; pull(); }
    });
    return pulling;
  }

  function send(push) {
    return exchange(push).then(function (answer) {
      if (answer === null) return 'failed';
      var mine = (answer.skipped || []).filter(function (s) { return s.kind === KIND && s.id === ID; });
      return mine.length === 0 ? 'saved' : 'refused';
    }, function () { return 'failed'; });
  }

  // ---- the phone's own rules (form_input.dart, profile_row_rules.dart) -------------------------------------------

  var SPACE = [0x09, 0x0a, 0x0b, 0x0c, 0x0d, 0x20, 0x85, 0xa0, 0x1680, 0x2000, 0x2001, 0x2002, 0x2003, 0x2004, 0x2005,
    0x2006, 0x2007, 0x2008, 0x2009, 0x200a, 0x2028, 0x2029, 0x202f, 0x205f, 0x3000, 0xfeff];
  function dartTrim(s) {
    var start = 0, end = s.length;
    while (start < end && SPACE.indexOf(s.charCodeAt(start)) >= 0) start++;
    while (end > start && SPACE.indexOf(s.charCodeAt(end - 1)) >= 0) end--;
    return s.slice(start, end);
  }
  /* form_input.dart's looksLikeEmail: empty is fine (the field is optional). */
  var looksLikeEmail = function (e) { var t = e.trim(); return t === '' || /^[^\s@]+@[^\s@.]+(\.[^\s@.]+)+$/.test(t); };
  /* form_input.dart's formatUsPhone: ten digits (or eleven starting with 1) and no letters become (754) 364-5501. */
  function formatUsPhone(raw) {
    var digits = raw.replace(/\D/g, ''), ten = digits.length === 11 && digits.charAt(0) === '1' ? digits.slice(1) : digits;
    if (ten.length !== 10 || /[A-Za-z]/.test(raw)) return raw.trim();
    return '(' + ten.slice(0, 3) + ') ' + ten.slice(3, 6) + '-' + ten.slice(6);
  }
  var nextAt = function (data) { var t = Date.now(); return data && data.updatedAt >= t ? data.updatedAt + 1 : t; };

  // ---- the form --------------------------------------------------------------------------------------------------

  var form = $('[data-form]', main);
  var shownAt = null;   // the change time of the row the form was filled from (null: none yet)
  var dirty = false, filled = false;

  function say(which) { showOne(main, 'data-say', which || ''); }

  function fill() {
    var d = row ? row.data : {};
    FIELDS.forEach(function (f) { form.elements[f].value = d[f] == null ? '' : String(d[f]); });
    shownAt = row ? row.updated_at : null;
    dirty = false;
    filled = true;
    need();
  }

  function need() {
    var name = dartTrim(form.elements.inspectorName.value) !== '', license = dartTrim(form.elements.licenseNumber.value) !== '';
    $('[data-need-line]', form).hidden = name && license;
    showOne(form, 'data-need', !name && !license ? 'both' : !name ? 'name' : !license ? 'license' : '');
  }

  function render() {
    showOne(main, 'data-live', failing ? 'offline' : loaded ? 'live' : 'connecting');
    if (!loaded) { showOne(main, 'data-state', failing ? 'failed' : 'loading'); return; }
    showOne(main, 'data-state', '');
    form.hidden = false;
    // A change from elsewhere shows at once, unless it would land under typing.
    if (!filled || (!dirty && (row ? row.updated_at : null) !== shownAt)) fill();
  }

  form.addEventListener('input', function () { dirty = true; need(); });
  form.elements.companyPhone.addEventListener('blur', function () {
    var tidy = formatUsPhone(form.elements.companyPhone.value);
    if (tidy !== form.elements.companyPhone.value) { form.elements.companyPhone.value = tidy; dirty = true; }
  });
  form.elements.companyEmail.addEventListener('blur', function () {
    showOne(form, 'data-problem', looksLikeEmail(form.elements.companyEmail.value) ? '' : 'email');
  });

  var busy = false;
  form.addEventListener('submit', function (e) {
    e.preventDefault();
    if (busy) return;
    var bad = !looksLikeEmail(form.elements.companyEmail.value);
    showOne(form, 'data-problem', bad ? 'email' : '');
    if (bad) return;
    if ((row ? row.updated_at : null) !== shownAt) {
      // Changed elsewhere since the form was filled: refused once; the next save keeps what is on screen.
      shownAt = row ? row.updated_at : null;
      say('elsewhere');
      return;
    }
    var held = row ? row.data : null, at = nextAt(held);
    var data = { id: ID, ownerAccountId: me };
    FIELDS.forEach(function (f) {
      var v = dartTrim(f === 'companyPhone' ? formatUsPhone(form.elements[f].value) : form.elements[f].value);
      data[f] = v === '' ? null : v;
    });
    data.associationNumbers = held && Array.isArray(held.associationNumbers) ? held.associationNumbers : null;
    data.secondInspectorName = held && typeof held.secondInspectorName === 'string' ? held.secondInspectorName : null;
    data.updatedAt = at;
    data.deletedAt = null;
    busy = true;
    form.querySelector('button[type="submit"]').disabled = true;
    send([{ kind: KIND, id: ID, updated_at: at, deleted_at: null, data: data }]).then(function (outcome) {
      busy = false;
      form.querySelector('button[type="submit"]').disabled = false;
      if (outcome === 'saved') { take({ kind: KIND, id: ID, updated_at: at, deleted_at: null, data: data }); fill(); }
      say(outcome);
    });
  });

  // ---- start -----------------------------------------------------------------------------------------------------

  var who = auth.who();
  if (!who) { window.location.replace('/signin'); return; }
  me = who.id;
  main.hidden = false;
  render();
  pull();
  document.addEventListener('visibilitychange', function () { if (document.visibilityState === 'visible') pull(); });
  setInterval(function () { if (document.visibilityState === 'visible') pull(); }, POLL);
})();
