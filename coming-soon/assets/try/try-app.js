/* TRY SPEX (inspyx.com home page, 2026-11-23): talk to the real Spex on a demo house. Loaded by try.js only when the
   visitor clicks "Try Spex now", so the home page's own story is never touched.
   - The phone shows web copies of four app screens (the walk, an item, the camera, the report) in the app's Look A,
     with real photos of a demo house (assets/try/photos, CREDITS.md). Every screen can be tapped.
   - "Talk to Spex" asks for the microphone (never before), solves the relay's proof-of-work challenge in a Web Worker
     (started when the overlay opens, so it's usually done), and opens the relay's demo session ("mode": "demo",
     inspyx-mobile relay/demo_voice.py). The mic goes up as 16 kHz PCM; Spex's voice comes back as 24 kHz PCM; Spex's
     tools come back as calls this page runs on its screens and answers.
   - Anything the model says (findings, captions) is set as text, never as markup; every tool argument is checked
     against the demo's own lists and capped in length.
   - The relay ends the visit at 3 minutes or at its cost limit, and refuses when the day's cap, the crowd or the
     address limit is reached: each shows the page's friendly "busy" or "that's the demo" card.
   - Close (X, Esc, or a click outside the phone): the mic stops, the session closes, and the page is where it was. */
(function () {
  'use strict';
  var RELAY = 'chat---spex-relay-yu5bdad2fa-uc.a.run.app';
  var PHOTOS = '/assets/try/photos/';
  var W = {
    side_title: 'Inspect a house, by voice.',
    side_text: 'This is the real Spex: say where to go and what you see, and it runs the app. About three minutes, on a demo house.',
    side_try: ['\u201cGo to the water heater\u201d', '\u201cOpen the camera\u201d', '\u201cAdd a finding: rust flakes in the burner\u201d', '\u201cShow me the report\u201d'],
    side_note: 'Or tap around the phone. Your voice is used only to answer you, and nothing is kept.',
    credits: 'Photos: Zach Miller, Robin Joshua and Canada\u2019s Restoration Services on Unsplash; Wikimedia Commons contributors (CC0, CC BY, CC BY-SA).',
    credits_link: 'Photo credits',
    close: 'Close the demo',
    talk: 'Talk to Spex', connecting: 'Connecting to Spex\u2026', listening: 'Spex is listening', stop: 'Tap to stop',
    left: '{t} left',
    hint_first: 'Try saying: \u201cgo to the water heater\u201d',
    hint_camera: 'Try: \u201copen the camera\u201d', hint_take: 'Try: \u201ctake it\u201d',
    hint_finding: 'Try: \u201cadd a finding: rust flakes in the burner\u201d', hint_report: 'Try: \u201cshow me the report\u201d',
    no_mic: 'The microphone is off, so Spex can\u2019t hear you. You can still tap around.',
    busy_title: 'Spex is busy right now', busy_text: 'A lot of people are trying Spex at the moment. Try again in a few minutes. The rest of the page is all yours.',
    busy_again: 'Try again',
    done_title: 'That\u2019s Spex.', done_text: 'Imagine this on every inspection: you talk, the report writes itself.', done_cta: 'Join the waitlist', done_again: 'Look around more',
    today: 'Today', inspection: 'Inspection', report: 'Report', walk: 'Walk', done: 'Done', walk_label: 'Walk the house',
    condition: 'Condition', photos: 'Photos', findings: 'Findings', camera_close: 'Close',
    rate: ['Inspected', 'Not inspected', 'Not present'],
    report_title: 'Home Inspection Report', prepared: 'Prepared by {c}',
    kinds: { safety: 'Safety', repair: 'Repair', maintenance: 'Maintenance', note: 'Note' },
    done_of: '{d} of {n} done', one_finding: '1 finding', findings_n: '{n} findings'
  };
  var COMPANY = 'Saltmeadow Home Inspections';
  var ADDRESS = '7314 Willet Marsh Ct.';
  var HOUSE = 'Tampa, FL \u00b7 2 stories \u00b7 1925 \u00b7 2,480 sq ft';
  var PLACES = [
    { id: 'exterior', title: 'Exterior', room: 'Exterior', photo: 'exterior.jpg', n: 8, d: 8 },
    { id: 'roof', title: 'Roof', room: 'Roof', photo: 'roof.jpg', n: 6, d: 5 },
    { id: 'kitchen', title: 'Kitchen', room: 'Kitchen', photo: 'kitchen.jpg', n: 9, d: 3 },
    { id: 'water heater', title: 'Water heater', room: 'Garage', photo: 'water-heater.jpg', shot: 'water-heater-rust.jpg', n: 4, d: 0,
      fact: ['Type and age', 'Gas, 50 gallons, made 2016 (about 10 years old).'] },
    { id: 'electrical panel', title: 'Electrical panel', room: 'Garage', photo: 'electrical-panel.jpg', n: 7, d: 0 },
    { id: 'attic', title: 'Attic', room: 'Attic', photo: 'attic.jpg', n: 5, d: 0 }
  ];
  var KINDS = ['safety', 'repair', 'maintenance', 'note'];
  // The app's item marks (walk_marks.dart ItemStatusButtons): Inspected, Not inspected, Not present.
  var CONDITIONS = ['inspected', 'not inspected', 'not present'];
  var place = function (id) { return PLACES.filter(function (p) { return p.id === id; })[0] || null; };
  var fill = function (s, o) { Object.keys(o).forEach(function (k) { s = s.split('{' + k + '}').join(o[k]); }); return s; };
  var clip = function (v, n) { return String(v == null ? '' : v).replace(/\s+/g, ' ').trim().slice(0, n); };

  // ---- the page's DOM: built with createElement and textContent only ------------------------------------------------
  function el(tag, cls, text, attrs) {
    var e = document.createElement(tag);
    if (cls) e.className = cls.split(' ').map(function (c) { return 'ty-' + c; }).join(' ');
    if (text != null) e.textContent = text;
    Object.keys(attrs || {}).forEach(function (k) { e.setAttribute(k, attrs[k]); });
    return e;
  }
  // The overlay's classes all start with ty-: the home page's own (.spex, .bar, .hint...) never reach it.
  function cl(e, op) { for (var i = 2; i < arguments.length; i++) e.classList[op]('ty-' + arguments[i]); }
  function add(parent) { for (var i = 1; i < arguments.length; i++) if (arguments[i]) parent.appendChild(arguments[i]); return parent; }

  var S = null;   // the visit's state; null while closed

  function fresh() {
    return { screen: 'walk', at: null, camera: false, rates: {}, photos: {}, finds: {}, voice: null, ended: false, opener: null };
  }

  // ---- screens ------------------------------------------------------------------------------------------------------
  var root, screen, timer, hint, spex, you, say, busy, doneCard;

  function bar(left, title, right, onLeft, onRight) {
    var b = el('div', 'bar');
    var l = left ? el('button', 'back', left, { type: 'button' }) : el('span', 'back');
    if (onLeft) l.addEventListener('click', onLeft);
    var r = right ? el('button', 'more', right, { type: 'button' }) : el('span', 'more');
    if (onRight) r.addEventListener('click', onRight);
    return add(b, l, el('b', null, title), r);
  }

  function walkScreen() {
    var s = el('section', 'scr', null, { 'data-ty-scr': 'walk' });
    add(s, bar(W.today, W.inspection, W.report, null, function () { show('report'); }));
    var body = el('div', 'body'), house = el('div', 'house'), img = el('img', null, null, { src: PHOTOS + 'exterior.jpg', alt: '' });
    var info = el('div'), prog = el('div', 'prog'), bar2 = el('span', 'prog-fill');
    var done = 0, all = 0;
    PLACES.forEach(function (p) { all += p.n; done += Math.min(p.n, p.d + (S.rates[p.id] ? 1 : 0)); });
    bar2.style.width = Math.round(done / all * 100) + '%';
    add(info, el('strong', null, ADDRESS), el('span', null, HOUSE), add(prog, bar2));
    add(body, add(house, img, info), el('p', 'label', W.walk_label));
    var list = el('div', 'list');
    PLACES.forEach(function (p) {
      var row = el('button', 'row', null, { type: 'button', 'data-ty-place': p.id });
      var done = Math.min(p.n, p.d + (S.rates[p.id] ? 1 : 0)), finds = (S.finds[p.id] || []).length;
      // The app's walk row: the room's ring, its name, "3 of 9 done \u00b7 1 finding", and a chevron.
      var status = fill(W.done_of, { d: done, n: p.n }) + (finds === 1 ? ' \u00b7 ' + W.one_finding : finds > 1 ? ' \u00b7 ' + fill(W.findings_n, { n: finds }) : '');
      var t = add(el('span', 't', p.room === p.title ? p.title : p.room + ' \u00b7 ' + p.title), el('small', null, status));
      add(row, ring(done, p.n), t, el('span', 'chev', '\u203a', { 'aria-hidden': 'true' }));
      row.addEventListener('click', function () { openPlace(p.id); });
      list.appendChild(row);
    });
    return add(s, add(body, list));
  }

  /* The app's RoomRing (walk_marks.dart): an arc as the room's items are done, a green check once they all are. */
  function ring(done, total) {
    var NS = 'http://www.w3.org/2000/svg', svg = document.createElementNS(NS, 'svg');
    svg.setAttribute('viewBox', '0 0 26 26'); svg.setAttribute('class', 'ty-ring'); svg.setAttribute('aria-hidden', 'true');
    var c = function (attrs) { var e = document.createElementNS(NS, 'circle'); Object.keys(attrs).forEach(function (k) { e.setAttribute(k, attrs[k]); }); svg.appendChild(e); return e; };
    if (total > 0 && done >= total) {
      c({ cx: 13, cy: 13, r: 13, fill: '#157347' });
      var path = document.createElementNS(NS, 'path');
      path.setAttribute('d', 'M8 13.5l3.2 3.2L18.5 9.4'); path.setAttribute('fill', 'none'); path.setAttribute('stroke', '#fff'); path.setAttribute('stroke-width', '2.4'); path.setAttribute('stroke-linecap', 'round'); path.setAttribute('stroke-linejoin', 'round');
      svg.appendChild(path);
    } else {
      var r = 10, len = 2 * Math.PI * r;
      c({ cx: 13, cy: 13, r: r, fill: 'none', stroke: 'rgba(128,138,152,.45)', 'stroke-width': 3 });
      c({ cx: 13, cy: 13, r: r, fill: 'none', stroke: '#1D62D8', 'stroke-width': 3, 'stroke-dasharray': (len * (total ? done / total : 0)).toFixed(2) + ' ' + len.toFixed(2), transform: 'rotate(-90 13 13)', 'stroke-linecap': 'butt' });
    }
    return svg;
  }

  function itemScreen(p) {
    var s = el('section', 'scr', null, { 'data-ty-scr': 'item' });
    add(s, bar('\u2039 ' + W.walk, p.title, W.done, function () { show('walk'); }, function () { show('walk'); }));
    var body = el('div', 'body');
    var rate = el('div', 'rate');
    W.rate.forEach(function (label, i) {
      var b = el('button', S.rates[p.id] === CONDITIONS[i] ? 'on' : null, label, { type: 'button', 'data-ty-rate': CONDITIONS[i] });
      b.addEventListener('click', function () { setRate(p.id, CONDITIONS[i]); });
      rate.appendChild(b);
    });
    var photos = el('div', 'photos');
    var first = el('i'); first.style.backgroundImage = 'url(' + PHOTOS + p.photo + ')'; photos.appendChild(first);
    (S.photos[p.id] || []).forEach(function (f) { var i = el('i', null, null, { 'data-ty-taken': '' }); i.style.backgroundImage = 'url(' + PHOTOS + f + ')'; photos.appendChild(i); });
    var cam = el('button', 'add', '+', { type: 'button', 'aria-label': 'Camera' });
    cam.addEventListener('click', function () { openCamera(); });
    photos.appendChild(cam);
    var finds = el('div', null, null, { 'data-ty-finds': '' });
    if (p.fact) finds.appendChild(findCard(p.fact[0], p.fact[1], null));
    (S.finds[p.id] || []).forEach(function (f) { finds.appendChild(findCard(f.title, f.text, f.kind)); });
    add(body, el('p', 'label', W.condition), rate, el('p', 'label', W.photos), photos, el('p', 'label', W.findings), finds);
    return add(s, body);
  }

  function findCard(title, text, kind) {
    var c = el('div', 'find' + (kind ? ' new' : ''));
    if (!kind) c.style.boxShadow = 'inset 3px 0 0 #157347';
    add(c, el('b', null, title), el('p', null, text));
    if (kind) c.appendChild(el('span', 'tag', W.kinds[kind]));
    return c;
  }

  function cameraScreen(p) {
    var s = el('section', 'scr cam', null, { 'data-ty-scr': 'camera' });
    var view = el('div', 'view'); view.style.backgroundImage = 'url(' + PHOTOS + (p.shot || p.photo) + ')';
    var close = el('button', 'close', W.camera_close, { type: 'button' });
    close.addEventListener('click', function () { S.camera = false; show('item'); });
    var shut = el('div', 'shut'), b = el('button', null, null, { type: 'button', 'aria-label': 'Take the photo' });
    b.addEventListener('click', function () { takePhoto(); });
    return add(s, close, view, add(shut, b), el('div', 'flash', null, { 'data-ty-flash': '' }));
  }

  function reportScreen() {
    var s = el('section', 'scr rep', null, { 'data-ty-scr': 'report' });
    var cover = el('div', 'cover'); cover.style.backgroundImage = 'url(' + PHOTOS + 'exterior.jpg)';
    add(cover, add(el('div'), el('b', null, W.report_title), el('span', null, ADDRESS + ' \u00b7 ' + fill(W.prepared, { c: COMPANY }))));
    var all = [];
    PLACES.forEach(function (p) { (S.finds[p.id] || []).forEach(function (f) { all.push({ p: p, f: f }); }); });
    var count = function (k) { return all.filter(function (x) { return x.f.kind === k; }).length; };
    var sum = el('div', 'sum');
    [['safety', 3], ['repair', 6], ['maintenance', 11]].forEach(function (k) {
      add(sum, add(el('div'), el('b', null, String(k[1] + count(k[0]))), el('span', null, W.kinds[k[0]])));
    });
    var body = el('div', 'body'); body.style.paddingTop = '0';
    KINDS.forEach(function (k) {
      var these = all.filter(function (x) { return x.f.kind === k; });
      if (!these.length) return;
      body.appendChild(el('p', 'label', W.kinds[k]));
      these.forEach(function (x) { body.appendChild(findCard(x.p.title + ': ' + x.f.title, x.f.text, k)); });
    });
    var back = bar('\u2039 ' + W.walk, W.report, null, function () { show('walk'); });
    return add(s, back, cover, sum, body);
  }

  function show(name) {
    S.screen = name;
    if (name !== 'camera') S.camera = false;
    var p = S.at && place(S.at);
    var next = name === 'item' && p ? itemScreen(p) : name === 'camera' && p ? cameraScreen(p) : name === 'report' ? reportScreen() : walkScreen();
    if (screen) screen.replaceWith(next); else root.querySelector('.ty-iph-screen').insertBefore(next, timer);
    cl(root.querySelector('.ty-iph-screen'), name === 'camera' ? 'add' : 'remove', 'cam-on');
    screen = next;
  }

  // ---- what Spex (or a tap) does -----------------------------------------------------------------------------------
  function openPlace(id) { var p = place(id); if (!p) return false; S.at = id; show('item'); setHint(p.shot ? W.hint_camera : null); return true; }
  function openCamera() { if (!S.at) return false; S.camera = true; show('camera'); setHint(W.hint_take); return true; }
  function takePhoto() {
    if (!S.camera || !S.at) return false;
    var p = place(S.at), f = root.querySelector('[data-ty-flash]');
    if (f) { cl(f, 'remove', 'go'); void f.offsetWidth; cl(f, 'add', 'go'); }
    (S.photos[p.id] = S.photos[p.id] || []).push(p.shot || p.photo);
    setTimeout(function () { if (S && S.screen === 'camera') { S.camera = false; show('item'); } }, 450);
    setHint(W.hint_finding);
    return true;
  }
  function addFinding(title, text, kind) {
    if (!S.at || KINDS.indexOf(kind) < 0) return false;
    title = clip(title, 60); text = clip(text, 300);
    if (!title || !text) return false;
    (S.finds[S.at] = S.finds[S.at] || []).push({ title: title, text: text, kind: kind });
    if (S.screen !== 'item') show('item'); else show('item');
    setHint(W.hint_report);
    return true;
  }
  function setRate(id, c) { if (!place(id) || CONDITIONS.indexOf(c) < 0) return false; S.rates[id] = c; if (S.screen === 'item') show('item'); return true; }

  /* One of Spex's tool calls, checked against the demo's own lists. Answers what the model is told. */
  function runTool(name, args) {
    args = args || {};
    var ok = false;
    if (name === 'open_place') ok = openPlace(String(args.place || '').toLowerCase());
    else if (name === 'open_camera') ok = openCamera();
    else if (name === 'take_photo') ok = takePhoto();
    else if (name === 'add_finding') ok = addFinding(args.title, args.report_text, String(args.kind || '').toLowerCase());
    else if (name === 'rate_item') ok = !!S.at && setRate(S.at, String(args.condition || '').toLowerCase());
    else if (name === 'show_report') { show('report'); setHint(null); ok = true; }
    return ok ? { ok: true, screen: S.screen, place: S.at } : { ok: false, why: 'not possible here', screen: S.screen, place: S.at };
  }

  function setHint(t) { hint.textContent = t || ''; hint.style.opacity = t ? '1' : '0'; }

  // ---- voice ---------------------------------------------------------------------------------------------------------
  function solveChallenge() {
    return fetch('https://' + RELAY + '/demo-challenge', { cache: 'no-store', credentials: 'omit', referrerPolicy: 'no-referrer' })
      .then(function (r) { if (!r.ok) throw new Error('challenge'); return r.json(); })
      .then(function (ch) {
        return new Promise(function (resolve, reject) {
          var w = new Worker('/assets/try/pow-worker.js');
          S.worker = w;
          w.onmessage = function (e) { w.terminate(); if (e.data) resolve(e.data); else reject(new Error('unsolved')); };
          w.onerror = function () { w.terminate(); reject(new Error('worker')); };
          w.postMessage(ch);
        });
      });
  }

  function b64(buf) { var s = '', a = new Uint8Array(buf); for (var i = 0; i < a.length; i += 0x8000) s += String.fromCharCode.apply(null, a.subarray(i, i + 0x8000)); return btoa(s); }
  function unb64(s) { var bin = atob(s), a = new Uint8Array(bin.length); for (var i = 0; i < bin.length; i++) a[i] = bin.charCodeAt(i); return a.buffer; }

  function talk() {
    if (S.voice) { stopVoice(); return; }
    var v = S.voice = { ws: null, stream: null, mic: null, out: null, playAt: 0, sources: [], seconds: 0, tick: 0, heard: '', said: '', turnDone: true };
    cl(spex, 'add', 'wait'); spex.querySelector('.ty-spex-talk span').textContent = W.connecting;
    navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } }).then(function (stream) {
      // Closed, or stopped, while the browser asked: the mic goes off at once (Codex on #70).
      if (!S || S.voice !== v) { stream.getTracks().forEach(function (t) { t.stop(); }); return null; }
      v.stream = stream;
      return S.pow;
    }, function () { if (S && S.voice === v) noMic(); throw null; }).then(function (pow) {
      if (!pow || !S || S.voice !== v) return;
      var ws = v.ws = new WebSocket('wss://' + RELAY + '/');
      ws.onopen = function () { ws.send(JSON.stringify({ hello: { mode: 'demo', client: 'inspyx-web-demo', pow: pow } })); };
      // A stopped session's socket may still deliver: only the current session's messages count.
      ws.onmessage = function (e) { if (typeof e.data === 'string' && S && S.voice === v) heard(v, e.data); };
      ws.onclose = function () { if (S && S.voice === v && !S.ended) { stopVoice(); } };
    }).catch(function (e) { if (e !== null && S && S.voice === v) { stopVoice(); showBusy(); } });
  }

  function heard(v, text) {
    var m; try { m = JSON.parse(text); } catch (e) { return; }
    if (m.relay) {
      var st = m.relay.status;
      if (st === 'admitted') startLive(v, m.relay.seconds || 180);
      else if (st === 'denied') { stopVoice(); showBusy(); }
      else if (st === 'ended') { S.ended = true; stopVoice(); cl(doneCard, 'add', 'show'); }
      return;
    }
    var c = m.serverContent || m.server_content;
    if (c) {
      if (c.interrupted) stopPlayback(v);
      var turn = c.modelTurn || c.model_turn;
      ((turn && turn.parts) || []).forEach(function (part) {
        var d = part.inlineData || part.inline_data;
        if (d && /audio\/pcm/.test(d.mimeType || d.mime_type || '')) play(v, unb64(d.data));
      });
      var ti = c.inputTranscription || c.input_transcription, to = c.outputTranscription || c.output_transcription;
      if (ti && ti.text) { if (v.turnDone) { v.heard = ''; v.said = ''; v.turnDone = false; } v.heard += ti.text; you.textContent = clip(v.heard, 140); say.textContent = ''; }
      if (to && to.text) { v.said += to.text; say.textContent = clip(v.said, 200); }
      if (c.turnComplete || c.turn_complete) v.turnDone = true;
    }
    var tc = m.toolCall || m.tool_call;
    if (tc) {
      var calls = tc.functionCalls || tc.function_calls || [];
      var out = calls.slice(0, 8).map(function (f) { return { id: f.id, name: f.name, response: runTool(f.name, f.args) }; });
      if (out.length && v.ws && v.ws.readyState === 1) v.ws.send(JSON.stringify({ tool_response: { function_responses: out } }));
    }
  }

  function startLive(v, seconds) {
    cl(spex, 'remove', 'wait'); cl(spex, 'add', 'on');
    v.seconds = seconds; timer.hidden = false;
    var ends = Date.now() + seconds * 1000;
    var tick = function () {
      var left = Math.max(0, Math.round((ends - Date.now()) / 1000));
      timer.textContent = fill(W.left, { t: Math.floor(left / 60) + ':' + ('0' + left % 60).slice(-2) });
    };
    tick(); v.tick = setInterval(tick, 1000);
    var ctx = v.mic = new AudioContext();
    ctx.audioWorklet.addModule('/assets/try/mic-worklet.js').then(function () {
      // This session may have been stopped (or the demo closed) while the module loaded (Codex on #70).
      if (!S || S.voice !== v) return;
      var src = ctx.createMediaStreamSource(v.stream), node = new AudioWorkletNode(ctx, 'mic-chunks');
      node.port.onmessage = function (e) {
        if (v.ws && v.ws.readyState === 1) v.ws.send(JSON.stringify({ realtime_input: { media_chunks: [{ mime_type: 'audio/pcm;rate=16000', data: b64(e.data) }] } }));
      };
      src.connect(node);
    }).catch(function () { if (S && S.voice === v) { stopVoice(); showBusy(); } });
  }

  function play(v, buf) {
    if (!v.out) { v.out = new AudioContext({ sampleRate: 24000 }); v.playAt = 0; }
    var pcm = new Int16Array(buf), f = new Float32Array(pcm.length);
    for (var i = 0; i < pcm.length; i++) f[i] = pcm[i] / 0x8000;
    var b = v.out.createBuffer(1, f.length, 24000); b.copyToChannel(f, 0);
    var s = v.out.createBufferSource(); s.buffer = b; s.connect(v.out.destination);
    var at = Math.max(v.out.currentTime, v.playAt); s.start(at); v.playAt = at + b.duration;
    v.sources.push(s); s.onended = function () { v.sources.splice(v.sources.indexOf(s), 1); };
  }
  function stopPlayback(v) { v.sources.slice().forEach(function (s) { try { s.stop(); } catch (e) { /* done */ } }); v.sources = []; v.playAt = 0; }

  function stopVoice() {
    var v = S && S.voice; if (!v) return;
    S.voice = null;
    clearInterval(v.tick);
    if (v.ws) { try { v.ws.close(); } catch (e) { /* closed */ } }
    if (v.stream) v.stream.getTracks().forEach(function (t) { t.stop(); });
    if (v.mic) v.mic.close().catch(function () {});
    if (v.out) { stopPlayback(v); v.out.close().catch(function () {}); }
    cl(spex, 'remove', 'on', 'wait'); spex.querySelector('.ty-spex-talk span').textContent = W.talk;
    timer.hidden = true;
  }
  function noMic() { stopVoice(); you.textContent = ''; say.textContent = ''; setHint(W.no_mic); }
  function showBusy() { cl(busy, 'add', 'show'); }

  // ---- the overlay ---------------------------------------------------------------------------------------------------
  function build() {
    root = el('div', 'try-veil', null, { role: 'dialog', 'aria-modal': 'true', 'aria-label': W.talk });
    var x = el('button', 'try-x', '\u00d7', { type: 'button', 'aria-label': W.close });
    x.addEventListener('click', close);
    var iph = el('div', 'iph'), scr = el('div', 'iph-screen');
    add(scr, el('div', 'iph-island'), add(el('div', 'iph-status'), el('span', null, '9:41'), el('span', null, '\u25cf\u25cf\u25cf 100%')), el('div', 'iph-glare'));
    timer = el('div', 'timer', null, { 'data-ty-timer': '' }); timer.hidden = true;
    hint = el('div', 'hint', null, { 'data-ty-hint': '' });
    spex = el('div', 'spex', null, { 'data-ty-spex': '' });
    var tb = el('button', 'spex-talk', null, { type: 'button', 'data-ty-talk': '' }); add(tb, el('i'), el('span', null, W.talk));
    tb.addEventListener('click', talk);
    var live = el('div', 'spex-live', null, { role: 'button', tabindex: '0', 'data-ty-live': '' });
    var wave = el('div', 'wave'); for (var i = 0; i < 22; i++) wave.appendChild(el('i'));
    you = el('p', 'cap you', null, { 'data-ty-you': '' }); say = el('p', 'cap spexsay', null, { 'data-ty-say': '', 'aria-live': 'polite' });
    add(live, add(el('div', 'spex-who'), el('span', null, '\u25cf ' + W.listening), el('span', null, W.stop)), wave, you, say);
    live.addEventListener('click', stopVoice);
    // A keyboard stops it too (Codex on #70): Enter or Space, as a button.
    live.addEventListener('keydown', function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); stopVoice(); } });
    add(spex, tb, live);
    busy = el('div', 'busy', null, { 'data-ty-busy': '' });
    var again = el('button', null, W.busy_again, { type: 'button' });
    again.addEventListener('click', function () { cl(busy, 'remove', 'show'); S.pow = solveChallenge(); S.pow.catch(function () {}); });
    add(busy, add(el('div'), el('b', null, W.busy_title), el('p', null, W.busy_text), again));
    doneCard = el('div', 'done-card', null, { 'data-ty-done': '' });
    var cta = el('a', null, W.done_cta, { href: '#waitlist' });
    cta.addEventListener('click', close);
    var more = el('button', null, W.done_again, { type: 'button' });
    more.addEventListener('click', function () { cl(doneCard, 'remove', 'show'); });
    add(doneCard, add(el('div'), el('b', null, W.done_title), el('p', null, W.done_text), cta, el('br'), more));
    add(scr, timer, hint, spex, busy, doneCard);
    add(iph, scr);
    var side = el('aside', 'try-side'), ul = el('ul');
    W.side_try.forEach(function (t) { add(ul, add(el('li'), el('b', null, t))); });
    var credits = el('p', 'try-credits', W.credits + ' ');
    add(credits, el('a', null, W.credits_link, { href: '/assets/try/photos/CREDITS.md', target: '_blank', rel: 'noopener' }));
    add(side, el('h2', null, W.side_title), el('p', null, W.side_text), ul, el('p', 'try-meter', W.side_note), credits);
    add(root, x, iph, side);
    root.addEventListener('click', function (e) { if (e.target === root) close(); });
  }

  function onKey(e) { if (e.key === 'Escape') close(); }
  /* The phone fits the window: scaled down on a short (or narrow) desktop window, so "Talk to Spex" is always in
     view (Codex on #70). On a phone-sized screen the demo fills it and needs no scale. */
  function fit() {
    if (!root) return;
    var s = Math.min(1, (window.innerHeight - 32) / 870, (window.innerWidth - 32) / 400);
    root.style.setProperty('--s', String(Math.max(0.5, s)));
  }

  function open(opener) {
    if (S) return;
    S = fresh(); S.opener = opener || null;
    screen = null;
    build();
    document.body.appendChild(root);
    show('walk'); setHint(W.hint_first);
    S.overflow = document.documentElement.style.overflow;
    document.documentElement.style.overflow = 'hidden';
    document.addEventListener('keydown', onKey);
    window.addEventListener('resize', fit); fit();
    root.querySelector('.ty-try-x').focus();
    // The bot check, while the visitor looks around: usually done before they tap "Talk to Spex".
    S.pow = solveChallenge(); S.pow.catch(function () {});
  }

  function close() {
    if (!S) return;
    stopVoice();
    if (S.worker) S.worker.terminate();
    document.removeEventListener('keydown', onKey);
    window.removeEventListener('resize', fit);
    document.documentElement.style.overflow = S.overflow || '';
    var opener = S.opener;
    root.remove(); root = null; screen = null; S = null;
    if (opener) opener.focus({ preventScroll: true });
  }

  window.TrySpex = { open: open, close: close, _run: function (n, a) { return S ? runTool(n, a) : null; } };
})();
