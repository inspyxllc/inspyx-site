/* TRY SPEX's door on the home page (2026-11-23): the "Try Spex now" button in the hero, beside "Join the waitlist".
   Public since 2026-11-23 (his word: "go public"). ON is the one switch: false takes it off everywhere, and the page
   then shows nothing new at all. The overlay's code
   (try-app.js) loads only on the first click, so the home page's story never waits for it. */
(function () {
  'use strict';
  // On everywhere, inspyx.com included, since he said go public (2026-11-23). To take it off: false.
  var ON = true;
  if (!ON) return;
  var anchor = document.querySelector('.hero-in .btn');
  if (!anchor) return;
  // The button's own look is in try.css (small): it comes now; the overlay's code waits for the click.
  var css = document.createElement('link'); css.rel = 'stylesheet'; css.href = '/assets/try/try.css';
  document.head.appendChild(css);
  var b = document.createElement('button');
  b.type = 'button'; b.className = 'try-btn'; b.setAttribute('data-try', '');
  var dot = document.createElement('i'), words = document.createElement('span'), small = document.createElement('small');
  // A space before the small line, so a screen reader says "Try Spex now Talk to the app, live", not one run-on word.
  words.textContent = 'Try Spex now '; small.textContent = 'Talk to the app, live';
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
