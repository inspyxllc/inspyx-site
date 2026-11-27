/* A client's pay page with the inspector's card fee: inspyx.com/pay#<link>. It reads and pays
   through the pay function (backend/supabase/functions/pay in the app's repo):
     GET  <link>?view=json[&pi=<payment>]  what is due and the card fee's rate; or paid, confirming, nothing due,
                                           or Checkout after all (the fee no longer applies here);
     POST <link> {"action":"quote","payment_method":"pm_…"}  the payment for the card typed in, with the fee
                                           Stripe allows on it: credit cards only, never debit or prepaid.
   The card is typed into Stripe's own form (js.stripe.com) and goes to Stripe alone: this page never sees it.

   The link comes after the "#", which a browser never sends to any server. It is read once, kept for this tab only,
   and taken out of the address at once. The function is asked with no sign-in and no key: the link is its key.

   This file says no words. The page holds every sentence; the script fills in only amounts, the rate, and the
   inspector's business name and line. */
(function () {
  'use strict';
  var FN = 'https://btxlrfvqifnrnxffohsz.supabase.co/functions/v1/pay/';
  var LINK = /^[A-Za-z0-9_-]{22}$/;
  var KEPT = 'inspyx.pay.link';
  var PAID = 'inspyx.pay.paying';   // {link, pi}: a payment Stripe took whose result isn't read yet
  var DEADLINE = 20000;   // an ask that takes longer counts as no answer
  var PK = /^pk_(test|live)_[A-Za-z0-9]{10,240}$/;
  var ACCT = /^acct_[A-Za-z0-9]{6,64}$/;
  var SECRET = /^pi_[A-Za-z0-9]{10,240}_secret_[A-Za-z0-9]{10,240}$/;
  var PI = /^pi_[A-Za-z0-9]{10,240}$/;

  var doc = document;
  var main = doc.querySelector('[data-pay]');
  if (!main) return;
  var one = function (sel, root) { return (root || doc).querySelector(sel); };
  var all = function (sel, root) { return [].slice.call((root || doc).querySelectorAll(sel)); };
  var due = one('[data-due]'), entry = one('[data-entry]'), quote = one('[data-quote]');
  var again = one('[data-again]'), go = one('[data-continue]'), payNow = one('[data-paynow]'), other = one('[data-other]');

  /* The link: read once from after the "#", kept for this tab, and taken out of the address. */
  var mark = (location.hash || '').replace(/^#/, '');
  var link = null;
  if (LINK.test(mark)) {
    link = mark;
    try { sessionStorage.setItem(KEPT, link); } catch (e) { /* storage off: a reload asks for the link again */ }
    try { history.replaceState(null, '', '/pay'); } catch (e) { /* an old browser keeps the address */ }
  } else {
    try { var kept = sessionStorage.getItem(KEPT); if (kept && LINK.test(kept)) link = kept; } catch (e) { /* storage off */ }
  }

  var stripe = null, card = null, secret = null, busy = false, rate = 0;

  /* A payment Stripe took, for this link: followed until its result is read, across a reload of the tab. */
  function paying() {
    try { var k = JSON.parse(sessionStorage.getItem(PAID) || 'null'); if (k && k.link === link && PI.test(k.pi || '')) return k.pi; } catch (e) { /* storage off */ }
    return null;
  }
  function keepPaying(pi) { try { if (pi) sessionStorage.setItem(PAID, JSON.stringify({ link: link, pi: pi })); else sessionStorage.removeItem(PAID); } catch (e) { /* storage off */ } }

  function state(name) {
    all('[data-states] [data-state]').forEach(function (p) { p.hidden = p.getAttribute('data-state') !== name; });
    again.hidden = name !== 'failed';
    if (name !== 'paid') one('[data-receipt]').hidden = true;
  }
  function error(name, why) {
    all('[data-error]').forEach(function (p) { p.hidden = p.getAttribute('data-error') !== name; });
    var w = one('[data-why]');
    w.textContent = typeof why === 'string' ? why : '';
    w.hidden = !name || w.textContent === '';
  }
  function fill(name, value) { all('[data-v="' + name + '"]').forEach(function (e) { e.textContent = value; }); }
  var whole = function (n, lo, hi) { return typeof n === 'number' && isFinite(n) && Math.floor(n) === n && n >= lo && n <= hi; };
  var text = function (v) { return typeof v === 'string' ? v.replace(/\s+/g, ' ').trim() : ''; };
  var usd = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });
  var money = function (cents) { return usd.format(cents / 100); };
  var percent = function (bp) { return (bp % 100 === 0 ? String(bp / 100) : (bp / 100).toFixed(1)) + '%'; };

  function ask(method, query, body) {
    var stop = typeof AbortController === 'function' ? new AbortController() : null;
    var timer = stop ? setTimeout(function () { stop.abort(); }, DEADLINE) : null;
    var init = { method: method, credentials: 'omit', cache: 'no-store', referrerPolicy: 'no-referrer', signal: stop ? stop.signal : undefined };
    // A GET carries no header of its own; a POST says only that its body is JSON (the function allows no other).
    if (body) { init.headers = { 'Content-Type': 'application/json' }; init.body = JSON.stringify(body); }
    return fetch(FN + link + (query || ''), init).then(function (res) {
      if (timer) clearTimeout(timer);
      if (res.status === 404) return { state: 'gone' };
      if (!res.ok) return { state: 'failed' };
      return res.json().catch(function () { return { state: 'failed' }; });
    }, function () {
      if (timer) clearTimeout(timer);
      return { state: 'failed' };
    });
  }

  /* Only the pay function's own Checkout address, and only Stripe's receipt pages, are ever opened. */
  function toCheckout(url) {
    if (typeof url === 'string' && url.indexOf(FN + link) === 0 && !/[\s"'<>]/.test(url)) {
      state('checkout');
      location.replace(url);
      return;
    }
    state('failed');
  }
  function receipt(url) {
    var a = one('[data-receipt]');
    var ok = typeof url === 'string' && /^https:\/\/pay\.stripe\.com\/receipts\/[A-Za-z0-9/_-]+$/.test(url);
    if (ok) a.setAttribute('href', url);
    a.hidden = !ok;
  }

  function settled(a) {
    due.hidden = true;
    if (a.state === 'paid') { keepPaying(null); state('paid'); receipt(a.receipt_url); return true; }
    if (a.state === 'nothing_due') { keepPaying(null); state(a.paid_in_full === true ? 'paidfull' : 'nothing'); return true; }
    if (a.state === 'confirming') {
      state('confirming');
      follow(settled.pi || null);
      return true;
    }
    if (a.state === 'checkout') { toCheckout(a.url); return true; }
    if (a.state === 'gone') { state('gone'); return true; }
    return false;
  }

  /* A payment on its way is followed until its result is read: soon at first, then less often, and at once when
     the tab comes back or the connection does. One this tab took is asked about by its own id, never through the
     plain "what is due" view, which, asked before the function records it, would offer to take it a second time. */
  var followTimer = null, followTries = 0;
  function follow(pi) {
    if (pi) { settled.pi = pi; keepPaying(pi); }
    state('confirming');
    due.hidden = true;
    if (followTimer) return;
    var wait = followTries < 5 ? 2000 : Math.min(30000, 2000 * Math.pow(2, followTries - 4));
    followTimer = setTimeout(followNow, followTries === 0 ? 0 : wait);
  }
  function followNow() {
    if (followTimer) { clearTimeout(followTimer); followTimer = null; }
    var pi = settled.pi || null;
    followTries++;
    // With no payment of this tab's own to name (the page opened on a payment already on its way), the plain
    // view is asked: the server answers what is due, and "due" then is its own word that nothing is pending.
    ask('GET', '?view=json' + (pi ? '&pi=' + pi : '')).then(function (a) {
      if (a.state === 'paid' || a.state === 'nothing_due' || a.state === 'gone' || a.state === 'checkout') return settled(a);
      if (!pi && a.state === 'due') return showDue(a);
      follow(pi);   // confirming, no answer, or not recorded yet: still on its way
    });
  }
  window.addEventListener('online', function () { if (followTimer) followNow(); });
  doc.addEventListener('visibilitychange', function () { if (doc.visibilityState === 'visible' && followTimer) followNow(); });

  function look() {
    state('loading');
    due.hidden = true;
    ask('GET', '?view=json').then(function (a) {
      if (settled(a)) return;
      if (a.state === 'due') return showDue(a);
      state('failed');
    });
  }

  function showDue(a) {
    if (!whole(a.due_cents, 1, 100000000) || !whole(a.card_fee_bp, 1, 300) || !PK.test(a.publishable_key || '') ||
        !ACCT.test(a.stripe_account || '') || typeof window.Stripe !== 'function') {
      return state('failed');
    }
    rate = a.card_fee_bp;
    var name = text(a.business_name), title = text(a.title), detail = text(a.detail);
    fill('due', money(a.due_cents));
    fill('rate', percent(rate));
    fill('business', name);
    one('[data-named]').hidden = name === '';
    one('[data-unnamed]').hidden = name !== '';
    fill('title', title);
    fill('detail', detail);
    one('[data-what]').hidden = title === '' && detail === '';
    one('.pay-detail').hidden = detail === '';
    if (!stripe) {
      try {
        // The payment is the inspector's own (their Stripe account), as their pay link's Checkout page is.
        stripe = window.Stripe(a.publishable_key, { stripeAccount: a.stripe_account });
        card = stripe.elements().create('card', {
          disableLink: true,
          style: {
            base: { fontSize: '17px', color: '#1D1D1F', fontFamily: '-apple-system,BlinkMacSystemFont,Helvetica,Arial,sans-serif', '::placeholder': { color: '#8A8A8E' } },
            invalid: { color: '#8C1D18' },
          },
        });
        card.mount(one('[data-card]'));
        card.on('change', function () { error(null); });
      } catch (e) {
        stripe = null;
        return state('failed');
      }
    }
    state(null);
    due.hidden = false;
    entry.hidden = false;
    quote.hidden = true;
    go.disabled = false;
  }

  function showQuote(q) {
    if (!SECRET.test(q.client_secret || '') || !whole(q.due_cents, 1, 100000000) || !whole(q.card_fee_cents, 0, 100000000) ||
        !whole(q.total_cents, 1, 100000000) || q.total_cents !== q.due_cents + q.card_fee_cents) {
      return error('failed');
    }
    secret = q.client_secret;
    var credit = q.credit === true && q.card_fee_cents > 0;
    if (whole(q.card_fee_bp, 1, 300)) { rate = q.card_fee_bp; fill('rate', percent(rate)); }
    fill('due', money(q.due_cents));
    fill('fee', money(q.card_fee_cents));
    fill('total', money(q.total_cents));
    one('[data-credit]').hidden = !credit;
    one('[data-debit]').hidden = credit;
    entry.hidden = true;
    quote.hidden = false;
    payNow.disabled = false;
    payNow.focus();
  }

  go.addEventListener('click', function () {
    if (busy || !stripe || !card) return;
    busy = true; go.disabled = true; error(null);
    stripe.createPaymentMethod({ type: 'card', card: card }).then(function (r) {
      if (!r || r.error || !r.paymentMethod || !/^pm_[A-Za-z0-9]{6,240}$/.test(r.paymentMethod.id || '')) {
        busy = false; go.disabled = false;
        return error('card', r && r.error ? r.error.message : '');
      }
      return ask('POST', '', { action: 'quote', payment_method: r.paymentMethod.id }).then(function (a) {
        busy = false; go.disabled = false;
        if (a.state === 'quote') return showQuote(a);
        if (a.state === 'checkout' || a.state === 'nothing_due' || a.state === 'gone') return settled(a);
        error('failed');
      });
    }, function () { busy = false; go.disabled = false; error('failed'); });
  });

  payNow.addEventListener('click', function () {
    if (busy || !stripe || !secret) return;
    busy = true; payNow.disabled = true; other.disabled = true; error(null);
    stripe.confirmCardPayment(secret).then(function (r) {
      busy = false; other.disabled = false;
      var pi = r && r.paymentIntent;
      if (r && r.error) {
        payNow.disabled = false;
        return error('declined', r.error.message);
      }
      if (!pi || !PI.test(pi.id || '') || (pi.status !== 'succeeded' && pi.status !== 'processing')) {
        payNow.disabled = false;
        return error('failed');
      }
      // Paid: what the function recorded from Stripe's own answer, with Stripe's receipt.
      secret = null;
      follow(pi.id);
    }, function () { busy = false; other.disabled = false; payNow.disabled = false; error('failed'); });
  });

  other.addEventListener('click', function () {
    if (busy) return;
    secret = null;
    if (card) card.clear();
    error(null);
    quote.hidden = true;
    entry.hidden = false;
    go.disabled = false;
  });

  again.addEventListener('click', function () { look(); });

  /* Another pay link opened in this tab: the browser only moves to it within the page, so the page starts again on
     it, once nothing is on its way to Stripe. A payment of the last link still being read is read by that link. */
  window.addEventListener('hashchange', function () {
    var next = (location.hash || '').replace(/^#/, '');
    if (!LINK.test(next) || next === link) return;
    (function when() {
      if (busy) return setTimeout(when, 300);
      try { sessionStorage.setItem(KEPT, next); } catch (e) { /* storage off: the address carries it */ }
      location.reload();
    })();
  });

  if (!link) return state('gone');
  var pending = paying();
  if (pending) return follow(pending);
  look();
})();
