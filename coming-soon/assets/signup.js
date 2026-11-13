/* The sign-up page (2026-11-13). Four steps, one shown at a time:
   start   Google, or an email and a password, with the Terms tick (required) and the metrics tick;
   check   "check your email" after an email sign-up, until the link brings the browser back;
   finish  the two ticks, recorded on Inspyx's server (the signup function) for a signed-in account that has none;
   password a password for an account that has none yet (one that came in with Google).
   The ticks chosen at the start are remembered on this device (never anything secret) so that the finish step,
   after the email link, is already ticked the same way; the person still taps Finish. It says no words: every
   sentence is a line of the page. */
(function () {
  'use strict';
  var A = window.InspyxAuth;
  if (!A || !A.signUp) return;
  var TERMS_VERSION = '2026-11-13';
  var PENDING = 'inspyx.signup.ticks';
  var q = function (s) { return document.querySelector(s); };
  var start = q('[data-start]'), create = q('[data-create]'), check = q('[data-check]'), finish = q('[data-finish]'), pass = q('[data-password]'), trouble = q('[data-trouble]');
  var google = q('[data-google]');

  function only(el) { [start, check, finish, pass].forEach(function (x) { x.hidden = x !== el; }); }
  function say(box, kind) { [].slice.call(box.querySelectorAll('[data-say]')).forEach(function (p) { p.hidden = p.getAttribute('data-say') !== kind; }); if (box === trouble) trouble.hidden = !kind; }
  function working(form, on) {
    var b = form.querySelector('button[type="submit"]');
    if (!b.getAttribute('data-idle')) b.setAttribute('data-idle', b.textContent);
    b.disabled = on; b.textContent = on ? b.getAttribute('data-busy') : b.getAttribute('data-idle');
    form.setAttribute('aria-busy', on ? 'true' : 'false');
  }
  function kindOf(why, known) { var k = why && why.kind; return known.indexOf(k) >= 0 ? k : 'server'; }
  function remember(email, metrics) { try { localStorage.setItem(PENDING, JSON.stringify({ email: email.toLowerCase(), terms: true, metrics: !!metrics })); } catch (e) { /* nothing kept; the finish step asks again */ } }
  function remembered(email) { try { var p = JSON.parse(localStorage.getItem(PENDING)); return p && p.email === String(email || '').toLowerCase() ? p : null; } catch (e) { return null; } }
  function forget() { try { localStorage.removeItem(PENDING); } catch (e) { /* nothing kept */ } }

  // Where a signed-in account stands decides the step: no record yet → finish; no password → password; else done.
  function next() {
    var me = A.who();
    if (!me) { only(start); return; }
    A.ask('signup', { action: 'state' }).then(function (r) {
      if (!r) { only(start); return; }
      if (r.status !== 200 || !r.json) { only(finish); say(finish, 'server'); return; }
      if (!r.json.recorded) {
        q('[data-email]').textContent = me.email;
        var p = remembered(me.email);
        finish.querySelector('[name="terms"]').checked = !!(p && p.terms);
        finish.querySelector('[name="metrics"]').checked = !!(p && p.metrics);
        only(finish);
      } else if (!r.json.has_password) {
        only(pass);
      } else {
        forget();
        window.location.replace('/account');
      }
    }, function () { only(finish); say(finish, 'network'); });
  }

  create.addEventListener('submit', function (e) {
    e.preventDefault();
    if (create.getAttribute('aria-busy') === 'true') return;
    if (create.reportValidity && !create.reportValidity()) return;
    say(create, '');
    var email = create.querySelector('[name="email"]').value.trim(), password = create.querySelector('[name="password"]');
    remember(email, create.querySelector('[name="metrics"]').checked);
    working(create, true);
    A.signUp(email, password.value).then(function (how) {
      password.value = '';
      working(create, false);
      if (how === 'in') next(); else only(check);
    }, function (why) {
      working(create, false);
      say(create, kindOf(why, ['closed', 'weak', 'busy', 'network', 'server']));
    });
  });

  finish.addEventListener('submit', function (e) {
    e.preventDefault();
    if (finish.getAttribute('aria-busy') === 'true') return;
    if (finish.reportValidity && !finish.reportValidity()) return;
    say(finish, '');
    working(finish, true);
    A.ask('signup', { action: 'record', terms: true, terms_version: TERMS_VERSION, metrics: finish.querySelector('[name="metrics"]').checked }).then(function (r) {
      working(finish, false);
      if (!r) { only(start); return; }
      if (r.status !== 200) { say(finish, 'server'); return; }
      next();
    }, function () { working(finish, false); say(finish, 'network'); });
  });

  pass.addEventListener('submit', function (e) {
    e.preventDefault();
    if (pass.getAttribute('aria-busy') === 'true') return;
    if (pass.reportValidity && !pass.reportValidity()) return;
    say(pass, '');
    working(pass, true);
    var pw = pass.querySelector('[name="password"]');
    A.setPassword(pw.value).then(function () { pw.value = ''; forget(); window.location.replace('/account'); }, function (why) {
      working(pass, false);
      var k = kindOf(why, ['weak', 'network', 'server', 'rejected']);
      if (k === 'rejected') { only(start); return; }
      say(pass, k);
    });
  });

  if (google && A.googleStart) {
    google.addEventListener('click', function () {
      if (create.getAttribute('aria-busy') === 'true') return;
      // The Terms tick is needed before any account is made, Google's way too.
      var terms = create.querySelector('[name="terms"]');
      if (!terms.checked) { terms.reportValidity ? terms.reportValidity() : terms.focus(); return; }
      remember('', create.querySelector('[name="metrics"]').checked);
      say(create, '');
      google.disabled = true;
      A.googleStart('/signup').then(function () {}, function () { google.disabled = false; say(create, 'google'); });
    });
  }

  // Back from the email link, or from Google: take what came back out of the address first.
  var returning = /[#&](access_token|error|error_code)=/.test(window.location.hash) || /[?&](code|error|error_code)=/.test(window.location.search);
  var fromEmail = A.signupBack();
  fromEmail.then(function (s) {
    if (s) { next(); return; }
    return A.googleBack().then(function (g) {
      if (g) {
        // Google's address is the one remembered for the ticks.
        try { var p = JSON.parse(localStorage.getItem(PENDING)); if (p && !p.email) remember(g.email, p.metrics); } catch (e) { /* asked again */ }
        next();
      } else if (!returning) next();
    }, function (why) {
      var k = why && why.kind;
      only(start);
      say(create, k === 'noaccount' ? 'closed' : k === 'cancelled' ? '' : 'google');
    });
  }, function (why) {
    only(start);
    say(trouble, why && why.kind === 'expired' ? 'expired' : 'expired');
  });
})();
