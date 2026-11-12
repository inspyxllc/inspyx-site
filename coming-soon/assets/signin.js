/* The sign-in page's form. It says no words: each message is a line of the page, shown when it applies. */
(function () {
  'use strict';
  var form = document.querySelector('[data-signin]');
  if (!form || !window.InspyxAuth) return;
  var email = form.querySelector('[name="email"]');
  var password = form.querySelector('[name="password"]');
  var button = form.querySelector('button[type="submit"]');
  var lines = [].slice.call(form.querySelectorAll('[data-say]'));
  var idle = button.textContent;
  var busy = false;

  // One message at a time: the line for this kind of trouble shows, every other line hides. say('') hides them all.
  function say(kind) { lines.forEach(function (p) { p.hidden = p.getAttribute('data-say') !== kind; }); }
  function working(on) {
    busy = on;
    button.disabled = on;
    button.textContent = on ? button.getAttribute('data-busy') || idle : idle;
    form.setAttribute('aria-busy', on ? 'true' : 'false');
  }

  form.addEventListener('submit', function (e) {
    e.preventDefault();
    if (busy) return;
    if (form.reportValidity && !form.reportValidity()) return;
    say('');
    working(true);
    window.InspyxAuth.signIn(email.value.trim(), password.value).then(function () {
      password.value = '';
      window.location.assign('/account');
    }, function (why) {
      working(false);
      var kind = why && why.kind;
      say(kind === 'rejected' || kind === 'network' || kind === 'malformed' || kind === 'server' ? kind : 'other');
      if (kind === 'rejected') { password.value = ''; password.focus(); }
    });
  });

  // The Back button brings a page back as it was left: after a sign-in that went through, that is with the
  // button still saying it is working, and dead. Put the form back to rest.
  window.addEventListener('pageshow', function (e) { if (e.persisted) { working(false); say(''); } });
})();
