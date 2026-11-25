/* The repair request builder (2026-11-24, his Spectora list item 11): on their own report link, the client or an
   agent picks findings and asks for each a repair, a replacement, or a credit in dollars; the total is the credits'
   sum. "Share" freezes it as a read-only document at inspyx.com/repair#<its key>, which they send themselves:
   Inspyx sends nothing (his ruling 3, 2026-11-13). Each person's request is their own until they share it.

   report.js tells this file when an open report is drawn from a person's own link ("inspyx:report-open": the key,
   the report's version and its view); never for a sample, a look or the agent page. The report function keeps the
   request (README "Repair requests"): it checks every finding, works out the total, and refuses a save from a page
   older than the report. The money words are drafts, waiting on his answer (sent by the lead). */
(function () {
  'use strict';
  var API = 'https://btxlrfvqifnrnxffohsz.supabase.co/functions/v1/report';
  var DOC_BASE = 'https://inspyx.com/repair#';
  var SETTLE = 700;
  var MAX_CENTS = 100000000;
  var doc = document;

  var WORDS = {
    add: 'Add to repair request',
    added: 'In your repair request',
    bar: 'Repair request',
    count: function (n) { return n + (n === 1 ? ' finding' : ' findings'); },
    review: 'Review and share',
    sheet: 'Your repair request',
    intro: 'For each finding, ask for a repair, a replacement, or a credit. Your inspector doesn’t see this.',
    asks: { repair: 'Repair', replace: 'Replace', credit: 'Credit' },
    amount: 'Credit amount',
    inDollars: 'in dollars',
    itemNote: 'Note (optional)',
    remove: 'Remove',
    note: 'A note for the whole request (optional)',
    total: 'Total credit requested',
    disclaimer: 'These are the amounts you’re asking for. Your inspector doesn’t price repairs or approve credits.',
    shareClient: 'Share with your agent',
    shareAgent: 'Share',
    shared: 'Your repair request is ready to send.',
    sharedHow: 'Send this link, or save it as a PDF from the page it opens. Inspyx doesn’t send it to anyone.',
    copy: 'Copy link',
    copied: 'Link copied',
    open: 'Open it',
    saving: 'Saving…',
    saved: 'Saved',
    close: 'Close',
    empty: 'Pick a finding first: tap “Add to repair request” on it.',
    badAmount: 'Enter an amount in dollars, up to $1,000,000.',
    missing: function (n) {
      return n === 1 ? 'One finding you picked is no longer in the report, so it was taken off your request.'
        : n + ' findings you picked are no longer in the report, so they were taken off your request.';
    },
    changed: 'Your inspector updated the report. Reload it to keep building your request.',
    reload: 'Reload',
    locked: 'The report isn’t open right now, so your request can’t be changed.',
    gone: 'This link no longer opens the report.',
    limit: 'This request has been shared as many times as it can be. Start from the latest link.',
    failed: 'That didn’t go through. Try again.',
    howTo: 'How it works, in three steps',
    howSteps: ['Tap “Add to repair request” on a finding', 'Pick Repair, Replace or Credit, with an amount', 'Share: you send the link yourself'],
    howCard: 'Cracked tile',
    howAsk: 'Credit $1,250.00',
    howLink: 'inspyx.com/repair#…'
  };

  var state = null;   // { key, version, role, findings: {id: f}, items: {id: {ask, cents, note}}, order: [ids], note, total, shares }
  var timer = null, saving = null, dirty = false, problem = null;
  /* Counts edits: a shared link shows only while nothing changed since it was made, so the document sent is the sheet
     on the screen (Codex on inspyx-site #91, r3). */
  var edits = 0;

  function el(tag, props, kids) {
    var e = doc.createElement(tag);
    Object.keys(props || {}).forEach(function (k) {
      var v = props[k];
      if (k === 'class') e.className = v;
      else if (k === 'text') e.textContent = v;
      else if (k === 'on') Object.keys(v).forEach(function (ev) { e.addEventListener(ev, v[ev]); });
      else if (v !== null && v !== undefined && v !== false) e.setAttribute(k, v === true ? '' : v);
    });
    (kids || []).forEach(function (c) { if (c) e.appendChild(typeof c === 'string' ? doc.createTextNode(c) : c); });
    return e;
  }
  function money(cents) {
    var abs = Math.abs(cents), d = String(Math.floor(abs / 100)).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    var c = String(abs % 100); if (c.length < 2) c = '0' + c;
    return '$' + d + '.' + c;
  }
  /* "1,250" or "$1,250.50" → cents; null when it isn't an amount in dollars and cents within the cap. */
  function centsOf(text) {
    var t = String(text || '').replace(/[\s$,]/g, '');
    if (!/^\d{1,7}(\.\d{1,2})?$/.test(t)) return null;
    var parts = t.split('.'), c = Number(parts[0]) * 100 + (parts[1] ? Number((parts[1] + '0').slice(0, 2)) : 0);
    return c >= 0 && c <= MAX_CENTS ? c : null;
  }

  function ask(body) {
    return fetch(API, {
      method: 'POST', credentials: 'omit', cache: 'no-store', referrerPolicy: 'no-referrer',
      headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
      body: JSON.stringify(Object.assign({ key: state.key }, body))
    }).then(function (res) {
      return res.json().catch(function () { return {}; }).then(function (j) { return { status: res.status, json: j || {} }; });
    });
  }

  /* ---- the cards: a tick on each finding ---- */
  function picked(id) { return Object.prototype.hasOwnProperty.call(state.items, id); }
  function decorate() {
    Array.prototype.forEach.call(doc.querySelectorAll('[data-finding-card]'), function (card) {
      var id = card.getAttribute('data-finding-card');
      if (!state.findings[id] || card.querySelector('.rr-add')) return;
      var b = el('button', { class: 'rr-add', type: 'button', 'data-rr-add': id, on: { click: function () { toggle(id); } } });
      (card.querySelector('.card-h') || card).appendChild(b);
    });
    paintCards();
  }
  function paintCards() {
    Array.prototype.forEach.call(doc.querySelectorAll('[data-rr-add]'), function (b) {
      var on = picked(b.getAttribute('data-rr-add'));
      b.setAttribute('aria-pressed', on ? 'true' : 'false');
      b.textContent = on ? WORDS.added : WORDS.add;
    });
  }
  function toggle(id) {
    if (picked(id)) { delete state.items[id]; state.order = state.order.filter(function (x) { return x !== id; }); }
    else { state.items[id] = { ask: 'repair', cents: null, amount: '', note: '' }; state.order.push(id); }
    // The sheet shows what will be shared: a finding taken off (or added) while it is open goes from it at once
    // (Codex on inspyx-site #91, r2).
    changed(!!(sheet && sheet.open));
  }

  /* ---- the bar and the sheet ---- */
  var bar = null, sheet = null;
  function localTotal() {
    return state.order.reduce(function (n, id) { var i = state.items[id]; return n + (i.ask === 'credit' && i.cents !== null ? i.cents : 0); }, 0);
  }
  function paintBar() {
    if (!bar) {
      bar = el('div', { class: 'rr-bar', 'data-rr-bar': true, role: 'region', 'aria-label': WORDS.bar });
      doc.body.appendChild(bar);
    }
    var n = state.order.length;
    bar.hidden = n === 0;
    bar.textContent = '';
    bar.appendChild(el('p', { class: 'rr-bar-t' }, [el('strong', { text: WORDS.bar }), ' · ' + WORDS.count(n)]));
    bar.appendChild(el('p', { class: 'rr-bar-total', 'data-rr-bar-total': true, text: WORDS.total + ': ' + money(localTotal()) }));
    bar.appendChild(el('button', { class: 'rr-open', type: 'button', 'data-rr-open': true, on: { click: openSheet } }, [WORDS.review]));
  }

  function openSheet() {
    if (!sheet) {
      sheet = el('dialog', { class: 'rr-sheet', 'data-rr-sheet': true, 'aria-label': WORDS.sheet });
      sheet.addEventListener('click', function (e) { if (e.target === sheet) sheet.close(); });
      doc.body.appendChild(sheet);
    }
    paintSheet();
    if (!sheet.open) { try { sheet.showModal(); } catch (e) { sheet.setAttribute('open', ''); } }
  }
  function paintSheet(after) {
    if (!sheet) return;
    sheet.textContent = '';
    var head = el('header', { class: 'rr-h' }, [
      el('h2', { text: WORDS.sheet }),
      el('button', { class: 'rr-x', type: 'button', 'aria-label': WORDS.close, on: { click: function () { sheet.close(); } } }, ['×'])
    ]);
    sheet.appendChild(head);
    sheet.appendChild(el('p', { class: 'rr-intro', text: WORDS.intro }));
    sheet.appendChild(howTo());
    if (state.missing) sheet.appendChild(el('p', { class: 'rr-warn', 'data-rr-missing': true, text: WORDS.missing(state.missing) }));
    var list = el('ol', { class: 'rr-list' });
    state.order.forEach(function (id) {
      var f = state.findings[id], it = state.items[id];
      var asks = el('div', { class: 'rr-asks', role: 'radiogroup', 'aria-label': f.title });
      ['repair', 'replace', 'credit'].forEach(function (a) {
        asks.appendChild(el('button', {
          type: 'button', role: 'radio', 'aria-checked': it.ask === a ? 'true' : 'false', 'data-rr-ask': a,
          // Back to Credit: the amount still in the box is the credit again (Codex on inspyx-site #91, r2).
          on: { click: function () { it.ask = a; it.cents = a === 'credit' ? centsOf(it.amount) : null; changed(true); } }
        }, [WORDS.asks[a]]));
      });
      var amount = null;
      if (it.ask === 'credit') {
        var bad = it.amount !== '' && centsOf(it.amount) === null;
        amount = el('label', { class: 'rr-amount' + (bad ? ' is-bad' : '') }, [
          el('span', { text: WORDS.amount }),
          // Dollars, said in the box: a fixed "$" the person never types (as the price forms show it).
          el('span', { class: 'rr-money' }, [
            el('span', { class: 'rr-cur', 'aria-hidden': 'true', text: '$' }),
            el('input', { type: 'text', inputmode: 'decimal', autocomplete: 'off', value: it.amount, 'data-rr-amount': id, 'aria-invalid': bad ? 'true' : 'false',
              'aria-label': WORDS.amount + ' ' + WORDS.inDollars,
              on: { input: function (e) { it.amount = e.target.value; it.cents = centsOf(it.amount); changed(false); } } })
          ]),
          bad ? el('em', { text: WORDS.badAmount }) : null
        ]);
      }
      list.appendChild(el('li', { class: 'rr-item cat-' + f.category, 'data-rr-item': id }, [
        el('p', { class: 'rr-item-t' }, [el('span', { class: 'fid', text: f.number }), ' ' + f.title]),
        f.place ? el('p', { class: 'rr-item-p', text: f.place }) : null,
        asks, amount,
        el('label', { class: 'rr-note' }, [el('span', { text: WORDS.itemNote }),
          el('input', { type: 'text', maxlength: '500', value: it.note, 'data-rr-note': id, on: { input: function (e) { it.note = e.target.value; changed(false); } } })]),
        el('button', { class: 'rr-remove', type: 'button', on: { click: function () { toggle(id); } } }, [WORDS.remove])
      ]));
    });
    sheet.appendChild(state.order.length ? list : el('p', { class: 'rr-empty', text: WORDS.empty }));
    sheet.appendChild(el('label', { class: 'rr-whole' }, [el('span', { text: WORDS.note }),
      el('textarea', { rows: '2', maxlength: '1000', 'data-rr-whole': true, on: { input: function (e) { state.note = e.target.value; changed(false); } } }, [state.note])]));
    sheet.appendChild(el('p', { class: 'rr-total', 'data-rr-total': true }, [el('span', { text: WORDS.total }), el('strong', { text: money(localTotal()) })]));
    sheet.appendChild(el('p', { class: 'rr-disc', text: WORDS.disclaimer }));
    sheet.appendChild(el('p', { class: 'rr-status', role: 'status', 'data-rr-status': true, text: problem || (saving ? WORDS.saving : (dirty ? '' : (state.savedOnce ? WORDS.saved : ''))) }));
    if (problem === WORDS.changed) {
      sheet.appendChild(el('button', { class: 'rr-reload', type: 'button', on: { click: function () { location.reload(); } } }, [WORDS.reload]));
    }
    var share = el('button', { class: 'rr-share', type: 'button', 'data-rr-share': true, on: { click: shareNow } },
      [state.role === 'agent' ? WORDS.shareAgent : WORDS.shareClient]);
    share.disabled = state.order.length === 0 || anyBadAmount() || problem === WORDS.changed;
    sheet.appendChild(share);
    if (after) sheet.appendChild(after);
  }
  /* Its how-to (his rule: every feature gets one): a finger adds a finding, picks a credit, and the link appears. */
  function howTo() {
    var stage = el('div', { class: 'rr-how-stage', 'aria-hidden': 'true' }, [
      el('div', { class: 'rr-how-scene rr-how-a' }, [el('span', { class: 'rr-how-card', text: WORDS.howCard }), el('em', { class: 'rr-how-add', text: '+ ' + WORDS.add })]),
      el('div', { class: 'rr-how-scene rr-how-b' }, [el('span', { class: 'rr-how-card', text: WORDS.howCard }),
        el('span', { class: 'rr-how-asks' }, [el('i', { text: WORDS.asks.repair }), el('i', { text: WORDS.asks.replace }), el('b', { text: WORDS.howAsk })])]),
      el('div', { class: 'rr-how-scene rr-how-c' }, [el('span', { class: 'rr-how-done', text: WORDS.shared }), el('span', { class: 'rr-how-link', text: WORDS.howLink })]),
      el('span', { class: 'rr-how-finger' })
    ]);
    var steps = el('figcaption', { class: 'rr-how-steps' }, WORDS.howSteps.map(function (t, i) {
      return el('span', { class: 'rr-how-step', 'data-n': String(i + 1), text: t });
    }));
    return el('figure', { class: 'rr-how', 'aria-label': WORDS.howTo }, [stage, steps]);
  }
  function anyBadAmount() {
    return state.order.some(function (id) { var i = state.items[id]; return i.ask === 'credit' && i.cents === null; });
  }

  /* ---- saving: what is on the page, a moment after it changes; never an amount that isn't one ---- */
  function changed(repaint) {
    dirty = true; problem = problem === WORDS.changed ? problem : null;
    edits++;
    // A link shared before this edit is of the document as it was: it goes; Share makes one of the sheet as it is.
    var done = sheet && sheet.querySelector('[data-rr-done]');
    if (done) done.parentNode.removeChild(done);
    paintCards(); paintBar();
    if (repaint) paintSheet(); else refreshTotals();
    clearTimeout(timer);
    timer = setTimeout(save, SETTLE);
  }
  function refreshTotals() {
    if (!sheet) return;
    var t = sheet.querySelector('[data-rr-total] strong'); if (t) t.textContent = money(localTotal());
    var s = sheet.querySelector('[data-rr-share]'); if (s) s.disabled = state.order.length === 0 || anyBadAmount() || problem === WORDS.changed;
    var st = sheet.querySelector('[data-rr-status]'); if (st) st.textContent = problem || '';
    Array.prototype.forEach.call(sheet.querySelectorAll('[data-rr-amount]'), function (inp) {
      var it = state.items[inp.getAttribute('data-rr-amount')]; if (!it) return;
      var bad = it.amount !== '' && it.cents === null;
      inp.setAttribute('aria-invalid', bad ? 'true' : 'false');
      inp.closest('.rr-amount').classList.toggle('is-bad', bad);
    });
  }
  /* Saves what is on the page; its promise settles only when every edit made so far is kept (true), or a save
     failed (false). A save already on the wire is followed by one more when the page changed meanwhile, and the
     promise waits for that one too; a failed save leaves the page unsaved, so the next save or a Share tries again
     (Codex on inspyx-site #91). */
  function save() {
    if (anyBadAmount() || problem === WORDS.changed) return Promise.resolve(false);
    if (saving) return saving.then(function (ok) { return ok && dirty ? save() : ok; });
    dirty = false;
    var items = state.order.map(function (id) {
      var i = state.items[id], out = { finding: id, ask: i.ask, note: i.note };
      if (i.ask === 'credit') out.cents = i.cents;
      return out;
    });
    setStatus(WORDS.saving);
    saving = ask({ repair: 'save', version: state.version, items: items, note: state.note }).then(function (r) {
      saving = null;
      if (r.status === 200 && r.json.state === 'saved') {
        state.total = r.json.total_cents; state.savedOnce = true;
        if (dirty) return save();   // changed while on the wire: keep that too before saying it's kept
        setStatus(WORDS.saved);
        return true;
      }
      dirty = true;
      fail(r);
      return false;
    }, function () { saving = null; dirty = true; problem = WORDS.failed; setStatus(problem); return false; });
    return saving;
  }
  function fail(r) {
    var e = r.json && r.json.error;
    problem = r.status === 409 && e === 'report_changed' ? WORDS.changed
      : r.status === 403 ? WORDS.locked
      : r.status === 404 ? WORDS.gone
      : r.status === 409 && e === 'limit' ? WORDS.limit
      : r.status === 409 && e === 'changed' ? WORDS.changed
      : r.status === 409 && e === 'empty' ? WORDS.empty
      : r.status === 400 && e === 'amount' ? WORDS.badAmount
      : WORDS.failed;
    paintSheet();
  }
  function setStatus(text) { var st = sheet && sheet.querySelector('[data-rr-status]'); if (st) st.textContent = text; }

  /* ---- share: what was saved, frozen; its link to send ---- */
  function shareNow() {
    clearTimeout(timer);
    var at = edits;
    // Everything on the page is kept before it is frozen: a save on the wire, and any edit after it.
    var ready = dirty || saving ? save() : Promise.resolve(true);
    Promise.resolve(ready).then(function (ok) {
      if (ok === false) return;
      return ask({ repair: 'share' }).then(function (r) {
        if (r.status !== 200 || r.json.state !== 'shared' || !/^[A-Za-z0-9_-]{22}$/.test(r.json.key)) return fail(r);
        if (edits !== at) return;   // edited while it was being shared: that link is of an older sheet
        problem = null;   // an earlier try's error goes with the link
        var link = DOC_BASE + r.json.key;
        var copy = el('button', { class: 'rr-copy', type: 'button', 'data-rr-copy': true, on: { click: function () {
          var done = function () { copy.textContent = WORDS.copied; };
          if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(link).then(done, function () {});
        } } }, [WORDS.copy]);
        paintSheet(el('div', { class: 'rr-done', 'data-rr-done': true }, [
          el('p', { class: 'rr-done-t', text: WORDS.shared }),
          el('p', { class: 'rr-done-how', text: WORDS.sharedHow }),
          el('input', { class: 'rr-link', type: 'text', readonly: true, value: link, 'data-rr-link': true, 'aria-label': WORDS.shared }),
          el('div', { class: 'rr-done-b' }, [copy, el('a', { class: 'rr-go', href: link, target: '_blank', rel: 'noopener noreferrer' }, [WORDS.open])])
        ]));
      });
    }).catch(function () { problem = WORDS.failed; paintSheet(); });   // the share itself never arrived, too: it says so
  }

  /* ---- start: what this link already holds ---- */
  doc.addEventListener('inspyx:report-open', function (ev) {
    var d = ev.detail || {};
    if (!d.key || typeof d.version !== 'number' || !d.report) return;
    var findings = {};
    (d.report.sections || []).forEach(function (s) { (s.items || []).forEach(function (i) { (i.findings || []).forEach(function (f) { findings[f.id] = f; }); }); });
    state = { key: d.key, version: d.version, role: 'client', findings: findings, items: {}, order: [], note: '', total: 0, missing: 0 };
    ask({ repair: 'get' }).then(function (r) {
      if (r.status !== 200 || r.json.state !== 'repair') return;   // locked, gone or down: no builder, the report stands
      var j = r.json;
      state.role = j.role === 'agent' ? 'agent' : 'client';
      state.note = typeof j.note === 'string' ? j.note : '';
      (j.items || []).forEach(function (i) {
        if (!findings[i.finding]) return;
        state.items[i.finding] = { ask: i.ask, cents: typeof i.cents === 'number' ? i.cents : null,
          amount: typeof i.cents === 'number' ? (i.cents / 100).toFixed(2) : '', note: i.note || '' };
        state.order.push(i.finding);
      });
      state.missing = Array.isArray(j.missing) ? j.missing.length : 0;
      state.savedOnce = state.order.length > 0;
      doc.documentElement.classList.add('has-rr');
      decorate(); paintBar();
    }, function () { /* the report stands without the builder */ });
  });
})();
