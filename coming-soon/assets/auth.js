/* Sign-in for the Inspyx website. The same accounts as the app, and the same calls its sign-in makes
   (lib/src/auth/auth_client.dart in the app's repo): sign in with email and password, renew a sign-in,
   sign out. One call differs on purpose: signing out here ends this browser's sign-in only (see signOut).
   It also asks Inspyx's own server functions as the signed-in inspector (see ask), so that no page's script
   ever holds a token.
   Nothing of a sign-in is ever written to a log, an address or an error: no password, no token.
   This file says no words. The pages hold every sentence. */
(function (root) {
  'use strict';
  var SERVER = 'https://btxlrfvqifnrnxffohsz.supabase.co';
  var BASE = SERVER + '/auth/v1';
  var FUNCTIONS = SERVER + '/functions/v1/';
  // The project's public key, the one the waitlist form already uses (assets/home.js). It grants nothing
  // by itself: every table sits behind row-level security, and new accounts are made by invitation only.
  var KEY = 'sb_publishable_iFfCyDj7e5cnTsWC7aDO8Q_BD5bG_io';
  var STORE = 'inspyx.signin';
  var GOING = 'inspyx.signin.google';   // kept for this tab only, while the browser is away at Google
  var DEADLINE = 30000;   // the longest one call may take, as in the app
  var EARLY = 60000;      // a sign-in with less than a minute left is renewed before it is used

  /* Why a call did not give a sign-in.
     rejected:  the email or password was not accepted (the server never says which, and neither do we)
     network:   the server said nothing (no connection, or no answer within the deadline)
     server:    the server refused or failed
     malformed: its answer cannot make a whole sign-in
     storage:   this browser would not keep the sign-in
     and, back from Google only:
     noaccount: no Inspyx account uses that Google address (accounts are made by invitation; Google makes none)
     cancelled: the person turned back at Google's page
     google:    anything else that went wrong on the way there or back */
  function Refusal(kind, status) { this.kind = kind; this.status = status || 0; }

  function send(method, url, token, body, deadline) {
    var ctl = typeof AbortController === 'function' ? new AbortController() : null;
    var timer = setTimeout(function () { if (ctl) ctl.abort(); }, deadline || DEADLINE);
    var headers = { apikey: KEY };
    if (token) headers.Authorization = 'Bearer ' + token;
    if (body) headers['Content-Type'] = 'application/json';
    var silent = function () { clearTimeout(timer); throw new Refusal('network'); };
    return root.fetch(url, {
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
    return send('POST', BASE + '/token?grant_type=password', null, { email: email, password: password }).then(function (r) {
      if (r.status === 400 || r.status === 401) throw new Refusal('rejected', r.status);
      if (r.status !== 200) throw new Refusal('server', r.status);
      var s = whole(r.json);
      if (!keep(s)) { send('POST', BASE + '/logout?scope=local', s.access).then(function () {}, function () {}); throw new Refusal('storage'); }
      return s;
    });
  }

  /* Signing in with Google (2026-11-13, his decision of 2026-11-12). The browser goes to the account server,
     which sends it on to Google and takes it back, and returns it to /signin with a code good once. The code is
     worth nothing alone: it is exchanged together with a verifier this tab made before leaving and never sent
     anywhere until then (PKCE). So a code read off an address bar, a history or a log signs nobody in.
     Google can only sign in someone who already has an Inspyx account with that address: the server makes no
     new accounts. */
  function b64url(bytes) {
    var s = '';
    for (var i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
    return root.btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }
  function googleStart(back) {
    var page = back === '/signup' ? '/signup' : '/signin';
    var c = root.crypto;
    if (!c || !c.subtle || !c.getRandomValues || typeof TextEncoder !== 'function') return Promise.reject(new Refusal('google'));
    var raw = new Uint8Array(48);
    c.getRandomValues(raw);
    var verifier = b64url(raw);
    return c.subtle.digest('SHA-256', new TextEncoder().encode(verifier)).then(function (hash) {
      // The verifier has to outlast the trip to Google and back, so it is kept, in the narrowest place a browser
      // has: this tab's own storage, gone when the tab closes, read once on the way back and removed then. It is
      // not a password and not a token: without the code Google's return brings, it signs nobody in, and that code
      // is good once and for minutes. (GitHub's code scanning flags this line as "clear text storage of sensitive
      // information"; it was looked at on 2026-11-13 and left as it is, for these reasons.)
      try { root.sessionStorage.setItem(GOING, verifier); } catch (e) { throw new Refusal('storage'); }
      if (root.sessionStorage.getItem(GOING) !== verifier) throw new Refusal('storage');
      root.location.assign(BASE + '/authorize?provider=google&redirect_to=' + encodeURIComponent(root.location.origin + page) +
        '&code_challenge=' + b64url(new Uint8Array(hash)) + '&code_challenge_method=s256');
    }, function () { throw new Refusal('google'); });
  }
  /* Back on the sign-in page: null when the browser did not come from Google, the sign-in when it did and the
     server gave one. Whatever came back is taken out of the address at once, before anything else happens. */
  function googleBack() {
    var q, h;
    try { q = new URLSearchParams(root.location.search); h = new URLSearchParams(root.location.hash.replace(/^#/, '')); } catch (e) { return Promise.resolve(null); }
    var code = q.get('code');
    var error = q.get('error') || h.get('error'), errorCode = q.get('error_code') || h.get('error_code');
    if (!code && !error && !errorCode) return Promise.resolve(null);
    var verifier = null;
    try { verifier = root.sessionStorage.getItem(GOING); root.sessionStorage.removeItem(GOING); } catch (e) { verifier = null; }
    try { root.history.replaceState(null, '', root.location.pathname); } catch (e) { /* the address stays; the code is still good only once */ }
    if (error || errorCode) {
      return Promise.reject(new Refusal(errorCode === 'signup_disabled' ? 'noaccount' : error === 'access_denied' && (!errorCode || errorCode === 'access_denied') ? 'cancelled' : 'google'));
    }
    if (!verifier || !/^[A-Za-z0-9._~-]{1,512}$/.test(code)) return Promise.reject(new Refusal('google'));
    return send('POST', BASE + '/token?grant_type=pkce', null, { auth_code: code, code_verifier: verifier }).then(function (r) {
      if (r.status === 400 || r.status === 401 || r.status === 403 || r.status === 404) throw new Refusal('google', r.status);
      if (r.status !== 200) throw new Refusal('server', r.status);
      var s = whole(r.json);
      if (!keep(s)) { send('POST', BASE + '/logout?scope=local', s.access).then(function () {}, function () {}); throw new Refusal('storage'); }
      return s;
    });
  }

  function renew(s) {
    return send('POST', BASE + '/token?grant_type=refresh_token', null, { refresh_token: s.renew }).then(function (r) {
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
     A renewal that could not reach the server throws, and the stored sign-in stays.
     With `anew`, the sign-in is renewed whatever time it has left, unless another tab has renewed it since
     this one looked: that is how the browser finds out that a sign-in which still looks good was ended
     somewhere else (see ask). */
  var renewing = null;
  function current(anew) {
    var s = stored();
    if (!s) return Promise.resolve(null);
    if (!anew && s.ends - Date.now() > EARLY) return Promise.resolve(s);
    if (renewing) return renewing;
    var job = function () {
      var again = stored();
      if (!again) return null;
      var good = again.ends - Date.now() > EARLY;
      return good && !(anew && again.access === s.access) ? again : renew(again);
    };
    var locks = root.navigator && root.navigator.locks;
    renewing = (locks && locks.request ? locks.request('inspyx.signin.renew', job) : Promise.resolve().then(job)).then(
      function (v) { renewing = null; return v; },
      function (e) { renewing = null; if (e && e.kind === 'rejected') return null; throw e; });
    return renewing;
  }

  /* Signing out forgets the sign-in here first, then tells the server. As in the app, a server that cannot be
     reached never keeps the browser signed in.
     It ends THIS browser's sign-in only (scope=local). Left unsaid, the server ends every sign-in the person has.
     An inspector who signed out of the website on an office computer would then, within the hour, find the app
     on their phone asking them to sign in again: the app keeps the inspection going on the phone, but stops
     everything that needs the server until they do (lib/src/auth/session_manager.dart, reauthRequired). */
  function signOut() {
    var s = stored();
    forget();
    if (!s) return Promise.resolve();
    return send('POST', BASE + '/logout?scope=local', s.access).then(function () {}, function () {});
  }

  /* One request to one of Inspyx's own server functions, as the signed-in inspector: the function's name and
     what to send. It answers { status, json }, or null when nobody is signed in. The token stays in this file:
     a page's script says what it wants, and never holds what would let it be asked for by someone else.
     A function that refuses the sign-in (401) may be right: the app's own "Sign out" ends every sign-in the
     person has, this browser's too, and until its hour is up a sign-in ended that way still looks good from
     here. So the sign-in server is asked: renewed, the request goes once more with the new sign-in; rejected,
     the browser is signed out and this answers null. A sign-in server that cannot be reached throws, and the
     sign-in stays. */
  function ask(name, body, deadline) {
    if (!/^[a-z][a-z-]*$/.test(name)) return Promise.reject(new Refusal('malformed'));
    var once = function (s) { return send('POST', FUNCTIONS + name, s.access, body, deadline); };
    return current().then(function (s) {
      if (!s) return null;
      return once(s).then(function (r) {
        if (r.status !== 401) return r;
        return current(true).then(function (fresh) { return fresh ? once(fresh) : null; });
      });
    });
  }

  /* Hearing "something changed" (inspection sync, 2026-11-14): the server's pings for the signed-in inspector's
     own inspections, on their private Realtime topic insp:<their id>. The sign-in goes to the server inside this
     file, as in ask: the page gives a function to call on each ping, and gets back a way to stop. Only the
     signed-in inspector's own topic can be asked for (the server holds the same rule). It joins again after any
     drop, waiting a little longer each time, and with a renewed sign-in before the old one ends. A ping is only
     a nudge: the page then asks the inspection-sync function for what changed. */
  var REALTIME = SERVER.replace(/^https:/, 'wss:') + '/realtime/v1/websocket?apikey=' + encodeURIComponent(KEY) + '&vsn=1.0.0';
  function listen(onPing) {
    var me = who();
    if (!me || typeof onPing !== 'function' || typeof root.WebSocket !== 'function') return null;
    var topic = 'realtime:insp:' + me.id;
    var socket = null, beat = null, renewal = null, retry = null, stopped = false, failures = 0, ref = 0;
    var tell = function (what) { try { onPing(what); } catch (e) { /* a page's mistake never stops the listening */ } };
    function close() {
      clearInterval(beat); clearTimeout(renewal); beat = renewal = null;
      var s = socket; socket = null;
      if (s) { try { s.onclose = s.onerror = s.onmessage = null; s.close(); } catch (e) { /* already gone */ } }
    }
    function dropped() {
      close();
      if (stopped) return;
      failures = Math.min(failures + 1, 6);
      clearTimeout(retry);
      retry = setTimeout(open, 1000 * Math.pow(2, failures));   // 2 s, 4 s ... about 2 minutes
    }
    function open() {
      if (stopped) return;
      current().then(function (s) {
        if (stopped) return;
        if (!s || s.id !== me.id) { stopped = true; tell({ signedOut: true }); return; }   // signed out, or someone else signed in
        var ws;
        try { ws = new root.WebSocket(REALTIME); } catch (e) { dropped(); return; }
        socket = ws;
        var joinRef = String(++ref);
        var say = function (m) { try { ws.send(JSON.stringify(m)); } catch (e) { /* the drop handler follows */ } };
        ws.onopen = function () {
          say({ topic: topic, event: 'phx_join', ref: joinRef, join_ref: joinRef, payload: {
            config: { broadcast: { self: false, ack: false }, presence: { key: '' }, postgres_changes: [], private: true },
            access_token: s.access } });
          beat = setInterval(function () { say({ topic: 'phoenix', event: 'heartbeat', payload: {}, ref: String(++ref) }); }, 25000);
          var left = s.ends - Date.now() - EARLY;
          renewal = setTimeout(function () { close(); open(); }, Math.max(left, 30000));
        };
        ws.onmessage = function (ev) {
          var m = null;
          try { m = JSON.parse(ev.data); } catch (e) { return; }
          if (!m || m.topic !== topic) return;
          if (m.event === 'phx_reply' && m.ref === joinRef) {
            if (m.payload && m.payload.status === 'ok') { failures = 0; tell({ joined: true }); return; }
            // Refused for the sign-in (ended somewhere else, say): the sign-in server is asked, as ask does; a
            // rejected sign-in signs this browser out, and the next try finds nobody and stops.
            var why = String((m.payload && m.payload.response && (m.payload.response.reason || m.payload.response.message)) || '');
            if (/auth|token|jwt|expired/i.test(why)) { close(); current(true).then(dropped, dropped); } else dropped();
            return;
          }
          if (m.event === 'broadcast' && m.payload && m.payload.event === 'changed') { tell(m.payload.payload || {}); return; }
          if (m.event === 'phx_error' || m.event === 'phx_close') dropped();
        };
        ws.onerror = dropped;
        ws.onclose = dropped;
      }, dropped);
    }
    open();
    return { stop: function () { stopped = true; clearTimeout(retry); close(); } };
  }

  /* Who is signed in: their address and their id, and nothing that could sign anyone in. What a page needs to
     name its reader; a page that only shows things takes this, never the sign-in itself. */
  function who() {
    var s = stored();
    return s ? { id: s.id, email: s.email } : null;
  }

  /* A forgotten password (2026-11-13). Two halves, on two visits.
     requestReset asks the account server to email a reset link to an address. The answer never says whether an
     account uses that address: the server answers the same either way, and so does the page.
     The link comes back to /reset with a one-time sign-in in the address's fragment (the part after #, which no
     server ever receives). resetBack takes it out of the address at once and holds it here, in this file only,
     never in storage: closing or reloading the page drops it, and the person asks for a new link.
     setNewPassword uses it once to set the new password, then ends that one-time sign-in. The person then signs in
     on /signin with the new password, so a reset link never leaves anyone signed in on a borrowed computer.
     More kinds of trouble, here only:
     busy:    too many reset emails asked for at once (the server limits them); try again later
     expired: the link was used already, or is too old, or this page lost it (reloaded)
     weak:    the server would not take that password (too short, or the same as before) */
  var recovery = null;
  function requestReset(email) {
    var back = root.location.origin + '/reset';
    return send('POST', BASE + '/recover?redirect_to=' + encodeURIComponent(back), null, { email: email }).then(function (r) {
      if (r.status === 429) throw new Refusal('busy', r.status);
      if (r.status !== 200) throw new Refusal('server', r.status);
    });
  }
  /* 'ready' when a reset link brought a one-time sign-in, 'expired' when it brought an error instead, null when
     the page was opened without one. */
  function resetBack() {
    var h;
    try { h = new URLSearchParams(root.location.hash.replace(/^#/, '')); } catch (e) { return null; }
    var token = h.get('access_token'), type = h.get('type'), error = h.get('error') || h.get('error_code');
    if (!token && !error) return null;
    try { root.history.replaceState(null, '', root.location.pathname); } catch (e) { /* the fragment stays; it is good once */ }
    if (error || type !== 'recovery' || !/^[A-Za-z0-9._-]{20,4096}$/.test(token || '')) { recovery = null; return 'expired'; }
    recovery = token;
    return 'ready';
  }
  function setNewPassword(password) {
    var token = recovery;
    if (!token) return Promise.reject(new Refusal('expired'));
    return send('PUT', BASE + '/user', token, { password: password }).then(function (r) {
      if (r.status === 401 || r.status === 403) { recovery = null; throw new Refusal('expired', r.status); }
      if (r.status === 422) throw new Refusal('weak', r.status);
      if (r.status !== 200) throw new Refusal('server', r.status);
      recovery = null;
      send('POST', BASE + '/logout?scope=local', token).then(function () {}, function () {});
    });
  }

  /* Making an account (2026-11-13; his rules: anyone may sign up, with Google or an email and a password; every
     account also has a password; the Terms tick is required). Nothing here opens sign-up: while the account server
     refuses new accounts, signUp answers 'closed'.
     signUp asks for an account with an email and a password. The server then emails a link that proves the address;
     until it is followed nobody is signed in. The answer never says whether the address already has an account.
     signupBack takes the one-time sign-in that link brings (the address's fragment) out of the address at once,
     asks the server who it belongs to, and keeps it like any sign-in.
     setPassword gives a signed-in account a password (one that came in with Google has none yet).
     More kinds of trouble: closed (sign-up is not open), weak (a password the server won't take), busy (too many at
     once), expired (a link used already or too old). */
  function signUp(email, password) {
    var back = root.location.origin + '/signup';
    return send('POST', BASE + '/signup?redirect_to=' + encodeURIComponent(back), null, { email: email, password: password }).then(function (r) {
      var code = r.json && (r.json.error_code || r.json.code || r.json.msg || r.json.message);
      if (r.status === 429) throw new Refusal('busy', r.status);
      if (r.status === 403 || /signup_disabled|signup_closed|not allowed/i.test(String(code || ''))) throw new Refusal('closed', r.status);
      if (r.status === 422 || r.status === 400) throw new Refusal(/weak|password/i.test(String(code || '')) ? 'weak' : 'server', r.status);
      if (r.status !== 200) throw new Refusal('server', r.status);
      if (r.json && r.json.access_token) {
        var s = whole(r.json);
        if (!keep(s)) throw new Refusal('storage');
        return 'in';
      }
      return 'confirm';
    });
  }
  function signupBack() {
    var h;
    try { h = new URLSearchParams(root.location.hash.replace(/^#/, '')); } catch (e) { return Promise.resolve(null); }
    var token = h.get('access_token'), renewal = h.get('refresh_token'), type = h.get('type'), error = h.get('error') || h.get('error_code');
    if (!token && !error) return Promise.resolve(null);
    try { root.history.replaceState(null, '', root.location.pathname); } catch (e) { /* the fragment stays; it is good once */ }
    if (error || (type !== 'signup' && type !== 'email') || !/^[A-Za-z0-9._-]{20,4096}$/.test(token || '') || !renewal) return Promise.reject(new Refusal('expired'));
    var expires = parseInt(h.get('expires_in') || '', 10);
    return send('GET', BASE + '/user', token).then(function (r) {
      if (r.status === 401 || r.status === 403) throw new Refusal('expired', r.status);
      if (r.status !== 200) throw new Refusal('server', r.status);
      var s = whole({ access_token: token, refresh_token: renewal, expires_in: isFinite(expires) && expires > 0 ? expires : 3600, user: r.json });
      if (!keep(s)) throw new Refusal('storage');
      return s;
    });
  }
  function setPassword(password) {
    return current().then(function (s) {
      if (!s) throw new Refusal('rejected');
      return send('PUT', BASE + '/user', s.access, { password: password }).then(function (r) {
        if (r.status === 422) throw new Refusal('weak', r.status);
        if (r.status === 401 || r.status === 403) throw new Refusal('rejected', r.status);
        if (r.status !== 200) throw new Refusal('server', r.status);
      });
    });
  }

  root.InspyxAuth = { signIn: signIn, signOut: signOut, current: current, stored: stored, ask: ask, listen: listen, who: who, googleStart: googleStart, googleBack: googleBack, requestReset: requestReset, resetBack: resetBack, setNewPassword: setNewPassword, signUp: signUp, signupBack: signupBack, setPassword: setPassword };

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
