/* Client View / Agent View (2026-11-24, Inspyx 4; his Spectora list item 1): the inspector sees one of his own
   inspections exactly as his client or an agent sees it.
   Two ways in:
   - from the website, signed in: inspyx.com/look#i=<inspection>&as=<client|agent>. This page asks the report function
     for a one-time ticket as the signed-in inspector (InspyxAuth.ask; the token never reaches this file);
   - from the app: inspyx.com/look#t=<ticket>, a ticket the app made. It is taken out of the address at once.
   Then the ticket goes to the report function alone, once ({"look"}): the answer is that person's own link's answer,
   with nothing counted. "not_sent" gets its own card; any other answer is drawn by report.js, handed over ready
   (window.INSPYX_REPORT.answer), so that page asks nothing more and its Pay button goes nowhere.
   A ticket works once: a reload opens a fresh one from the website, and from the app says the view has closed.
   This file says no words. The page holds every sentence. */
(function () {
  'use strict';
  var REPORT = 'https://btxlrfvqifnrnxffohsz.supabase.co/functions/v1/report';
  var TICKET = /^[A-Za-z0-9_-]{22}$/;
  var INSPECTION = /^[A-Za-z0-9_-]{1,64}$/;
  var doc = document;
  var all = function (sel) { return [].slice.call(doc.querySelectorAll(sel)); };

  function state(name) {
    all('.look-state').forEach(function (el) { el.hidden = el.getAttribute('data-state') !== name; });
  }
  function view(name) {
    all('[data-view]').forEach(function (el) { el.hidden = el.getAttribute('data-view') !== name; });
    var label = doc.querySelector('.look-name [data-view="' + name + '"]');
    if (label) doc.title = label.textContent;
  }

  /* What the address asks for: a ticket (the app), or an inspection and a view (the website). */
  var asked = (function () {
    var p = new URLSearchParams((location.hash || '').replace(/^#/, ''));
    var t = p.get('t');
    if (t && TICKET.test(t)) {
      // A ticket is kept nowhere: not in the address, this tab's history or a screenshot of it.
      try { history.replaceState(history.state, '', '/look'); } catch (e) { /* an old browser keeps the address */ }
      return { ticket: t };
    }
    var i = p.get('i'), as = p.get('as');
    if (i && INSPECTION.test(i) && (as === 'client' || as === 'agent')) return { inspection: i, as: as };
    return null;
  })();

  function ticket() {
    if (asked.ticket) {
      var t = asked.ticket;
      asked.ticket = null;   // once: a second try says the view has closed
      return Promise.resolve({ ticket: t });
    }
    if (!asked.inspection) return Promise.resolve({ gone: true });
    var auth = window.InspyxAuth;
    if (!auth) return Promise.reject(new Error('auth'));
    return auth.ask('report', { action: 'look_ticket', inspection_id: asked.inspection, as: asked.as }).then(function (r) {
      if (r === null) return { signin: true };
      if (r.status === 404) return { gone: true };
      if (r.status !== 200 || !r.json || !TICKET.test(r.json.ticket)) throw new Error('ticket ' + r.status);
      return { ticket: r.json.ticket };
    });
  }

  function look(t) {
    return fetch(REPORT, {
      method: 'POST', credentials: 'omit', cache: 'no-store', referrerPolicy: 'no-referrer',
      headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
      body: JSON.stringify({ look: t })
    }).then(function (res) {
      if (res.status === 404) return { state: 'gone' };
      if (!res.ok) throw new Error('status ' + res.status);
      return res.json();
    });
  }

  function money(cents) {
    return '$' + (cents / 100).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  }

  function notSent(answer) {
    var client = answer.look && answer.look.view === 'client';
    var facts = doc.querySelector('[data-facts]');
    // The client's agreement and what is due are the client's; an agent's card says only that nothing was sent
    // (an agent sees "paid" or "due", never an amount: his ruling 2, 2026-11-13).
    facts.hidden = !client;
    all('[data-fact]').forEach(function (li) { li.hidden = true; });
    if (client) {
      var a = doc.querySelector('[data-fact="' + answer.agreement + '"]');
      if (a) a.hidden = false;
      var due = answer.due_cents;
      if (typeof due === 'number' && isFinite(due) && due > 0 && Math.floor(due) === due) {
        doc.querySelector('[data-due]').textContent = money(due);
        doc.querySelector('[data-fact="due"]').hidden = false;
      } else if (due === 0) {
        doc.querySelector('[data-fact="paid"]').hidden = false;
      }
    }
    state('not_sent');
  }

  function draw(answer) {
    state('none');
    var app = doc.getElementById('app');
    app.hidden = false;
    doc.querySelector('[data-pill]').hidden = false;
    window.INSPYX_REPORT = { answer: answer, look: true };
    var s = doc.createElement('script');
    s.src = '/assets/report.js';
    doc.body.appendChild(s);
  }

  function open() {
    state('wait');
    ticket().then(function (got) {
      if (got.signin) return state('signin');
      if (got.gone) return state('gone');
      return look(got.ticket).then(function (answer) {
        if (!answer || typeof answer !== 'object') throw new Error('answer');
        if (answer.look && (answer.look.view === 'client' || answer.look.view === 'agent')) view(answer.look.view);
        if (answer.state === 'gone') return state('gone');
        if (answer.state === 'not_sent') return notSent(answer);
        return draw(answer);
      });
    }).catch(function () { state('failed'); });
  }

  view(asked && asked.as === 'agent' ? 'agent' : 'client');
  var again = doc.querySelector('[data-again]');
  if (again) again.addEventListener('click', function () { location.reload(); });
  var close = doc.querySelector('[data-close]');
  if (close) close.addEventListener('click', function () {
    window.close();
    // A tab this page didn't open can't be closed by it: back to the inspections instead.
    setTimeout(function () { location.href = '/inspections'; }, 150);
  });
  if (!asked) return state('gone');
  open();
})();
