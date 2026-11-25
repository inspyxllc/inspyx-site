/* Your company (2026-11-16, Inspyx 4): the inspector's company profile on the web, the same as on their phone.
   Moises's dashboard interview, answer 5: "business setup (... company profile, logo, signature)"; business setup
   phase 2b (the lead's order of 2026-11-16: agreements, then the profile's words, then its pictures).
   How: the sync function keeps the profile as one row (inspector_profile, id "profile"), newest change wins; the
   phone writes a pulled one only through its profile service (every report's cover prints it). This page pulls
   once, then what changed after its point, every half minute while in view and when it comes back into view.
   It writes the row whole, as the phone's profile screen saves it: each field trimmed as Dart trims, an empty one
   as none, the phone number tidied as the phone tidies it, the email checked as the phone checks it; the
   association numbers and the second inspector, which this page doesn't show, go back as they were. A new change
   time comes after the row's last one. A form being typed in is never refilled under the typing; a save over a
   change made elsewhere since the form was filled is refused once, and says so.
   The photo, logo and signature (phase 2c, the lead's answers of 2026-11-16): each is a row of its own
   (inspector_media, its id the kind) naming a file in the private store, which this page reads and adds through
   the sign-in (InspyxAuth.picture) and shows from a copy held in the page (an object URL, let go when the picture
   changes or the page is left): no link to it ever outlives the page. A new one is made as the phone makes it
   (the photo a JPEG at most 600 pixels on its long side; the logo a PNG at most 1000, made smaller until it is
   within the report's 2 MB, else refused; the signature drawn on a pad, a white PNG at three times its size),
   its file added first, then its row. Removing one marks its row removed.
   This file says no words. The page holds every sentence. */
