/* Sign-in for the Inspyx website. The same accounts as the app, and the same calls its sign-in makes
   (lib/src/auth/auth_client.dart in the app's repo): sign in with email and password, renew a sign-in,
   sign out. One call differs on purpose: signing out here ends this browser's sign-in only (see signOut).
   Nothing of a sign-in is ever written to a log, an address or an error: no password, no token.
   This file says no words. The pages hold every sentence. */
(function (root) {
  'use strict';
  var BASE = 'https://btxlrfvqifnrnxffohsz.supabase.co/auth/v1';
  // The project's public key, the one the waitlist form already uses (assets/home.js). It grants nothing
  // by itself: every table sits behind row-level security, and new accounts are made by invitation only.
  var KEY = 'sb_publishable_iFfCyDj7e5cnTsWC7aDO8Q_BD5bG_io';
  var STORE = 'inspyx.signin';
  var DEADLINE = 30000;   // the longest one call may take, as in the app
  var EARLY = 60000;      // a sign-in with less than a minute left is renewed before it is used

  /* Why a call did not give a sign-in.
     rejected:  the email or password was not accepted (the server never says which, and neither do we)
     network:   the server said nothing (no connection, or no answer within the deadline)
     server:    the server refused or failed
     malformed: its answer cannot make a whole sign-in
     storage:   this browser would not keep the sign-in */
  function Refusal(kind, status) { this.kind = kind; this.status = status || 0; }

  function send(method, path, token, body) {
    var ctl = typeof AbortController === 'function' ? new AbortController() : null;
    var timer = setTimeout(function () { if (ctl) ctl.abort(); }, DEADLINE);
    var headers = { apikey: KEY };
    if (token) headers.Authorization = 'Bearer ' + token;
    if (body) headers['Content-Type'] = 'application/json';
    var silent = function () { clearTimeout(timer); throw new Refusal('network'); };
    return root.fetch(BASE + path, {
      method: method, headers: headers, body: body ? JSON.stringify(body) : undefined,
      signal: ctl ? ctl.signal : undefined, cache: 'no-store', credentials: 'omit', referrerPolicy: 'no-referrer'
    }).then(function (res) {
      return res.text().then(function (text) {
        clearTimeout(timer);
        var json = null;
        try { json = JSON.parse(text); } catch (e) { json = null; }
        return { status: res.status, json: json };
      }, silent);
    }, silent);
  }

  /* A whole sign-in or none: both tokens, when it ends, and whose it is. */
  function whole(json) {
    var u = json && json.user;
    var ends = !json ? 0 : typeof json.expires_in === 'number' ? Date.now() + json.expires_in * 1000 : typeof json.expires_at === 'number' ? json.expires_at * 1000 : 0;
    var text = function (v) { return typeof v === 'string' && v.length > 0; };
    if (!json || !text(json.access_token) || !text(json.refresh_token) || !u || !text(u.id) || !text(u.email) || !ends) throw new Refusal('malformed');
    return { access: json.access_token, renew: json.refresh_token, ends: ends, id: u.id, email: u.email };
  }

  function stored() {
    try {
      var s = JSON.parse(root.localStorage.getItem(STORE));
      return s && typeof s.access === 'string' && typeof s.renew === 'string' && typeof s.ends === 'number' && typeof s.id === 'string' && typeof s.email === 'string' ? s : null;
    } catch (e) { return null; }
  }
  function keep(s) { try { root.localStorage.setItem(STORE, JSON.stringify(s)); return stored() !== null; } catch (e) { return false; } }
  function forget() { try { root.localStorage.removeItem(STORE); } catch (e) { /* nothing was kept */ } }

  function signIn(email, password) {
    return send('POST', '/token?grant_type=password', null, { email: email, password: password }).then(function (r) {
      if (r.status === 400 || r.status === 401) throw new Refusal('rejected', r.status);
      if (r.status !== 200) throw new Refusal('server', r.status);
      var s = whole(r.json);
      if (!keep(s)) { send('POST', '/logout?scope=local', s.access).then(function () {}, function () {}); throw new Refusal('storage'); }
      return s;
    });
  }

  function renew(s) {
    return send('POST', '/token?grant_type=refresh_token', null, { refresh_token: s.renew }).then(function (r) {
      if (r.status === 400 || r.status === 401) { forget(); throw new Refusal('rejected', r.status); }
      if (r.status !== 200) throw new Refusal('server', r.status);
      var next = whole(r.json);
      if (!keep(next)) throw new Refusal('storage');
      return next;
    });
  }

  /* The sign-in to use right now, renewed first if it is about to end; null when nobody is signed in.
     The server gives each renewal token one use, so two tabs must not renew at once: where the browser has
     locks, one tab renews and the others read what it kept. A renewal the server rejects signs the browser out.
     A renewal that could not reach the server throws, and the stored sign-in stays. */
  var renewing = null;
  function current() {
    var s = stored();
    if (!s) return Promise.resolve(null);
    if (s.ends - Date.now() > EARLY) return Promise.resolve(s);
    if (renewing) return renewing;
    var job = function () {
      var again = stored();
      if (!again) return null;
      return again.ends - Date.now() > EARLY ? again : renew(again);
    };
    var locks = root.navigator && root.navigator.locks;
    renewing = (locks && locks.request ? locks.request('inspyx.signin.renew', job) : Promise.resolve().then(job)).then(
      function (v) { renewing = null; return v; },
      function (e) { renewing = null; if (e && e.kind === 'rejected') return null; throw e; });
    return renewing;
  }

  /* Signing out forgets the sign-in here first, then tells the server. As in the app, a server that cannot be
     reached never keeps the browser signed in.
     It ends THIS browser's sign-in only (scope=local). Left unsaid, the server ends every sign-in the person has,
     which would sign an inspector out of the app on their phone, in the middle of an inspection, because
     they signed out of the website on an office computer. */
  function signOut() {
    var s = stored();
    forget();
    if (!s) return Promise.resolve();
    return send('POST', '/logout?scope=local', s.access).then(function () {}, function () {});
  }

  root.InspyxAuth = { signIn: signIn, signOut: signOut, current: current, stored: stored };

  /* The gate. A page for the signed-in (data-gate="in") sends a browser with no sign-in to the sign-in page; the
     sign-in page (data-gate="out") sends a browser that has one to the account page. It asks three times:
     as the page loads, before anything is drawn; when the sign-in changes in another tab; and when the Back
     button brings the page back, because a page brought back is shown as it was left, not loaded again. */
  function gate() {
    var want = root.document && root.document.documentElement.getAttribute('data-gate');
    if (want === 'in' && !stored()) root.location.replace('/signin');
    if (want === 'out' && stored()) root.location.replace('/account');
  }
  gate();
  root.addEventListener('storage', function (e) { if (e.key === STORE || e.key === null) gate(); });
  root.addEventListener('pageshow', function (e) { if (e.persisted) gate(); });
})(window);
