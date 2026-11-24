/* The page a signed-in inspector lands on. It says no words of its own: it shows who is signed in, changes the
   password (job 7, W20: auth.js's setPassword, the same as a Google account's first password) and signs out. */
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

  // A new password: at least 8 characters, typed twice, the server's word final. Nothing of it is kept or shown.
  var pw = main.querySelector('[data-password]');
  var pwSay = function (kind) { [].slice.call(pw.querySelectorAll('[data-psay]')).forEach(function (p) { p.hidden = p.getAttribute('data-psay') !== kind; }); };
  pw.addEventListener('submit', function (e) {
    e.preventDefault();
    var a = pw.elements.password.value, b = pw.elements.again.value;
    if (Array.from(a).length < 8) { pwSay('short'); return; }
    if (a !== b) { pwSay('differ'); return; }
    var go = pw.querySelector('button[type="submit"]');
    go.disabled = true;
    pwSay('');
    window.InspyxAuth.setPassword(a).then(function () {
      pw.reset();
      pwSay('saved');
    }, function (why) {
      var kind = why && why.kind;
      pwSay(kind === 'weak' || kind === 'network' || kind === 'rejected' ? kind : 'server');
    }).then(function () { go.disabled = false; });
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