(function () {
  'use strict';
  var main = document.querySelector('[data-prf]');
  var auth = window.InspyxAuth;
  if (!main || !auth) return;
  var DEADLINE = 20000, POLL = 30000, KIND = 'inspector_profile', ID = 'profile', MEDIA = 'inspector_media';
  var PICTURES = ['headshot', 'logo', 'signature'], MAX_BYTES = 2 * 1024 * 1024;
  var FIELDS = ['inspectorName', 'licenseNumber', 'companyName', 'companyPhone', 'companyEmail'];

  var $ = function (sel, el) { return (el || document).querySelector(sel); };
  var all = function (sel, el) { return [].slice.call((el || document).querySelectorAll(sel)); };
  var showOne = function (el, attr, which) { all('[' + attr + ']', el).forEach(function (x) { x.hidden = x.getAttribute(attr) !== which; }); };

  // ---- the row, as the server keeps it ---------------------------------------------------------------------------

  var me = null, row = null, pics = Object.create(null);   // pics: kind -> its row
  var point = null, loaded = false, pulling = null, again = false, failing = false;

  function take(r) {
    if (!r || !r.data || r.data.ownerAccountId !== me) return;
    if (r.kind === KIND && r.id === ID) { if (!row || r.updated_at >= row.updated_at) row = r; return; }
    if (r.kind === MEDIA && PICTURES.indexOf(r.id) >= 0) { var held = pics[r.id]; if (!held || r.updated_at >= held.updated_at) pics[r.id] = r; }
  }

  function exchange(push) {
    return auth.ask('sync', { push: push, after: point, limit: 500 }, DEADLINE).then(function (r) {
      if (r === null) { window.location.replace('/signin'); return null; }
      if (r.status !== 200 || !r.json || !Array.isArray(r.json.rows)) throw new Error('sync');
      r.json.rows.forEach(take);
      if (r.json.next) point = r.json.next;
      return r.json;
    });
  }

  function pull() {
    if (pulling) { again = true; return pulling; }
    var loop = function () { return exchange([]).then(function (a) { return a && a.more ? loop() : null; }); };
    pulling = loop().then(function () {
      loaded = true; failing = false;
    }, function () {
      failing = true;
    }).then(function () {
      pulling = null;
      render();
      if (again) { again = false; pull(); }
    });
    return pulling;
  }

  function send(push) {
    return exchange(push).then(function (answer) {
      if (answer === null) return 'failed';
      var sent = function (s) { return push.some(function (p) { return p.kind === s.kind && p.id === s.id; }); };
      var mine = (answer.skipped || []).filter(sent);
      if (mine.length > 0) return 'refused';
      // Not applied: the server holds a newer copy, changed elsewhere since this page read it (the answer's pull just
      // brought it). Nothing was saved. The details say so, and their next save keeps what is on screen, as the check
      // before a save; a picture says Inspyx couldn't keep it, shows the newer one, and the next try comes after it.
      var stale = (answer.applied || []).filter(function (a) { return a.applied === false && sent(a); });
      if (stale.length === 0) return 'saved';
      return stale.some(function (a) { return a.kind === KIND; }) ? 'elsewhere' : 'refused';
    }, function () { return 'failed'; });
  }

  // ---- the phone's own rules (form_input.dart, profile_row_rules.dart) -------------------------------------------

  var SPACE = [0x09, 0x0a, 0x0b, 0x0c, 0x0d, 0x20, 0x85, 0xa0, 0x1680, 0x2000, 0x2001, 0x2002, 0x2003, 0x2004, 0x2005,
    0x2006, 0x2007, 0x2008, 0x2009, 0x200a, 0x2028, 0x2029, 0x202f, 0x205f, 0x3000, 0xfeff];
  function dartTrim(s) {
    var start = 0, end = s.length;
    while (start < end && SPACE.indexOf(s.charCodeAt(start)) >= 0) start++;
    while (end > start && SPACE.indexOf(s.charCodeAt(end - 1)) >= 0) end--;
    return s.slice(start, end);
  }
  /* form_input.dart's looksLikeEmail: empty is fine (the field is optional). */
  var looksLikeEmail = function (e) { var t = e.trim(); return t === '' || /^[^\s@]+@[^\s@.]+(\.[^\s@.]+)+$/.test(t); };
  /* form_input.dart's formatUsPhone: ten digits (or eleven starting with 1) and no letters become (754) 364-5501. */
  function formatUsPhone(raw) {
    var digits = raw.replace(/\D/g, ''), ten = digits.length === 11 && digits.charAt(0) === '1' ? digits.slice(1) : digits;
    if (ten.length !== 10 || /[A-Za-z]/.test(raw)) return raw.trim();
    return '(' + ten.slice(0, 3) + ') ' + ten.slice(3, 6) + '-' + ten.slice(6);
  }
  var nextAt = function (data) { var t = Date.now(); return data && data.updatedAt >= t ? data.updatedAt + 1 : t; };

  // ---- the form --------------------------------------------------------------------------------------------------

  var form = $('[data-form]', main);
  var shownAt = null;   // the change time of the row the form was filled from (null: none yet)
  var dirty = false, filled = false;

  function say(which) { showOne(main, 'data-say', which || ''); }

  function fill() {
    var d = row ? row.data : {};
    FIELDS.forEach(function (f) { form.elements[f].value = d[f] == null ? '' : String(d[f]); });
    shownAt = row ? row.updated_at : null;
    dirty = false;
    filled = true;
    need();
  }

  function need() {
    var name = dartTrim(form.elements.inspectorName.value) !== '', license = dartTrim(form.elements.licenseNumber.value) !== '';
    $('[data-need-line]', form).hidden = name && license;
    showOne(form, 'data-need', !name && !license ? 'both' : !name ? 'name' : !license ? 'license' : '');
  }

  function render() {
    showOne(main, 'data-live', failing ? 'offline' : loaded ? 'live' : 'connecting');
    if (!loaded) { showOne(main, 'data-state', failing ? 'failed' : 'loading'); return; }
    showOne(main, 'data-state', '');
    form.hidden = false;
    // A change from elsewhere shows at once, unless it would land under typing.
    if (!filled || (!dirty && (row ? row.updated_at : null) !== shownAt)) fill();
    showPictures();
  }

  form.addEventListener('input', function () { dirty = true; need(); });
  form.elements.companyPhone.addEventListener('blur', function () {
    var tidy = formatUsPhone(form.elements.companyPhone.value);
    if (tidy !== form.elements.companyPhone.value) { form.elements.companyPhone.value = tidy; dirty = true; }
  });
  form.elements.companyEmail.addEventListener('blur', function () {
    showOne(form, 'data-problem', looksLikeEmail(form.elements.companyEmail.value) ? '' : 'email');
  });

  var busy = false;
  form.addEventListener('submit', function (e) {
    e.preventDefault();
    if (busy) return;
    var bad = !looksLikeEmail(form.elements.companyEmail.value);
    showOne(form, 'data-problem', bad ? 'email' : '');
    if (bad) return;
    if ((row ? row.updated_at : null) !== shownAt) {
      // Changed elsewhere since the form was filled: refused once; the next save keeps what is on screen.
      shownAt = row ? row.updated_at : null;
      say('elsewhere');
      return;
    }
    var held = row ? row.data : null, at = nextAt(held);
    var data = { id: ID, ownerAccountId: me };
    FIELDS.forEach(function (f) {
      var v = dartTrim(f === 'companyPhone' ? formatUsPhone(form.elements[f].value) : form.elements[f].value);
      data[f] = v === '' ? null : v;
    });
    data.associationNumbers = held && Array.isArray(held.associationNumbers) ? held.associationNumbers : null;
    data.secondInspectorName = held && typeof held.secondInspectorName === 'string' ? held.secondInspectorName : null;
    data.updatedAt = at;
    data.deletedAt = null;
    busy = true;
    form.querySelector('button[type="submit"]').disabled = true;
    send([{ kind: KIND, id: ID, updated_at: at, deleted_at: null, data: data }]).then(function (outcome) {
      busy = false;
      form.querySelector('button[type="submit"]').disabled = false;
      if (outcome === 'saved') { take({ kind: KIND, id: ID, updated_at: at, deleted_at: null, data: data }); fill(); }
      if (outcome === 'elsewhere') shownAt = row ? row.updated_at : null;
      say(outcome);
    });
  });

  // ---- the photo, logo and signature -------------------------------------------------------------------------------

  var section = $('[data-pics]', main), fileBox = $('[data-file]', section);
  var shown = Object.create(null);   // kind -> { sha, url } of the copy on the page
  var picBusy = false, choosing = null;
  function psay(which) { showOne(section, 'data-psay', which || ''); }
  var card = function (kind) { return $('[data-pic="' + kind + '"]', section); };
  var current = function (kind) { var r = pics[kind]; return r && r.deleted_at === null && r.data.deletedAt == null ? r : null; };
  var fileName = function (kind, data) { return me + '/' + kind + '/' + data.sha256 + '.' + (data.format === 'jpeg' ? 'jpg' : 'png'); };

  /* Lets go of the copy of [kind] on the page. */
  function drop(kind) {
    var had = shown[kind];
    if (had && had.url) URL.revokeObjectURL(had.url);
    delete shown[kind];
    var img = $('[data-img]', card(kind));
    img.hidden = true;
    img.removeAttribute('src');
  }

  /* Each picture as its row says: the copy on the page fetched again only when the picture itself changed. */
  function showPictures() {
    section.hidden = false;
    PICTURES.forEach(function (kind) {
      var r = current(kind), c = card(kind);
      showOne(c, 'data-has', r ? '1' : '0');
      $('[data-remove]', c).hidden = !r;
      if (!r) { drop(kind); return; }
      if (shown[kind] && shown[kind].sha === r.data.sha256) return;
      // A changed picture: the old copy stays on screen until the new one is here, then is let go.
      var sha = r.data.sha256, old = shown[kind] ? shown[kind].url : null;
      shown[kind] = { sha: sha, url: null };
      var settled = function () { if (old) { URL.revokeObjectURL(old); old = null; } };
      auth.picture('read', fileName(kind, r.data)).then(function (answer) {
        if (!shown[kind] || shown[kind].sha !== sha) { settled(); return; }   // changed again meanwhile
        if (!answer || answer.status !== 200 || !answer.blob) { settled(); drop(kind); psay('unread'); return; }
        var url = URL.createObjectURL(answer.blob), img = $('[data-img]', c);
        shown[kind].url = url;
        img.src = url;
        img.hidden = false;
        settled();
      }, function () { settled(); if (shown[kind] && shown[kind].sha === sha) drop(kind); psay('unread'); });
    });
  }

  function hex(buffer) {
    return [].map.call(new Uint8Array(buffer), function (b) { return (b < 16 ? '0' : '') + b.toString(16); }).join('');
  }
  function toBlob(canvas, type, quality) {
    return new Promise(function (resolve) { canvas.toBlob(resolve, type, quality); });
  }
  /* [bitmap] drawn at most [edge] pixels on its long side; [white]: on white (a JPEG keeps no transparency). */
  function drawn(bitmap, edge, white) {
    var scale = Math.min(1, edge / Math.max(bitmap.width, bitmap.height));
    var canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    var g = canvas.getContext('2d');
    if (white) { g.fillStyle = '#FFFFFF'; g.fillRect(0, 0, canvas.width, canvas.height); }
    g.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    return canvas;
  }
  /* The phone's printable copy of a chosen file (inspyx_app.dart's _changeProfileMedia): 'unreadable' when it
     isn't a picture, 'too-detailed' for a logo the report can't print even at 200 pixels. */
  function copyOf(kind, file) {
    return createImageBitmap(file).then(function (bitmap) {
      if (kind === 'headshot') return toBlob(drawn(bitmap, 600, true), 'image/jpeg', 0.85);
      // The logo: 1000 pixels, then 70% smaller each time, down to 200, until it fits the report's cap.
      var edges = [], e = 1000;
      while (true) { edges.push(e); if (e <= 200) break; e = Math.max(200, Math.floor(e * 0.7)); }
      var next = function (i) {
        return toBlob(drawn(bitmap, edges[i], false), 'image/png').then(function (blob) {
          if (blob && blob.size <= MAX_BYTES) return blob;
          if (i + 1 >= edges.length) throw new Error('too-detailed');
          return next(i + 1);
        });
      };
      return next(0);
    }, function () { throw new Error('unreadable'); });
  }

  /* Saves [blob] as [kind]: its file first, then its row, after the picture's last change. */
  function savePicture(kind, blob) {
    var format = blob.type === 'image/jpeg' ? 'jpeg' : 'png';
    return blob.arrayBuffer().then(function (buffer) {
      return crypto.subtle.digest('SHA-256', buffer).then(function (digest) {
        var sha = hex(digest), held = pics[kind] ? pics[kind].data : null, at = nextAt(held);
        var data = { id: kind, ownerAccountId: me, format: format, sha256: sha, byteLength: blob.size, updatedAt: at, deletedAt: null };
        return auth.picture('add', fileName(kind, data), blob).then(function (answer) {
          if (answer === null) { window.location.replace('/signin'); return 'failed'; }
          var there = answer.status === 200 || answer.status === 409 || answer.inner === '409';
          if (!there) return answer.status >= 500 || answer.status === 429 ? 'failed' : 'refused';
          var r = { kind: MEDIA, id: kind, updated_at: at, deleted_at: null, data: data };
          return send([r]).then(function (outcome) { if (outcome === 'saved') take(r); return outcome; });
        }, function () { return 'failed'; });
      });
    });
  }

  function removePicture(kind) {
    var held = pics[kind] ? pics[kind].data : null, at = nextAt(held);
    var data = { id: kind, ownerAccountId: me, format: null, sha256: null, byteLength: null, updatedAt: at, deletedAt: at };
    var r = { kind: MEDIA, id: kind, updated_at: at, deleted_at: at, data: data };
    return send([r]).then(function (outcome) { if (outcome === 'saved') take(r); return outcome; });
  }

  /* One change at a time; the buttons rest meanwhile, and the outcome is said. */
  function busyWith(job, done) {
    if (picBusy) return;
    picBusy = true;
    all('button', section).forEach(function (b) { b.disabled = true; });
    psay('');
    job().then(function (outcome) { return outcome; }, function (e) { return e && e.message === 'too-detailed' ? 'too-detailed' : e && e.message === 'unreadable' ? 'unreadable' : 'failed'; })
      .then(function (outcome) {
        picBusy = false;
        all('button', section).forEach(function (b) { b.disabled = false; });
        psay(outcome === 'saved' ? done : outcome);
        showPictures();
      });
  }

  PICTURES.forEach(function (kind) {
    var c = card(kind);
    $('[data-change]', c).addEventListener('click', function () {
      if (picBusy) return;
      if (kind === 'signature') { openPad(); return; }
      choosing = kind;
      fileBox.value = '';
      fileBox.click();
    });
    $('[data-remove]', c).addEventListener('click', function () {
      busyWith(function () { return removePicture(kind); }, 'removed');
    });
  });
  fileBox.addEventListener('change', function () {
    var kind = choosing, file = fileBox.files && fileBox.files[0];
    choosing = null;
    if (!kind || !file) return;
    busyWith(function () { return copyOf(kind, file).then(function (blob) { return savePicture(kind, blob); }); }, 'saved');
  });

  // ---- the signature pad: strokes drawn black, 2.5 wide, round (agreement_screens.dart's paintSignatureStrokes) --

  var sign = $('[data-sign]'), pad = $('[data-pad]', sign), strokes = [], stroke = null;
  function sized() {
    var box = pad.getBoundingClientRect(), ratio = window.devicePixelRatio || 1;
    pad.width = Math.round(box.width * ratio); pad.height = Math.round(box.height * ratio);
    paint(pad.getContext('2d'), ratio, strokes);
  }
  function paint(g, ratio, list) {
    g.setTransform(ratio, 0, 0, ratio, 0, 0);
    g.fillStyle = '#FFFFFF'; g.fillRect(0, 0, g.canvas.width / ratio, g.canvas.height / ratio);
    g.strokeStyle = '#000000'; g.fillStyle = '#000000'; g.lineWidth = 2.5; g.lineCap = 'round'; g.lineJoin = 'round';
    list.forEach(function (line) {
      if (line.length === 1) { g.beginPath(); g.arc(line[0][0], line[0][1], 1.25, 0, Math.PI * 2); g.fill(); return; }
      g.beginPath(); g.moveTo(line[0][0], line[0][1]);
      for (var i = 1; i < line.length; i++) g.lineTo(line[i][0], line[i][1]);
      g.stroke();
    });
  }
  function padState() {
    $('[data-sign-save]', sign).disabled = strokes.length === 0;
    $('[data-sign-clear]', sign).disabled = strokes.length === 0;
  }
  function openPad() {
    strokes = []; stroke = null;
    sign.showModal();
    sized();
    padState();
  }
  var at = function (e) { var box = pad.getBoundingClientRect(); return [e.clientX - box.left, e.clientY - box.top]; };
  pad.addEventListener('pointerdown', function (e) {
    e.preventDefault();
    pad.setPointerCapture(e.pointerId);
    stroke = [at(e)]; strokes.push(stroke);
    sized(); padState();
  });
  pad.addEventListener('pointermove', function (e) { if (!stroke) return; stroke.push(at(e)); sized(); });
  ['pointerup', 'pointercancel'].forEach(function (t) { pad.addEventListener(t, function () { stroke = null; }); });
  $('[data-sign-clear]', sign).addEventListener('click', function () { strokes = []; sized(); padState(); });
  $('[data-sign-cancel]', sign).addEventListener('click', function () { sign.close(); });
  $('[data-sign-save]', sign).addEventListener('click', function () {
    if (strokes.length === 0) return;
    // The PNG kept: white, three times the pad's size (agreement_screens.dart's signaturePng).
    var box = pad.getBoundingClientRect(), out = document.createElement('canvas');
    out.width = Math.ceil(box.width * 3); out.height = Math.ceil(box.height * 3);
    paint(out.getContext('2d'), 3, strokes);
    sign.close();
    busyWith(function () { return toBlob(out, 'image/png').then(function (blob) { return savePicture('signature', blob); }); }, 'saved');
  });
  window.addEventListener('pagehide', function () { PICTURES.forEach(drop); });

  // ---- start -----------------------------------------------------------------------------------------------------

  var who = auth.who();
  if (!who) { window.location.replace('/signin'); return; }
  me = who.id;
  main.hidden = false;
  render();
  pull();
  document.addEventListener('visibilitychange', function () { if (document.visibilityState === 'visible') pull(); });
  setInterval(function () { if (document.visibilityState === 'visible') pull(); }, POLL);
})();
