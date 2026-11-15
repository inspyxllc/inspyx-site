/* An agent's private page (2026-11-15, board item 32): every report one inspector emailed them, from the
   agent-page function (backend/supabase/functions/agent-page in the app's repo), and each report drawn by the
   client report page's own renderer (report.js), asked through the same function.

   The page's key comes after the "#" (inspyx.com/a#<key>), which a browser never sends to any server. It is read
   once, kept for this tab only, and taken out of the address at once. It travels only in a request's body. No
   client's key is ever on this page: a report is asked for by this page's key and the report's link id.

   This file says no words. The page holds every sentence; the script fills in only addresses, places, dates and
   the inspector's name. */
(function () {
  'use strict';
  var API = 'https://btxlrfvqifnrnxffohsz.supabase.co/functions/v1/agent-page';
  var KEY = /^[A-Za-z0-9_-]{22}$/;
  var LINK = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  var KEPT = 'inspyx.agent.key';
  var DEADLINE = 20000;   // an ask that takes longer counts as no answer

  var doc = document;
  var main = doc.querySelector('[data-agent]');
  if (!main) return;
  var one = function (sel, root) { return (root || doc).querySelector(sel); };
  var all = function (sel, root) { return [].slice.call((root || doc).querySelectorAll(sel)); };
  var list = one('[data-items]'), again = one('[data-again]');

  /* The key, and which report (a link id after the "#", put there by this page itself), if one. */
  var mark = (location.hash || '').replace(/^#/, '');
  var key = null, open = null;
  if (KEY.test(mark)) {
    key = mark;
    try { sessionStorage.setItem(KEPT, key); } catch (e) { /* storage off: a reload asks for the link again */ }
    try { history.replaceState(null, '', '/a'); } catch (e) { /* an old browser keeps the address */ }
  } else {
    try { var kept = sessionStorage.getItem(KEPT); if (kept && KEY.test(kept)) key = kept; } catch (e) { /* storage off */ }
    if (LINK.test(mark)) open = mark.toLowerCase();
  }
  // Moving between the list and a report is a new page each time: report.js draws once.
  window.addEventListener('hashchange', function () { location.reload(); });

  function state(name) {
    all('.agent-state [data-state]').forEach(function (p) { p.hidden = p.getAttribute('data-state') !== name; });
    again.hidden = name !== 'failed' && name !== 'slow';
  }
  function fill(root, name, value) { all('[data-v="' + name + '"]', root).forEach(function (e) { e.textContent = value; }); }
  var text = function (v) { return typeof v === 'string' ? v : ''; };

  // "Nov 12", or "Nov 12, 2025" when not this year.
  function shortDate(iso) {
    var t = typeof iso === 'string' ? Date.parse(iso) : NaN;
    if (isNaN(t)) return '';
    var d = new Date(t), o = { month: 'short', day: 'numeric' };
    if (d.getFullYear() !== new Date().getFullYear()) o.year = 'numeric';
    return new Intl.DateTimeFormat('en-US', o).format(d);
  }

  function ask(body) {
    var stop = typeof AbortController === 'function' ? new AbortController() : null;
    var timer = stop ? setTimeout(function () { stop.abort(); }, DEADLINE) : null;
    return fetch(API, {
      method: 'POST', credentials: 'omit', cache: 'no-store', referrerPolicy: 'no-referrer',
      headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
      body: JSON.stringify(body), signal: stop ? stop.signal : undefined,
    }).then(function (res) {
      if (timer) clearTimeout(timer);
      if (res.status === 404) return { state: 'gone' };
      if (res.status === 429) return { state: 'slow' };
      if (!res.ok) return { state: 'failed' };
      return res.json().catch(function () { return { state: 'failed' }; });
    }, function () {
      if (timer) clearTimeout(timer);
      return { state: 'failed' };
    });
  }

  function item(r) {
    if (!r || typeof r.link_id !== 'string' || !LINK.test(r.link_id)) return null;
    var li = one('template[data-t="item"]').content.firstElementChild.cloneNode(true);
    var address = text(r.address);
    fill(li, 'address', address);
    one('[data-v="address"]', li).hidden = address === '';
    one('[data-noaddress]', li).hidden = address !== '';
    fill(li, 'locality', text(r.locality));
    fill(li, 'published', shortDate(r.published_at));
    all('.agent-sub .bit', li).forEach(function (b) { b.hidden = all('[data-v]', b).some(function (v) { return v.textContent === ''; }) || b.textContent.trim() === ''; });
    one('[data-locked]', li).hidden = r.locked !== true;
    // Only the report's link id goes in the address: it opens nothing without this tab's key.
    one('.agent-open', li).setAttribute('href', '#' + r.link_id.toLowerCase());
    return li;
  }

  function showList(answer) {
    while (list.firstChild) list.removeChild(list.firstChild);
    var who = answer.inspector || {};
    var name = text(who.name) || text(who.company);
    fill(main, 'inspector', name);
    fill(main, 'company', text(who.name) ? text(who.company) : '');
    one('[data-from]').hidden = name === '';
    one('[data-company]').hidden = !(text(who.name) && text(who.company));
    var items = (Array.isArray(answer.reports) ? answer.reports : []).map(item).filter(Boolean);
    items.forEach(function (li) { list.appendChild(li); });
    one('[data-note]').hidden = items.length === 0;
    state(items.length ? null : 'empty');
  }

  function look() {
    state('loading');
    ask({ key: key }).then(function (a) {
      if (a && a.state === 'open') return showList(a);
      state(a && (a.state === 'gone' || a.state === 'slow') ? a.state : 'failed');
    });
  }

  function report(linkId) {
    // The report, drawn by the client page's own renderer, asked by this page's key and the report's link id.
    main.hidden = true;
    one('[data-back]').hidden = false;
    var app = doc.getElementById('app');
    app.hidden = false;
    window.INSPYX_REPORT = { ask: { url: API, body: { key: key, link_id: linkId } } };
    var s = doc.createElement('script');
    s.src = '/assets/report.js';
    doc.body.appendChild(s);
  }

  again.addEventListener('click', function () { look(); });
  if (!key) return state('gone');
  if (open) return report(open);
  look();
})();
