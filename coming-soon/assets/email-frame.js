/* The designed email, shown as it goes (the rehearsal, round 2: /emails showed only the plain words). /emails puts this
   page in a sandboxed frame (scripts, but its own opaque origin: it can reach nothing of the signed-in page) and
   hands it the automation-preview function's html, the same the email function sends. This page's own rule
   (vercel.json) lets that html's inline styles and Inspyx's stored logo show, and nothing run: no script but this
   file. Its links open nothing: it is a preview. It tells the page its height, so the frame fits the email.
   This file says no words. */
(function () {
  'use strict';
  var home = location.origin;
  var DROP = 'script, iframe, frame, object, embed, form, base, link, meta';
  // The content's own height (scrollHeight never drops below the frame's, so a frame could only grow).
  function tell() { window.parent.postMessage({ emailFrame: 'height', height: document.documentElement.offsetHeight }, home); }
  window.addEventListener('message', function (e) {
    if (e.source !== window.parent || e.origin !== home) return;
    var d = e.data;
    if (!d || d.emailFrame !== 'show' || typeof d.html !== 'string') return;
    var doc = new DOMParser().parseFromString(d.html, 'text/html');
    [].forEach.call(doc.querySelectorAll(DROP), function (n) { n.remove(); });
    [].forEach.call(document.head.querySelectorAll('style'), function (n) { n.remove(); });
    [].forEach.call(doc.head.querySelectorAll('style'), function (s) { document.head.appendChild(document.importNode(s, true)); });
    document.body.replaceWith(document.importNode(doc.body, true));
    tell();
  });
  // Links open nothing from a preview (the sandbox lets none out either).
  document.addEventListener('click', function (e) { if (e.target.closest && e.target.closest('a')) e.preventDefault(); }, true);
  // A picture that loads later changes the height.
  document.addEventListener('load', tell, true);
  window.addEventListener('resize', tell);
  window.parent.postMessage({ emailFrame: 'ready' }, home);
})();
