/* Sign-in links by email (2026-11-23): the form that asks for one (on /signin, and on /signin/link when a link
   has expired) and the page a link opens (/signin/link). It says no words: each message is a line of the page.
   Every answer to "send me a link" is the same, whether or not an account uses the address, and after every one
   the button waits a minute (the server's own limit for a real account), with the seconds counted down. */
(function () {
  'use strict';
  var A = window.InspyxAuth;
  if (!A || !A.linkRequest) return;
  var WAIT = 60;
  var KEPT = 'inspyx.signin.link.wait';   // when this tab may ask again: a reload doesn't restart the minute

  function lines(scope) { return [].slice.call(scope.querySelectorAll('[data-say]')); }
  function say(scope, kind) { lines(scope).forEach(function (p) { p.hidden = p.getAttribute('data-say') !== kind; }); }
  function until() {
    var t = 0;
    try { t = Number(window.sessionStorage.getItem(KEPT)) || 0; } catch (e) { t = 0; }
    return t;
  }
  function hold() {
    try { window.sessionStorage.setItem(KEPT, String(Date.now() + WAIT * 1000)); } catch (e) { /* the minute still runs on this page */ }
  }

  /* One "send me a link" form: its email field, its button, its lines, and its countdown line. */
  function asker(form) {
    var email = form.querySelector('[name="email"]');
    var button = form.querySelector('button[type="submit"]');
    var wait = form.querySelector('[data-wait]');
    var secs = wait && wait.querySelector('[data-secs]');
    var idle = button.textContent;
    var busy = false;
    var timer = null;
    var ends = 0;

    function tick() {
      var left = Math.ceil((ends - Date.now()) / 1000);
      if (left <= 0) {
        clearInterval(timer); timer = null;
        if (wait) wait.hidden = true;
        button.disabled = false;
        return;
      }
      button.disabled = true;
      if (wait) wait.hidden = false;
      if (secs) secs.textContent = String(left);
    }
    function waiting(at) {
      ends = at;
      if (timer) clearInterval(timer);
      tick();
      if (ends > Date.now()) timer = setInterval(tick, 250);
    }
    if (until() > Date.now()) waiting(until());

    form.addEventListener('submit', function (e) {
      e.preventDefault();
      if (busy || button.disabled) return;
      if (form.reportValidity && !form.reportValidity()) return;
      busy = true;
      say(form, '');
      button.disabled = true;
      button.textContent = button.getAttribute('data-busy') || idle;
      form.setAttribute('aria-busy', 'true');
      A.linkRequest(email.value.trim()).then(function () {
        busy = false;
        button.textContent = idle;
        form.setAttribute('aria-busy', 'false');
        say(form, 'sent');
        hold();
        waiting(until());
      }, function (why) {
        busy = false;
        button.textContent = idle;
        button.disabled = false;
        form.setAttribute('aria-busy', 'false');
        var kind = why && why.kind;
        say(form, kind === 'network' ? 'network' : 'server');
      });
    });
    return { fill: function (v) { if (v && !email.value) email.value = v; }, focus: function () { email.focus(); } };
  }

  // /signin: the "Email me a sign-in link" way opens its form, with the email already typed above.
  var open = document.querySelector('[data-link-open]');
  var panel = document.querySelector('[data-link-panel]');
  var form = document.querySelector('[data-link]');
  var ask = form ? asker(form) : null;
  if (open && panel && ask) {
    // One email field on screen at a time: the link way, when open, takes the password way's place.
    var passwordWay = [].slice.call(document.querySelectorAll('[data-password-way]'));
    var close = panel.querySelector('[data-link-close]');
    open.addEventListener('click', function () {
      panel.hidden = false;
      open.hidden = true;
      open.setAttribute('aria-expanded', 'true');
      passwordWay.forEach(function (el) { el.hidden = true; });
      var typed = document.querySelector('[data-signin] [name="email"]');
      ask.fill(typed && typed.value.trim());
      ask.focus();
    });
    if (close) {
      close.addEventListener('click', function (e) {
        e.preventDefault();
        panel.hidden = true;
        open.hidden = false;
        open.setAttribute('aria-expanded', 'false');
        passwordWay.forEach(function (el) { el.hidden = false; });
        open.focus();
      });
    }
  }

  // /signin/link: the page a link opens. Its key is taken out of the address before anything else, kept in this
  // page only, and exchanged once; a server that couldn't be reached can be asked again with the same key.
  var back = document.querySelector('[data-link-back]');
  if (!back) return;
  var states = [].slice.call(back.querySelectorAll('[data-state]'));
  var anew = back.querySelector('[data-state-form]');
  function show(state) {
    states.forEach(function (el) { el.hidden = el.getAttribute('data-state') !== state; });
    // A new link can be sent from here whenever this one can't sign in: no dead end.
    if (anew) anew.hidden = ['expired', 'missing', 'storage'].indexOf(state) < 0;
  }
  var found = A.linkTake();
  var again = [].slice.call(back.querySelectorAll('[data-again]'));
  function verify() {
    show('checking');
    A.linkVerify(found.key).then(function () {
      found = null;
      window.location.replace('/today');
    }, function (why) {
      var kind = why && why.kind;
      if (kind === 'network' || kind === 'server') { show(kind); return; }
      found = null;
      show(kind === 'storage' ? 'storage' : 'expired');
    });
  }
  if (found.kind === 'key') verify();
  else show(found.kind === 'missing' ? 'missing' : 'expired');
  again.forEach(function (b) { b.addEventListener('click', function () { if (found && found.kind === 'key') verify(); }); });
})();
