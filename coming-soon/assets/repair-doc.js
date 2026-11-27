/* A shared repair request (2026-11-24, his list item 11): inspyx.com/repair#<key>. The key is read once and taken out
   of the address at once; the report function answers what the request said when it was shared ({"repair_doc"}).
   Read-only: nothing here changes or sends anything. "Save as PDF" is the browser's own print. This file says no
   words: the page holds every sentence. */
(function () {
  'use strict';
  var API = 'https://btxlrfvqifnrnxffohsz.supabase.co/functions/v1/report';
  var KEY = /^[A-Za-z0-9_-]{22}$/;
  var KEPT = 'inspyx.repair.key';
  var doc = document;
  var $ = function (s) { return doc.querySelector(s); };
  var all = function (s) { return [].slice.call(doc.querySelectorAll(s)); };
  var word = function (w) { var e = doc.querySelector('[data-rd-words] [data-w="' + w + '"]'); return e ? e.textContent : ''; };
  function state(name) { all('[data-rd-state]').forEach(function (e) { e.hidden = e.getAttribute('data-rd-state') !== name; }); }
  function money(cents) {
    var abs = Math.abs(cents), d = String(Math.floor(abs / 100)).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    var c = String(abs % 100); if (c.length < 2) c = '0' + c;
    return '$' + d + '.' + c;
  }
  var key = (function () {
    var h = (location.hash || '').replace(/^#/, '');
    if (KEY.test(h)) {
      try { sessionStorage.setItem(KEPT, h); } catch (e) { /* storage off: a reload asks for the link again */ }
      try { history.replaceState(history.state, '', '/repair'); } catch (e) { /* an old browser keeps the address */ }
      return h;
    }
    try { var k = sessionStorage.getItem(KEPT); if (k && KEY.test(k)) return k; } catch (e) { /* storage off */ }
    return null;
  })();
  function set(name, text) { all('[data-rd-v="' + name + '"]').forEach(function (e) { e.textContent = text; }); }
  function draw(d) {
    set('address', d.address || '');
    set('locality', d.locality || '');
    set('inspected', d.inspected ? ' · ' + word('inspected') + d.inspected : '');
    set('by', word(d.role === 'agent' ? 'by-agent' : 'by-client') + (d.company || ''));
    set('footer', (d.report ? word('report') + d.report + '.' : ''));
    set('total', money(typeof d.total_cents === 'number' ? d.total_cents : 0));
    var body = $('[data-rd-items]');
    body.textContent = '';
    (Array.isArray(d.items) ? d.items : []).forEach(function (i) {
      var tr = doc.createElement('tr');
      tr.className = 'cat-' + (i.category || '');
      var th = doc.createElement('th'); th.scope = 'row';
      var t = doc.createElement('strong'); t.textContent = (i.number ? i.number + ' ' : '') + (i.title || ''); th.appendChild(t);
      if (i.place) { var p = doc.createElement('span'); p.className = 'rd-place'; p.textContent = i.place; th.appendChild(p); }
      if (i.recommendation) { var r = doc.createElement('span'); r.className = 'rd-rec'; r.textContent = i.recommendation; th.appendChild(r); }
      var askTd = doc.createElement('td');
      var a = doc.createElement('span'); a.className = 'rd-ask'; a.textContent = word(i.ask) || ''; askTd.appendChild(a);
      if (i.note) { var n = doc.createElement('span'); n.className = 'rd-inote'; n.textContent = i.note; askTd.appendChild(n); }
      var c = doc.createElement('td'); c.className = 'rd-num';
      c.textContent = i.ask === 'credit' && typeof i.cents === 'number' ? money(i.cents) : word('none');
      tr.appendChild(th); tr.appendChild(askTd); tr.appendChild(c);
      body.appendChild(tr);
    });
    $('[data-rd-note]').hidden = !d.note;
    set('note', d.note || '');
    if (d.address) doc.title = doc.title + ' · ' + d.address;
    state('none');
    $('[data-rd-sheet]').hidden = false;
    $('#doc').removeAttribute('aria-busy');
  }
  function open() {
    if (!key) return state('gone');
    state('wait');
    fetch(API, {
      method: 'POST', credentials: 'omit', cache: 'no-store', referrerPolicy: 'no-referrer',
      headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
      body: JSON.stringify({ repair_doc: key })
    }).then(function (res) {
      if (res.status === 404) return { state: 'gone' };
      if (!res.ok) throw new Error('status ' + res.status);
      return res.json();
    }).then(function (a) {
      if (a && a.state === 'repair_doc' && a.doc && typeof a.doc === 'object') return draw(a.doc);
      state(a && a.state === 'gone' ? 'gone' : 'failed');
    }, function () { state('failed'); });
  }
  var again = $('[data-rd-again]'); if (again) again.addEventListener('click', open);
  var print = $('[data-rd-print]'); if (print) print.addEventListener('click', function () { window.print(); });
  open();
})();
