/* The pricing and policy pages' two small movements. Nothing here writes or changes a word:
   the pages read the same with this file missing. */
(function () {
  'use strict';
  var calm = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);

  /* 1. Pricing: the plan's card leans to the pointer. The page gets two numbers from -1 to 1 (--mx, --my) and the
        stylesheet turns them into the lean and into the light that follows the pointer. A finger is left alone. */
  var hero = document.querySelector('[data-lean]');
  if (hero && !calm) {
    var raf = 0, nx = 0, ny = 0;
    hero.addEventListener('pointermove', function (e) {
      if (e.pointerType === 'touch') return;
      var r = hero.getBoundingClientRect();
      if (!r.width || !r.height) return;
      nx = Math.max(-1, Math.min(1, ((e.clientX - r.left) / r.width) * 2 - 1));
      ny = Math.max(-1, Math.min(1, ((e.clientY - r.top) / r.height) * 2 - 1));
      if (raf) return;
      raf = requestAnimationFrame(function () {
        raf = 0;
        hero.style.setProperty('--mx', nx.toFixed(3));
        hero.style.setProperty('--my', ny.toFixed(3));
        hero.classList.add('is-near');
      });
    });
    hero.addEventListener('pointerleave', function () {
      if (raf) { cancelAnimationFrame(raf); raf = 0; }
      hero.style.setProperty('--mx', '0');
      hero.style.setProperty('--my', '0');
      hero.classList.remove('is-near');
    });
  }

  /* 2. Policy pages: the list of headings marks the section being read. A heading counts once it has come up to
        the top of the window; a heading the reader chose stays marked until they scroll away from where it landed
        (a last, short section can never reach the top by itself). */
  var toc = document.querySelector('nav.toc');
  if (toc) {
    var links = [].slice.call(toc.querySelectorAll('a'));
    var heads = links.map(function (a) { return document.getElementById(a.getAttribute('href').slice(1)); });
    var tick = 0, chosen = -1, landed = null, settle = 0;
    var mark = function () {
      tick = 0;
      var at = 0;
      for (var i = 0; i < heads.length; i++) if (heads[i] && heads[i].getBoundingClientRect().top <= 170) at = i;
      if (chosen >= 0) at = chosen;
      links.forEach(function (a, i) { if (i === at) a.setAttribute('aria-current', 'true'); else a.removeAttribute('aria-current'); });
    };
    links.forEach(function (a, i) {
      a.addEventListener('click', function () { chosen = i; landed = null; mark(); });
    });
    window.addEventListener('scroll', function () {
      if (chosen >= 0) {
        if (landed === null) { clearTimeout(settle); settle = setTimeout(function () { landed = window.scrollY; }, 200); }
        else if (Math.abs(window.scrollY - landed) > 4) { chosen = -1; landed = null; }
      }
      if (!tick) tick = requestAnimationFrame(mark);
    }, { passive: true });
    mark();
  }
})();
