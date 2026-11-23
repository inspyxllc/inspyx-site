/* TRY SPEX's door on the home page (2026-11-23): the "Try Spex now" button in the hero, beside "Join the waitlist".
   Switched off (ON = false) until the demo may go public: then the page shows nothing new at all. The overlay's code
   (try-app.js) loads only on the first click, so the home page's story never waits for it. */
(function () {
  'use strict';
  // Off on inspyx.com until it may go public (his word); on in private previews and local checks, so he can look.
  var LIVE = /^(www\.)?inspyx\.com$/.test(location.hostname);
  var ON = false || !LIVE;
  if (!ON) return;
  var anchor = document.querySelector('.hero-in .btn');
  if (!anchor) return;
  // The button's own look is in try.css (small): it comes now; the overlay's code waits for the click.
  var css = document.createElement('link'); css.rel = 'stylesheet'; css.href = '/assets/try/try.css';
  document.head.appendChild(css);
  var b = document.createElement('button');
  b.type = 'button'; b.className = 'try-btn'; b.setAttribute('data-try', '');
  var dot = document.createElement('i'), words = document.createElement('span'), small = document.createElement('small');
  words.textContent = 'Try Spex now'; small.textContent = 'Talk to the app, live';
  words.appendChild(small); b.appendChild(dot); b.appendChild(words);
  anchor.insertAdjacentElement('afterend', b);
  var loading = null;
  function load() {
    if (loading) return loading;
    loading = new Promise(function (resolve, reject) {
      var s = document.createElement('script'); s.src = '/assets/try/try-app.js'; s.async = true;
      s.onload = function () { resolve(); }; s.onerror = function () { loading = null; reject(); };
      document.head.appendChild(s);
    });
    return loading;
  }
  b.addEventListener('click', function () { load().then(function () { window.TrySpex.open(b); }, function () {}); });
})();
