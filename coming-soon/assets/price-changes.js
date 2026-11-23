/* Price changes and the inspector's own questions, on /prices (2026-11-23, job 3 of the lead's inspector review: the
   web sets up the whole price list, as the phone's Prices screen does). Spectora's model, as Moises decided on 11-09:
   a price change reads one fact of the house (square feet, year built, age, zip, distance, foundation) or one of his
   own questions (yes or no, or a number), and adds a fee AND hours: in ranges (a house on a range's end is in that
   range; past the last range nothing is added), or for each unit past a number (any part of a unit counts as one).
   How: the same rows as the phone (price_modifiers, price_questions), written through the sync function by
   prices.js's own send (window.InspyxPrices). Each row is checked first against the phone's rules, ported here from
   inspyx-mobile lib/src/data/price_list.dart (PriceChange.problem, PriceQuestion.nameProblem); the server holds the
   same rules (test/fixtures/price_rules.json) and has the last word.
   This file says no words: the page holds every sentence. */
(function () {
  'use strict';
  var P = window.InspyxPrices;
  var main = document.querySelector('[data-prc]');
  if (!P || !main) return;
  var MAX = 100000000;
  var NUMERIC = function (b) { return b !== 'zip' && b !== 'foundation' && b !== 'yes_no_question'; };
  var PER_UNIT = function (b) { return b === 'square_feet' || b === 'age' || b === 'distance' || b === 'number_question'; };
  var QUESTION = function (b) { return b === 'yes_no_question' || b === 'number_question'; };
  var FOUNDATIONS = ['Slab', 'Crawlspace', 'Basement', 'Pier and beam'];

  var $ = function (sel, el) { return (el || document).querySelector(sel); };
  var all = function (sel, el) { return [].slice.call((el || document).querySelectorAll(sel)); };
  var tpl = function (name) { return document.querySelector('template[data-t="' + name + '"]').content.firstElementChild.cloneNode(true); };
  var showOne = function (el, attr, which) { all('[' + attr + ']', el).forEach(function (x) { x.hidden = x.getAttribute(attr) !== which; }); };
  var words = (function () {
    var box = document.querySelector('template[data-t="cwords"]').content;
    return function (key) { var w = box.querySelector('[data-w="' + key + '"]'); return w ? w.textContent : ''; };
  })();
  var sameName = function (n) { return n.trim().toLowerCase().replace(/\s+/g, ' '); };
  var questions = function () { return P.standing('price_questions').sort(function (a, b) { return (a.position - b.position) || (a.createdAt - b.createdAt); }); };

  /* parseCents(…, allowNegative: true): a minus before or after the dollar sign. */
  function signedCents(text) {
    var t = String(text).trim(), neg = false;
    if (/^[-−]/.test(t)) { neg = true; t = t.slice(1); }
    if (t.charAt(0) === '$') t = t.slice(1);
    if (/^[-−]/.test(t)) { neg = true; t = t.slice(1); }
    var c = P.parseCents(t);
    return c === null ? null : neg ? -c : c;
  }
  var whole = function (text) { var t = String(text).trim().replace(/,/g, ''); return /^\d{1,9}$/.test(t) ? parseInt(t, 10) : null; };
  var normal = function (basis, v) {
    var t = String(v).trim();
    if (basis === 'zip') { var m = /^(\d{5})(?:-\d{4})?$/.exec(t); return m ? m[1] : t; }
    return t.toLowerCase().replace(/\s+/g, ' ');
  };

  /* PriceChange.problem, ported: the first problem's words, or null. */
  function problem(c) {
    if (QUESTION(c.basis) && !c.questionId) return words('p-question');
    if (!QUESTION(c.basis) && c.questionId) return words('p-question');   // the form never sends one; kept for the rule's sake
    if (c.mode === 'per_unit_over') {
      var p = c.perUnit;
      if (!PER_UNIT(c.basis)) return (P.words(c.basis) || c.basis) + ' ' + words('p-ranges-only');
      if (!p) return words('p-per');
      if (p.over < 0) return words('p-over');
      if (p.unit < 1) return words('p-unit');
      if (p.minutes < 0) return words('p-minutes');
      if (p.fee_cents === 0 && p.minutes === 0) return words('p-per-zero');
      if (Math.abs(p.fee_cents) > MAX) return words('p-big');
      return null;
    }
    var tiers = c.tiers;
    if (tiers.length === 0) return c.basis === 'yes_no_question' ? words('p-none-yesno') : NUMERIC(c.basis) ? words('p-none-ranges') : words('p-none');
    for (var i = 0; i < tiers.length; i++) {
      if (tiers[i].minutes < 0) return words('p-minutes');
      if (Math.abs(tiers[i].fee_cents) > MAX) return words('p-big');
    }
    if (!NUMERIC(c.basis)) {
      var seen = {};
      for (var j = 0; j < tiers.length; j++) {
        var t = tiers[j];
        if (c.basis === 'yes_no_question' && t.values.some(function (v) { return v !== 'yes' && v !== 'no'; })) return words('p-yesno');
        var vals = t.values.map(function (v) { return normal(c.basis, v); }).filter(function (v) { return v !== ''; });
        if (vals.length === 0) return c.basis === 'zip' ? words('p-zip-empty') : c.basis === 'yes_no_question' ? words('p-yesno-empty') : words('p-found-empty');
        for (var k = 0; k < vals.length; k++) {
          if (c.basis === 'zip' && !/^\d{5}$/.test(vals[k])) return '"' + vals[k] + '" ' + words('p-zip-bad');
          if (seen[vals[k]]) return '"' + vals[k] + '" ' + words('p-twice');
          seen[vals[k]] = true;
        }
      }
      return null;
    }
    for (var n = 0; n < tiers.length; n++) {
      var r = tiers[n];
      if (r.from == null && n > 0) return words('p-start');
      if (r.to == null && n < tiers.length - 1) return words('p-end');
      if (r.from != null && r.from < 0) return words('p-below');
      if (r.from != null && r.to != null && r.to < r.from) return words('p-backwards');
      if (n > 0 && tiers[n - 1].to != null && r.from < tiers[n - 1].to) return words('p-overlap');
    }
    return null;
  }

  // ---- your questions ---------------------------------------------------------------------------------------------

  var qDialog = $('[data-dialog="question"]'), qForm = $('[data-form="question"]'), editingQ = null;
  function drawQuestions() {
    var group = $('[data-group="questions"]', main), list = $('[data-list="questions"]', main), qs = questions();
    if (!P.ready()) return;
    group.hidden = false;
    $('[data-empty="questions"]', main).hidden = qs.length > 0;
    list.textContent = '';
    qs.forEach(function (q) {
      var li = tpl('question');
      $('[data-v="name"]', li).textContent = q.name;
      $('[data-v="kind"]', li).textContent = words('q-' + q.kind);
      $('[data-edit]', li).addEventListener('click', function () { openQuestion(q); });
      list.appendChild(li);
    });
  }
  function openQuestion(q) {
    editingQ = q;
    showOne(qForm, 'data-qtitle', q ? 'edit' : 'new');
    showOne(qForm, 'data-qproblem', '');
    qForm.elements.name.value = q ? q.name : '';
    all('input[name="kind"]', qForm).forEach(function (r) { r.checked = r.value === (q ? q.kind : 'yes_no'); r.disabled = !!q; });
    var del = $('[data-qdelete]', qForm);
    del.hidden = !q; del.setAttribute('data-armed', '0'); showOne(del, 'data-qarm', '0');
    P.say('');
    qDialog.showModal();
    qForm.elements.name.focus();
  }
  qForm.addEventListener('submit', function (e) {
    e.preventDefault();
    var name = qForm.elements.name.value.trim(), was = editingQ;
    var p = name === '' ? 'name' : name.length > 60 ? 'long'
      : questions().some(function (q) { return (!was || q.id !== was.id) && sameName(q.name) === sameName(name); }) ? 'same' : '';
    showOne(qForm, 'data-qproblem', p);
    if (p) return;
    var at = P.nextAt(was), kind = was ? was.kind : $('input[name="kind"]:checked', qForm).value;
    var position = was ? was.position : questions().reduce(function (m, q) { return q.position > m ? q.position : m; }, -1) + 1;
    P.finish(qDialog, [P.wire('price_questions', { id: was ? was.id : P.newId(), ownerAccountId: P.me(), name: name, kind: kind,
      position: position, createdAt: was ? was.createdAt : at, updatedAt: at, deletedAt: null })], 'saved');
  });
  $('[data-qdelete]', qForm).addEventListener('click', function () {
    var b = $('[data-qdelete]', qForm), was = editingQ;
    if (P.standing('price_modifiers').some(function (m) { return m.questionId === was.id; })) { showOne(qForm, 'data-qproblem', 'used'); return; }
    if (b.getAttribute('data-armed') !== '1') { b.setAttribute('data-armed', '1'); showOne(b, 'data-qarm', '1'); return; }
    var when = Date.now(), copy = Object.assign({}, was);
    copy.updatedAt = was.updatedAt >= when ? was.updatedAt + 1 : when; copy.deletedAt = when;
    P.finish(qDialog, [P.wire('price_questions', copy)], 'deleted');
  });

  // ---- a price change ---------------------------------------------------------------------------------------------

  var cDialog = $('[data-dialog="change"]'), cForm = $('[data-form="change"]'), editingC = null;
  var basisOf = function () { return cForm.elements.basis.value; };
  var modeOf = function () { var r = $('input[name="mode"]:checked', cForm); return r ? r.value : 'ranges'; };

  function addTier(t) {
    var li = tpl('tier');
    $('[data-k="from"]', li).value = t && t.from != null ? String(t.from) : '';
    $('[data-k="to"]', li).value = t && t.to != null ? String(t.to) : '';
    $('[data-k="fee"]', li).value = t ? P.centsText(t.fee_cents) : '';
    $('[data-k="hours"]', li).value = t && t.minutes ? P.hoursText(t.minutes) : '';
    all('input', li).forEach(function (x) { x.placeholder = x.getAttribute('aria-label'); });
    $('[data-remove]', li).addEventListener('click', function () { li.remove(); });
    $('[data-tiers]', cForm).appendChild(li);
  }
  function addLine(basis, t) {
    var li = tpl('line'), vals = $('[data-vals]', li);
    if (basis === 'zip') {
      var input = document.createElement('input');
      input.type = 'text'; input.setAttribute('data-k', 'zips'); input.setAttribute('inputmode', 'numeric');
      input.placeholder = words('zip-placeholder'); input.setAttribute('aria-label', P.words('zip') || 'zip');
      input.value = t ? t.values.join(', ') : '';
      vals.appendChild(input);
    } else if (basis === 'foundation') {
      // The four choices, and any other foundation the line already holds (typed on the phone or a booking page),
      // so editing never drops one (Codex on #78).
      var others = (t ? t.values : []).filter(function (v) {
        return !FOUNDATIONS.some(function (f) { return normal('foundation', f) === normal('foundation', v); });
      });
      FOUNDATIONS.concat(others).forEach(function (f) {
        var lab = document.createElement('label'), box = document.createElement('input'), span = document.createElement('span');
        lab.className = 'tick'; box.type = 'checkbox'; box.value = f; box.checked = !!t && t.values.some(function (v) { return normal('foundation', v) === normal('foundation', f); });
        span.textContent = words('f-' + f) || f; lab.appendChild(box); lab.appendChild(span); vals.appendChild(lab);
      });
    } else {
      var yn = document.createElement('strong');
      yn.setAttribute('data-yn', t.values[0]); yn.textContent = words(t.values[0]);
      vals.appendChild(yn);
      li.querySelector('[data-remove]').hidden = true;
    }
    $('[data-k="fee"]', li).value = t && (t.fee_cents || t.minutes) ? P.centsText(t.fee_cents) : '';
    $('[data-k="hours"]', li).value = t && t.minutes ? P.hoursText(t.minutes) : '';
    all('input[data-k="fee"], input[data-k="hours"]', li).forEach(function (x) { x.placeholder = x.getAttribute('aria-label'); });
    $('[data-remove]', li).addEventListener('click', function () { li.remove(); });
    $('[data-lines]', cForm).appendChild(li);
  }
  /* Draws the form for its basis and mode, from [c] when it is one (else empty). */
  function shape(c) {
    var basis = basisOf(), question = QUESTION(basis), perOk = PER_UNIT(basis);
    $('[data-c-only="question"]', cForm).hidden = !question;
    if (question) {
      var sel = cForm.elements.question, want = basis === 'yes_no_question' ? 'yes_no' : 'number', qs = questions().filter(function (q) { return q.kind === want; });
      sel.textContent = '';
      qs.forEach(function (q) { var o = document.createElement('option'); o.value = q.id; o.textContent = q.name; sel.appendChild(o); });
      if (c && c.questionId) sel.value = c.questionId;
      $('[data-c-noq]', cForm).hidden = qs.length > 0;
    }
    $('[data-c-only="mode"]', cForm).hidden = !perOk;
    if (!perOk) all('input[name="mode"]', cForm).forEach(function (r) { r.checked = r.value === 'ranges'; });
    var mode = modeOf(), numeric = NUMERIC(basis);
    $('[data-c-only="ranges"]', cForm).hidden = !(numeric && mode === 'ranges');
    $('[data-c-only="values"]', cForm).hidden = numeric;
    $('[data-c-only="per"]', cForm).hidden = !(numeric && mode === 'per_unit_over');
    ['from', 'to'].forEach(function (k) {
      var h = $('[data-c-head="' + k + '"]', cForm);
      if (!h.hasAttribute('data-plain')) h.setAttribute('data-plain', h.textContent);
      h.textContent = basis === 'year_built' ? words(k === 'from' ? 'h-year' : 'h-year-to') : h.getAttribute('data-plain');
    });
    $('[data-tiers]', cForm).textContent = '';
    $('[data-lines]', cForm).textContent = '';
    $('[data-add-line]', cForm).hidden = basis === 'yes_no_question';
    $('[data-c-head="vals"]', cForm).textContent = numeric ? '' : words('v-' + basis);
    all('[data-c-help]', cForm).forEach(function (x) { x.hidden = x.getAttribute('data-c-help') !== basis; });
    var tiers = c && c.tiers ? c.tiers : [];
    if (numeric) { (tiers.length ? tiers : [null]).forEach(addTier); }
    else if (basis === 'yes_no_question') {
      // One row per answer, each with what its tier adds: a tier may hold both (Codex on #78).
      ['yes', 'no'].forEach(function (v) {
        var t = tiers.filter(function (x) { return x.values.indexOf(v) >= 0; })[0];
        addLine(basis, { values: [v], fee_cents: t ? t.fee_cents : 0, minutes: t ? t.minutes : 0 });
      });
    } else { (tiers.length ? tiers : [null]).forEach(function (t) { addLine(basis, t); }); }
    var p = c && c.perUnit;
    cForm.elements.over.value = p ? String(p.over) : '';
    cForm.elements.unit.value = p ? String(p.unit) : '';
    cForm.elements.perFee.value = p ? P.centsText(p.fee_cents) : '';
    cForm.elements.perHours.value = p && p.minutes ? P.hoursText(p.minutes) : '';
  }
  function parsed(row) {
    var json = null;
    try { json = JSON.parse(row.tiersJson); } catch (e) { json = null; }
    var c = { basis: row.basis, mode: row.mode, questionId: row.questionId || null, tiers: [], perUnit: null };
    if (row.mode === 'per_unit_over') c.perUnit = json;
    else c.tiers = (json && Array.isArray(json.tiers) ? json.tiers : []).map(function (t) { return { from: t.from == null ? null : t.from, to: t.to == null ? null : t.to, values: t.values || [], fee_cents: t.fee_cents, minutes: t.minutes || 0 }; });
    return c;
  }
  function openChange(row, serviceId) {
    var svc = P.held('price_services', serviceId);
    editingC = { row: row, serviceId: serviceId };
    showOne(cForm, 'data-ctitle', row ? 'edit' : 'new');
    $('[data-c-service]', cForm).textContent = svc ? svc.name : '';
    var c = row ? parsed(row) : null;
    cForm.elements.basis.value = c ? c.basis : 'square_feet';
    all('input[name="mode"]', cForm).forEach(function (r) { r.checked = r.value === (c ? c.mode : 'ranges'); });
    shape(c);
    $('[data-c-problem]', cForm).hidden = true;
    var del = $('[data-cdelete]', cForm);
    del.hidden = !row; del.setAttribute('data-armed', '0'); showOne(del, 'data-carm', '0');
    P.say('');
    cDialog.showModal();
  }
  cForm.elements.basis.addEventListener('change', function () { shape(null); });
  // Changing only how it prices keeps the question chosen (Codex on #78: it fell back to the first).
  all('input[name="mode"]', cForm).forEach(function (r) {
    r.addEventListener('change', function () {
      var q = cForm.elements.question.value;
      shape(null);
      if (q && [].some.call(cForm.elements.question.options, function (o) { return o.value === q; })) cForm.elements.question.value = q;
    });
  });
  $('[data-add-tier]', cForm).addEventListener('click', function () {
    var rows = all('[data-tiers] .prc-tier', cForm), last = rows[rows.length - 1];
    addTier({ from: last ? whole($('[data-k="to"]', last).value) : null, to: null, values: [], fee_cents: 0, minutes: 0 });
  });
  $('[data-add-line]', cForm).addEventListener('click', function () { addLine(basisOf(), null); });

  /* The form as a price change, or {problem}. */
  function fromForm() {
    var basis = basisOf(), mode = PER_UNIT(basis) ? modeOf() : 'ranges';
    var c = { basis: basis, mode: mode, questionId: QUESTION(basis) ? (cForm.elements.question.value || null) : null, tiers: [], perUnit: null };
    var money = function (t) { return t.trim() === '' ? 0 : signedCents(t); };
    var hours = function (t) { return t.trim() === '' ? 0 : P.parseHours(t); };
    if (NUMERIC(basis) && mode === 'per_unit_over') {
      var over = whole(cForm.elements.over.value), unit = whole(cForm.elements.unit.value);
      var fee = money(cForm.elements.perFee.value), min = hours(cForm.elements.perHours.value);
      if (over === null || unit === null) return { problem: words('p-number') };
      if (fee === null) return { problem: words('p-money') };
      if (min === null) return { problem: words('p-hours') };
      c.perUnit = { over: over, unit: unit, fee_cents: fee, minutes: min };
      return c;
    }
    if (NUMERIC(basis)) {
      var rows = all('[data-tiers] .prc-tier', cForm);
      for (var i = 0; i < rows.length; i++) {
        var f = $('[data-k="from"]', rows[i]).value.trim(), to = $('[data-k="to"]', rows[i]).value.trim();
        var from = f === '' ? null : whole(f), end = to === '' ? null : whole(to);
        if ((f !== '' && from === null) || (to !== '' && end === null)) return { problem: words('p-number') };
        var fc = money($('[data-k="fee"]', rows[i]).value), mn = hours($('[data-k="hours"]', rows[i]).value);
        if (fc === null) return { problem: words('p-money') };
        if (mn === null) return { problem: words('p-hours') };
        c.tiers.push({ from: from, to: end, values: [], fee_cents: fc, minutes: mn });
      }
      return c;
    }
    var lines = all('[data-lines] .prc-tier', cForm);
    for (var j = 0; j < lines.length; j++) {
      var li = lines[j], values;
      if (basis === 'zip') values = $('[data-k="zips"]', li).value.split(/[\s,]+/).filter(Boolean);
      else if (basis === 'foundation') values = all('input[type="checkbox"]:checked', li).map(function (b) { return b.value; });
      else values = [$('[data-yn]', li).getAttribute('data-yn')];
      var fc2 = money($('[data-k="fee"]', li).value), mn2 = hours($('[data-k="hours"]', li).value);
      if (fc2 === null) return { problem: words('p-money') };
      if (mn2 === null) return { problem: words('p-hours') };
      // A yes or no line that adds nothing is left out (the phone's screen does the same).
      if (basis === 'yes_no_question' && fc2 === 0 && mn2 === 0) continue;
      c.tiers.push({ from: null, to: null, values: values, fee_cents: fc2, minutes: mn2 });
    }
    return c;
  }
  /* The tiersJson the phone writes (PriceTier.toJson / PerUnitOver.toJson). */
  function tiersJson(c) {
    if (c.mode === 'per_unit_over') return JSON.stringify({ over: c.perUnit.over, unit: c.perUnit.unit, fee_cents: c.perUnit.fee_cents, minutes: c.perUnit.minutes });
    return JSON.stringify({ tiers: c.tiers.map(function (t) {
      return t.values.length ? { values: t.values, fee_cents: t.fee_cents, minutes: t.minutes } : { from: t.from, to: t.to, fee_cents: t.fee_cents, minutes: t.minutes };
    }) });
  }
  cForm.addEventListener('submit', function (e) {
    e.preventDefault();
    var c = fromForm(), box = $('[data-c-problem]', cForm);
    var p = c.problem || problem(c);
    box.textContent = p || ''; box.hidden = !p;
    if (p) return;
    var was = editingC.row, at = P.nextAt(was);
    var siblings = P.changesOf(editingC.serviceId);
    P.finish(cDialog, [P.wire('price_modifiers', {
      id: was ? was.id : P.newId(), ownerAccountId: P.me(), serviceId: editingC.serviceId, basis: c.basis, mode: c.mode,
      tiersJson: tiersJson(c), position: was ? was.position : siblings.reduce(function (m, x) { return x.position > m ? x.position : m; }, -1) + 1,
      createdAt: was ? was.createdAt : at, updatedAt: at, deletedAt: null, questionId: c.questionId,
    })], 'saved');
  });
  $('[data-cdelete]', cForm).addEventListener('click', function () {
    var b = $('[data-cdelete]', cForm), was = editingC.row;
    if (b.getAttribute('data-armed') !== '1') { b.setAttribute('data-armed', '1'); showOne(b, 'data-carm', '1'); return; }
    var when = Date.now(), copy = Object.assign({}, was);
    copy.updatedAt = was.updatedAt >= when ? was.updatedAt + 1 : when; copy.deletedAt = when;
    P.finish(cDialog, [P.wire('price_modifiers', copy)], 'deleted');
  });

  // ---- hooks -------------------------------------------------------------------------------------------------------

  main.addEventListener('click', function (e) {
    var add = e.target.closest('[data-add="change"]'), edit = e.target.closest('[data-edit-change]');
    var card = e.target.closest('[data-id]');
    if (add && card) openChange(null, card.getAttribute('data-id'));
    if (edit && card) openChange(P.held('price_modifiers', edit.getAttribute('data-edit-change')), card.getAttribute('data-id'));
  });
  all('[data-add="question"]').forEach(function (b) { b.addEventListener('click', function () { openQuestion(null); }); });
  document.addEventListener('inspyx:prices-render', drawQuestions);
  drawQuestions();

  // For the checks: the ported rules, called on the rulebook's cases (tools/check_price_changes.js).
  window.InspyxPriceRules = { problem: problem, parsed: parsed, tiersJson: tiersJson };
})();
