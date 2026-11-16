/* Your plan, on the website: where the inspector's Inspyx plan stands, and one button. The same as the app's
   Settings → Your plan (lib/src/shell/plan_billing.dart and plan_section.dart in the app's repo), sentence for
   sentence: Moises approved those words on 2026-11-09. The first button goes to Stripe's checkout page and the
   others to Stripe's billing page; Stripe sends the inspector back here (?billing=done, canceled or back).
   The card never passes through Inspyx: it goes to Stripe, on Stripe's page.
   Free days and "Get my money back" (Moises approved those words on 2026-11-15, "Yes, all"): a founder's free days
   start with their own app invite, and the page says how many are left and when they end; within 30 days of a
   payment, once, the inspector may have it back. The page first asks what that would give back and to which card
   (money_back_quote), asks the inspector once more in a sheet, then sends the amount they saw (expect_cents): a
   different one is never refunded unseen.
   This file says no words. The page holds every sentence; the script shows the one that is true and writes
   only a date, an amount, and the server's own word for how often into it. */
(function () {
  'use strict';
  var main = document.querySelector('[data-plan]');
  var auth = window.InspyxAuth;
  if (!main || !auth) return;
  var DEADLINE = 20000;          // as in the app: an ask that takes longer counts as no answer
  // "Get my money back": ON since Moises approved its last sentence ("Couldn't finish your refund. Try again in a
  // minute.", 2026-11-16); it was off from 2026-11-15 until then. Off, whatever the server says, no button, sheet or
  // line about it shows, as with the app's INSPYX_PLAN_MONEY_BACK. The free days (items 1 to 3) follow the server either way.
  var MONEY_BACK_ON = true;
  var SETTLE = 2000, MORE = 3;   // after a checkout Stripe's notice can take a moment: three more looks, two seconds apart
  var STRIPE = ['checkout.stripe.com', 'billing.stripe.com'];   // the only places this page ever sends anyone

  var all = function (sel) { return [].slice.call(main.querySelectorAll(sel)); };
  var levels = all('.badge[data-level], .name[data-level]');
  var lines = all('[data-stands]'), says = all('[data-say]'), backs = all('[data-back]'), buttons = all('[data-do]'), names = all('[data-email]');
  var unders = all('[data-under]'), moneyButton = main.querySelector('[data-money]'), sheet = main.querySelector('[data-sheet]');
  var asks = sheet ? [].slice.call(sheet.querySelectorAll('[data-ask]')) : [], sheetButtons = sheet ? [].slice.call(sheet.querySelectorAll('[data-sheet-do]')) : [];
  var asked = 0;      // goes up with every check started here, so an older answer never replaces a newer one
  var busy = false;   // one of Stripe's pages, or the money back, is being asked for
  var quoted = null;  // what the sheet offers to give back: { cents, last4 }
  var refunded = null;   // what was just given back, in cents: said until the page is looked at afresh

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
  // "$54.95", "$593", "$84.95", "$1,090".
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
      every: every === 'month' || every === 'year' ? every : null,
      // The inspector's level (2026-11-14): founder, early (the next 100) or regular; founder when the server
      // doesn't say, as before.
      level: json.tier === 'early' || json.tier === 'regular' ? json.tier : 'founder',
      // A founder's free days start with their own app invite (2026-11-15): before it, no plan can start; after
      // it, the days left and when they end.
      waits: json.free_waits_for_invite === true,
      freeUntil: when(json.free_until),
      freeDays: json.offer && whole(json.offer.trial_days) && json.offer.trial_days > 0 ? json.offer.trial_days : null,
      moneyBack: MONEY_BACK_ON ? moneyBackOf(json.money_back) : null
    };
  }
  function whole(n) { return typeof n === 'number' && n >= 0 && Math.floor(n) === n; }
  // What the server says about money back: offered (for how much), or why not; null when it says nothing.
  function moneyBackOf(m) {
    if (!m || typeof m !== 'object') return null;
    if (m.eligible === true) return whole(m.amount_cents) && m.amount_cents > 0 ? { eligible: true } : null;
    return m.eligible === false && (m.why === 'used' || m.why === 'too_late') ? { eligible: false, why: m.why } : null;
  }
  // A quote, or a "changed" answer: the amount (whole cents, more than none) and the card's last four, when said.
  function quoteOf(json) {
    if (!json || !whole(json.amount_cents) || json.amount_cents <= 0) return null;
    return { cents: json.amount_cents, last4: typeof json.card_last4 === 'string' && /^[0-9]{4}$/.test(json.card_last4) ? json.card_last4 : null };
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
    // A plan whose time ran out gave its place back: starting again is the regular price, for every level
    // (Moises, 2026-11-14: "Yes, keep it"). One that never began keeps its own offer.
    if (s === 'canceled') return { line: 'ended', button: 'start' };
    if (s === 'incomplete_expired') return { line: 'offer', button: 'start' };
    // Free days are a founder's only. Theirs start with their own app invite: until it is sent, no plan starts.
    if (plan.freeMonth && plan.level === 'founder') {
      if (plan.waits) return { line: 'waits', button: '' };
      return { line: 'offer-free', days: plan.freeDays || 30, under: plan.freeUntil ? 'free-until' : '', underDate: plan.freeUntil, button: 'start' };
    }
    return { line: 'offer', button: 'start' };
  }

  function fill(p, hole, text) { [].forEach.call(p.querySelectorAll('[data-fill="' + hole + '"]'), function (e) { e.textContent = text; }); }
  function show(what, plan) {
    // Each level is told its own name and price (Codex on #398); the founding ones until the server says.
    var level = plan && plan.level ? plan.level : 'founder';
    levels.forEach(function (e) { e.hidden = e.getAttribute('data-level') !== level; });
    var need = [what.date ? 'date' : '', what.price ? 'price' : ''].filter(Boolean).join(' ');
    lines.forEach(function (p) {
      var on = p.getAttribute('data-stands') === what.line && (p.getAttribute('data-with') || '') === need &&
        (!p.hasAttribute('data-level') || p.getAttribute('data-level') === level);
      p.hidden = !on;
      if (!on) return;
      fill(p, 'date', what.date ? longDate(what.date) : '');
      fill(p, 'amount', what.price ? money(plan.cents) : '');
      fill(p, 'every', what.price ? plan.every : '');
      fill(p, 'days', what.days ? String(what.days) : '');
    });
    buttons.forEach(function (b) { b.hidden = b.getAttribute('data-do') !== what.button; b.disabled = busy; });
    // Under it: when the free days end; why money back isn't offered (only once it was, or the 30 days are over).
    var mb = plan && plan.moneyBack;
    var under = what.under || (mb && !mb.eligible ? (mb.why === 'used' ? 'money-used' : 'money-over') : '');
    unders.forEach(function (p) {
      p.hidden = p.getAttribute('data-under') !== under;
      if (!p.hidden) fill(p, 'date', what.underDate ? longDate(what.underDate) : '');
    });
    if (moneyButton) { moneyButton.hidden = !(mb && mb.eligible); moneyButton.disabled = busy; }
    // Stripe's last word is said only when the plan agrees with it: all set with a plan running, no charge with none.
    // A money back just made is said until the page is looked at afresh.
    var said = refunded !== null ? 'refunded' : plan && back === 'done' && plan.hasPlan ? 'done' : plan && back === 'canceled' && !plan.hasPlan ? 'canceled' : '';
    backs.forEach(function (p) {
      p.hidden = p.getAttribute('data-back') !== said;
      if (!p.hidden) fill(p, 'amount', refunded !== null ? money(refunded) : '');
    });
  }
  // The money-back lines alone, from an answer to the quote or the press: no longer offered, and why.
  function moneyGone(why) {
    if (moneyButton) moneyButton.hidden = true;
    unders.forEach(function (p) { p.hidden = p.getAttribute('data-under') !== (why === 'already' ? 'money-used' : 'money-over'); });
  }
  function say(kind) { says.forEach(function (p) { p.hidden = p.getAttribute('data-say') !== kind; }); }

  /* One ask of Inspyx's billing server, as the signed-in inspector (auth.js holds the sign-in; this file is
     never handed it: it asks who is signed in and gets an address and an id). gone: nobody is signed in any more. trouble: why there is no answer to show. */
  function billing(action, more) {
    var body = { action: action };
    if (more) Object.keys(more).forEach(function (k) { body[k] = more[k]; });
    return auth.ask('billing', body, DEADLINE).then(function (r) {
      if (r === null) return { gone: true };
      if (r.status === 200) return { json: r.json };
      // 404: the function is not there. not_configured: it has no Stripe key yet.
      if (r.status === 404 || (r.json && r.json.error === 'not_configured')) return { trouble: 'not-set-up' };
      // The money back's refusals (409): the reason, and a changed amount's new quote.
      if (r.status === 409 && r.json && typeof r.json.error === 'string') return { trouble: 'refused', why: r.json.error, json: r.json };
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

  /* "Get my money back": what it would give back is asked first, and said in the sheet; "Refund me" sends the amount
     the inspector saw. Each refusal is said in its own words; no answer is "Couldn't finish your refund". */
  function settle(on) {
    busy = !on;
    buttons.forEach(function (b) { b.disabled = !on; });
    sheetButtons.forEach(function (b) { b.disabled = !on; });
    if (moneyButton) moneyButton.disabled = !on;
  }
  function fillSheet(q) {
    quoted = q;
    asks.forEach(function (p) {
      p.hidden = p.getAttribute('data-ask') !== (q.last4 ? 'card' : 'card-unknown');
      fill(p, 'amount', money(q.cents));
      fill(p, 'last4', q.last4 || '');
    });
  }
  function openSheet() {
    if (!sheet || sheet.open) return;
    if (typeof sheet.showModal === 'function') sheet.showModal(); else sheet.setAttribute('open', '');
    var first = sheet.querySelector('[data-sheet-do="refund"]');
    if (first) first.focus();
  }
  function closeSheet() {
    if (!sheet || !sheet.open) return;
    if (typeof sheet.close === 'function') sheet.close(); else sheet.removeAttribute('open');
  }
  // A refusal or no answer, from the quote or the press: the sheet closes and the page says why.
  function moneyTrouble(a) {
    closeSheet();
    if (a.trouble === 'refused' && (a.why === 'already' || a.why === 'too_late' || a.why === 'nothing_paid')) { moneyGone(a.why); return; }
    say(a.trouble === 'not-set-up' ? 'not-set-up' : 'refund');
  }
  function askMoneyBack() {
    if (busy || !MONEY_BACK_ON) return;
    settle(false);
    say('');
    billing('money_back_quote').then(function (a) {
      if (a.gone) { signedOut(); return; }
      settle(true);
      var q = a.trouble ? null : quoteOf(a.json);
      if (!q) { moneyTrouble(a.trouble ? a : { trouble: 'failed' }); return; }
      fillSheet(q);
      openSheet();
    });
  }
  function refundNow() {
    if (busy || !quoted || !MONEY_BACK_ON) return;
    settle(false);
    billing('money_back', { expect_cents: quoted.cents }).then(function (a) {
      if (a.gone) { signedOut(); return; }
      settle(true);
      if (!a.trouble && a.json && a.json.refunded === true) {
        closeSheet();
        refunded = whole(a.json.amount_cents) ? a.json.amount_cents : quoted.cents;
        quoted = null;
        // The plan has ended: where it stands now, with what was given back said over it.
        check(false).then(function () { var at = main.querySelector('.back'); if (at) { at.setAttribute('tabindex', '-1'); at.focus(); } });
        return;
      }
      // A newer payment landed between the quote and the press: the sheet says the new amount, and asks again.
      var changed = a.trouble === 'refused' && a.why === 'changed' ? quoteOf(a.json) : null;
      if (changed) { fillSheet(changed); return; }
      moneyTrouble(a.trouble ? a : { trouble: 'failed' });
    });
  }
  if (moneyButton) moneyButton.addEventListener('click', askMoneyBack);
  sheetButtons.forEach(function (b) {
    b.addEventListener('click', function () {
      if (b.getAttribute('data-sheet-do') === 'refund') refundNow();
      else if (!busy) { closeSheet(); quoted = null; }
    });
  });
  // Escape closes the sheet as "Keep my plan" does, but never while the refund is being asked for.
  if (sheet) sheet.addEventListener('cancel', function (e) { if (busy) e.preventDefault(); else quoted = null; });
  if (sheet) sheet.addEventListener('close', function () { if (moneyButton && !moneyButton.hidden) moneyButton.focus(); });

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
    refunded = null;
    closeSheet();
    check(false);
  }
  window.addEventListener('storage', function (e) { if (e.key === 'inspyx.signin') again(); });
  window.addEventListener('pageshow', function (e) { if (e.persisted) again(); });

  check(back === 'done');
})();
