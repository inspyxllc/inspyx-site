/* New inspection (2026-11-23, job 4 of the lead's inspector review): the inspector books one themselves, and their
   phone makes the inspection at its next sync, as it does for a client's booking: its client and agents, its
   template, its fee (priced on the phone from the same price list) and its agreement.
   How: the booking function's "create" (inspyx-mobile backend/supabase/functions/booking): with "check" it answers the
   price (the phone's own quote: price changes, credits, discount, tax) and any warnings, writing nothing; without, it
   books. Outside the booking hours, or meeting another inspection, only WARNS: the button then says "Book anyway".
   The price list, booking hours, templates, agreement and email switch are read from the sync function, read only
   (an empty push), as /prices and /emails read them.
   This file says no words: the page holds every sentence. */
(function () {
  'use strict';
  var main = document.querySelector('[data-new]');
  var auth = window.InspyxAuth;
  if (!main || !auth) return;
  var DEADLINE = 20000, LIVE = 400;
  var $ = function (sel, el) { return (el || main).querySelector(sel); };
  var all = function (sel, el) { return [].slice.call((el || main).querySelectorAll(sel)); };
  var showOne = function (attr, which, el) { all('[' + attr + ']', el).forEach(function (x) { x.hidden = x.getAttribute(attr) !== which; }); };
  var words = (function () {
    var box = document.querySelector('template[data-t="words"]').content;
    return function (key) { var w = box.querySelector('[data-w="' + key + '"]'); return w ? w.textContent : ''; };
  })();
  var form = $('[data-form]'), f = form.elements;
  var text = function (v) { return typeof v === 'string' ? v : ''; };
  var two = function (n) { return (n < 10 ? '0' : '') + n; };

  // ---- the rows (read only) -------------------------------------------------------------------------------------
  var rows = Object.create(null), point = null;
  function pull() {
    var loop = function () {
      return auth.ask('sync', { push: [], after: point, limit: 500 }, DEADLINE).then(function (r) {
        if (r === null) { window.location.replace('/signin'); return null; }
        if (r.status !== 200 || !r.json || !Array.isArray(r.json.rows)) throw new Error('sync');
        r.json.rows.forEach(function (row) {
          if (!row || typeof row.kind !== 'string' || typeof row.id !== 'string') return;
          var k = row.kind + '/' + row.id, held = rows[k];
          if (!held || row.updated_at >= held.updated_at) rows[k] = row;
        });
        if (r.json.next) point = r.json.next;
        return r.json.more ? loop() : null;
      });
    };
    return loop();
  }
  var standing = function (kind) {
    return Object.keys(rows).map(function (k) { return rows[k]; })
      .filter(function (r) { return r.kind === kind && r.deleted_at == null && r.data && r.data.deletedAt == null; })
      .map(function (r) { return r.data; });
  };
  var held = function (kind, id) { var r = rows[kind + '/' + id]; return r && r.deleted_at == null ? r.data : null; };
  var byPlace = function (a, b) { return (a.position - b.position) || (a.createdAt - b.createdAt) || (a.id < b.id ? -1 : 1); };
  var services = function () { return standing('price_services').filter(function (s) { return s.parentId == null; }).sort(byPlace); };
  var addOnsOf = function (id) { return standing('price_services').filter(function (s) { return s.parentId === id; }).sort(byPlace); };
  var settings = function () { return held('booking_settings', 'booking') || {}; };

  // ---- money and time, as the phone writes them ------------------------------------------------------------------
  function money(cents) {
    var neg = cents < 0, c = Math.abs(cents);
    var s = '$' + Math.floor(c / 100).toLocaleString('en-US') + (c % 100 ? '.' + two(c % 100) : '');
    return neg ? '−' + s : s;
  }
  function length(minutes) {
    var h = Math.floor(minutes / 60), m = minutes % 60;
    return words('minutes') + ' ' + [h ? h + ' ' + words('h') : '', m ? m + ' ' + words('min') : ''].filter(Boolean).join(' ');
  }
  var zone = function () { return text(settings().timeZone) || 'America/New_York'; };
  /* The UTC instant of wall-clock [y-m-d h:mi] in [tz]: guessed as UTC, then moved by that zone's offset there. */
  function instant(y, m, d, h, mi, tz) {
    var guess = Date.UTC(y, m - 1, d, h, mi);
    var offset = function (t) {
      var p = {};
      new Intl.DateTimeFormat('en-US', { timeZone: tz, hourCycle: 'h23', year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric' })
        .formatToParts(new Date(t)).forEach(function (x) { p[x.type] = +x.value; });
      return Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute) - t;
    };
    var at = guess - offset(guess);
    return guess - offset(at);
  }
  function startsAt() {
    var d = /^(\d{4})-(\d{2})-(\d{2})$/.exec(f.day.value), t = /^(\d{2}):(\d{2})$/.exec(f.time.value);
    return d && t ? instant(+d[1], +d[2], +d[3], +t[1], +t[2], zone()) : null;
  }

  // ---- what the form says ------------------------------------------------------------------------------------------
  var main_ = function () { var r = $('input[name="service"]:checked'); return r ? r.value : null; };
  function chosen() {
    var m = main_();
    if (!m) return [];
    return [m].concat(all('input[name="addon"]:checked').map(function (b) { return b.value; }));
  }
  function person(prefix) {
    var o = { name: f[prefix + 'Name'].value.trim() || null, email: f[prefix + 'Email'].value.trim() || null, phone: f[prefix + 'Phone'].value.trim() || null };
    return o.name || o.email || o.phone ? o : null;
  }
  function details() {
    return {
      client: person('client') || {},
      agent: person('agent'),
      listingAgent: person('listing'),
      property: { street: f.street.value.trim() || null, unit: f.unit.value.trim() || null, city: f.city.value.trim() || null, state: f.state.value.trim() || null, zip: f.zip.value.trim() || null },
    };
  }
  function facts() {
    var out = {}, yes = {}, counts = {};
    all('[data-ask]').forEach(function (el) {
      var k = el.getAttribute('data-ask'), v = el.type === 'checkbox' ? el.checked : el.value.trim();
      if (k === 'squareFeet' || k === 'yearBuilt') { if (/^\d+$/.test(String(v).replace(/,/g, ''))) out[k] = parseInt(String(v).replace(/,/g, ''), 10); }
      else if (k === 'foundation') { if (v) out.foundation = v; }
      else if (el.getAttribute('data-q-kind') === 'yes_no') yes[k] = !!v;
      else if (/^\d+$/.test(String(v))) counts[k] = parseInt(v, 10);
    });
    var zip = f.zip.value.trim();
    if (zip) out.zip = zip.slice(0, 10);
    if (Object.keys(yes).length) out.yesNo = yes;
    if (Object.keys(counts).length) out.counts = counts;
    return out;
  }
  function body(extra) {
    var b = { action: 'create', serviceIds: chosen(), facts: facts(), discountCode: f.code.value.trim() || undefined, details: details(),
      templateId: f.template.value || null, agreement: !$('[data-agreement-row]').hidden && f.agreement.checked, emailClient: f.emailClient.checked };
    var at = startsAt();
    if (at !== null) b.startsAt = at;
    return Object.assign(b, extra || {});
  }

  // ---- drawing -----------------------------------------------------------------------------------------------------
  function drawServices() {
    var box = $('[data-services]'), keep = main_();
    box.textContent = '';
    services().forEach(function (s, i) {
      var lab = document.createElement('label'), r = document.createElement('input'), name = document.createElement('span'), fee = document.createElement('small');
      lab.className = 'new-choice'; r.type = 'radio'; r.name = 'service'; r.value = s.id; r.checked = keep ? keep === s.id : i === 0;
      name.textContent = s.name; fee.textContent = money(s.feeCents);
      lab.appendChild(r); lab.appendChild(name); lab.appendChild(fee); box.appendChild(lab);
    });
    drawAddOns();
  }
  function drawAddOns() {
    var m = main_(), list = $('[data-addon-list]'), keep = all('input[name="addon"]:checked').map(function (b) { return b.value; });
    list.textContent = '';
    var adds = m ? addOnsOf(m) : [];
    $('[data-addons]').hidden = adds.length === 0;
    adds.forEach(function (a) {
      var lab = document.createElement('label'), b = document.createElement('input'), name = document.createElement('span'), fee = document.createElement('small');
      lab.className = 'tick new-addon'; b.type = 'checkbox'; b.name = 'addon'; b.value = a.id; b.checked = keep.indexOf(a.id) >= 0;
      name.textContent = a.name; fee.textContent = (a.feeCents >= 0 ? words('addon-plus') : '') + money(a.feeCents);
      lab.appendChild(b); lab.appendChild(name); lab.appendChild(fee); list.appendChild(lab);
    });
    drawAsks();
  }
  /* What the chosen service's and add-ons' price changes read, asked here (distance never: the inspector confirms
     it on the phone; zip comes from the address). */
  function drawAsks() {
    var ids = chosen(), box = $('[data-ask-list]');
    var keep = {};
    all('[data-ask]').forEach(function (el) { keep[el.getAttribute('data-ask')] = el.type === 'checkbox' ? el.checked : el.value; });
    var asks = [];
    standing('price_modifiers').filter(function (m) { return ids.indexOf(m.serviceId) >= 0; }).forEach(function (m) {
      var k = m.basis === 'square_feet' ? 'squareFeet' : (m.basis === 'year_built' || m.basis === 'age') ? 'yearBuilt' : m.basis === 'foundation' ? 'foundation'
        : (m.basis === 'yes_no_question' || m.basis === 'number_question') && typeof m.questionId === 'string' ? m.questionId : null;
      if (k && asks.indexOf(k) < 0) asks.push(k);
    });
    box.textContent = '';
    $('[data-asks]').hidden = asks.length === 0;
    asks.forEach(function (k) {
      var lab = document.createElement('label'), el;
      if (k === 'foundation') {
        el = document.createElement('select');
        [['', words('foundation-pick')], ['Slab'], ['Crawlspace'], ['Basement'], ['Pier and beam']].forEach(function (o) {
          var op = document.createElement('option'); op.value = o[0]; op.textContent = o[1] || words('f-' + o[0]); el.appendChild(op);
        });
        lab.appendChild(document.createTextNode(words('foundation') + ' '));
      } else if (k === 'squareFeet' || k === 'yearBuilt') {
        el = document.createElement('input'); el.inputMode = 'numeric';
        lab.appendChild(document.createTextNode(words(k === 'squareFeet' ? 'sqft' : 'year') + ' '));
      } else {
        var q = held('price_questions', k);
        if (!q) return;
        el = document.createElement('input');
        if (q.kind === 'yes_no') { el.type = 'checkbox'; lab.className = 'tick'; } else el.inputMode = 'numeric';
        el.setAttribute('data-q-kind', q.kind);
        lab.appendChild(document.createTextNode(text(q.name) + ' '));
      }
      el.setAttribute('data-ask', k);
      if (keep[k] !== undefined) { if (el.type === 'checkbox') el.checked = !!keep[k]; else el.value = keep[k]; }
      if (el.type === 'checkbox') lab.insertBefore(el, lab.firstChild); else lab.appendChild(el);
      box.appendChild(lab);
    });
  }
  /* His booking hours that day, as times to tap (each 30 minutes); any other time can be typed. */
  function drawSlots() {
    var d = /^(\d{4})-(\d{2})-(\d{2})$/.exec(f.day.value), list = $('[data-slot-list]');
    list.textContent = '';
    var week = Array.isArray(settings().week) ? settings().week : [];
    if (!d) { $('[data-slots]').hidden = true; return; }
    var wd = new Date(Date.UTC(+d[1], +d[2] - 1, +d[3])).getUTCDay() || 7;   // Monday 1 … Sunday 7, as the phone's settings
    var times = [];
    week.filter(function (w) { return w && w.day === wd; }).forEach(function (w) {
      var a = /^(\d{2}):(\d{2})$/.exec(text(w.from)), b = /^(\d{2}):(\d{2})$/.exec(text(w.to));
      if (!a || !b) return;
      for (var t = +a[1] * 60 + +a[2]; t < +b[1] * 60 + +b[2]; t += 30) times.push(two(Math.floor(t / 60)) + ':' + two(t % 60));
    });
    $('[data-slots]').hidden = times.length === 0;
    times.forEach(function (t) {
      var b = document.createElement('button'), h = +t.slice(0, 2), m = t.slice(3);
      b.type = 'button'; b.className = 'new-slot'; b.value = t;
      b.textContent = ((h + 11) % 12 + 1) + ':' + m + (h < 12 ? ' AM' : ' PM');
      if (f.time.value === t) b.setAttribute('aria-pressed', 'true');
      b.addEventListener('click', function () { f.time.value = t; drawSlots(); live(); });
      list.appendChild(b);
    });
  }
  function drawChoices() {
    var sel = f.template, keep = sel.value;
    while (sel.options.length > 1) sel.remove(1);
    var add = function (id, name) { var o = document.createElement('option'); o.value = id; o.textContent = name; sel.appendChild(o); };
    add('inspyx.walkthrough', words('walkthrough'));
    standing('inspection_templates').sort(function (a, b) { return text(a.name) < text(b.name) ? -1 : 1; })
      .forEach(function (t) { if (/^inspector\./.test(t.id)) add(t.id, text(t.name)); });
    sel.value = keep;
    // His agreement, when he has one the clients sign.
    var signs = held('legal_default', 'signs');
    $('[data-agreement-row]').hidden = !signs;
    // Ticked whenever he has one, as his booking page has clients sign before the inspection (the lead's pick,
    // 2026-11-23); always in view, so never a silent send, and his own untick stands.
    if (!form.hasAttribute('data-touched-agreement')) f.agreement.checked = !!signs;
    // The client's confirmation email: ticked as his own switch says (his 11-21 automation settings), never silently.
    var a = held('automation_settings', 'automation'), c = a && a.messages && a.messages.booking_confirmed;
    var on = c ? c.on !== false && (!Array.isArray(c.to) || c.to.indexOf('client') >= 0) : true;
    if (!form.hasAttribute('data-touched-email')) f.emailClient.checked = on;
    $('[data-email-why]').textContent = words(on ? 'email-on' : 'email-off');
  }

  // ---- the price and the warnings, live -----------------------------------------------------------------------------
  var asked = 0, timer = null, warned = [];
  function live() {
    clearTimeout(timer);
    timer = setTimeout(check, LIVE);
  }
  function check() {
    var mine = ++asked;
    if (chosen().length === 0) { drawQuote(null); return; }
    auth.ask('booking', body({ check: true }), DEADLINE).then(function (r) {
      if (mine !== asked) return;
      if (r && r.status === 200 && r.json && r.json.state === 'check') { drawQuote(r.json); problem(''); return; }
      problem(r && r.json && typeof r.json.error === 'string' ? r.json.error : 'failed');
    }, function () { if (mine === asked) problem('failed'); });
  }
  function drawQuote(a) {
    var list = $('[data-lines]');
    list.textContent = '';
    $('[data-quote-empty]').hidden = !!a;
    $('[data-total-row]').hidden = !a;
    $('[data-length-row]').hidden = !a;
    warned = a ? a.warnings || [] : [];
    $('[data-warnings]').hidden = warned.length === 0;
    all('[data-warn]').forEach(function (p) { p.hidden = warned.indexOf(p.getAttribute('data-warn')) < 0; });
    showOne('data-book-say', warned.length ? 'anyway' : 'book');
    if (!a) return;
    a.quote.lines.forEach(function (l) {
      var li = document.createElement('li'), n = document.createElement('span'), c = document.createElement('span');
      li.className = 'new-line new-line-' + l.kind; n.textContent = l.name; c.textContent = money(l.cents);
      li.appendChild(n); li.appendChild(c); list.appendChild(li);
    });
    $('[data-total]').textContent = money(a.quote.totalCents);
    $('[data-length]').textContent = length(a.length);
  }
  function problem(which) { showOne('data-problem', which, $('[data-quote]')); }

  // ---- booking -----------------------------------------------------------------------------------------------------
  var busy = false;
  form.addEventListener('submit', function (e) {
    e.preventDefault();
    if (busy) return;
    if (chosen().length === 0) { problem('services'); return; }
    if (startsAt() === null) { problem('time'); return; }
    if (!f.clientName.value.trim() || !f.street.value.trim()) { problem('missing'); return; }
    if (f.emailClient.checked && !f.clientEmail.value.trim()) { problem('email'); return; }
    busy = true;
    var btn = $('[data-book]');
    btn.disabled = true;
    showOne('data-book-say', 'busy');
    var at = startsAt();
    auth.ask('booking', body({ force: warned.length > 0 }), DEADLINE).then(function (r) {
      busy = false; btn.disabled = false;
      if (r && r.status === 200 && r.json && r.json.state === 'booked') {
        form.hidden = true;
        var day = new Date(at), d = day.getFullYear() + '-' + two(day.getMonth() + 1) + '-' + two(day.getDate());
        $('[data-done-day]').href = '/calendar#day-' + d;
        $('[data-done]').hidden = false;
        window.scrollTo(0, 0);
        return;
      }
      if (r && r.status === 409 && r.json && r.json.error === 'warn') {
        // Something changed since the last look: it says what, and the button asks again.
        drawQuote(null); check();
        return;
      }
      showOne('data-book-say', warned.length ? 'anyway' : 'book');
      problem(r && r.json && typeof r.json.error === 'string' ? r.json.error : 'failed');
    }, function () { busy = false; btn.disabled = false; showOne('data-book-say', warned.length ? 'anyway' : 'book'); problem('failed'); });
  });
  form.addEventListener('change', function (e) {
    if (e.target.name === 'service') drawAddOns();
    if (e.target.name === 'addon') drawAsks();
    if (e.target.name === 'day') drawSlots();
    if (e.target.name === 'emailClient') form.setAttribute('data-touched-email', '');
    if (e.target.name === 'agreement') form.setAttribute('data-touched-agreement', '');
    live();
  });
  form.addEventListener('input', function (e) { if (e.target.name !== 'emailClient') live(); });

  // ---- start -----------------------------------------------------------------------------------------------------
  if (!auth.who()) { window.location.replace('/signin'); return; }
  main.hidden = false;
  var today = new Date();
  f.day.value = today.getFullYear() + '-' + two(today.getMonth() + 1) + '-' + two(today.getDate());
  var load = function () {
    pull().then(function () {
      if (services().length === 0) { showOne('data-state', 'noprices'); return; }
      showOne('data-state', '');
      form.hidden = false;
      drawServices(); drawChoices(); drawSlots();
      live();
    }, function () { showOne('data-state', 'failed'); setTimeout(load, 5000); });
  };
  load();
})();
