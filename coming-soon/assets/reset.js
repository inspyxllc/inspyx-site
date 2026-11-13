/* The password-reset page (2026-11-13). Two forms: one asks for a reset email; the other, shown only when a reset
   link brought the browser here, sets the new password. It says no words: each message is a line of the page. */
(function () {
  'use strict';
  var A = window.InspyxAuth;
  var ask = document.querySelector('[data-ask]');
  var anew = document.querySelector('[data-new]');
  var done = document.querySelector('[data-done]');
  var old = document.querySelector('[data-old]');
  if (!A || !ask || !anew || !A.requestReset) return;

  function say(form, kind) { [].slice.call(form.querySelectorAll('[data-say]')).forEach(function (p) { p.hidden = p.getAttribute('data-say') !== kind; }); }
  function working(form, on) {
    var b = form.querySelector('button[type="submit"]');
    if (!b.getAttribute('data-idle')) b.setAttribute('data-idle', b.textContent);
    b.disabled = on;
    b.textContent = on ? b.getAttribute('data-busy') : b.getAttribute('data-idle');
    form.setAttribute('aria-busy', on ? 'true' : 'false');
  }
  function kindOf(why, known) { var k = why && why.kind; return known.indexOf(k) >= 0 ? k : 'server'; }

  ask.addEventListener('submit', function (e) {
    e.preventDefault();
    if (ask.getAttribute('aria-busy') === 'true') return;
    if (ask.reportValidity && !ask.reportValidity()) return;
    say(ask, '');
    working(ask, true);
    A.requestReset(ask.querySelector('[name="email"]').value.trim()).then(function () {
      working(ask, false);
      say(ask, 'sent');
    }, function (why) {
      working(ask, false);
      say(ask, kindOf(why, ['busy', 'network', 'server']));
    });
  });

  anew.addEventListener('submit', function (e) {
    e.preventDefault();
    if (anew.getAttribute('aria-busy') === 'true') return;
    if (anew.reportValidity && !anew.reportValidity()) return;
    var pw = anew.querySelector('[name="password"]'), again = anew.querySelector('[name="again"]');
    if (pw.value !== again.value) { say(anew, 'mismatch'); again.value = ''; again.focus(); return; }
    say(anew, '');
    working(anew, true);
    A.setNewPassword(pw.value).then(function () {
      pw.value = ''; again.value = '';
      anew.hidden = true;
      done.hidden = false;
    }, function (why) {
      working(anew, false);
      var k = kindOf(why, ['weak', 'expired', 'network', 'server']);
      say(anew, k);
      if (k === 'expired') { pw.value = ''; again.value = ''; anew.hidden = true; ask.hidden = false; old.hidden = false; }
    });
  });

  // Read the address before anything else: resetBack takes the one-time sign-in out of it at once.
  var came = A.resetBack();
  if (came === 'ready') { ask.hidden = true; anew.hidden = false; anew.querySelector('[name="password"]').focus(); }
  else if (came === 'expired') { old.hidden = false; }
})();
