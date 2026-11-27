/* Payments (2026-11-23, job 2 of the lead's inspector review): card payments on the web, as the phone's Settings ->
   Card payments. Where they stand, and the one step that moves them on.
   How: the payments function (inspyx-mobile backend/supabase/functions/payments): {"action": "status"} answers
   {state: none | needs_info | pending | ready, payouts}, or 409 no_account before the plan starts (the plan's Stripe
   account is the one clients pay); {"action": "connect"} answers Stripe's onboarding page, followed only when it is
   on connect.stripe.com or accounts.stripe.com (the server's own isStripeOnboarding). Stripe sends the inspector
   back to inspyx.com; this page asks again each time it is opened or comes back into view.
   This file says no words: the page holds every sentence. */
(function () {
  'use strict';
  var main = document.querySelector('[data-pay]');
  var auth = window.InspyxAuth;
  if (!main || !auth) return;
  var DEADLINE = 20000;
  var STRIPE = ['connect.stripe.com', 'accounts.stripe.com'];
  var all = function (sel, el) { return [].slice.call((el || document).querySelectorAll(sel)); };
  var showOne = function (attr, which) { all('[' + attr + ']', main).forEach(function (x) { x.hidden = x.getAttribute(attr) !== which; }); };
  var buttons = all('[data-do]', main), busy = false;

  function show(stands, button, payoutsPending) {
    showOne('data-stands', stands);
    buttons.forEach(function (b) { b.hidden = b.getAttribute('data-do') !== button; b.disabled = busy; });
    main.querySelector('[data-payouts]').hidden = !payoutsPending;
    var step = stands === 'no-plan' ? 'plan' : stands === 'ready' ? 'done' : 'stripe';
    all('.pay-step', main).forEach(function (li) {
      var s = li.getAttribute('data-step'), order = ['plan', 'stripe', 'ready'];
      var at = step === 'done' ? 3 : order.indexOf(step);
      li.classList.toggle('is-done', order.indexOf(s) < at);
      li.classList.toggle('is-now', order.indexOf(s) === at);
      if (order.indexOf(s) === at) li.setAttribute('aria-current', 'step'); else li.removeAttribute('aria-current');
      // The steps are where things stand, never buttons (Moises, 2026-11-26: he tapped one): the step it is at
      // says which button below moves it on.
      all('[data-next]', li).forEach(function (n) { n.hidden = !(order.indexOf(s) === at && n.getAttribute('data-next') === button); });
    });
  }

  /* Back from Stripe (Moises's setup, 2026-11-27). ?stripe=done: for a few minutes after, Stripe is still checking what he
     gave and can say "needs details" with nothing missing; this page says Stripe is checking and checks again by itself,
     never sends him back into Stripe for it. ?stripe=again (the link ran out): a fresh one is opened, once. The address
     is cleaned either way. */
  var BACK_KEY = 'inspyx.stripe.back', AGAIN_KEY = 'inspyx.stripe.again', SETTLE = 5 * 60000, EVERY = 10000;
  var store = function (k, v) { try { if (v === undefined) return window.sessionStorage.getItem(k); if (v === null) window.sessionStorage.removeItem(k); else window.sessionStorage.setItem(k, v); } catch (e) { return null; } return null; };
  var back = (/[?&]stripe=(done|again)(?:&|$)/.exec(window.location.search) || [])[1] || null;
  if (back) {
    try { window.history.replaceState(null, '', window.location.pathname + window.location.hash); } catch (e) { /* the address stays */ }
    if (back === 'done') store(BACK_KEY, String(Date.now()));
  }
  function settling() { var at = Number(store(BACK_KEY)); return at > 0 && Date.now() - at < SETTLE; }
  var again = null;
  function checkSoon() { clearTimeout(again); again = setTimeout(function () { if (!busy) check(); }, EVERY); }

  var asked = 0;   // each check is numbered: only the newest one's answer shows (a slow older one never overwrites it)
  function check() {
    var mine = ++asked;
    show('checking', '', false);
    return auth.ask('payments', { action: 'status' }, DEADLINE).then(function (r) {
      if (mine !== asked) return;
      if (r === null) { window.location.replace('/signin'); return; }
      if (r.status === 409 && r.json && r.json.error === 'no_account') { show('no-plan', 'plan', false); return; }
      if (r.status === 404 || r.status === 501) { show('not-set-up', '', false); return; }
      var s = r.status === 200 && r.json ? r.json.state : null;
      if (s === 'ready') { store(BACK_KEY, null); show('ready', '', r.json.payouts !== true); }
      else if (s === 'none') show('none', 'setup', false);
      else if ((s === 'needs_info' || s === 'pending') && settling()) { show('stripe-checking', '', false); checkSoon(); }
      else if (s === 'needs_info') show('needs_info', 'finish', false);
      else if (s === 'pending') show('pending', 'again', false);
      else show('failed', 'again', false);
    }, function () { if (mine === asked) show('failed', 'again', false); });
  }

  function openStripe(button) {
    busy = true; button.disabled = true;
    main.querySelector('[data-page-failed]').hidden = true;
    // "back": "web": Stripe brings him back here, to /payments, not the home page (the server's fixed addresses).
    auth.ask('payments', { action: 'connect', back: 'web' }, DEADLINE).then(function (r) {
      var to = null;
      try { to = r && r.status === 200 && r.json && typeof r.json.url === 'string' ? new URL(r.json.url) : null; } catch (e) { to = null; }
      if (to && to.protocol === 'https:' && STRIPE.indexOf(to.host) >= 0 && !to.username && !to.password) { window.location.assign(to.href); return; }
      if (r && r.status === 409) { show('no-plan', 'plan', false); return; }
      main.querySelector('[data-page-failed]').hidden = false;
      fellBack();
    }, function () { main.querySelector('[data-page-failed]').hidden = false; fellBack(); }).then(function () { busy = false; button.disabled = false; });
  }
  // A fresh link that couldn't be opened leaves "Opening a fresh one" for where things stand, with its button.
  function fellBack() {
    var waiting = main.querySelector('[data-stands="link-expired"]');
    if (waiting && !waiting.hidden) setTimeout(check, 0);
  }

  buttons.forEach(function (b) {
    var what = b.getAttribute('data-do');
    if (what === 'setup' || what === 'finish') b.addEventListener('click', function () { openStripe(b); });
    if (what === 'again') b.addEventListener('click', check);
  });

  if (!auth.who()) { window.location.replace('/signin'); return; }
  main.hidden = false;
  // The link ran out: a fresh one, once in a while (never a loop if Stripe keeps sending him back).
  var lastAgain = Number(store(AGAIN_KEY));
  if (back === 'again' && !(lastAgain > 0 && Date.now() - lastAgain < 2 * 60000)) {
    store(AGAIN_KEY, String(Date.now()));
    show('link-expired', '', false);
    var go = main.querySelector('[data-do="finish"]');
    openStripe(go);
    return;
  }
  check();
  document.addEventListener('visibilitychange', function () { if (document.visibilityState === 'visible' && !busy) check(); });
})();
