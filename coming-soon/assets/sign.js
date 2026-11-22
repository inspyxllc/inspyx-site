/* Signing an inspection agreement (2026-11-22, Inspyx 4; signing step 3, part 5): inspyx.com/sign#<key>.
   Contract: the sign function's header (inspyx-mobile, backend/supabase/functions/sign/index.ts): POST /sign, no
   sign-in, {action: "view", key} then {action: "sign", key, textSha256, name, signature, initials}.
   - The key is read from after "#" (never sent to this site, never in a Referer).
   - The agreement is shown as text only (textContent): nothing in it can become markup. Each [Initials] spot (the
     server's own pattern, core.ts SPOT) becomes an "Initial here" button; with none, one goes at the end, as the
     server counts them (view.initials).
   - The client draws initials once and taps each spot to place them; the same drawing is sent for each spot.
   - Both pads have a fixed size in pixels whatever the screen (signature 1200 x 400, initials 450 x 150): always
     under the server's caps (2.5 M and 120,000 pixels), and a browser's PNG is 8-bit RGBA with no colour key, which
     the server takes. A drawing over the server's byte caps (200 KB, 50 KB) is refused here first.
   This file says no words. The page holds every sentence. */
(function () {
  'use strict';
  var main = document.querySelector('[data-sg]');
  if (!main) return;
  var ENDPOINT = 'https://btxlrfvqifnrnxffohsz.supabase.co/functions/v1/sign';
  var DEADLINE = 20000;
  var SIGNATURE_MAX = 200 * 1024, INITIAL_MAX = 50 * 1024;
  // The server's pattern (sign/core.ts SPOT): [Initials], any case, spaces or tabs inside, never a line break.
  var SPOT = /\[[ \t\u00a0]*initials[ \t\u00a0]*\]/gi;

  var $ = function (sel, el) { return (el || document).querySelector(sel); };
  var all = function (sel, el) { return [].slice.call((el || document).querySelectorAll(sel)); };
  var words = (function () {
    var box = document.querySelector('template[data-t="words"]').content;
    return function (key) { var w = box.querySelector('[data-w="' + key + '"]'); return w ? w.textContent : ''; };
  })();
  var setAll = function (name, text) { all('[data-v="' + name + '"]').forEach(function (el) { el.textContent = text; }); };
  var state = function (which) { all('[data-state]', main).forEach(function (el) { el.hidden = el.getAttribute('data-state') !== which; }); };
  var say = function (which) { all('[data-say]', main).forEach(function (el) { el.hidden = el.getAttribute('data-say') !== which; }); };

  var key = decodeURIComponent((location.hash || '').replace(/^#/, ''));
  var view = null;
  var spots = [];       // the "Initial here" buttons
  var needed = 1;       // how many initials the server takes (its view says)
  var sending = false;

  function call(body) {
    var ctl = typeof AbortController === 'function' ? new AbortController() : null;
    var timer = ctl ? setTimeout(function () { ctl.abort(); }, DEADLINE) : null;
    return fetch(ENDPOINT, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
      signal: ctl ? ctl.signal : undefined, credentials: 'omit', referrerPolicy: 'no-referrer',
    }).then(function (res) {
      return res.json().catch(function () { return {}; }).then(function (b) { return { status: res.status, body: b || {} }; });
    }).catch(function () { return { status: 0, body: {} }; })
      .then(function (r) { if (timer) clearTimeout(timer); return r; });
  }

  // ---- time, in the inspector's zone ---------------------------------------------------------------------------------
  function tz() { return view && view.booking && view.booking.timeZone ? view.booking.timeZone : 'America/New_York'; }
  function when(ms) {
    try {
      var day = new Intl.DateTimeFormat('en-US', { timeZone: tz(), weekday: 'long', month: 'long', day: 'numeric' }).format(ms);
      var time = new Intl.DateTimeFormat('en-US', { timeZone: tz(), hour: 'numeric', minute: '2-digit', timeZoneName: 'short' }).format(ms);
      return day + words('at') + time;
    } catch (e) { return new Date(ms).toUTCString(); }
  }

  // ---- the agreement, its spots --------------------------------------------------------------------------------------
  function spotButton() {
    var b = document.createElement('button');
    b.type = 'button';
    b.className = 'sg-spot';
    b.setAttribute('aria-pressed', 'false');
    b.textContent = words('initial-here');
    b.addEventListener('click', function () {
      if (b.getAttribute('aria-pressed') === 'true') { mark(b, false); return; }
      if (!pads.initials.drawn) { say('draw-initials'); $('[data-pad="initials"]').scrollIntoView({ block: 'center' }); return; }
      mark(b, true);
    });
    spots.push(b);
    return b;
  }
  function mark(b, on) {
    b.setAttribute('aria-pressed', on ? 'true' : 'false');
    b.textContent = words(on ? 'initialed' : 'initial-here');
    count();
    say(null);
  }
  function count() {
    var done = spots.filter(function (b) { return b.getAttribute('aria-pressed') === 'true'; }).length;
    setAll('placed', done + ' ' + words('placed') + ' ' + spots.length);
  }
  function showText(text, needed) {
    var box = $('[data-text]');
    box.textContent = '';
    spots = [];
    var at = 0, m;
    SPOT.lastIndex = 0;
    while ((m = SPOT.exec(text)) !== null) {
      box.appendChild(document.createTextNode(text.slice(at, m.index)));
      box.appendChild(spotButton());
      at = m.index + m[0].length;
    }
    box.appendChild(document.createTextNode(text.slice(at)));
    // None in the text: one at the end, as the server counts (its view says how many it takes).
    while (spots.length < needed) { box.appendChild(document.createTextNode('\n')); box.appendChild(spotButton()); }
    count();
  }

  // ---- the pads ------------------------------------------------------------------------------------------------------
  var pads = {};
  function pad(name) {
    var c = $('[data-pad="' + name + '"]');
    var g = c.getContext('2d');
    var p = { canvas: c, drawn: false, points: 0, last: null, down: false };
    g.lineCap = 'round';
    g.lineJoin = 'round';
    g.strokeStyle = '#14213D';
    g.lineWidth = name === 'signature' ? 8 : 5;
    // The point in the canvas's own pixels, whatever its size on screen (the pad keeps its pixel size).
    function at(e) {
      var r = c.getBoundingClientRect();
      return { x: (e.clientX - r.left) * (c.width / r.width), y: (e.clientY - r.top) * (c.height / r.height) };
    }
    c.addEventListener('pointerdown', function (e) {
      e.preventDefault();
      if (c.setPointerCapture) try { c.setPointerCapture(e.pointerId); } catch (x) { /* fine without */ }
      p.down = true;
      p.last = at(e);
      g.beginPath();
      g.arc(p.last.x, p.last.y, g.lineWidth / 2, 0, Math.PI * 2);
      g.fillStyle = g.strokeStyle;
      g.fill();
      p.points++;
    });
    c.addEventListener('pointermove', function (e) {
      if (!p.down) return;
      e.preventDefault();
      var q = at(e);
      g.beginPath();
      g.moveTo(p.last.x, p.last.y);
      g.lineTo(q.x, q.y);
      g.stroke();
      p.last = q;
      p.points++;
      if (p.points >= 3) p.drawn = true;
    });
    var up = function () { p.down = false; p.last = null; };
    c.addEventListener('pointerup', up);
    c.addEventListener('pointercancel', up);
    c.addEventListener('pointerleave', up);
    p.clear = function () {
      g.clearRect(0, 0, c.width, c.height);
      p.drawn = false;
      p.points = 0;
    };
    pads[name] = p;
  }
  pad('initials');
  pad('signature');
  all('[data-clear]').forEach(function (b) {
    b.addEventListener('click', function () {
      var name = b.getAttribute('data-clear');
      pads[name].clear();
      // New initials: the spots must be initialed again with them.
      if (name === 'initials') spots.forEach(function (s) { mark(s, false); });
      say(null);
    });
  });

  /** The pad as PNG bytes in base64, or null when it can't be read. */
  function png(name) {
    return new Promise(function (resolve) {
      var c = pads[name].canvas;
      if (!c.toBlob) { resolve(dataUrlBytes(c.toDataURL('image/png'))); return; }
      c.toBlob(function (blob) {
        if (!blob) { resolve(null); return; }
        var r = new FileReader();
        r.onload = function () { resolve(dataUrlBytes(String(r.result))); };
        r.onerror = function () { resolve(null); };
        r.readAsDataURL(blob);
      }, 'image/png');
    });
  }
  function dataUrlBytes(url) {
    var m = /^data:image\/png;base64,([A-Za-z0-9+/=]+)$/.exec(url || '');
    return m ? { b64: m[1], bytes: Math.floor((m[1].length * 3) / 4) - (m[1].match(/=*$/)[0].length) } : null;
  }

  // ---- signing -------------------------------------------------------------------------------------------------------
  function sign() {
    if (sending) return;
    if (spots.some(function (b) { return b.getAttribute('aria-pressed') !== 'true'; })) { say(pads.initials.drawn ? 'initials' : 'draw-initials'); return; }
    var name = $('#sg-name').value.trim().replace(/\s+/g, ' ');
    if (!name) { say('name'); $('#sg-name').focus(); return; }
    if (!pads.signature.drawn) { say('signature'); return; }
    sending = true;
    var button = $('[data-sign]');
    button.disabled = true;
    say(null);
    Promise.all([png('signature'), png('initials')]).then(function (pics) {
      var sig = pics[0], ini = pics[1];
      if (!sig || !ini) return { status: -1 };
      if (sig.bytes > SIGNATURE_MAX || ini.bytes > INITIAL_MAX) return { status: -2 };
      // As many as the server takes (view.initials: one a spot, at most 60), each spot having been initialed.
      var initials = [];
      for (var i = 0; i < needed; i++) initials.push(ini.b64);
      return call({ action: 'sign', key: key, textSha256: view.textSha256, name: name, signature: sig.b64, initials: initials });
    }).then(function (r) {
      sending = false;
      button.disabled = false;
      if (r.status === 200 && r.body.state === 'signed') { done(name, null); return; }
      if (r.status === -2) { say('too-big'); return; }
      if (r.status === 404) { state('gone'); return; }
      if (r.status === 429) { state('slow'); return; }
      if (r.status === 409) { say('changed'); return; }
      if (r.status === 400 && r.body.error === 'name') { say('name'); return; }
      if (r.status === 400 && r.body.error === 'initials') { say('too-big'); return; }
      if (r.status === 400 && r.body.error === 'signature') { say('too-big'); return; }
      say('failed');
    });
  }
  $('[data-sign]').addEventListener('click', sign);

  function done(name, at) {
    setAll('signedline', words('signed-by') + ' ' + name + (at ? ' ' + words('on') + ' ' + when(at) : ''));
    state('signed');
    window.scrollTo(0, 0);
  }

  // ---- the page ------------------------------------------------------------------------------------------------------
  function start() {
    if (!/^[0-9a-f-]{36}\.[A-Za-z0-9_-]{22}$/.test(key)) { state('gone'); return; }
    call({ action: 'view', key: key }).then(function (r) {
      if (r.status === 404) { state('gone'); return; }
      if (r.status === 429) { state('slow'); return; }
      if (r.status !== 200 || !r.body || (r.body.state !== 'open' && r.body.state !== 'signed')) { state('down'); return; }
      view = r.body;
      var company = (view.inspector && (view.inspector.company || view.inspector.name)) || '';
      setAll('company', company);
      if (view.state === 'signed') { done(view.signerName || '', view.signedAt || null); return; }
      setAll('title', view.title || '');
      document.title = view.title || document.title;
      var b = view.booking || {};
      if (typeof b.startsAt === 'number') {
        setAll('when', when(b.startsAt));
        setAll('place', b.address ? ', ' + b.address : '');
        $('[data-when]').hidden = false;
      }
      needed = Math.max(1, Number(view.initials) || 1);
      showText(String(view.text || ''), needed);
      state('open');
    });
  }
  start();
})();
