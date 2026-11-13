/* The sign-in page's form. It says no words: each message is a line of the page, shown when it applies. */
(function () {
  'use strict';
  var form = document.querySelector('[data-signin]');
  if (!form || !window.InspyxAuth) return;
  var email = form.querySelector('[name="email"]');
  var password = form.querySelector('[name="password"]');
  var button = form.querySelector('button[type="submit"]');
  var lines = [].slice.call(form.querySelectorAll('[data-say]'));
  var google = document.querySelector('[data-google]');
  var idle = button.textContent;
  var googleIdle = google ? google.textContent : '';
  var busy = false;

  // One message at a time: the line for this kind of trouble shows, every other line hides. say('') hides them all.
  function say(kind) { lines.forEach(function (p) { p.hidden = p.getAttribute('data-say') !== kind; }); }
  // `which` is the button that says it is working; the other one only stops taking taps.
  function working(on, which) {
    busy = on;
    button.disabled = on;
    button.textContent = on && which !== google ? button.getAttribute('data-busy') || idle : idle;
    if (google) {
      google.disabled = on;
      var word = google.querySelector('[data-word]');
      if (word) word.textContent = on && which === google ? google.getAttribute('data-busy') || googleIdle : googleIdle;
    }
    form.setAttribute('aria-busy', on ? 'true' : 'false');
  }
  function failed(why) {
    working(false);
    var kind = why && why.kind;
    return kind;
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

  // Google. A tap sends the browser to the account server and on to Google; the page is left, so the button
  // stays "working" until it is. Back from Google, the code in the address is exchanged before anything is shown.
  if (google && window.InspyxAuth.googleStart) {
    googleIdle = (google.querySelector('[data-word]') || google).textContent;
    google.addEventListener('click', function () {
      if (busy) return;
      say('');
      working(true, google);
      window.InspyxAuth.googleStart().then(function () {}, function (why) {
        var kind = failed(why);
        say(kind === 'storage' ? 'other' : 'google');
      });
    });
    // Read the address BEFORE asking: googleBack takes what came back out of it at once.
    var returning = /[?&#](code|error|error_code)=/.test(window.location.search + window.location.hash);
    var back = window.InspyxAuth.googleBack();
    // While the code is being exchanged, neither button takes a tap.
    if (returning) working(true);
    back.then(function (s) {
      if (s) window.location.replace('/account');
      else if (returning) working(false);
    }, function (why) {
      var kind = failed(why);
      if (kind === 'cancelled') return;
      say(kind === 'noaccount' || kind === 'network' || kind === 'malformed' || kind === 'server' || kind === 'google' ? kind : 'other');
    });
  }

  // The Back button brings a page back as it was left: after a sign-in that went through, that is with the
  // button still saying it is working, and dead. Put the form back to rest.
  window.addEventListener('pageshow', function (e) { if (e.persisted) { working(false); say(''); } });
})();
