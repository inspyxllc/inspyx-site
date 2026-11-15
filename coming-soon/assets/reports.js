/* Reports sent (2026-11-15, board item 32): every report the signed-in inspector published, with each person's link
   and each report email, from the reports-sent function (backend/supabase/functions/reports-sent in the app's repo).
   No report link's key ever reaches this page (the server never sends one), so it can neither open a client's report
   nor turn a link off: those stay in the app.
   This file says no words. The page holds every sentence; the script fills in only names, addresses, dates and
   counts. */
(function () {
  'use strict';
  var main = document.querySelector('[data-sent]');
  var auth = window.InspyxAuth;
  if (!main || !auth) return;
  var DEADLINE = 20000;          // an ask that takes longer counts as no answer
  var STALE = 5 * 60000;         // coming back to the page after this long looks again

  var one = function (sel, root) { return (root || main).querySelector(sel); };
  var all = function (sel, root) { return [].slice.call((root || main).querySelectorAll(sel)); };
  var list = one('[data-items]'), again = one('[data-again]'), states = all('.sent-state [data-state]');
  var asked = 0, lastLook = 0;

  function signedOut() { window.location.replace('/signin'); }
  function state(name) { states.forEach(function (p) { p.hidden = p.getAttribute('data-state') !== name; }); again.hidden = name !== 'failed'; }
  var text = function (v) { return typeof v === 'string' ? v : ''; };
  var whole = function (v) { return typeof v === 'number' && Math.floor(v) === v && v >= 0; };

  // "Nov 12", or "Nov 12, 2025" when not this year, on the inspector's own calendar.
  function shortDate(iso) {
    var t = typeof iso === 'string' ? Date.parse(iso) : NaN;
    if (isNaN(t)) return '';
    var d = new Date(t), o = { month: 'short', day: 'numeric' };
    if (d.getFullYear() !== new Date().getFullYear()) o.year = 'numeric';
    return new Intl.DateTimeFormat('en-US', o).format(d);
  }
  function fill(root, name, value) { all('[data-v="' + name + '"]', root).forEach(function (e) { e.textContent = value; }); }
  function only(root, state) { all('[data-state]', root).forEach(function (e) { e.hidden = e.getAttribute('data-state') !== state; }); }
  function clone(kind) { return document.querySelector('template[data-t="' + kind + '"]').content.firstElementChild.cloneNode(true); }

  function linkRow(l) {
    if (!l || typeof l.id !== 'string') return null;
    var li = clone('link');
    fill(li, 'label', text(l.label));
    all('[data-audience]', li).forEach(function (t) { t.hidden = t.getAttribute('data-audience') !== l.audience; });
    if (l.off === true) only(li, 'off');
    else if (typeof l.first_opened_at === 'string') {
      only(li, 'opened');
      fill(li, 'first', shortDate(l.first_opened_at));
      // "Opened Nov 13, 3 times, last Nov 14": the more only when there was more than one open.
      var more = one('[data-more]', li);
      if (whole(l.opens) && l.opens > 1 && typeof l.last_opened_at === 'string') {
        fill(li, 'opens', String(l.opens));
        fill(li, 'last', shortDate(l.last_opened_at));
        more.hidden = false;
      }
    } else only(li, 'unopened');
    return li;
  }

  function emailRow(e) {
    if (!e || typeof e.id !== 'string') return null;
    var li = clone('email');
    fill(li, 'to_name', text(e.to_name));
    fill(li, 'to_address', text(e.to_address));
    var said = e.status !== 'sent' ? 'unsent' : (e.delivery === 'delivered' || e.delivery === 'bounced' || e.delivery === 'complained') ? e.delivery : 'sent';
    only(li, said);
    fill(li, 'when', shortDate(said === 'sent' ? e.sent_at : e.delivery_at || e.sent_at));
    return li;
  }

  function reportItem(r) {
    if (!r || typeof r.inspection_id !== 'string') return null;
    var li = clone('report');
    var address = text(r.address);
    fill(li, 'address', address);
    one('[data-noaddress]', li).hidden = address !== '';
    fill(li, 'locality', text(r.locality));
    fill(li, 'published', shortDate(r.published_at));
    one('[data-locked]', li).hidden = r.locked !== true;
    all('.report-sub .bit', li).forEach(function (b) { if (b.hasAttribute('data-locked')) return; b.hidden = b.textContent.trim() === '' || all('[data-v]', b).some(function (v) { return v.textContent === ''; }); });
    var links = (Array.isArray(r.links) ? r.links : []).map(linkRow).filter(Boolean);
    var emails = (Array.isArray(r.emails) ? r.emails : []).map(emailRow).filter(Boolean);
    links.forEach(function (x) { one('[data-links]', li).appendChild(x); });
    emails.forEach(function (x) { one('[data-emails]', li).appendChild(x); });
    one('[data-no="links"]', li).hidden = links.length > 0;
    one('[data-no="emails"]', li).hidden = emails.length > 0;
    return li;
  }

  function show(reports) {
    while (list.firstChild) list.removeChild(list.firstChild);
    var items = reports.map(reportItem).filter(Boolean);
    items.forEach(function (li) { list.appendChild(li); });
    state(items.length ? null : 'empty');
  }

  function look() {
    var mine = ++asked;
    lastLook = Date.now();
    if (!list.firstChild) state('loading');
    return auth.ask('reports-sent', { action: 'list' }, DEADLINE).then(function (r) {
      if (mine !== asked) return;
      if (r === null) { signedOut(); return; }
      if (r.status === 200 && r.json && Array.isArray(r.json.reports)) { show(r.json.reports); return; }
      if (!list.firstChild) state('failed');
    }, function () {
      if (mine !== asked) return;
      if (!list.firstChild) state('failed');
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
