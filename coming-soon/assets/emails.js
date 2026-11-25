/* Emails (2026-11-23, job 2 of the lead's inspector review): the automatic emails on the web, the same five as the
   phone's Settings -> Automations (his 11-21 picks): on or off, when, who gets each, the Google review link, and a
   preview of the client's email.
   How: the sync function keeps them as one row (automation_settings, id "automation"), newest change wins, the
   phone's own row (inspyx-mobile lib/src/data/automation_settings.dart). A message with no setting of its own is
   its default (automation_rules.dart automationDefaults). Each change writes the row whole at once, checked first
   against the server's twin rules (automation_rules.dart): a "when" from the message's own choices, roles from the
   three in their order with no repeat, a review link that is https on a Google host, as written, at most 500
   characters. Wording the inspector wrote on the phone (subject/body) is kept as it is; it's edited on the phone.
   The preview is the automation-preview function's text, with the account's own saved settings.
   This file says no words: the page holds every sentence. */
(function () {
  'use strict';
  var main = document.querySelector('[data-eml]');
  var auth = window.InspyxAuth;
  if (!main || !auth) return;
  var DEADLINE = 20000, POLL = 30000, KIND = 'automation_settings', ID = 'automation';
  var IDS = ['booking_confirmed', 'booking_rescheduled', 'sign_and_pay', 'day_before', 'review_request'];
  var ROLES = ['client', 'buyer_agent', 'listing_agent'];
  var WHEN = { booking_confirmed: ['now'], booking_rescheduled: ['now'], sign_and_pay: ['3d', '2d', '1d'],
    day_before: ['1d', '2d', 'same_day'], review_request: ['right_after', '1d', '3d'] };
  var DEFAULTS = {
    booking_confirmed: { on: true, when: 'now', to: ['client', 'buyer_agent'] },
    booking_rescheduled: { on: true, when: 'now', to: ['client', 'buyer_agent'] },
    sign_and_pay: { on: true, when: '2d', to: ['client'] },
    day_before: { on: true, when: '1d', to: ['client', 'buyer_agent', 'listing_agent'] },
    review_request: { on: true, when: 'right_after', to: ['client'] },
  };
  var URI_CHARS = /^[A-Za-z0-9\-._~:/?#[\]@!$&'()*+,;=%]+$/;

  var $ = function (sel, el) { return (el || document).querySelector(sel); };
  var all = function (sel, el) { return [].slice.call((el || document).querySelectorAll(sel)); };
  var tpl = function (name) { return document.querySelector('template[data-t="' + name + '"]').content.firstElementChild.cloneNode(true); };
  var showOne = function (el, attr, which) { all('[' + attr + ']', el).forEach(function (x) { x.hidden = x.getAttribute(attr) !== which; }); };
  var words = (function () {
    var box = document.querySelector('template[data-t="words"]').content;
    return function (key) { var w = box.querySelector('[data-w="' + key + '"]'); return w ? w.textContent : ''; };
  })();

  var me = null, row = null, point = null, loaded = false, failing = false, pulling = null, saving = 0;   // saves sent or waiting their turn
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
    if (pulling) return pulling;
    var loop = function () { return exchange([]).then(function (a) { return a && a.more ? loop() : null; }); };
    pulling = loop().then(function () { loaded = true; failing = false; }, function () { failing = true; })
      .then(function () { pulling = null; shown(); });
    return pulling;
  }
  var held = function () { return row && row.deleted_at === null && row.data.deletedAt == null ? row.data : null; };
  /* A message as set, or its default (a copy). */
  function settingOf(id) {
    var h = held(), m = h && h.messages && h.messages[id];
    var s = m && typeof m.on === 'boolean' && typeof m.when === 'string' && Array.isArray(m.to) ? m : DEFAULTS[id];
    return { on: s.on, when: s.when, to: s.to.slice(), subject: typeof s.subject === 'string' ? s.subject : null, body: typeof s.body === 'string' ? s.body : null };
  }

  function reviewProblem(url) {
    if (url === null) return false;
    if (url === '' || url.trim() !== url || url.length > 500 || !URI_CHARS.test(url)) return true;
    var u; try { u = new URL(url); } catch (e) { return true; }
    if (u.protocol !== 'https:' || !u.hostname) return true;
    var host = u.hostname.toLowerCase(), under = function (d) { return host === d || host.slice(-(d.length + 1)) === '.' + d; };
    return !(under('google.com') || under('g.page') || host === 'g.co' || host === 'maps.app.goo.gl');
  }

  /* Writes the row whole with [change] applied: (data) => void. One at a time (Codex on #77): each builds on the row
     the one before it left, so two quick changes never undo each other. */
  var queue = Promise.resolve();
  function save(change) {
    saving++;
    queue = queue.then(function () { return saveNow(change); }).then(function () { saving--; shown(); });
    return queue;
  }
  function saveNow(change) {
    var before = held();
    var data = before ? JSON.parse(JSON.stringify(before)) : { id: ID, ownerAccountId: me, design: 'bold_1', brandColor: null, googleReviewUrl: null, messages: {} };
    data.messages = data.messages || {};
    IDS.forEach(function (id) { if (!data.messages[id]) data.messages[id] = settingOf(id); });
    change(data);
    var at = Date.now(); if (before && before.updatedAt >= at) at = before.updatedAt + 1;
    data.updatedAt = at; data.deletedAt = null; data.ownerAccountId = me; data.id = ID;
    say('');
    return exchange([{ kind: KIND, id: ID, updated_at: at, deleted_at: null, data: data }]).then(function (answer) {
      if (answer === null) return;
      var skip = (answer.skipped || []).some(function (x) { return x.kind === KIND; });
      // Kept, it is the row now: a second change made before the server's echo builds on it, never on the old one.
      if (!skip) take({ kind: KIND, id: ID, updated_at: at, deleted_at: null, data: data });
      say(skip ? 'refused' : 'saved');
    }, function () { say('failed'); });
  }
  function say(which) { showOne(main, 'data-say', which || ''); }

  // ---- the list ---------------------------------------------------------------------------------------------------
  var list = $('[data-list]', main), cards = {};
  function build() {
    IDS.forEach(function (id) {
      var li = tpl('msg');
      li.dataset.msg = id;
      $('[data-name]', li).textContent = words('name-' + id);
      var when = $('[data-when]', li);
      WHEN[id].forEach(function (w) {
        var o = document.createElement('option');
        o.value = w; o.textContent = words(w === 'now' ? 'when-now' : 'when-' + id + '-' + w);
        when.appendChild(o);
      });
      when.disabled = WHEN[id].length < 2;
      var who = $('[data-who]', li);
      ROLES.forEach(function (role) {
        var lab = document.createElement('label'), box = document.createElement('input'), text = document.createElement('span');
        lab.className = 'tick'; box.type = 'checkbox'; box.value = role; text.textContent = words('role-' + role);
        lab.appendChild(box); lab.appendChild(text); who.appendChild(lab);
        box.addEventListener('change', function () {
          var picked = ROLES.filter(function (r) { return $('input[value="' + r + '"]', who).checked; });
          save(function (d) { d.messages[id].to = picked; });
        });
      });
      var note = words('note-' + id);
      if (note) { $('[data-note]', li).textContent = note; $('[data-note]', li).hidden = false; }
      $('[data-on]', li).addEventListener('change', function (e) { var on = e.target.checked; save(function (d) { d.messages[id].on = on; }); });
      when.addEventListener('change', function () { var w = when.value; save(function (d) { d.messages[id].when = w; }); });
      $('[data-preview]', li).addEventListener('toggle', function (e) { if (e.target.open) preview(id, li); });
      list.appendChild(li);
      cards[id] = li;
    });
  }
  function draw() {
    IDS.forEach(function (id) {
      var li = cards[id], s = settingOf(id);
      $('[data-on]', li).checked = s.on;
      showOne(li, 'data-on-text', s.on ? 'on' : 'off');
      $('[data-body]', li).classList.toggle('eml-off', !s.on);
      $('[data-when]', li).value = s.when;
      ROLES.forEach(function (r) { $('input[value="' + r + '"]', li).checked = s.to.indexOf(r) >= 0; });
    });
    var h = held(), url = h && typeof h.googleReviewUrl === 'string' ? h.googleReviewUrl : null, box = $('[data-review]', main);
    box.hidden = false;
    showOne(box, 'data-review-say', url ? 'set' : 'needed');
    // A link typed and not yet saved stays, whatever redraws the page (Codex on #77).
    if (!reviewDraft) $('[data-review-url]', box).value = url || '';
  }
  function preview(id, li) {
    $('[data-mail]', li).hidden = true; $('[data-mail-wait]', li).hidden = false; $('[data-mail-failed]', li).hidden = true;
    var s = settingOf(id), body = { messageId: id, role: 'client' };
    if (s.subject !== null) body.subject = s.subject;
    if (s.body !== null) body.body = s.body;
    auth.ask('automation-preview', body, DEADLINE).then(function (r) {
      $('[data-mail-wait]', li).hidden = true;
      if (!r || r.status !== 200 || !r.json || typeof r.json.subject !== 'string' || typeof r.json.text !== 'string') { $('[data-mail-failed]', li).hidden = false; return; }
      $('[data-mail-subject]', li).textContent = r.json.subject;
      $('[data-mail-text]', li).textContent = r.json.text;
      $('[data-mail]', li).hidden = false;
    }, function () { $('[data-mail-wait]', li).hidden = true; $('[data-mail-failed]', li).hidden = false; });
  }

  var reviewDraft = false;   // the link box holds a change not yet saved
  $('[data-review-url]', main).addEventListener('input', function () { reviewDraft = true; });
  $('[data-review-save]', main).addEventListener('click', function () {
    var raw = $('[data-review-url]', main).value.trim(), url = raw === '' ? null : raw;
    var bad = reviewProblem(url);
    $('[data-review-bad]', main).hidden = !bad;
    if (bad) return;
    save(function (d) { d.googleReviewUrl = url; }).then(function () {
      // Saved (and nothing typed since): the box follows the saved row again.
      var h = held();
      if (h && h.googleReviewUrl === url && $('[data-review-url]', main).value.trim() === raw) { reviewDraft = false; shown(); }
    });
  });

  function shown() {
    showOne(main, 'data-live', failing ? 'offline' : loaded ? 'live' : 'connecting');
    $('[data-state="loading"]', main).hidden = loaded || failing;
    $('[data-state="failed"]', main).hidden = loaded || !failing;
    if (!loaded) return;
    $('[data-ready]', main).hidden = false;
    list.hidden = false;
    if (saving === 0) draw();
  }

  var who = auth.who();
  if (!who) { window.location.replace('/signin'); return; }
  me = who.id;
  main.hidden = false;
  list.hidden = true;
  build();
  pull();
  setInterval(function () { if (document.visibilityState === 'visible') pull(); }, POLL);
  document.addEventListener('visibilitychange', function () { if (document.visibilityState === 'visible') pull(); });
})();
