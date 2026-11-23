/* Booking page settings (2026-11-23, job 2 of the lead's inspector review: the website sets up the whole business).
   The inspector's own booking page (inspyx.com/book/<slug>): on or off, its address, the hours it offers, and its
   limits; the same settings as the phone's Settings -> Booking hours.
   How: the sync function keeps them as one row (booking_settings, id "booking"), newest change wins, the phone's
   own row (inspyx-mobile lib/src/data/booking_settings.dart). This page pulls once, then what changed every half
   minute while in view. It writes the row whole, checked first against the server's twin rules
   (booking_row_rules.dart): an address of 3 to 40 lower-case letters, digits and single dashes, not a reserved one;
   a zone from the list; at most 28 spans, each on a 5-minute step, ending after it starts, none overlapping on its
   day; each limit within its range. An address is checked as free with the booking function's "slug" action
   (taking it is the synced row's own trigger on the server).
   This file says no words: the page holds every sentence. */
(function () {
  'use strict';
  var main = document.querySelector('[data-bkg]');
  var auth = window.InspyxAuth;
  if (!main || !auth) return;
  var DEADLINE = 20000, POLL = 30000;
  var KINDS = ['booking_settings', 'inspector_profile', 'price_services'];
  var ID = 'booking';
  var ZONES = ['America/New_York', 'America/Detroit', 'America/Indiana/Indianapolis', 'America/Kentucky/Louisville',
    'America/Chicago', 'America/Denver', 'America/Boise', 'America/Phoenix', 'America/Los_Angeles', 'America/Anchorage',
    'Pacific/Honolulu', 'America/Puerto_Rico'];
  var RESERVED = ['admin', 'api', 'app', 'book', 'booking', 'bookings', 'help', 'inspyx', 'login', 'new', 'pay', 'sign',
    'signin', 'sms-consent', 'support', 'test', 'www'];
  var SLUG = /^[a-z0-9](?:[a-z0-9]|-(?=[a-z0-9])){2,39}$/;
  var LIMITS = { maxPerDay: [1, 20], minNoticeHours: [0, 168], daysAhead: [1, 120], gapMinutes: [0, 240] };
  var DEFAULTS = { on: false, timeZone: 'America/New_York', maxPerDay: 2, minNoticeHours: 24, daysAhead: 60, gapMinutes: 30,
    week: [1, 2, 3, 4, 5].map(function (d) { return { day: d, from: '08:00', to: '17:00' }; }) };
  var MAX_SPANS = 28, STEP = 15;

  var $ = function (sel, el) { return (el || document).querySelector(sel); };
  var all = function (sel, el) { return [].slice.call((el || document).querySelectorAll(sel)); };
  var tpl = function (name) { return document.querySelector('template[data-t="' + name + '"]').content.firstElementChild.cloneNode(true); };
  var showOne = function (el, attr, which) { all('[' + attr + ']', el).forEach(function (x) { x.hidden = x.getAttribute(attr) !== which; }); };
  var words = (function () {
    var box = document.querySelector('template[data-t="words"]').content;
    return function (key) { var w = box.querySelector('[data-w="' + key + '"]'); return w ? w.textContent : ''; };
  })();

  // ---- the rows ---------------------------------------------------------------------------------------------------
  var me = null, rows = Object.create(null), point = null, loaded = false, failing = false, pulling = null;
  function take(r) {
    if (!r || KINDS.indexOf(r.kind) < 0 || typeof r.id !== 'string' || !r.data || r.data.ownerAccountId !== me) return;
    var k = r.kind + '/' + r.id, held = rows[k];
    if (!held || r.updated_at >= held.updated_at) rows[k] = r;
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
  var standing = function (kind) {
    return Object.keys(rows).map(function (k) { return rows[k]; }).filter(function (r) {
      return r.kind === kind && r.deleted_at === null && r.data.deletedAt == null;
    }).map(function (r) { return r.data; });
  };
  var held = function () { var r = rows['booking_settings/' + ID]; return r && r.deleted_at === null ? r.data : null; };

  // ---- times ------------------------------------------------------------------------------------------------------
  var minutesOf = function (hhmm) {
    var m = /^([01][0-9]|2[0-3]):([0-5][0-9])$/.exec(hhmm || '');
    if (!m) return null;
    var v = Number(m[1]) * 60 + Number(m[2]);
    return v % 5 === 0 ? v : null;
  };
  var hhmmOf = function (min) { var h = Math.floor(min / 60), m = min % 60; return (h < 10 ? '0' : '') + h + ':' + (m < 10 ? '0' : '') + m; };
  var label = function (min) {
    var h = Math.floor(min / 60), m = min % 60, h12 = h % 12 === 0 ? 12 : h % 12;
    return h12 + (m === 0 ? '' : ':' + (m < 10 ? '0' : '') + m) + ' ' + words(h < 12 ? 'am' : 'pm');
  };
  function fillTimes(select, chosen, from, to) {
    select.textContent = '';
    for (var t = from; t <= to; t += STEP) {
      var o = document.createElement('option');
      o.value = hhmmOf(t); o.textContent = label(t);
      select.appendChild(o);
    }
    // A time from the phone on a 5-minute step off this list still shows as itself.
    if (chosen && !all('option', select).some(function (o) { return o.value === chosen; }) && minutesOf(chosen) !== null) {
      var extra = document.createElement('option');
      extra.value = chosen; extra.textContent = label(minutesOf(chosen));
      select.appendChild(extra);
    }
    if (chosen) select.value = chosen;
  }

  // ---- the form ---------------------------------------------------------------------------------------------------
  var form = $('[data-form]', main), daysBox = $('[data-days]', main);
  var field = function (name) { return $('[data-f="' + name + '"]', form); };
  var editing = false;   // the inspector has changed something not yet saved: a pull never overwrites it

  function suggestSlug() {
    var p = standing('inspector_profile')[0] || {};
    var base = String(p.companyName || p.inspectorName || '').toLowerCase()
      .normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/&/g, ' and ')
      .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40).replace(/-+$/g, '');
    return SLUG.test(base) && RESERVED.indexOf(base) < 0 ? base : '';
  }
  function guessZone() {
    try { var z = Intl.DateTimeFormat().resolvedOptions().timeZone; return ZONES.indexOf(z) >= 0 ? z : DEFAULTS.timeZone; }
    catch (e) { return DEFAULTS.timeZone; }
  }

  function addSpan(dayLi, span) {
    var box = $('[data-spans]', dayLi), el = tpl('span');
    fillTimes($('[data-from]', el), span.from, 0, 24 * 60 - STEP);
    fillTimes($('[data-to]', el), span.to, STEP, 24 * 60 - 5);
    $('[data-remove]', el).addEventListener('click', function () { el.remove(); dayChanged(dayLi); changed(); });
    all('select', el).forEach(function (s) { s.addEventListener('change', changed); });
    box.appendChild(el);
  }
  function dayChanged(li) {
    var spans = all('.bkg-span', li).length;
    var open = $('[data-open]', li);
    if (spans === 0) open.checked = false;
    $('[data-closed]', li).hidden = open.checked;
    $('[data-spans]', li).hidden = !open.checked;
    $('[data-add-span]', li).hidden = !open.checked;
  }
  function drawDays(week) {
    daysBox.textContent = '';
    for (var d = 1; d <= 7; d++) {
      (function (day) {
        var li = tpl('day');
        li.dataset.day = String(day);
        $('[data-day-name]', li).textContent = words('day-' + day);
        var spans = week.filter(function (s) { return s.day === day; })
          .sort(function (a, b) { return minutesOf(a.from) - minutesOf(b.from); });
        spans.forEach(function (s) { addSpan(li, s); });
        var open = $('[data-open]', li);
        open.checked = spans.length > 0;
        open.addEventListener('change', function () {
          if (open.checked && all('.bkg-span', li).length === 0) addSpan(li, { from: '08:00', to: '17:00' });
          dayChanged(li); changed();
        });
        $('[data-add-span]', li).addEventListener('click', function () {
          var last = all('.bkg-span', li).pop();
          var after = last ? minutesOf($('[data-to]', last).value) + 60 : 8 * 60;
          var from = Math.min(after, 24 * 60 - 2 * 60), to = Math.min(from + 4 * 60, 24 * 60 - 5);
          from -= from % STEP; to -= to % STEP;
          addSpan(li, { from: hhmmOf(from), to: hhmmOf(to) });
          changed();
        });
        dayChanged(li);
        daysBox.appendChild(li);
      })(d);
    }
  }

  function fill(s) {
    field('on').checked = s.on === true;
    field('slug').value = s.slug || '';
    field('timeZone').value = ZONES.indexOf(s.timeZone) >= 0 ? s.timeZone : DEFAULTS.timeZone;
    Object.keys(LIMITS).forEach(function (k) { field(k).value = String(s[k]); });
    drawDays(Array.isArray(s.week) ? s.week : []);
    onText(); linkShown(s);
  }
  function read() {
    var week = [];
    all('.bkg-day', daysBox).forEach(function (li) {
      if (!$('[data-open]', li).checked) return;
      all('.bkg-span', li).forEach(function (el) {
        week.push({ day: Number(li.dataset.day), from: $('[data-from]', el).value, to: $('[data-to]', el).value });
      });
    });
    var out = { on: field('on').checked, slug: field('slug').value.trim().toLowerCase(), timeZone: field('timeZone').value, week: week };
    Object.keys(LIMITS).forEach(function (k) { out[k] = Number(field(k).value); });
    return out;
  }
  /* The server's rules, before sending: the first problem's words, or null. */
  function problem(s) {
    if (!SLUG.test(s.slug) || RESERVED.indexOf(s.slug) >= 0) return 'p-slug';
    if (s.week.length > MAX_SPANS) return 'p-spans';
    var byDay = {};
    for (var i = 0; i < s.week.length; i++) {
      var sp = s.week[i], a = minutesOf(sp.from), b = minutesOf(sp.to);
      if (a === null || b === null || b <= a) return 'p-order';
      var list = byDay[sp.day] || (byDay[sp.day] = []);
      if (list.some(function (x) { return a < x[1] && x[0] < b; })) return 'p-overlap';
      list.push([a, b]);
    }
    for (var k in LIMITS) {
      var v = s[k];
      if (!Number.isInteger(v) || v < LIMITS[k][0] || v > LIMITS[k][1]) return 'p-limits';
    }
    return null;
  }

  function onText() { showOne(form, 'data-on-text', field('on').checked ? 'on' : 'off'); }
  function linkShown(s) {
    var box = $('[data-link]', main), ok = s && SLUG.test(s.slug || '') && held() !== null && held().slug === s.slug;
    box.hidden = !ok;
    if (ok) { var url = 'https://inspyx.com/book/' + s.slug; $('[data-link-a]', box).href = url; $('[data-link-a]', box).textContent = 'inspyx.com/book/' + s.slug; }
  }
  function say(which) { showOne(form, 'data-say', which || ''); }
  var edits = 0;   // counts every change, so a save that lands knows whether more came after it (Codex on #77)
  function changed() { editing = true; edits++; say(''); $('[data-problems]', main).hidden = true; }

  // The address: its form at once, whether it is free a moment after typing stops.
  var slugTimer = null, slugAsked = 0;
  function slugCheck() {
    var slug = field('slug').value.trim().toLowerCase(), box = $('.bkg-slug-say', main);
    clearTimeout(slugTimer);
    if (slug === '') { showOne(box, 'data-slug', ''); return; }
    if (RESERVED.indexOf(slug) >= 0) { showOne(box, 'data-slug', 'reserved'); return; }
    if (!SLUG.test(slug)) { showOne(box, 'data-slug', 'form'); return; }
    var mine = held();
    if (mine && mine.slug === slug) { showOne(box, 'data-slug', ''); return; }
    showOne(box, 'data-slug', 'checking');
    var ask = ++slugAsked;
    slugTimer = setTimeout(function () {
      auth.ask('booking', { action: 'slug', slug: slug }, DEADLINE).then(function (r) {
        if (ask !== slugAsked) return;
        if (r && r.status === 200) showOne(box, 'data-slug', 'free');
        else if (r && r.status === 409) showOne(box, 'data-slug', 'taken');
        else if (r && r.status === 400) showOne(box, 'data-slug', 'form');
        else showOne(box, 'data-slug', '');
      }, function () { if (ask === slugAsked) showOne(box, 'data-slug', ''); });
    }, 450);
  }

  form.addEventListener('input', function (e) {
    if (e.target === field('slug')) slugCheck();
    if (e.target === field('on')) onText();
    changed();
  });
  form.addEventListener('submit', function (e) {
    e.preventDefault();
    var s = read(), p = problem(s), box = $('[data-problems]', main);
    if (p) { box.textContent = words(p); box.hidden = false; return; }
    var before = held() || {};
    var at = Date.now(); if (before.updatedAt >= at) at = before.updatedAt + 1;
    var data = { id: ID, ownerAccountId: me, on: s.on, slug: s.slug, timeZone: s.timeZone, week: s.week,
      maxPerDay: s.maxPerDay, minNoticeHours: s.minNoticeHours, daysAhead: s.daysAhead, gapMinutes: s.gapMinutes,
      updatedAt: at, deletedAt: null };
    var save = $('[data-save]', form), sentAt = edits;
    save.disabled = true;
    exchange([{ kind: 'booking_settings', id: ID, updated_at: at, deleted_at: null, data: data }]).then(function (answer) {
      if (answer === null) return;
      var skip = (answer.skipped || []).filter(function (x) { return x.kind === 'booking_settings'; })[0];
      if (!skip) {
        take({ kind: 'booking_settings', id: ID, updated_at: at, deleted_at: null, data: data });
        // Changes made while it was saving stay on the form, unsaved: a pull never replaces them.
        if (edits === sentAt) { editing = false; say('saved'); }
        linkShown(s);
        return;
      }
      say(/slug|taken/.test(String(skip.reason || '')) ? 'taken' : 'refused');
    }, function () { say('failed'); }).then(function () { save.disabled = false; });
  });
  $('[data-copy]', main).addEventListener('click', function () {
    var url = $('[data-link-a]', main).href, done = function () { var c = $('[data-copied]', main); c.hidden = false; setTimeout(function () { c.hidden = true; }, 2500); };
    if (navigator.clipboard) navigator.clipboard.writeText(url).then(done, function () {});
  });

  function shown() {
    showOne(main, 'data-live', failing ? 'offline' : loaded ? 'live' : 'connecting');
    $('[data-state="loading"]', main).hidden = loaded || failing;
    $('[data-state="failed"]', main).hidden = loaded || !failing;
    if (!loaded) return;
    $('[data-warn="no-services"]', main).hidden = standing('price_services').some(function (s) { return s.parentId == null; });
    form.hidden = false;
    if (editing) return;
    var s = held();
    fill(s || { on: DEFAULTS.on, slug: suggestSlug(), timeZone: guessZone(), week: DEFAULTS.week, maxPerDay: DEFAULTS.maxPerDay,
      minNoticeHours: DEFAULTS.minNoticeHours, daysAhead: DEFAULTS.daysAhead, gapMinutes: DEFAULTS.gapMinutes });
  }

  var who = auth.who();
  if (!who) { window.location.replace('/signin'); return; }
  me = who.id;
  main.hidden = false;
  pull();
  setInterval(function () { if (document.visibilityState === 'visible') pull(); }, POLL);
  document.addEventListener('visibilitychange', function () { if (document.visibilityState === 'visible') pull(); });
})();
