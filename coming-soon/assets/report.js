/* The client's report page: inspyx.com/r/ and a key.

   A client (or their agent) opens the private link their inspector sent. The page asks Inspyx for the report
   that key opens and draws it: the cover, the findings ranked, every section with its items, findings and
   photos, and a button for the PDF. No sign-in: the key is the link's only lock.

   What it is given is already the report as it reads (the "view"), made on the server from the same content
   the PDF is made from, so the two say the same thing. This file only lays it out.

   Three rules it keeps:
   - A report's words are written by inspectors. They are put on the page as text, never as markup.
   - A photo or the PDF is loaded only from Inspyx's own addresses.
   - Nothing is loaded from any other company, and nothing about the visit is sent anywhere. */
(function () {
  'use strict';

  var doc = document;
  var app = doc.getElementById('app');
  if (!app) return;

  /* A page can be told to show a sample kept beside it (the preview does this). */
  var CFG = window.INSPYX_REPORT || {};

  /* Where a report comes from: the report function, given the key in a request's body. */
  var API = 'https://btxlrfvqifnrnxffohsz.supabase.co/functions/v1/report';

  /* A link's key (2026-11-14). New links carry it after the "#" (inspyx.com/r#<key>), which a browser never
     sends to any server; links sent before carry it in the path (inspyx.com/r/<key>). Either way it is read
     once, kept for this tab only (so a reload still opens the report), and taken out of the address at once:
     it is not left in the address bar, in this tab's history or in a screenshot of it. The report function
     is asked with the key in the request's body, never in an address. */
  var KEY_PATTERN = /^[A-Za-z0-9_-]{22}$/;
  var KEPT_KEY = 'inspyx.report.key';
  var linkKey = (function () {
    if (CFG.sample) return null;
    var mark = (location.hash || '').replace(/^#/, '');
    var inPath = /^\/r\/([A-Za-z0-9_-]{22})\/?$/.exec(location.pathname);
    var key = KEY_PATTERN.test(mark) ? mark : (inPath ? inPath[1] : null);
    if (key) {
      try { sessionStorage.setItem(KEPT_KEY, key); } catch (err) { /* storage off: a reload asks for the link again */ }
      // What stays in the address: /r, and a finding's own mark (#3.1) when an old link carried one.
      var keep = KEY_PATTERN.test(mark) ? '' : (location.hash || '');
      try { history.replaceState(history.state, '', '/r' + keep); } catch (err) { /* an old browser keeps the address */ }
      return key;
    }
    if (/^\/r\/?$/.test(location.pathname)) {
      try {
        var kept = sessionStorage.getItem(KEPT_KEY);
        if (kept && KEY_PATTERN.test(kept)) return kept;
      } catch (err) { /* storage off */ }
    }
    return null;
  })();
  /* Where this page itself was loaded from. (Read from its address: a page shown inside a frame, as a
     preview is, may be given no origin of its own.) */
  var HERE = (function () { try { return new URL(location.href).origin; } catch (err) { return location.origin; } })();
  /* The only places a photo, the PDF or the pay page may come from. */
  var FILE_ORIGINS = [HERE, 'https://btxlrfvqifnrnxffohsz.supabase.co'];
  var PAY_ORIGINS = [HERE, 'https://inspyx.com', 'https://btxlrfvqifnrnxffohsz.supabase.co'];
  /* A sample's photos and PDF are kept beside the sample, wherever the page showing it keeps that. */
  if (CFG.sample) {
    try {
      var beside = new URL(CFG.sample, doc.baseURI).origin;
      if (beside !== 'null' && FILE_ORIGINS.indexOf(beside) < 0) FILE_ORIGINS.push(beside);
    } catch (err) { /* no such address: nothing is added */ }
  }
  /* The view this page knows how to draw. */
  var VIEW = 'inspyx-report-view/1';

  /* The page's own words. The report's words (headings a PDF prints too, categories, lines under an item)
     arrive with the report, or are the PDF's own, kept under PDF below. */
  var WORDS = {
    wait: 'Opening the report…',
    gone: 'This report link doesn’t work.',
    goneMore: 'Please ask your inspector for a new one.',
    failed: 'The report couldn’t be opened.',
    failedMore: 'Check your connection and try again.',
    again: 'Try again',
    plain: 'This report can’t be shown as a page yet.',
    plainMore: 'The PDF has all of it.',
    locked: 'This report opens once the inspection is paid.',
    lockedMore: 'Paid another way? Ask your inspector to open it for you.',
    pay: 'Pay now',
    sample: 'Sample report',
    pdf: 'PDF',
    pdfLong: 'Download the PDF',
    pdfNote: 'The PDF is the document of record.',
    contents: 'Contents',
    close: 'Close',
    all: 'All findings',
    tapHint: 'Tap a finding to read it in full, with its photos.',
    finding: 'Finding',
    of: 'of',
    previous: 'Previous',
    next: 'Next',
    inSection: 'See it in its section',
    photo: 'Photo',
    openPhoto: 'Open photo',
    photoGone: 'This photo couldn’t be loaded.',
    call: 'Call',
    email: 'Email',
    delivered: 'Delivered by Inspyx',
    privacy: 'Privacy',
    reportId: 'Report',
    top: 'Top of the report',
    findingsIn: { one: 'finding', many: 'findings' }
  };

  /* The PDF's own headings and labels, word for word (lib/report/pdf/report_pdf_renderer.dart and
     lib/report/report_structure.dart in the app). */
  var PDF = {
    preparedFor: 'Prepared for',
    inspectionDate: 'Inspection date:',
    inspector: 'Inspector of record',
    license: 'License number',
    associations: 'Associations',
    second: 'Second inspector:',
    client: 'Client',
    clients: 'Clients',
    agent: 'Buyer’s agent',
    agents: 'Buyer’s agents',
    glance: 'At a glance — every finding, ranked',
    photos: 'Photos',
    notInspected: 'Not inspected',
    legend: 'How findings are categorized',
    details: 'Inspection details',
    sections: 'Sections in full — every item and its findings',
    scope: 'Scope:',
    description: 'Description:',
    limitation: 'Limitation:',
    notPresent: 'Not present',
    observed: 'Observed condition',
    implication: 'Implication',
    recommended: 'Recommended action',
    trade: 'Trade:',
    whoToCall: 'Who to call — each repair and its trade, most urgent first',
    standards: 'Standards of practice and limitations',
    signature: 'Inspector signature',
    date: 'Date'
  };

  var CHIP_LABELS = { SH: 'Safety hazards', MD: 'Recommendations', MN: 'Maintenance' };
  var reduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // ---------------------------------------------------------------------------------------- building

  /* An element. Text given here always goes in as text. */
  function h(tag, props) {
    var el = doc.createElement(tag);
    var k, e;
    if (props) {
      for (k in props) {
        var v = props[k];
        if (v === null || v === undefined || v === false) continue;
        if (k === 'class') el.className = v;
        else if (k === 'text') el.textContent = v;
        else if (k === 'on') { for (e in v) el.addEventListener(e, v[e]); }
        else el.setAttribute(k, v === true ? '' : String(v));
      }
    }
    for (var i = 2; i < arguments.length; i++) add(el, arguments[i]);
    return el;
  }

  function add(el, child) {
    if (child === null || child === undefined || child === false) return;
    if (Array.isArray(child)) { child.forEach(function (c) { add(el, c); }); return; }
    el.appendChild(typeof child === 'string' ? doc.createTextNode(child) : child);
  }

  var ICONS = {
    download: 'M12 3v11m0 0l-4.5-4.5M12 14l4.5-4.5M5 19h14',
    list: 'M5 7h14M5 12h14M5 17h14',
    home: 'M4.5 11.2L12 4.6l7.5 6.6M6.6 9.8V19h10.8V9.8M10.2 19v-5h3.6v5',
    close: 'M6 6l12 12M18 6L6 18',
    left: 'M14.5 5.5L8 12l6.5 6.5',
    right: 'M9.5 5.5L16 12l-6.5 6.5',
    lock: 'M7 11V8a5 5 0 0110 0v3M6 11h12v9H6z',
    up: 'M12 19V6m0 0l-5 5m5-5l5 5'
  };

  function icon(name) {
    var ns = 'http://www.w3.org/2000/svg';
    var svg = doc.createElementNS(ns, 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('aria-hidden', 'true');
    svg.setAttribute('class', 'ic');
    var path = doc.createElementNS(ns, 'path');
    path.setAttribute('d', ICONS[name]);
    svg.appendChild(path);
    return svg;
  }

  /* An address for a photo or the PDF, or null when it is not one of Inspyx's own. */
  function ownUrl(value, origins) {
    if (typeof value !== 'string' || value === '') return null;
    var url;
    try { url = new URL(value, doc.baseURI); } catch (err) { return null; }
    if (url.protocol !== 'https:' && url.origin !== HERE) return null;
    return (origins || FILE_ORIGINS).indexOf(url.origin) < 0 ? null : url.href;
  }

  function plural(n, words) { return n + ' ' + (n === 1 ? words.one : words.many); }

  // ---------------------------------------------------------------------------------------- overlays

  /* The sheets that open over the page (a finding, a photo, the contents). Each one open is a step in the
     browser's history, so the phone's Back closes the top one instead of leaving the report. */
  var open = [];
  var historyWorks = true;
  /* A step back closes a sheet; it must not also move the page (the page may be on its way to a section). */
  try { history.scrollRestoration = 'manual'; } catch (err) { /* an old browser: it keeps its own way */ }

  function lockScroll() { doc.documentElement.classList.toggle('is-locked', open.length > 0); }

  function openOverlay(dialog, onClose) {
    var entry = { dialog: dialog, onClose: onClose, opener: openerNow() };
    open.push(entry);
    if (historyWorks) {
      try { history.pushState({ overlays: open.length }, ''); } catch (err) { historyWorks = false; }
    }
    if (typeof dialog.showModal === 'function') dialog.showModal(); else dialog.setAttribute('open', '');
    lockScroll();
  }

  /* What a sheet gives the focus back to when it closes: what was pressed to open it. Safari never focuses a
     button that is tapped or clicked (the section around it holds the focus instead), so the last thing
     pressed is kept, and taken when the focus is on it or around it. */
  var lastPressed = null;
  doc.addEventListener('click', function (e) {
    lastPressed = e.target && e.target.closest ? e.target.closest('button, a[href], [tabindex]') : null;
  }, true);
  function openerNow() {
    var focused = doc.activeElement;
    if (lastPressed && doc.contains(lastPressed) && (!focused || focused === doc.body || (focused !== lastPressed && focused.contains(lastPressed)))) {
      return lastPressed;
    }
    return focused;
  }

  function closeTop() {
    var entry = open.pop();
    if (!entry) return;
    if (entry.dialog.open) {
      if (typeof entry.dialog.close === 'function') entry.dialog.close(); else entry.dialog.removeAttribute('open');
    }
    lockScroll();
    if (entry.onClose) entry.onClose();
    if (entry.opener && doc.contains(entry.opener) && typeof entry.opener.focus === 'function') {
      entry.opener.focus({ preventScroll: true });
    }
  }

  var asked = 0;      // how many sheets a step back in the history is meant to close
  var pending = null; // what to do once they are closed

  function steppedHere() {
    return historyWorks && history.state && history.state.overlays === open.length;
  }

  function afterClosing() {
    if (!open.length && pending) { var f = pending; pending = null; f(); }
  }

  /* Steps back in the history to close n sheets. Where the step never arrives (some in-app browsers and
     frames don't deliver it) the sheets are closed directly a moment later, and from then on the history is
     left alone, so a sheet can never be stuck open. */
  var late = null;
  function stepBack(n, then) {
    asked = n;
    pending = then || null;
    clearTimeout(late);
    late = setTimeout(function () {
      if (!asked) return;
      historyWorks = false;
      var k = asked;
      asked = 0;
      while (k-- > 0 && open.length) closeTop();
      afterClosing();
    }, 600);
    try { history.go(-n); } catch (err) { /* the timer above closes them */ }
  }

  /* Asks for the top sheet to close: through the history when it took a step there. */
  function dismiss() {
    if (!open.length) return;
    if (steppedHere()) stepBack(1); else closeTop();
  }

  function closeAll(then) {
    var n = open.length;
    if (!n) { if (then) then(); return; }
    if (steppedHere()) {
      stepBack(n, then);
    } else {
      while (open.length) closeTop();
      if (then) then();
    }
  }

  window.addEventListener('popstate', function () {
    var want = (history.state && history.state.overlays) || 0;
    // A step back that was asked for closes what it was asked to, whatever the step it lands on says.
    if (asked) { want = Math.min(want, Math.max(0, open.length - asked)); asked = 0; clearTimeout(late); }
    while (open.length > want) closeTop();
    afterClosing();
  });

  function dialogOf(cls, label) {
    var d = h('dialog', { class: cls, 'aria-label': label });
    // Esc, and a tap on the dimmed ground around a sheet, close it the same way the button does.
    d.addEventListener('cancel', function (e) { e.preventDefault(); dismiss(); });
    d.addEventListener('click', function (e) { if (e.target === d) dismiss(); });
    doc.body.appendChild(d);
    return d;
  }

  function closeButton(label) {
    return h('button', { class: 'ibtn', type: 'button', 'aria-label': label || WORDS.close, on: { click: dismiss } }, icon('close'));
  }

  // ---------------------------------------------------------------------------------------- photos

  var files = {};

  function fileOf(sha) {
    var f = files[sha];
    if (!f) return null;
    var full = ownUrl(f.url);
    if (!full) return null;
    return { full: full, small: ownUrl(f.thumb) || full, w: f.w > 0 ? f.w : 0, h: f.h > 0 ? f.h : 0 };
  }

  /* Marks a picture with the file it shows and at which size, so it can be given a new address later. */
  function shows(img, sha, size) {
    img.setAttribute('data-file', sha);
    img.setAttribute('data-size', size);
    return img;
  }

  /* The addresses of the pictures and the PDF stop working two hours after the report was fetched. A page
     left open is given new ones before that matters: when its reader comes back to it, or when a picture
     fails to load, the report is asked for again and only the addresses are taken from the answer. */
  var FRESH_MS = 90 * 60 * 1000;
  var fetchedAt = 0;
  var freshening = false;
  var lastTry = 0;
  var onceFresh = [];

  function stale() { return fetchedAt > 0 && Date.now() - fetchedAt > FRESH_MS; }

  /* Asks for new addresses (once a minute at most). [then] runs when they are in. Answers whether new
     addresses are on their way. */
  function freshen(then) {
    var src = source();
    if (freshening) { if (then) onceFresh.push(then); return true; }
    if (!src || Date.now() - lastTry < 60 * 1000) return false;
    freshening = true;
    lastTry = Date.now();
    onceFresh = then ? [then] : [];
    fetch(src.url, howToAsk(src))
      .then(function (res) { return res.ok ? res.json() : null; })
      .then(function (answer) {
        if (!answer || answer.state !== 'open' || !answer.files) return;
        files = answer.files;
        fetchedAt = Date.now();
        // A picture already on the screen stays as it is. One not loaded yet, or that failed, is asked for
        // again at its new address.
        Array.prototype.forEach.call(doc.querySelectorAll('img[data-file]'), function (img) {
          if (img.complete && img.naturalWidth > 0) return;
          var f = fileOf(img.getAttribute('data-file'));
          if (!f) return;
          var next = img.getAttribute('data-size') === 'full' ? f.full : f.small;
          if (img.getAttribute('src') === next) return;
          var tile = img.closest ? img.closest('.ph-missing') : null;
          if (tile) tile.classList.remove('ph-missing');
          img.src = next;
        });
        var pdf = answer.pdf ? ownUrl(answer.pdf.url) : null;
        if (pdf) Array.prototype.forEach.call(doc.querySelectorAll('a[data-pdf]'), function (a) { a.href = pdf; });
        var waiting = onceFresh;
        onceFresh = [];
        freshening = false;
        waiting.forEach(function (f) { f(); });
      })
      .catch(function () { /* the old addresses stay; the next return to the page tries again */ })
      .then(function () { freshening = false; onceFresh = []; });
    return true;
  }

  doc.addEventListener('visibilitychange', function () { if (!doc.hidden && stale()) freshen(); });
  window.addEventListener('pageshow', function () { if (stale()) freshen(); });
  // A picture that fails once its address is old: new addresses, and it is tried again.
  doc.addEventListener('error', function (e) {
    var t = e.target;
    if (t && t.tagName === 'IMG' && t.hasAttribute && t.hasAttribute('data-file') && stale()) freshen();
  }, true);
  // The PDF, asked for with an old address: a new one first, then the download.
  doc.addEventListener('click', function (e) {
    var a = e.target && e.target.closest ? e.target.closest('a[data-pdf]') : null;
    if (!a || !stale()) return;
    if (freshen(function () { a.click(); })) e.preventDefault();
  }, true);

  var viewer = null;

  function showPhoto(list, index) {
    if (!viewer) viewer = buildViewer();
    viewer.show(list, index);
  }

  function buildViewer() {
    var d = dialogOf('viewer', WORDS.photo);
    var count = h('p', { class: 'viewer-n', 'aria-live': 'polite' });
    var img = h('img', { class: 'viewer-img', alt: '' });
    var missing = h('p', { class: 'viewer-missing', hidden: true }, WORDS.photoGone);
    var caption = h('p', { class: 'viewer-cap' });
    var prev = h('button', { class: 'ibtn viewer-prev', type: 'button', 'aria-label': WORDS.previous }, icon('left'));
    var next = h('button', { class: 'ibtn viewer-next', type: 'button', 'aria-label': WORDS.next }, icon('right'));
    var stage = h('div', { class: 'viewer-stage' }, img, missing);
    add(d, [
      h('div', { class: 'viewer-bar' }, count, closeButton()),
      stage,
      h('div', { class: 'viewer-foot' }, prev, caption, next)
    ]);
    var list = [];
    var at = 0;

    function draw() {
      var p = list[at];
      var f = fileOf(p.file);
      count.textContent = WORDS.photo + ' ' + (at + 1) + ' ' + WORDS.of + ' ' + list.length;
      caption.textContent = p.caption || '';
      img.hidden = !f;
      missing.hidden = !!f;
      if (f) {
        img.alt = p.caption || (WORDS.photo + ' ' + (at + 1));
        shows(img, p.file, 'full').src = f.full;
      } else {
        img.removeAttribute('src');
        img.removeAttribute('data-file');
      }
      prev.disabled = at === 0;
      next.disabled = at === list.length - 1;
      prev.hidden = next.hidden = list.length < 2;
      // The next photo is fetched ahead, so stepping on is quick.
      var ahead = list[at + 1] && fileOf(list[at + 1].file);
      if (ahead) { var pre = new Image(); pre.src = ahead.full; }
    }

    function step(by) {
      var to = at + by;
      if (to < 0 || to >= list.length) return;
      at = to;
      draw();
    }

    img.addEventListener('error', function () { img.hidden = true; missing.hidden = false; });
    prev.addEventListener('click', function () { step(-1); });
    next.addEventListener('click', function () { step(1); });
    d.addEventListener('keydown', function (e) {
      if (e.key === 'ArrowLeft') { step(-1); e.preventDefault(); }
      if (e.key === 'ArrowRight') { step(1); e.preventDefault(); }
    });
    // A sideways swipe steps through the photos; a tap on the dark ground beside one closes it.
    var x0 = null, y0 = null;
    stage.addEventListener('touchstart', function (e) {
      if (e.touches.length === 1) { x0 = e.touches[0].clientX; y0 = e.touches[0].clientY; } else { x0 = null; }
    }, { passive: true });
    stage.addEventListener('touchend', function (e) {
      if (x0 === null) return;
      var t = e.changedTouches[0];
      var dx = t.clientX - x0, dy = t.clientY - y0;
      x0 = null;
      if (Math.abs(dx) > 48 && Math.abs(dx) > Math.abs(dy) * 1.5) step(dx < 0 ? 1 : -1);
    }, { passive: true });
    stage.addEventListener('click', function (e) { if (e.target === stage) dismiss(); });

    return {
      show: function (photos, index) {
        list = photos;
        at = index;
        draw();
        openOverlay(d, function () { img.removeAttribute('src'); });
      }
    };
  }

  /* A row of photos: each a button that opens it full screen. */
  function gallery(photos, big) {
    if (!photos || !photos.length) return null;
    var wrap = h('div', { class: 'photos' + (big ? ' photos-big' : '') + (photos.length === 1 ? ' photos-one' : '') });
    photos.forEach(function (p, i) {
      var f = fileOf(p.file);
      var label = WORDS.openPhoto + ' ' + (i + 1) + ' ' + WORDS.of + ' ' + photos.length + (p.caption ? ': ' + p.caption : '');
      var btn = h('button', { class: 'ph', type: 'button', 'aria-label': label, on: { click: function () { showPhoto(photos, i); } } });
      if (f) {
        var img = shows(h('img', { alt: '', loading: 'lazy', decoding: 'async', src: big ? f.full : f.small }), p.file, big ? 'full' : 'small');
        if (f.w && f.h) {
          img.setAttribute('width', f.w);
          img.setAttribute('height', f.h);
          // A tall photo is shown whole in its tile; a wide one fills it. Opened, every photo is whole.
          if (f.w / f.h < 1.2) btn.classList.add('ph-tall');
          // Alone, or opened in a finding, a photo keeps its own shape: the stylesheet sizes the tile from this number.
          if (big || photos.length === 1) btn.style.setProperty('--ar', (f.w / f.h).toFixed(4));
        }
        img.addEventListener('error', function () { btn.classList.add('ph-missing'); });
        btn.appendChild(img);
      } else {
        btn.classList.add('ph-missing');
      }
      var fig = h('figure', { class: 'fig' }, btn, p.caption ? h('figcaption', { text: p.caption }) : null);
      wrap.appendChild(fig);
    });
    return wrap;
  }

  // ---------------------------------------------------------------------------------------- pieces

  function pill(report, code, small) {
    var row = null;
    report.legend.rows.forEach(function (r) { if (r.code === code) row = r; });
    return h('span', { class: 'pill cat-' + code + (small ? ' pill-s' : '') }, row ? row.label : code);
  }

  function field(label, text) {
    if (!text || !String(text).trim()) return null;
    return [h('h6', { class: 'eyebrow' }, label), h('p', { class: 'prose' }, text)];
  }

  /* A finding in full: what the PDF's card holds, under the PDF's labels (OBSERVED, WHY IT MATTERS, WHAT TO
     DO, WHO TO CALL). */
  function findingBody(report, f, big) {
    var L = report.card_labels;
    return h('div', { class: 'card-b' },
      field(L.observed, f.observed),
      field(L.why, f.implication),
      field(L.what, f.recommendation),
      f.trade ? field(L.who, f.trade) : null,
      gallery(f.photos, big)
    );
  }

  function findingCard(report, f) {
    return h('article', { class: 'card cat-' + f.category, id: 'f-' + f.id, tabindex: '-1', 'data-finding-card': f.id },
      h('header', { class: 'card-h' },
        pill(report, f.category),
        h('h5', { class: 'card-t' }, h('span', { class: 'fid' }, f.number), ' ', f.title),
        f.place ? h('p', { class: 'card-place' }, f.place) : null
      ),
      findingBody(report, f, false)
    );
  }

  function line(l) {
    if (l.kind === 'information') {
      return h('div', { class: 'kv' }, h('dt', null, l.label), h('dd', { class: 'prose' }, l.text));
    }
    if (l.kind === 'limitation') {
      return h('p', { class: 'ln prose' }, h('span', { class: 'ln-k' }, PDF.limitation), ' ', l.text);
    }
    if (l.kind === 'not_inspected') {
      return h('p', { class: 'ln prose' },
        h('span', { class: 'pill pill-s cat-NI' }, PDF.notInspected),
        l.reason ? ' ' + l.reason : '',
        l.note ? h('span', { class: 'ln-note' }, l.note) : null
      );
    }
    if (l.kind === 'not_present') return h('p', { class: 'ln' }, h('span', { class: 'pill pill-s cat-NP' }, PDF.notPresent));
    return h('p', { class: 'ln ln-ok' }, l.text);
  }

  /* An item as the PDF prints it in its chapter: its name ("Kitchen, Sink") over its own lines and photos,
     then its findings' cards. Its status goes to the chapter's closing blocks. */
  function itemBlock(report, item) {
    var own = item.lines2.length > 0 || item.photos.length > 0;
    return h('div', { class: 'item' },
      own ? h('h4', { class: 'item-t' }, item.heading) : null,
      item.lines2.map(function (text) { return h('p', { class: 'ln prose' }, text); }),
      gallery(item.photos, false),
      item.findings.map(function (f) { return findingCard(report, f); })
    );
  }

  /* A chapter's closing blocks, as the PDF prints them: not inspected (each item and why), then partially
     inspected, inspected with no deficiencies, and not present, each room's items as one line. */
  function statusBlocks(report, s) {
    var L = report.status_labels;
    var out = [];
    if (s.status.not_inspected.length) {
      out.push(h('div', { class: 'status cat-NI' },
        h('h6', { class: 'eyebrow' }, L.not_inspected),
        s.status.not_inspected.map(function (n) {
          return h('div', { class: 'status-i' }, h('p', { class: 'item-t' }, n.item), n.reason ? h('p', { class: 'prose' }, n.reason) : null);
        })));
    }
    [['partial', 'status-partial'], ['clean', 'status-clean'], ['not_present', 'status-np']].forEach(function (k) {
      var lines = s.status[k[0]];
      if (!lines.length) return;
      out.push(h('div', { class: 'status ' + k[1] },
        h('h6', { class: 'eyebrow' }, L[k[0]]),
        lines.map(function (text) {
          var cut = text.indexOf(': ');
          return cut > 0
            ? h('p', { class: 'prose' }, h('strong', null, text.substring(0, cut + 2)), text.substring(cut + 2))
            : h('p', { class: 'prose' }, text);
        })));
    });
    return out;
  }

  function sectionBlock(report, s) {
    var counts = ['SH', 'MD', 'MN', 'NT'].filter(function (c) { return s.counts[c] > 0; }).map(function (c) {
      var label = '';
      report.legend.rows.forEach(function (r) { if (r.code === c) label = r.label; });
      return h('span', { class: 'pill pill-s cat-' + c }, s.counts[c] + ' ' + label);
    });
    return h('section', { class: 'sec', id: 's-' + s.id, tabindex: '-1', 'data-section': s.id },
      h('h3', { class: 'sec-t' }, h('span', { class: 'sec-id' }, s.number), ' ', s.name),
      counts.length ? h('p', { class: 'sec-counts' }, counts) : null,
      s.not_inspected ? h('p', { class: 'sec-note' }, PDF.notInspected + ': ' + s.not_inspected) : null,
      s.scope ? h('p', { class: 'sec-meta' }, PDF.scope + ' ' + s.scope) : null,
      s.description ? h('p', { class: 'sec-meta' }, s.description) : null,
      s.items.map(function (item) { return itemBlock(report, item); }),
      statusBlocks(report, s),
      s.nothing_recorded ? h('p', { class: 'prose' }, s.nothing_recorded) : null
    );
  }

  function person(name, lines) {
    return h('div', { class: 'who' }, name ? h('p', { class: 'who-n' }, name) : null, lines);
  }

  function contactLinks(phone, email) {
    var out = [];
    if (phone) {
      var digits = phone.replace(/[^0-9+]/g, '');
      out.push(digits.length >= 7
        ? h('a', { href: 'tel:' + digits, 'aria-label': WORDS.call + ' ' + phone }, phone)
        : h('span', null, phone));
    }
    if (email) {
      out.push(/^[^@\s<>"']+@[^@\s<>"']+$/.test(email)
        ? h('a', { href: 'mailto:' + email, 'aria-label': WORDS.email + ' ' + email }, email)
        : h('span', null, email));
    }
    return out.length ? h('p', { class: 'who-c' }, out) : null;
  }

  function initials(name) {
    var parts = String(name || '').trim().split(/\s+/).filter(Boolean);
    if (!parts.length) return '';
    return (parts[0][0] + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase();
  }

  function coverBlock(report, sample) {
    var c = report.cover;
    var photo = c.photo ? fileOf(c.photo) : null;
    var insp = c.inspector;
    var face = insp.photo ? fileOf(insp.photo) : null;
    var logo = c.logo ? fileOf(c.logo) : null;
    var sub = [c.locality, c.prepared_for ? PDF.preparedFor + ' ' + c.prepared_for : ''].filter(Boolean).join(' · ');
    var hero = null;
    if (photo) {
      var img = shows(h('img', { class: 'hero-img', alt: 'The property', src: photo.full, decoding: 'async', fetchpriority: 'high' }), c.photo, 'full');
      if (photo.w && photo.h) { img.setAttribute('width', photo.w); img.setAttribute('height', photo.h); }
      hero = h('button', { class: 'hero', type: 'button', 'aria-label': WORDS.openPhoto, on: { click: function () { showPhoto([{ file: c.photo, caption: [c.address, c.locality].filter(Boolean).join(', ') }], 0); } } }, img);
    }
    return h('header', { class: 'cover', id: 'top' },
      hero,
      h('div', { class: 'cover-in' },
        logo ? shows(h('img', { class: 'cover-logo', alt: insp.company || '', src: logo.full }), c.logo, 'full') : null,
        h('p', { class: 'kicker' }, report.title, sample ? h('span', { class: 'tag' }, WORDS.sample) : null),
        h('h1', { class: 'addr' }, c.address || report.title),
        sub ? h('p', { class: 'cover-sub' }, sub) : null,
        c.inspected ? h('p', { class: 'cover-sub' }, PDF.inspectionDate + ' ' + c.inspected) : null,
        h('div', { class: 'people' },
          h('div', { class: 'pcard pcard-main' },
            face ? shows(h('img', { class: 'face', alt: '', src: face.small }), insp.photo, 'small') : h('span', { class: 'face face-i', 'aria-hidden': 'true' }, initials(insp.name)),
            h('div', { class: 'pcard-b' },
              h('p', { class: 'eyebrow' }, PDF.inspector),
              insp.name ? h('p', { class: 'who-n' }, insp.name) : null,
              insp.license ? h('p', { class: 'who-l' }, PDF.license + ': ' + insp.license) : null,
              insp.associations && insp.associations.length ? h('p', { class: 'who-l' }, PDF.associations + ': ' + insp.associations.join(', ')) : null,
              insp.second ? h('p', { class: 'who-l' }, PDF.second + ' ' + insp.second) : null,
              insp.company ? h('p', { class: 'who-l' }, insp.company) : null,
              contactLinks(insp.phone, insp.email)
            )
          ),
          c.clients.length ? h('div', { class: 'pcard' },
            h('p', { class: 'eyebrow' }, c.clients.length === 1 ? PDF.client : PDF.clients),
            c.clients.map(function (n) { return h('p', { class: 'who-n' }, n); })
          ) : null,
          c.agents.length ? h('div', { class: 'pcard' },
            h('p', { class: 'eyebrow' }, c.agents.length === 1 ? PDF.agent : PDF.agents),
            c.agents.map(function (a) { return person(a.name, contactLinks(a.phone, a.email)); })
          ) : null
        )
      )
    );
  }

  // ---------------------------------------------------------------------------------------- the report

  function renderOpen(answer) {
    var report = answer.report;
    files = answer.files || {};
    fetchedAt = Date.now();
    var pdfUrl = answer.pdf ? ownUrl(answer.pdf.url) : null;
    var pdfName = (answer.pdf && answer.pdf.name) || report.pdf_name || 'Inspection Report.pdf';

    /* Every finding by its number, and the reading order: most urgent first, then the rest as the report
       has them. */
    var byId = {};
    var ranked = [];
    /* Where each finding is in the whole report, as "At a glance" says it. */
    var placeOf = {};
    report.glance2.groups.forEach(function (g) { g.rows.forEach(function (r) { placeOf[r.id] = r.place; }); });
    var hasDetails = report.details.rows.length > 0 || !!report.details.property;
    report.sections.forEach(function (s) {
      s.items.forEach(function (item) { item.findings.forEach(function (f) { byId[f.id] = f; }); });
    });
    report.glance2.groups.forEach(function (g) { g.rows.forEach(function (r) { if (byId[r.id]) ranked.push(r.id); }); });
    Object.keys(byId).forEach(function (id) { if (ranked.indexOf(id) < 0) ranked.push(id); });

    function pdfButton(cls, long) {
      if (!pdfUrl) return null;
      return h('a', { class: cls, href: pdfUrl, download: pdfName, 'data-pdf': true, 'aria-label': WORDS.pdfLong },
        icon('download'), h('span', null, long ? WORDS.pdfLong : WORDS.pdf));
    }

    function goTo(id) {
      var el = doc.getElementById(id);
      if (!el) return;
      el.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: 'start' });
      el.focus({ preventScroll: true });
    }

    // ---- the contents: a sheet on a phone, a column on a wide screen
    function contentsList(onPick) {
      function entry(target, label, extra, cls) {
        return h('li', { class: cls || '' },
          h('a', { href: '#' + target, 'data-goto': target, on: { click: function (e) { e.preventDefault(); onPick(target); } } },
            h('span', { class: 'toc-l' }, label), extra || null));
      }
      var H = report.headings;
      var list = h('ol', { class: 'toc' });
      add(list, entry('glance', H.glance));
      add(list, entry('legend', H.legend));
      if (hasDetails) add(list, entry('details', H.details));
      report.sections.forEach(function (s) {
        var n = s.counts.SH + s.counts.MD + s.counts.MN + s.counts.NT;
        var worst = s.counts.SH ? 'SH' : s.counts.MD ? 'MD' : s.counts.MN ? 'MN' : s.counts.NT ? 'NT' : '';
        add(list, entry('s-' + s.id, s.number + '  ' + s.name,
          n ? h('span', { class: 'toc-n cat-' + worst, 'aria-label': plural(n, WORDS.findingsIn) }, String(n)) : null, 'toc-sub'));
      });
      if (report.who_to_call2.length) add(list, entry('call', H.who_to_call));
      add(list, entry('standards', H.standards));
      return list;
    }

    var tocDialog = null;
    function openContents() {
      if (!tocDialog) {
        tocDialog = dialogOf('sheet sheet-toc', WORDS.contents);
        add(tocDialog, [
          h('div', { class: 'sheet-bar' }, h('h2', { class: 'sheet-t' }, WORDS.contents), closeButton()),
          h('div', { class: 'sheet-in' }, contentsList(function (target) { closeAll(function () { goTo(target); }); }))
        ]);
      }
      openOverlay(tocDialog);
    }

    // ---- a finding in full, over the page
    var sheet = null;
    function openFinding(id, order) {
      if (!byId[id]) return;
      if (!sheet) sheet = buildFindingSheet();
      sheet.show(id, order && order.indexOf(id) >= 0 ? order : ranked);
    }

    function buildFindingSheet() {
      var d = dialogOf('sheet sheet-finding', WORDS.finding);
      var count = h('p', { class: 'sheet-n', 'aria-live': 'polite' });
      var prev = h('button', { class: 'ibtn', type: 'button', 'aria-label': WORDS.previous + ' ' + WORDS.finding.toLowerCase() }, icon('left'));
      var next = h('button', { class: 'ibtn', type: 'button', 'aria-label': WORDS.next + ' ' + WORDS.finding.toLowerCase() }, icon('right'));
      var body = h('div', { class: 'sheet-in' });
      add(d, [h('div', { class: 'sheet-bar' }, count, h('span', { class: 'sheet-nav' }, prev, next), closeButton()), body]);
      var order = ranked;
      var at = 0;

      function draw() {
        var f = byId[order[at]];
        count.textContent = WORDS.finding + ' ' + (at + 1) + ' ' + WORDS.of + ' ' + order.length;
        prev.disabled = at === 0;
        next.disabled = at === order.length - 1;
        body.textContent = '';
        add(body, [
          h('div', { class: 'fhead cat-' + f.category },
            pill(report, f.category),
            h('h2', { class: 'fhead-t' }, h('span', { class: 'fid' }, f.number), ' ', f.title),
            placeOf[f.id] ? h('p', { class: 'crumb' }, placeOf[f.id]) : null
          ),
          findingBody(report, f, true),
          h('p', { class: 'sheet-more' },
            h('button', { class: 'link', type: 'button', on: { click: function () { closeAll(function () { goTo('f-' + f.id); flash('f-' + f.id); }); } } }, WORDS.inSection))
        ]);
        body.scrollTop = 0;
      }

      function step(by) {
        var to = at + by;
        if (to < 0 || to >= order.length) return;
        at = to;
        draw();
      }

      prev.addEventListener('click', function () { step(-1); });
      next.addEventListener('click', function () { step(1); });
      d.addEventListener('keydown', function (e) {
        if (open.length && open[open.length - 1].dialog !== d) return;
        if (e.key === 'ArrowLeft') { step(-1); e.preventDefault(); }
        if (e.key === 'ArrowRight') { step(1); e.preventDefault(); }
      });

      return {
        show: function (id, list) {
          order = list;
          at = Math.max(0, order.indexOf(id));
          draw();
          openOverlay(d);
        }
      };
    }

    function flash(id) {
      var el = doc.getElementById(id);
      if (!el) return;
      el.classList.remove('is-flash');
      void el.offsetWidth;
      el.classList.add('is-flash');
    }

    // ---- at a glance
    var filter = 'all';
    var glanceList = h('div', { class: 'glance-list' });
    var chips = h('div', { class: 'chips', role: 'group', 'aria-label': WORDS.all });

    function visibleOrder() {
      var ids = [];
      report.glance2.groups.forEach(function (g) {
        if (filter === 'all' || filter === g.code) g.rows.forEach(function (r) { ids.push(r.id); });
      });
      return ids;
    }

    function drawGlance() {
      chips.textContent = '';
      var options = [['all', WORDS.all]].concat(report.glance2.groups.map(function (g) {
        return [g.code, (CHIP_LABELS[g.code] || labelOf(g.code)) + ' (' + g.rows.length + ')'];
      }));
      options.forEach(function (o) {
        chips.appendChild(h('button', {
          class: 'chip' + (o[0] !== 'all' ? ' cat-' + o[0] : ''), type: 'button', 'aria-pressed': filter === o[0] ? 'true' : 'false',
          'data-filter': o[0], on: { click: function () { filter = o[0]; drawGlance(); } }
        }, o[1]));
      });
      glanceList.textContent = '';
      report.glance2.groups.forEach(function (g) {
        if (filter !== 'all' && filter !== g.code) return;
        var rows = h('ul', { class: 'rows' });
        g.rows.forEach(function (r) {
          var f = r.photo ? fileOf(r.photo) : null;
          var thumb = f
            ? shows(h('img', { class: 'row-ph', alt: '', loading: 'lazy', decoding: 'async', src: f.small }), r.photo, 'small')
            : h('span', { class: 'row-ph row-letter cat-' + g.code, 'aria-hidden': 'true' }, labelOf(g.code).charAt(0));
          rows.appendChild(h('li', null,
            h('button', { class: 'row', type: 'button', 'data-finding': r.id, on: { click: function () { openFinding(r.id, visibleOrder()); } } },
              thumb,
              h('span', { class: 'row-b' },
                pill(report, g.code, true),
                h('span', { class: 'row-t' }, h('span', { class: 'fid' }, r.number), ' ', r.title),
                r.place ? h('span', { class: 'crumb' }, r.place) : null
              ),
              icon('right')
            )));
        });
        add(glanceList, [h('h3', { class: 'group-t cat-' + g.code }, g.head), rows]);
      });
    }

    function labelOf(code) {
      var label = code;
      report.legend.rows.forEach(function (r) { if (r.code === code) label = r.label; });
      return label;
    }

    function tile(n, label, cls) {
      return h('div', { class: 'tile ' + (cls || '') }, h('span', { class: 'tile-n' }, String(n)), h('span', { class: 'tile-l' }, label));
    }

    var c = report.counts;
    var G = report.glance2;
    var glance = h('section', { class: 'part', id: 'glance', tabindex: '-1' },
      h('h2', { class: 'part-t' }, report.headings.glance),
      h('p', { class: 'lead' }, G.lead),
      h('div', { class: 'tiles' },
        tile(c.SH, labelOf('SH'), 'cat-SH'), tile(c.MD, labelOf('MD'), 'cat-MD'),
        tile(c.MN, labelOf('MN'), 'cat-MN'), tile(c.NT, labelOf('NT'), 'cat-NT'),
        tile(c.photos, PDF.photos, ''), tile(c.not_inspected, PDF.notInspected, 'cat-NI')
      ),
      G.none ? h('p', { class: 'none' }, G.none) : null,
      G.groups.length ? [chips, h('p', { class: 'hint' }, WORDS.tapHint), glanceList] : null,
      G.not_inspected ? [
        h('h3', { class: 'group-t cat-NI' }, G.not_inspected.head),
        h('ul', { class: 'ni' }, G.not_inspected.rows.map(function (n) {
          return h('li', null,
            h('a', { class: 'ni-t', href: '#s-' + n.section, on: { click: function (e) { e.preventDefault(); goTo('s-' + n.section); } } },
              h('span', { class: 'fid' }, n.number), ' ', n.title),
            h('span', { class: 'ni-r' }, [n.place, n.reason].filter(Boolean).join(' · ')));
        }))
      ] : null
    );
    if (G.groups.length) drawGlance();

    // ---- in this report: the chapters, numbered (the PDF's contents)
    var contents = h('section', { class: 'part', id: 'contents', tabindex: '-1' },
      h('h2', { class: 'part-t' }, report.headings.contents),
      h('ol', { class: 'toc toc-doc' }, report.contents.map(function (e) {
        return h('li', null, h('a', { href: '#s-' + e.id, on: { click: function (ev) { ev.preventDefault(); goTo('s-' + e.id); } } },
          h('span', { class: 'fid' }, e.number), ' ', e.name));
      }))
    );

    // ---- the rest of the report
    var d = report.details;
    /* The PDF prints its details only when there are some. */
    var details = !hasDetails ? null : h('section', { class: 'part', id: 'details', tabindex: '-1' },
      h('h2', { class: 'part-t' }, report.headings.details),
      d.rows.length
        ? h('dl', { class: 'kvs kvs-wide' }, d.rows.map(function (r) { return h('div', { class: 'kv' }, h('dt', null, r[0]), h('dd', { class: 'prose' }, r[1])); }))
        : null,
      d.property ? [
        h('h3', { class: 'sub-t' }, d.property.heading),
        d.property.groups.map(function (g) {
          return [h('h4', { class: 'item-t' }, g.title),
            h('dl', { class: 'kvs kvs-wide' }, g.rows.map(function (r) { return h('div', { class: 'kv' }, h('dt', null, r[0]), h('dd', { class: 'prose' }, r[1])); }))];
        }),
        h('p', { class: 'fine' }, d.property.note)
      ] : null
    );

    /* The chapters follow one another, as in the PDF, with no heading of their own over them. */
    var sections = h('section', { class: 'part', id: 'sections', tabindex: '-1' },
      report.sections.map(function (s) { return sectionBlock(report, s); })
    );

    /* Who to call: each trade once, the most urgent first, with the findings it is called for. */
    var callOrder = [];
    report.who_to_call2.forEach(function (g) { g.findings.forEach(function (x) { callOrder.push(x.id); }); });
    var call = report.who_to_call2.length ? h('section', { class: 'part', id: 'call', tabindex: '-1' },
      h('h2', { class: 'part-t' }, report.headings.who_to_call),
      report.who_to_call2.map(function (g) {
        return h('div', { class: 'call-g' },
          h('h3', { class: 'sub-t' }, g.head),
          h('ul', { class: 'calls' }, g.findings.map(function (x) {
            return h('li', null,
              h('button', { class: 'call', type: 'button', 'data-finding': x.id, on: { click: function () { openFinding(x.id, callOrder); } } },
                byId[x.id] ? pill(report, byId[x.id].category, true) : null,
                h('span', { class: 'call-t' }, x.text)));
          })));
      })
    ) : null;

    var legend = h('section', { class: 'part', id: 'legend', tabindex: '-1' },
      h('h2', { class: 'part-t' }, report.headings.legend),
      h('dl', { class: 'legend' }, report.legend2.rows.map(function (r) {
        return h('div', { class: 'legend-r' }, h('dt', null, h('span', { class: 'pill cat-' + r.code }, r.label)), h('dd', null, r.definition));
      })),
      report.legend2.numbers ? h('p', { class: 'fine' }, report.legend2.numbers) : null
    );

    var sig = report.signature;
    var sigFile = sig.image ? fileOf(sig.image) : null;
    var standards = h('section', { class: 'part', id: 'standards', tabindex: '-1' },
      h('h2', { class: 'part-t' }, report.headings.standards),
      h('p', { class: 'prose' }, report.standards),
      /* The inspector's own notices, in his words, as text (never markup), paragraphs as he wrote them. */
      (report.notices || []).map(function (n) {
        return h('div', { class: 'notice' }, h('h3', { class: 'sub-t' }, n.heading),
          n.text.split(/\n+/).filter(function (t) { return t.trim(); }).map(function (t) { return h('p', { class: 'prose' }, t); }));
      }),
      h('div', { class: 'sig' },
        sigFile ? shows(h('img', { class: 'sig-img', alt: PDF.signature, src: sigFile.full }), sig.image, 'full') : null,
        sig.name ? h('p', null, PDF.signature + ': ' + sig.name) : null,
        sig.license ? h('p', null, PDF.license + ': ' + sig.license) : null,
        sig.date ? h('p', null, PDF.date + ': ' + sig.date) : null
      )
    );

    var end = pdfUrl ? h('section', { class: 'part end' },
      pdfButton('btn btn-wide', true),
      h('p', { class: 'fine' }, WORDS.pdfNote)
    ) : null;

    var company = report.cover.inspector.company || report.cover.inspector.name || report.title;
    var barLogo = report.cover.logo ? fileOf(report.cover.logo) : null;
    var bar = h('div', { class: 'bar' },
      h('div', { class: 'bar-in' },
        /* The company's own logo when the report has one; a small house on the company's colour when it has none. */
        h('p', { class: 'bar-t' },
          barLogo ? shows(h('img', { class: 'bar-mark bar-logo', alt: '', src: barLogo.small }), report.cover.logo, 'small') : h('span', { class: 'bar-mark', 'aria-hidden': 'true' }, icon('home')),
          h('span', { class: 'bar-co' }, company)),
        /* Two quiet buttons of one kind. The full "Download the PDF" button stands at the end of the report. */
        pdfButton('btn btn-ghost bar-pdf', false),
        h('button', { class: 'btn btn-ghost bar-toc', type: 'button', on: { click: openContents } }, icon('list'), h('span', null, WORDS.contents))
      )
    );

    var side = h('nav', { class: 'side', 'aria-label': WORDS.contents },
      h('p', { class: 'side-t' }, report.cover.address || report.title),
      contentsList(function (target) { goTo(target); }),
      pdfButton('btn btn-wide', true)
    );

    var foot = h('footer', { class: 'foot' },
      h('p', null, [report.cover.address, WORDS.reportId + ' ' + (report.report_number || report.report_id)].filter(Boolean).join(' · ')),
      h('p', null, WORDS.delivered, ' · ', h('a', { href: 'https://inspyx.com/privacy', rel: 'noopener' }, WORDS.privacy))
    );

    app.textContent = '';
    add(app, [
      bar,
      h('div', { class: 'shell' },
        side,
        h('main', { class: 'doc', id: 'report', tabindex: '-1' }, coverBlock(report, answer.sample === true), glance, contents, legend, details, sections, call, standards, end)
      ),
      foot
    ]);
    app.removeAttribute('aria-busy');
    doc.title = [report.cover.address, report.title].filter(Boolean).join(' · ');

    // On a wide screen the contents mark the section being read.
    if ('IntersectionObserver' in window) {
      var links = {};
      Array.prototype.forEach.call(side.querySelectorAll('[data-goto]'), function (a) { links[a.getAttribute('data-goto')] = a; });
      var seen = new IntersectionObserver(function (entries) {
        entries.forEach(function (en) {
          if (!en.isIntersecting) return;
          Object.keys(links).forEach(function (k) { links[k].removeAttribute('aria-current'); });
          var a = links[en.target.id];
          if (a) a.setAttribute('aria-current', 'true');
        });
      }, { rootMargin: '-15% 0px -70% 0px' });
      Object.keys(links).forEach(function (k) { var el = doc.getElementById(k); if (el) seen.observe(el); });
    }

    // A link straight to one finding: inspyx.com/r/<key>#C6.2 opens it (the address then reads /r#C6.2).
    var wanted = (location.hash || '').replace(/^#/, '');
    try { wanted = decodeURIComponent(wanted); } catch (err) { wanted = ''; }
    /* …or its printed number: inspyx.com/r/<key>#3.1. */
    if (!byId[wanted]) {
      Object.keys(byId).forEach(function (id) { if (byId[id].number === wanted) wanted = id; });
    }
    if (byId[wanted]) openFinding(wanted, ranked);
  }

  // ---------------------------------------------------------------------------------------- other states

  function message(kind, after, before) {
    var more = { gone: WORDS.goneMore, failed: WORDS.failedMore, plain: WORDS.plainMore }[kind];
    return h('main', { class: 'state', id: 'report', tabindex: '-1', 'data-state': kind },
      before || null,
      h('h1', { class: 'state-t' }, WORDS[kind]),
      more ? h('p', { class: 'state-m' }, more) : null,
      after || null
    );
  }

  function show(el) {
    app.textContent = '';
    app.appendChild(el);
    app.removeAttribute('aria-busy');
  }

  /* What is known about a report whose page can't be drawn or isn't open yet: where, when, by whom. */
  function about(a) {
    if (!a) return null;
    var photo = ownUrl(a.photo);
    return h('div', { class: 'about' },
      photo ? h('img', { class: 'about-ph', alt: 'The property', src: photo }) : null,
      a.address ? h('p', { class: 'addr addr-s' }, a.address) : null,
      a.locality ? h('p', { class: 'cover-sub' }, a.locality) : null,
      a.inspected ? h('p', { class: 'cover-sub' }, PDF.inspectionDate + ' ' + a.inspected) : null,
      a.inspector ? h('p', { class: 'cover-sub' }, [a.inspector, a.company].filter(Boolean).join(' · ')) : null
    );
  }

  function render(answer) {
    if (!answer || typeof answer !== 'object') return show(message('failed', retry()));
    if (answer.state === 'gone') return show(message('gone'));
    if (answer.state === 'locked') {
      var pay = ownUrl(answer.pay_url, PAY_ORIGINS);
      doc.title = (answer.about && answer.about.address) || doc.title;
      return show(h('main', { class: 'state state-locked', id: 'report', tabindex: '-1', 'data-state': 'locked' },
        about(answer.about),
        h('p', { class: 'lockmark', 'aria-hidden': 'true' }, icon('lock')),
        h('h1', { class: 'state-t' }, WORDS.locked),
        pay ? h('p', { class: 'state-act' }, h('a', { class: 'btn btn-wide', href: pay, rel: 'noopener' }, WORDS.pay)) : null,
        h('p', { class: 'state-m' }, WORDS.lockedMore)
      ));
    }
    if (answer.state === 'open' && answer.report && answer.report.view === VIEW) {
      try { return renderOpen(answer); } catch (err) {
        // A report this page can't lay out still gets its PDF, below.
        if (window.console) console.error(err);
      }
    }
    if (answer.state === 'open' || answer.state === 'plain') {
      var pdf = answer.pdf ? ownUrl(answer.pdf.url) : null;
      return show(message('plain',
        pdf ? h('p', { class: 'state-act' }, h('a', { class: 'btn btn-wide', href: pdf, download: (answer.pdf && answer.pdf.name) || 'Inspection Report.pdf', 'data-pdf': true },
          icon('download'), h('span', null, WORDS.pdfLong))) : null,
        about(answer.about || (answer.report && answer.report.cover && {
          address: answer.report.cover.address, locality: answer.report.cover.locality, inspected: answer.report.cover.inspected
        }))
      ));
    }
    return show(message('failed', retry()));
  }

  function retry() {
    return h('p', null, h('button', { class: 'btn', type: 'button', on: { click: function () { show(h('p', { class: 'state state-wait', role: 'status' }, WORDS.wait)); load(); } } }, WORDS.again));
  }

  // ---------------------------------------------------------------------------------------- loading

  /* What to ask, and where: the report function with a link's key, or a sample kept beside the page. */
  function source() {
    if (CFG.sample) return { url: CFG.sample + (CFG.name || 'report') + '.json' };
    if (linkKey) return { url: API, key: linkKey };
    var s = /^\/r\/sample(?:-([a-z]{1,20}))?\/?$/.exec(location.pathname);
    if (s) return { url: '/sample-report/' + (s[1] || 'report') + '.json' };
    return null;
  }

  /* The report function is asked by POST, the key in the body: with no cookies and no word of where the
     request came from. A sample is a plain file kept beside the page, fetched the way the page's own files
     are. */
  function howToAsk(src) {
    return src.key
      ? {
        method: 'POST', credentials: 'omit', cache: 'no-store', referrerPolicy: 'no-referrer',
        headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
        body: JSON.stringify({ key: src.key }),
      }
      : {};
  }

  function load() {
    var src = source();
    if (!src) return show(message('gone'));
    fetch(src.url, howToAsk(src))
      .then(function (res) {
        if (res.status === 404 || res.status === 410) return { state: 'gone' };
        if (!res.ok) throw new Error('status ' + res.status);
        return res.json();
      })
      .then(render, function () { show(message('failed', retry())); });
  }

  /* A preview that shows a sample can ask for another of its samples (the page's other states). */
  if (CFG.sample) {
    CFG.show = function (name) {
      closeAll(function () {
        CFG.name = String(name || 'report').replace(/[^a-z]/g, '').slice(0, 20) || 'report';
        // The sheets of the report shown before go with it.
        Array.prototype.forEach.call(doc.querySelectorAll('dialog.sheet'), function (d) { d.parentNode.removeChild(d); });
        show(h('p', { class: 'state state-wait', role: 'status' }, WORDS.wait));
        window.scrollTo(0, 0);
        load();
      });
    };
  }

  load();
})();
