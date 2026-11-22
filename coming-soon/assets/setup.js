/* Set up your business, on the dashboard (/today), as a checklist (2026-11-22, Inspyx 4; dashboard plan step 1).
   His order: the dashboard sets up the whole business. His answer on the checklist: "Hide and allow option to never
   see again": it hides itself once every step is done, and "Don't show this again" hides it for good before then,
   kept with the account (InspyxAuth.choose), so it follows him to every browser. Hidden, a short line of the same
   links stays under the page's own, so the pages are never out of reach.
   Each tile says whether its step is done, read from the rows the phone and the setup pages keep through the sync
   function (the same pull as /prices, nothing sent):
     Your company   the profile's name, company name and license, and a signature picture (each prints on the report)
     Prices         at least one service (not an add-on)
     Agreements     at least one agreement
   Read once as the page opens and again whenever it comes back into view (back from a setup page in another tab).
   A pull that fails leaves the last whole read standing (plain links if there was none): no step is ever
   called done or missing on a guess.
   This file says no words. The page holds every one. */
(function () {
  'use strict';
  var auth = window.InspyxAuth;
  var box = document.querySelector('[data-setup]');
  if (!auth || !box) return;

  var HIDE = 'web_setup_hidden';
  var DEADLINE = 30000;
  var KINDS = ['inspector_profile', 'inspector_media', 'price_services', 'legal_documents'];
  var $ = function (sel, el) { return (el || document).querySelector(sel); };
  var all = function (sel, el) { return [].slice.call((el || document).querySelectorAll(sel)); };
  var words = (function () {
    var t = $('template[data-t="setup-words"]');
    return function (key) { var w = t && t.content.querySelector('[data-w="' + key + '"]'); return w ? w.textContent : ''; };
  })();
  var small = $('[data-setup-small]'), undo = $('[data-setup-undo]'), say = $('[data-say="setup-save"]');

  // ---- the rows ---------------------------------------------------------------------------------------------------

  var me = (auth.stored() || {}).id || null;
  var rows = Object.create(null);

  function take(into, r) {
    if (!r || KINDS.indexOf(r.kind) < 0 || typeof r.id !== 'string' || !r.data || r.data.ownerAccountId !== me) return;
    var k = r.kind + '/' + r.id, held = into[k];
    if (!held || r.updated_at >= held.updated_at) into[k] = r;
  }
  var standing = function (kind) {
    return Object.keys(rows).map(function (k) { return rows[k]; }).filter(function (r) {
      return r.kind === kind && r.deleted_at === null && r.data.deletedAt == null;
    }).map(function (r) { return r.data; });
  };
  var filled = function (v) { return typeof v === 'string' && v.trim().length > 0; };

  /* What each step still needs, as the keys of its words: none when done. */
  var STEPS = {
    company: function () {
      var p = standing('inspector_profile').filter(function (d) { return d.id === 'profile'; })[0] || {};
      var left = ['inspectorName', 'companyName', 'licenseNumber'].filter(function (f) { return !filled(p[f]); });
      if (!standing('inspector_media').some(function (d) { return d.id === 'signature'; })) left.push('signature');
      return left;
    },
    prices: function () { return standing('price_services').some(function (s) { return s.parentId == null; }) ? [] : ['service']; },
    agreements: function () { return standing('legal_documents').some(function (d) { return d.kind === 'agreement'; }) ? [] : ['agreement']; }
  };

  /* "Add your license and your signature": the step's missing words, joined as a sentence. */
  function sentence(step, left) {
    var parts = left.map(function (k) { return words(step + '-' + k); });
    var list = parts.length < 2 ? parts[0] : parts.slice(0, -1).join(', ') + ' ' + words('and') + ' ' + parts[parts.length - 1];
    return words('lead') + ' ' + list;
  }

  // ---- what shows -------------------------------------------------------------------------------------------------

  var known = false;      // the rows came in whole at least once
  var hidden = null;      // the account's choice: null until read (or when it can't be read)
  var read = false;       // the choice was asked for and answered (or failed)

  function render() {
    var done = 0, total = 0;
    all('[data-step]', box).forEach(function (tile) {
      var step = tile.getAttribute('data-step'), status = $('[data-status]', tile);
      total++;
      if (!known) { status.hidden = true; tile.removeAttribute('data-done'); return; }
      var left = STEPS[step]();
      status.hidden = false;
      $('[data-is="done"]', status).hidden = left.length > 0;
      var l = $('[data-is="left"]', status);
      l.hidden = left.length === 0;
      l.textContent = left.length ? sentence(step, left) : '';
      if (left.length === 0) { done++; tile.setAttribute('data-done', ''); } else tile.removeAttribute('data-done');
    });
    var progress = $('[data-progress]', box);
    progress.hidden = !known;
    $('[data-v="done"]', progress).textContent = String(done);
    $('[data-v="total"]', progress).textContent = String(total);
    $('[data-ring]', progress).style.strokeDasharray = (total ? Math.round(100 * done / total) : 0) + ' 100';
    var away = hidden === true || (known && done === total);
    box.hidden = !read || away;
    small.hidden = !read || !away;
  }

  // ---- reading ----------------------------------------------------------------------------------------------------

  var pulling = null;
  function pull() {
    if (pulling) return pulling;
    // Read whole into a fresh set, kept only when every page came: a pull that
    // fails part way leaves the last whole read as it was (Codex on #68).
    var point = null, fresh = Object.create(null);
    var loop = function () {
      return auth.ask('sync', { push: [], after: point, limit: 500 }, DEADLINE).then(function (r) {
        if (r === null) { window.location.replace('/signin'); return null; }
        if (r.status !== 200 || !r.json || !Array.isArray(r.json.rows)) throw new Error('sync');
        r.json.rows.forEach(function (row) { take(fresh, row); });
        if (r.json.next) point = r.json.next;
        return r.json.more ? loop() : true;
      });
    };
    pulling = loop().then(function (whole) { if (whole) { rows = fresh; known = true; } }, function () { /* the last whole read stands */ })
      .then(function () { pulling = null; render(); });
    return pulling;
  }

  auth.choices().then(function (c) { hidden = c ? c[HIDE] === true : null; }, function () { hidden = null; })
    .then(function () { read = true; render(); });
  pull();
  document.addEventListener('visibilitychange', function () { if (document.visibilityState === 'visible') pull(); });

  // ---- never again, and back ---------------------------------------------------------------------------------------

  function set(value, button) {
    button.disabled = true; say.hidden = true;
    return auth.choose(HIDE, value).then(function (kept) { return kept; }, function () { return false; }).then(function (kept) {
      button.disabled = false;
      if (!kept) { say.hidden = false; return; }
      hidden = value;
      undo.hidden = !value;
      render();
      if (!value) $('[data-never]', box).focus();
      else $('[data-setup-back]', undo).focus();
    });
  }
  $('[data-never]', box).addEventListener('click', function (e) { set(true, e.currentTarget); });
  $('[data-setup-back]', undo).addEventListener('click', function (e) { set(false, e.currentTarget); });
})();
