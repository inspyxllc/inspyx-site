/* The page a signed-in inspector lands on. It says no words of its own: it shows who is signed in and signs them out. */
(function () {
  'use strict';
  var main = document.querySelector('[data-account]');
  if (!main || !window.InspyxAuth) return;
  var who = main.querySelector('[data-email]');
  var out = main.querySelector('[data-signout]');
  var lines = [].slice.call(main.querySelectorAll('[data-say]'));

  function show(s) { who.textContent = s.email; main.hidden = false; }
  function say(kind) { lines.forEach(function (p) { p.hidden = p.getAttribute('data-say') !== kind; }); }

  window.InspyxAuth.current().then(function (s) {
    if (!s) { window.location.replace('/signin'); return; }
    show(s);
  }, function (why) {
    // The sign-in could not be renewed just now. It stays, and the page says why: no connection, or a server that
    // is failing. Telling someone to check their connection when the server is at fault sends them the wrong way.
    var s = window.InspyxAuth.stored();
    if (!s) { window.location.replace('/signin'); return; }
    show(s);
    var kind = why && why.kind;
    say(kind === 'network' ? 'network' : kind === 'server' || kind === 'malformed' ? 'server' : '');
  });

  out.addEventListener('click', function () {
    out.disabled = true;
    window.InspyxAuth.signOut().then(function () { window.location.replace('/signin'); });
  });

  // Somebody else signed in from another tab, or the Back button brought this page back: name who is signed in
  // now, not who was. (With nobody signed in any more, auth.js has already sent this tab to the sign-in page.)
  function again() {
    var s = window.InspyxAuth.stored();
    if (s && !main.hidden) { who.textContent = s.email; out.disabled = false; }
  }
  window.addEventListener('storage', function (e) { if (e.key === 'inspyx.signin') again(); });
  window.addEventListener('pageshow', function (e) { if (e.persisted) again(); });
})();
