/* Runs in the home page's head, before anything is drawn (moved out of index.html on 2026-11-17 so the page's
   security rule can allow scripts from this site only: script-src 'self', no inline script). This file says no words. */
// Stripe sends inspectors back here from Inspyx's plan pages (the billing
// function's success_url, return_url and cancel_url): ?billing=done, back
// or canceled. The page then shows that message instead of the home page.
(function () {
  var billing = new URLSearchParams(location.search).get("billing");
  if (billing === "done" || billing === "back" || billing === "canceled") {
    document.documentElement.setAttribute("data-billing", billing);
  }
})();
// Opened at a place on the page (/#waitlist, from the pricing page's button):
// stand there at once. Smooth scrolling would first run the whole film past in
// about a second. Once the page has loaded, its own buttons glide as before.
(function () {
  if (location.hash.length > 1) {
    var root = document.documentElement;
    root.setAttribute("data-arrive", "");
    window.addEventListener("load", function () {
      setTimeout(function () { root.removeAttribute("data-arrive"); }, 400);
    });
  }
})();
