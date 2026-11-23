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
    });
  }

  function check() {
    show('checking', '', false);
    return auth.ask('payments', { action: 'status' }, DEADLINE).then(function (r) {
      if (r === null) { window.location.replace('/signin'); return; }
      if (r.status === 409 && r.json && r.json.error === 'no_account') { show('no-plan', 'plan', false); return; }
      if (r.status === 404 || r.status === 501) { show('not-set-up', '', false); return; }
      var s = r.status === 200 && r.json ? r.json.state : null;
      if (s === 'ready') show('ready', '', r.json.payouts !== true);
      else if (s === 'none') show('none', 'setup', false);
      else if (s === 'needs_info') show('needs_info', 'finish', false);
      else if (s === 'pending') show('pending', 'again', false);
      else show('failed', 'again', false);
    }, function () { show('failed', 'again', false); });
  }

  function openStripe(button) {
    busy = true; button.disabled = true;
    main.querySelector('[data-page-failed]').hidden = true;
    auth.ask('payments', { action: 'connect' }, DEADLINE).then(function (r) {
      var to = null;
      try { to = r && r.status === 200 && r.json && typeof r.json.url === 'string' ? new URL(r.json.url) : null; } catch (e) { to = null; }
      if (to && to.protocol === 'https:' && STRIPE.indexOf(to.host) >= 0 && !to.username && !to.password) { window.location.assign(to.href); return; }
      if (r && r.status === 409) { show('no-plan', 'plan', false); return; }
      main.querySelector('[data-page-failed]').hidden = false;
    }, function () { main.querySelector('[data-page-failed]').hidden = false; }).then(function () { busy = false; button.disabled = false; });
  }

  buttons.forEach(function (b) {
    var what = b.getAttribute('data-do');
    if (what === 'setup' || what === 'finish') b.addEventListener('click', function () { openStripe(b); });
    if (what === 'again') b.addEventListener('click', check);
  });

  if (!auth.who()) { window.location.replace('/signin'); return; }
  main.hidden = false;
  check();
  document.addEventListener('visibilitychange', function () { if (document.visibilityState === 'visible' && !busy) check(); });
})();
