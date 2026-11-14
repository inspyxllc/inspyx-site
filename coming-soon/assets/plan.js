/* Your plan, on the website: where the inspector's Inspyx plan stands, and one button. The same as the app's
   Settings → Your plan (lib/src/shell/plan_billing.dart and plan_section.dart in the app's repo), sentence for
   sentence: Moises approved those words on 2026-11-09. The first button goes to Stripe's checkout page and the
   others to Stripe's billing page; Stripe sends the inspector back here (?billing=done, canceled or back).
   The card never passes through Inspyx: it goes to Stripe, on Stripe's page.
   This file says no words. The page holds every sentence; the script shows the one that is true and writes
   only a date, an amount, and the server's own word for how often into it. */
(function () {
  'use strict';
  var main = document.querySelector('[data-plan]');
  var auth = window.InspyxAuth;
  if (!main || !auth) return;
  var DEADLINE = 20000;          // as in the app: an ask that takes longer counts as no answer
  var SETTLE = 2000, MORE = 3;   // after a checkout Stripe's notice can take a moment: three more looks, two seconds apart
  var STRIPE = ['checkout.stripe.com', 'billing.stripe.com'];   // the only places this page ever sends anyone

  var all = function (sel) { return [].slice.call(main.querySelectorAll(sel)); };
  var lines = all('[data-stands]'), says = all('[data-say]'), backs = all('[data-back]'), buttons = all('[data-do]'), names = all('[data-email]');
  var asked = 0;      // goes up with every check started here, so an older answer never replaces a newer one
  var busy = false;   // one of Stripe's pages is being asked for

  /* Stripe sent the inspector back: which way they left it. The word is read once and taken out of the address,
     so loading the page again does not say it again. */
  var back = null;
  try { back = new URLSearchParams(window.location.search).get('billing'); } catch (e) { back = null; }
  if (back !== 'done' && back !== 'canceled' && back !== 'back') back = null;
  if (back) { try { window.history.replaceState(null, '', window.location.pathname); } catch (e) { /* the address stays as it is */ } }

  function when(v) {
    var t = typeof v === 'string' ? Date.parse(v) : NaN;
    return isNaN(t) ? null : new Date(t);
  }
  // "December 9, 2026", on the inspector's own calendar, as the app says it.
  function longDate(d) { return new Intl.DateTimeFormat('en-US', { month: 'long', day: 'numeric', year: 'numeric' }).format(d); }
  // "$69", "$649", "$84.95", "$1,090".
  function money(cents) {
    var digits = cents % 100 === 0 ? 0 : 2;
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: digits, maximumFractionDigits: digits }).format(cents / 100);
  }

  /* The server's answer as a plan; null when it is not one. */
  function planOf(json) {
    if (!json || typeof json.status !== 'string' || typeof json.has_plan !== 'boolean') return null;
    var cents = json.plan_amount, every = json.plan_interval;
    return {
      status: json.status,
      hasPlan: json.has_plan,
      trialEnd: when(json.trial_end),
      periodEnd: when(json.current_period_end),
      ending: json.cancel_at_period_end === true,
      freeMonth: json.free_month !== false,
      cents: typeof cents === 'number' && cents >= 0 && Math.floor(cents) === cents ? cents : null,
      every: every === 'month' || every === 'year' ? every : null
    };
  }

  /* What the page says about a plan: which sentence, the date and price to write into it, and which button. */
  function standing(plan) {
    var s = plan.status;
    if (s === 'trialing' || s === 'active') {
      if (plan.ending) return { line: 'ending', date: plan.periodEnd || plan.trialEnd, button: 'manage' };
      if (s === 'trialing') return { line: 'free', date: plan.trialEnd, price: plan.cents !== null && plan.every !== null, button: 'manage' };
      return { line: 'active', date: plan.periodEnd, button: 'manage' };
    }
    if (s === 'past_due') return { line: 'problem', button: 'card' };
    if (s === 'incomplete' || s === 'unpaid' || s === 'paused') return { line: 'attention', button: 'manage' };
    if (s === 'canceled' || s === 'incomplete_expired') return { line: 'ended', button: 'start' };
    return { line: plan.freeMonth ? 'offer-free' : 'offer', button: 'start' };
  }

  function fill(p, hole, text) { [].forEach.call(p.querySelectorAll('[data-fill="' + hole + '"]'), function (e) { e.textContent = text; }); }
  function show(what, plan) {
    var need = [what.date ? 'date' : '', what.price ? 'price' : ''].filter(Boolean).join(' ');
    lines.forEach(function (p) {
      var on = p.getAttribute('data-stands') === what.line && (p.getAttribute('data-with') || '') === need;
      p.hidden = !on;
      if (!on) return;
      fill(p, 'date', what.date ? longDate(what.date) : '');
      fill(p, 'amount', what.price ? money(plan.cents) : '');
      fill(p, 'every', what.price ? plan.every : '');
    });
    buttons.forEach(function (b) { b.hidden = b.getAttribute('data-do') !== what.button; b.disabled = busy; });
    // Stripe's last word is said only when the plan agrees with it: all set with a plan running, no charge with none.
    var said = plan && back === 'done' && plan.hasPlan ? 'done' : plan && back === 'canceled' && !plan.hasPlan ? 'canceled' : '';
    backs.forEach(function (p) { p.hidden = p.getAttribute('data-back') !== said; });
  }
  function say(kind) { says.forEach(function (p) { p.hidden = p.getAttribute('data-say') !== kind; }); }

  /* One ask of Inspyx's billing server, as the signed-in inspector (auth.js holds the sign-in; this file is
     never handed it: it asks who is signed in and gets an address and an id). gone: nobody is signed in any more. trouble: why there is no answer to show. */
  function billing(action) {
    return auth.ask('billing', { action: action }, DEADLINE).then(function (r) {
      if (r === null) return { gone: true };
      if (r.status === 200) return { json: r.json };
      // 404: the function is not there. not_configured: it has no Stripe key yet.
      if (r.status === 404 || (r.json && r.json.error === 'not_configured')) return { trouble: 'not-set-up' };
      return { trouble: 'failed' };
    }, function () { return { trouble: 'failed' }; });
  }

  function signedOut() { window.location.replace('/signin'); }
  function wait(ms) { return new Promise(function (done) { setTimeout(done, ms); }); }

  /* Where the plan stands now. Back from a checkout, a plan not there yet is looked for a few more times before
     the page says so: Stripe tells Inspyx's server a moment after it tells the inspector. */
  function check(settle) {
    var mine = ++asked, left = settle ? MORE : 0;
    say('');
    show({ line: 'checking' });
    var look = function () {
      return billing('status').then(function (a) {
        if (mine !== asked) return;
        if (a.gone) { signedOut(); return; }
        var plan = a.trouble ? null : planOf(a.json);
        if (plan && !plan.hasPlan && left > 0) { left -= 1; return wait(SETTLE).then(function () { if (mine === asked) return look(); }); }
        if (plan) show(standing(plan), plan);
        else show({ line: a.trouble === 'not-set-up' ? 'not-set-up' : 'failed', button: a.trouble === 'not-set-up' ? '' : 'again' });
      });
    };
    return look();
  }

  /* One of Stripe's pages: asked for, checked to be Stripe's own, then gone to. */
  function open(action) {
    if (busy) return;
    busy = true;
    say('');
    buttons.forEach(function (b) { b.disabled = true; });
    billing(action).then(function (a) {
      if (a.gone) { signedOut(); return; }
      var to = null;
      try { to = a.json && typeof a.json.url === 'string' ? new URL(a.json.url) : null; } catch (e) { to = null; }
      if (to && to.protocol === 'https:' && STRIPE.indexOf(to.host) >= 0 && !to.username && !to.password) { window.location.assign(to.href); return; }
      busy = false;
      buttons.forEach(function (b) { b.disabled = false; });
      say(a.trouble === 'not-set-up' ? 'not-set-up' : 'page');
    });
  }

  function name(s) { names.forEach(function (e) { e.textContent = s.email; }); }
  var s = auth.who();
  if (!s) { signedOut(); return; }
  name(s);
  main.hidden = false;

  buttons.forEach(function (b) {
    b.addEventListener('click', function () {
      var what = b.getAttribute('data-do');
      if (what !== 'again') { open(what === 'start' ? 'start' : 'portal'); return; }
      // The button that was pressed goes away while the plan is looked at, and the keyboard's place with it:
      // the next Tab would start from the top of the page. When the look is over, whoever has not moved on is
      // put on the button that shows now, or on the sentence when there is none.
      check(false).then(function () {
        var here = document.activeElement;
        if (here && here !== document.body && here !== b) return;
        var next = buttons.filter(function (x) { return !x.hidden; })[0] || main.querySelector('.stands');
        if (next) next.focus();
      });
    });
  });

  // Somebody else signed in from another tab, or the Back button brought this page back from Stripe: the plan is
  // looked at again, for whoever is signed in now. (With nobody signed in, auth.js has already sent this tab to
  // the sign-in page.)
  function again() {
    var now = auth.who();
    if (!now) return;
    name(now);
    busy = false;
    back = null;
    check(false);
  }
  window.addEventListener('storage', function (e) { if (e.key === 'inspyx.signin') again(); });
  window.addEventListener('pageshow', function (e) { if (e.persisted) again(); });

  check(back === 'done');
})();
