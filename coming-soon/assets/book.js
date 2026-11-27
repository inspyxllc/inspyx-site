/* An inspector's booking page (2026-11-21, Inspyx 4): inspyx.com/book/<name>. Contract: shared notes "booking and
   signing - data contract v1" §2–§3, and the booking function's header (inspyx-mobile,
   backend/supabase/functions/booking/index.ts): page → times → quote → save → book, all POST /booking, no sign-in.
   Times come first (for the shortest service), then the services and their price; a time that no longer fits the
   picked services is said so and the fitting times shown. A draft is saved once the client has a time or an email
   (the inspector may follow up). The "OK to text me" box is unticked; a tick sends client.smsOk and the version of
   the words shown (SMS_CONSENT_VERSION, which must match the server's own copy: the server keeps the words).
   /book/sms-consent (and ?preview=sms-consent): the whole form with sample details, never asking the server and
   never booking: the texting registration's proof of the consent step.
   This file says no words. The page holds every sentence. */
(function () {
  'use strict';
  var main = document.querySelector('[data-bk]');
  if (!main) return;
  var ENDPOINT = 'https://btxlrfvqifnrnxffohsz.supabase.co/functions/v1/booking';
  var SMS_CONSENT_VERSION = 'v1';
  var DEADLINE = 15000;

  var $ = function (sel, el) { return (el || document).querySelector(sel); };
  var all = function (sel, el) { return [].slice.call((el || document).querySelectorAll(sel)); };
  var words = (function () {
    var box = document.querySelector('template[data-t="words"]').content;
    return function (key) { var w = box.querySelector('[data-w="' + key + '"]'); return w ? w.textContent : ''; };
  })();
  var setAll = function (name, text) { all('[data-v="' + name + '"]').forEach(function (el) { el.textContent = text; }); };
  var state = function (which) { all('[data-state]', main).forEach(function (el) { el.hidden = el.getAttribute('data-state') !== which; }); };
  var say = function (which) { all('[data-say]', main).forEach(function (el) { el.hidden = el.getAttribute('data-say') !== which; }); };

  // The texting consent step's own page (a reserved name: no inspector can have it), or the same as ?preview.
  var preview = /^\/book\/sms-consent\/?$/.test(location.pathname) || /(?:^|[?&])preview=sms-consent(?:&|$)/.test(location.search);
  var slug = (location.pathname.match(/^\/book\/([a-z0-9-]{3,40})\/?$/) || [])[1] || '';

  var page = null;       // the page's answer: inspector, timeZone, services, questions, days
  var pickedTime = null; // UTC ms
  var mainId = null;     // the picked main service
  var addOns = {};       // id → true
  var draftKey = null;
  var saving = false, savedOnce = false;
  var fitting = null;    // the days for the picked services, or null for the page's own
  var code = null;       // the discount code applied (Apply), sent with every price, the draft and the booking

  function call(body) {
    if (preview) return Promise.resolve({ status: 0, body: {} });
    var ctl = typeof AbortController === 'function' ? new AbortController() : null;
    var timer = ctl ? setTimeout(function () { ctl.abort(); }, DEADLINE) : null;
    return fetch(ENDPOINT, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
      signal: ctl ? ctl.signal : undefined, credentials: 'omit', referrerPolicy: 'no-referrer',
    }).then(function (res) {
      return res.json().catch(function () { return {}; }).then(function (b) { return { status: res.status, body: b || {} }; });
    }).catch(function () { return { status: 0, body: {} }; })
      .then(function (r) { if (timer) clearTimeout(timer); return r; });
  }

  // ---- money, time and length, in the inspector's time zone ---------------------------------------------------------
  function money(cents) {
    if (cents === 0) return words('free');
    var neg = cents < 0, c = Math.abs(cents);
    var s = '$' + Math.floor(c / 100).toLocaleString('en-US') + (c % 100 ? '.' + String(c % 100).padStart(2, '0') : '');
    return neg ? '−' + s : s;
  }
  function length(min) {
    if (!min) return '';
    var h = Math.floor(min / 60), m = min % 60;
    return (h ? h + ' ' + words('hours') : '') + (h && m ? ' ' : '') + (m ? m + ' ' + words('minutes') : '');
  }
  function tz() { return page && page.timeZone ? page.timeZone : 'America/New_York'; }
  function dayLabel(ms) { return new Intl.DateTimeFormat('en-US', { timeZone: tz(), weekday: 'short', month: 'short', day: 'numeric' }).format(ms); }
  function timeLabel(ms) { return new Intl.DateTimeFormat('en-US', { timeZone: tz(), hour: 'numeric', minute: '2-digit' }).format(ms); }
  function fullLabel(ms) {
    return new Intl.DateTimeFormat('en-US', { timeZone: tz(), weekday: 'long', month: 'long', day: 'numeric' }).format(ms) + words('at') + timeLabel(ms);
  }
  function zoneName() {
    try {
      var p = new Intl.DateTimeFormat('en-US', { timeZone: tz(), timeZoneName: 'long' }).formatToParts(Date.now());
      for (var i = 0; i < p.length; i++) if (p[i].type === 'timeZoneName') return p[i].value;
    } catch (e) { /* the zone's own id below */ }
    return tz();
  }

  // ---- step 1: the times -----------------------------------------------------------------------------------------------
  function drawDays() {
    var days = fitting || page.days || [];
    var box = $('[data-days]', main);
    box.textContent = '';
    var any = false;
    days.forEach(function (d) {
      if (!d.times || !d.times.length) return;
      any = true;
      var row = document.createElement('div'); row.className = 'bk-day';
      var h = document.createElement('h3'); h.textContent = dayLabel(d.times[0]); row.appendChild(h);
      var list = document.createElement('div'); list.className = 'bk-times';
      d.times.forEach(function (t) {
        var b = document.createElement('button'); b.type = 'button'; b.className = 'bk-time';
        b.textContent = timeLabel(t); b.setAttribute('aria-pressed', String(t === pickedTime));
        b.setAttribute('data-time', String(t));
        b.addEventListener('click', function () { pickedTime = t; say(null); drawDays(); saveSoon(); });
        list.appendChild(b);
      });
      row.appendChild(list); box.appendChild(row);
    });
    $('[data-none]', main).hidden = any;
  }

  // ---- step 2: the services, the questions and the price -----------------------------------------------------------------
  function servicesOf(parent) { return (page.services || []).filter(function (s) { return (s.parentId || null) === parent; }); }
  function pickedIds() { return mainId ? [mainId].concat(Object.keys(addOns).filter(function (k) { return addOns[k]; })) : []; }

  function drawServices() {
    var box = $('[data-services]', main);
    box.textContent = '';
    servicesOf(null).forEach(function (s) {
      var lab = document.createElement('label'); lab.className = 'bk-svc';
      var r = document.createElement('input'); r.type = 'radio'; r.name = 'bk-main'; r.value = s.id; r.checked = s.id === mainId;
      r.addEventListener('change', function () { mainId = s.id; addOns = {}; drawServices(); changed(); });
      lab.appendChild(r);
      var t = document.createElement('span'); t.className = 'bk-svc-name'; t.textContent = s.name; lab.appendChild(t);
      var f = document.createElement('span'); f.className = 'bk-svc-fee'; f.textContent = money(s.feeCents) + (s.minutes ? ' · ' + length(s.minutes) : ''); lab.appendChild(f);
      if (s.description) { var d = document.createElement('span'); d.className = 'bk-svc-desc'; d.textContent = s.description; lab.appendChild(d); }
      box.appendChild(lab);
      var kids = servicesOf(s.id);
      if (s.id === mainId && kids.length) {
        var add = document.createElement('div'); add.className = 'bk-addons';
        var p = document.createElement('p'); p.className = 'bk-note'; p.textContent = words('addons'); add.appendChild(p);
        kids.forEach(function (a) {
          var l = document.createElement('label'); l.className = 'bk-check';
          var c = document.createElement('input'); c.type = 'checkbox'; c.value = a.id; c.checked = !!addOns[a.id];
          // An add-on can bring its own price questions: show (or drop) them before the price is asked again.
          c.addEventListener('change', function () { addOns[a.id] = c.checked; drawAsks(); changed(); });
          l.appendChild(c);
          var n = document.createElement('span'); n.textContent = ' ' + a.name + ' · ' + money(a.feeCents); l.appendChild(n);
          add.appendChild(l);
        });
        box.appendChild(add);
      }
    });
    drawAsks();
  }

  function asksNeeded() {
    var need = {};
    pickedIds().forEach(function (id) {
      (page.services || []).forEach(function (s) { if (s.id === id) (s.asks || []).forEach(function (a) { need[a] = true; }); });
    });
    return need;
  }
  function drawAsks() {
    var need = asksNeeded();
    var shown = false;
    ['squareFeet', 'yearBuilt', 'foundation'].forEach(function (k) {
      var el = $('[data-ask="' + k + '"]', main); el.hidden = !need[k]; shown = shown || !!need[k];
    });
    var qbox = $('[data-questions]', main);
    var keep = {};
    all('[data-q]', qbox).forEach(function (el) { keep[el.getAttribute('data-q')] = el; });
    qbox.textContent = '';
    (page.questions || []).forEach(function (q) {
      if (!need[q.id]) return;
      shown = true;
      var el = keep[q.id];
      if (!el) {
        el = document.createElement('label'); el.setAttribute('data-q', q.id); el.setAttribute('data-kind', q.kind);
        el.appendChild(document.createTextNode(q.name + ' '));
        var input;
        if (q.kind === 'yes_no') {
          input = document.createElement('select');
          [['', ''], ['yes', words('yes')], ['no', words('no')]].forEach(function (o) {
            var op = document.createElement('option'); op.value = o[0]; op.textContent = o[1]; input.appendChild(op);
          });
        } else {
          input = document.createElement('input'); input.type = 'number'; input.inputMode = 'numeric'; input.min = '0'; input.max = '1000';
        }
        input.addEventListener('change', changed);
        el.appendChild(input);
      }
      qbox.appendChild(el);
    });
    $('[data-asks]', main).hidden = !shown;
  }
  function intIn(id, lo, hi) {
    var v = $('#' + id).value.trim();
    if (!/^\d+$/.test(v)) return null;
    var n = Number(v);
    return n >= lo && n <= hi ? n : null;
  }
  function facts() {
    var need = asksNeeded(), f = {};
    if (need.squareFeet) { var sq = intIn('bk-sqft', 1, 1000000); if (sq !== null) f.squareFeet = sq; }
    if (need.yearBuilt) { var yr = intIn('bk-year', 1600, 2200); if (yr !== null) f.yearBuilt = yr; }
    if (need.foundation) { var fd = $('#bk-found').value.trim(); if (fd) f.foundation = fd.slice(0, 40); }
    var zip = $('#bk-zip').value.trim();
    if (zip) f.zip = zip.slice(0, 10);
    all('[data-q]', main).forEach(function (el) {
      var id = el.getAttribute('data-q'), input = el.lastChild, v = String(input.value || '').trim();
      if (el.getAttribute('data-kind') === 'yes_no') {
        if (v === 'yes' || v === 'no') { f.yesNo = f.yesNo || {}; f.yesNo[id] = v === 'yes'; }
      } else if (/^\d+$/.test(v) && Number(v) <= 1000) { f.counts = f.counts || {}; f.counts[id] = Number(v); }
    });
    return f;
  }

  // The price shown is for exactly these choices (services and facts), or there is none: a change hides the old
  // total at once, and Book waits until a price for the current choices has come back.
  // pending: the price being asked for pendingKey's choices; it settles true when that price came back.
  var asked = 0, quotedFor = null, pending = null, pendingKey = null;
  function choicesKey() { return JSON.stringify([pickedIds(), facts(), code]); }
  // The code's line under the price: on (it took money off), off (it took nothing off these choices), or none.
  var codeSay = function (which) { all('[data-code-say]', main).forEach(function (el) { el.hidden = el.getAttribute('data-code-say') !== which; }); };
  function changed() {
    say(null);
    quotedFor = null;
    // The old total stays where it is (nothing on the page jumps) but is marked as updating: it's not this price.
    var box = $('[data-quote]', main);
    box.classList.add('bk-pending'); box.setAttribute('aria-busy', 'true');
    var ids = pickedIds();
    if (!ids.length || preview) {
      if (preview) { drawQuote(sampleQuote()); quotedFor = choicesKey(); }
      pending = null; pendingKey = null;
      return Promise.resolve(quotedFor !== null);
    }
    var mine = ++asked;
    var f = facts(), key = choicesKey();
    pendingKey = key;
    // Waited for only while it's on its way: once it settles it's forgotten, so a failed price is asked for again
    // on the next try (Codex on site PR 64).
    var q = { action: 'quote', slug: slug, serviceIds: ids, facts: f };
    if (code) q.discountCode = code;
    codeSay(null);
    var thisOne = call(q).then(function (r) {
      var priced = mine === asked && r.status === 200 && !!r.body.quote;
      if (priced) {
        drawQuote(r.body.quote); quotedFor = key;
        setAll('code', code || '');
        codeSay(!code ? null : r.body.quote.discount === true ? 'on' : 'off');
      }
      if (pending === thisOne) { pending = null; pendingKey = null; }
      return priced;
    });
    pending = thisOne;
    var from = (page.days && page.days[0] && page.days[0].date) || null;
    if (!from) return;
    call({ action: 'times', slug: slug, serviceIds: ids, from: from, days: 14, facts: f }).then(function (r) {
      if (mine !== asked || r.status !== 200 || !r.body.days) return;
      fitting = r.body.days;
      var still = pickedTime !== null && fitting.some(function (d) { return (d.times || []).indexOf(pickedTime) >= 0; });
      if (pickedTime !== null && !still) { pickedTime = null; say('moved'); }
      drawDays();
    });
    saveSoon();
    return pending;
  }
  function drawQuote(q) {
    var box = $('[data-quote]', main), list = $('[data-lines]', box);
    list.textContent = '';
    (q.lines || []).forEach(function (l) {
      var li = document.createElement('li');
      var n = document.createElement('span'); n.textContent = l.name; li.appendChild(n);
      var c = document.createElement('span'); c.textContent = money(l.cents); li.appendChild(c);
      list.appendChild(li);
    });
    setAll('total', money(q.totalCents || 0));
    box.hidden = false;
    box.classList.remove('bk-pending'); box.removeAttribute('aria-busy');
  }

  // ---- step 3: the details, the draft, and booking ------------------------------------------------------------------------
  function val(id) { var v = $('#' + id).value.trim(); return v === '' ? null : v; }
  function details() {
    return {
      client: { name: val('bk-name'), email: val('bk-email'), phone: val('bk-phone'), smsOk: $('#bk-sms').checked },
      agent: { name: val('bk-agent-name'), email: val('bk-agent-email'), phone: val('bk-agent-phone') },
      property: { street: val('bk-street'), unit: val('bk-unit'), city: val('bk-city'), state: val('bk-state'), zip: val('bk-zip') },
      notes: val('bk-notes'),
    };
  }
  var saveTimer = null;
  function saveSoon() {
    if (preview) return;
    clearTimeout(saveTimer);
    saveTimer = setTimeout(save, 1500);
  }
  function save() {
    if (saving) return;
    var d = details();
    if (pickedTime === null && !(d.client.email && /@/.test(d.client.email))) return;
    saving = true;
    var body = { action: 'save', slug: slug, serviceIds: pickedIds(), facts: facts(), details: d };
    if (code) body.discountCode = code;
    if (draftKey) body.draftKey = draftKey;
    call(body).then(function (r) {
      saving = false;
      if (r.status === 200 && r.body.draftKey) {
        draftKey = r.body.draftKey;
        if (!savedOnce) { savedOnce = true; $('[data-saved]', main).hidden = false; }
      }
    });
  }
  // What's wrong with the form as it stands now, or null: checked when Book is pressed and again just before sending.
  function problem(d) {
    if (pickedTime === null || !mainId) return 'pick';
    if (!d.client.name || !d.client.email || !d.property.street || !d.property.city || !d.property.state || !d.property.zip) return 'missing';
    if (d.client.smsOk && !d.client.phone) return 'phone';
    return null;
  }
  function book() {
    if (preview) return;
    var first = problem(details());
    if (first) { say(first); return; }
    // A code typed but not applied goes with the booking too: applied now, so its price is the one waited for.
    if (typedCode() !== code) { code = typedCode(); if (!code) codeSay(null); changed(); }
    // Never book against a price for other choices (or none). A price already on its way for these choices (the last
    // field's change, as Book is pressed) is waited for; otherwise it's asked for. If it can't be had, say so.
    var key = choicesKey();
    var ready = quotedFor === key ? Promise.resolve(true) : (pendingKey === key && pending ? pending : changed());
    var btn = $('[data-book]', main);
    btn.disabled = true;
    ready.then(function (priced) {
      if (!priced || quotedFor !== choicesKey()) { btn.disabled = false; say('price'); return; }
      // The form may have changed while the price was on its way (the text box unticked, a new phone): send what it
      // says now, checked again (Codex on site PR 64).
      var d = details(), now = problem(d);
      if (now) { btn.disabled = false; say(now); return; }
      send(d, btn);
    });
  }
  function send(d, btn) {
    var body = { action: 'book', slug: slug, serviceIds: pickedIds(), facts: facts(), details: d, startsAt: pickedTime };
    if (code) body.discountCode = code;
    if (draftKey) body.draftKey = draftKey;
    if (d.client.smsOk) body.smsConsentVersion = SMS_CONSENT_VERSION;
    call(body).then(function (r) {
      btn.disabled = false;
      if (r.status === 200 && r.body.state === 'booked') {
        setAll('when', fullLabel(r.body.startsAt));
        setAll('email', d.client.email);
        state('booked');
        window.scrollTo(0, 0);
        return;
      }
      if (r.status === 409 && r.body.error === 'taken') {
        pickedTime = null;
        if (Array.isArray(r.body.days)) {
          var fresh = r.body.days;
          fitting = (fitting || page.days || []).map(function (day) {
            var match = fresh.filter(function (f) { return f.date === day.date; })[0];
            return match || day;
          });
        }
        drawDays(); say('taken'); return;
      }
      if (r.status === 404) { state('gone'); return; }
      if (r.status === 429) { state('slow'); return; }
      if (r.status === 400 && r.body.error === 'details') { say((r.body.missing || []).indexOf('client.phone') >= 0 ? 'phone' : 'missing'); return; }
      say('failed');
    });
  }

  // ---- the page -------------------------------------------------------------------------------------------------------
  function show(p) {
    page = p;
    setAll('company', (p.inspector && (p.inspector.company || p.inspector.name)) || '');
    setAll('inspector', (p.inspector && p.inspector.company && p.inspector.name) ? p.inspector.name : '');
    setAll('zone', zoneName());
    document.title = $('h1', main.querySelector('[data-state="open"]')).textContent;
    drawDays(); drawServices();
    $('[data-code]', main).hidden = !(p.services && p.services.length);
    state('open');
  }
  function sample() {
    var day = 86400000, base = Date.UTC(2026, 11, 2, 14);
    return {
      state: 'open', timeZone: 'America/New_York', inspector: { name: 'Marco Rivera', company: 'Rivera Home Inspections' },
      services: [
        { id: 'home', name: 'Full home inspection', description: 'Every system, top to bottom, with photos.', feeCents: 45000, minutes: 180, parentId: null, asks: ['squareFeet'] },
        { id: 'radon', name: 'Radon test', description: '', feeCents: 15000, minutes: 30, parentId: 'home', asks: [] },
        { id: 'wdo', name: 'Termite (WDO) inspection', description: '', feeCents: 9500, minutes: 30, parentId: 'home', asks: [] },
      ],
      questions: [],
      days: [0, 1, 2].map(function (n) { return { date: '2026-12-0' + (2 + n), times: [base + n * day, base + n * day + 3 * 3600000] }; }),
    };
  }
  function sampleQuote() {
    var lines = [{ kind: 'service', id: 'home', name: 'Full home inspection', cents: 45000 }];
    if (addOns.radon) lines.push({ kind: 'add_on', id: 'radon', name: 'Radon test', cents: 15000 });
    if (addOns.wdo) lines.push({ kind: 'add_on', id: 'wdo', name: 'Termite (WDO) inspection', cents: 9500 });
    return { lines: lines, totalCents: lines.reduce(function (s, l) { return s + l.cents; }, 0) };
  }

  ['bk-name', 'bk-email', 'bk-phone', 'bk-street', 'bk-city', 'bk-state', 'bk-zip', 'bk-agent-name', 'bk-agent-email', 'bk-agent-phone', 'bk-notes'].forEach(function (id) {
    $('#' + id).addEventListener('change', saveSoon);
  });
  ['bk-sqft', 'bk-year', 'bk-found', 'bk-zip'].forEach(function (id) { $('#' + id).addEventListener('change', changed); });
  $('[data-book]', main).addEventListener('click', book);
  // Apply (or Enter in the box): the code as typed, the server's spaces rule aside; an empty box takes it off.
  function typedCode() { var typed = $('#bk-code').value.trim().slice(0, 60); return typed === '' ? null : typed.toUpperCase(); }
  function applyCode() {
    var next = typedCode();
    if (next === code && quotedFor === choicesKey()) return;
    code = next;
    if (!code) codeSay(null);
    changed();
  }
  $('[data-apply]', main).addEventListener('click', applyCode);
  $('#bk-code').addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); applyCode(); } });

  if (preview) {
    $('[data-preview]', main).hidden = false;
    $('[data-book]', main).disabled = true;
    show(sample());
    mainId = 'home'; addOns = { radon: true }; pickedTime = page.days[0].times[0];
    drawServices(); drawDays(); drawQuote(sampleQuote());
    [['bk-name', 'Jordan Lee'], ['bk-email', 'jordan@example.com'], ['bk-phone', '(512) 555-0142'], ['bk-street', '1842 Willow Creek Dr'],
      ['bk-unit', 'Apt 103'], ['bk-city', 'Austin'], ['bk-state', 'TX'], ['bk-zip', '78704'], ['bk-sqft', '1850']].forEach(function (p) { $('#' + p[0]).value = p[1]; });
    return;
  }
  if (!slug) { state('gone'); return; }
  call({ action: 'page', slug: slug }).then(function (r) {
    if (r.status === 200 && r.body.state === 'open') { show(r.body); return; }
    if (r.status === 404) { state('gone'); return; }
    if (r.status === 429) { state('slow'); return; }
    state('down');
  });
})();
