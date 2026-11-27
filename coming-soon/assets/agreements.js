/* Agreements (2026-11-16, Inspyx 4): the inspector's agreements on the web, the same list as on their phone.
   Moises's dashboard interview, answer 5: "business setup (... agreements, company profile, logo, signature)";
   business setup phase 2 (the lead's answers of 2026-11-16).
   How: the sync function keeps each agreement as a row (legal_documents) and the one clients sign as one more
   (legal_default, id "signs"), newest change wins. This page pulls every row once, then what changed after its
   point, every half minute while in view and when it comes back into view. It writes a row whole, as the phone's
   LegalLibrary would: a trimmed name and words (Dart's trim), a new change time past the row's last one, a deletion
   as a mark. The first agreement becomes the one clients sign, as on the phone. It checks the caps every place
   keeps (a name of at most 120 characters, words of at most 100,000 bytes) before it sends; the server holds the
   same rules and has the last word: a change it keeps out is said so.
   The list is in the phone's order: the one clients sign first (the one chosen, or the first left when that one is
   deleted), then the rest by name.
   This file says no words. The page holds every sentence. */
(function () {
  'use strict';
  var main = document.querySelector('[data-agr]');
  var auth = window.InspyxAuth;
  if (!main || !auth) return;
  var DEADLINE = 20000, POLL = 30000, NAME_MAX = 120, WORDS_MAX_BYTES = 100000;
  // The profile is read only, for the preview's own blanks (his name, company and license).
  var KINDS = ['legal_documents', 'legal_default', 'inspector_profile'], SIGNS = 'signs';

  var $ = function (sel, el) { return (el || document).querySelector(sel); };
  var all = function (sel, el) { return [].slice.call((el || document).querySelectorAll(sel)); };
  var tpl = function (name) { return document.querySelector('template[data-t="' + name + '"]').content.firstElementChild.cloneNode(true); };
  var showOne = function (el, attr, which) { all('[' + attr + ']', el).forEach(function (x) { x.hidden = x.getAttribute(attr) !== which; }); };
  var words = (function () {
    var box = document.querySelector('template[data-t="words"]').content;
    return function (key) { var w = box.querySelector('[data-w="' + key + '"]'); return w ? w.textContent : ''; };
  })();

  // ---- the rows, as the server keeps them ------------------------------------------------------------------------

  var me = null;
  var rows = Object.create(null);   // "kind/id" -> {kind, id, updated_at, deleted_at, data}
  var point = null, loaded = false, pulling = null, again = false, failing = false;

  function take(r) {
    if (!r || KINDS.indexOf(r.kind) < 0 || typeof r.id !== 'string' || !r.data || r.data.ownerAccountId !== me) return;
    var k = r.kind + '/' + r.id, held = rows[k];
    if (!held || r.updated_at >= held.updated_at) rows[k] = r;
  }

  /* One exchange: sends [push], brings what changed after the point. */
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

  /* Sends [push] (rows of one change), then pulls the rest. Answers 'saved', 'refused' or 'failed'. */
  function send(push) {
    return exchange(push).then(function (answer) {
      if (answer === null) return 'failed';
      var sent = function (s) { return push.some(function (p) { return p.kind === s.kind && p.id === s.id; }); };
      var mine = (answer.skipped || []).filter(sent);
      // A pushed row the server didn't apply: it holds a newer copy (a phone change a moment earlier, or a clock
      // ahead), which the pull shows. Not saved.
      var stale = (answer.applied || []).filter(function (a) { return a.applied === false && sent(a); });
      var outcome = mine.length === 0 && stale.length === 0 ? 'saved' : 'refused';
      return (answer.more ? pull() : Promise.resolve()).then(function () { render(); return outcome; });
    }, function () { return 'failed'; });
  }

  /* Dart's String.trim, which the phone uses: Unicode White_Space and the byte-order mark at both ends (it also
     takes U+0085, which JavaScript's trim keeps), by one scan from each end. */
  var SPACE = [0x09, 0x0a, 0x0b, 0x0c, 0x0d, 0x20, 0x85, 0xa0, 0x1680, 0x2000, 0x2001, 0x2002, 0x2003, 0x2004, 0x2005,
    0x2006, 0x2007, 0x2008, 0x2009, 0x200a, 0x2028, 0x2029, 0x202f, 0x205f, 0x3000, 0xfeff];
  function dartTrim(s) {
    var start = 0, end = s.length;
    while (start < end && SPACE.indexOf(s.charCodeAt(start)) >= 0) start++;
    while (end > start && SPACE.indexOf(s.charCodeAt(end - 1)) >= 0) end--;
    return s.slice(start, end);
  }
  var characters = function (s) { return Array.from(s).length; };
  var bytes = function (s) { return new TextEncoder().encode(s).length; };

  var standing = function () {
    return Object.keys(rows).map(function (k) { return rows[k]; }).filter(function (r) {
      return r.kind === 'legal_documents' && r.deleted_at === null && r.data.deletedAt == null && r.data.kind === 'agreement';
    }).map(function (r) { return r.data; });
  };
  var signsRow = function () { var r = rows['legal_default/' + SIGNS]; return r ? r.data : null; };

  /* The phone's order (legal_library.dart's _agreementsNow): by name, then when made; the one chosen first. */
  function agreements() {
    var list = standing().sort(function (a, b) {
      var x = a.title.toLowerCase(), y = b.title.toLowerCase();
      return x < y ? -1 : x > y ? 1 : (a.createdAt - b.createdAt);
    });
    var chosen = signsRow(), at = chosen ? list.findIndex(function (d) { return d.id === chosen.agreementId; }) : -1;
    if (at > 0) list.unshift(list.splice(at, 1)[0]);
    return list;
  }

  /* A new change time: now, or just past the row's last one. */
  var nextAt = function (data) { var t = Date.now(); return data && data.updatedAt >= t ? data.updatedAt + 1 : t; };
  var wire = function (kind, data) { return { kind: kind, id: data.id, updated_at: data.updatedAt, deleted_at: data.deletedAt, data: data }; };
  var newId = function () { return window.crypto.randomUUID(); };
  function signsWire(agreementId) {
    var at = nextAt(signsRow());
    return wire('legal_default', { id: SIGNS, ownerAccountId: me, agreementId: agreementId, updatedAt: at, deletedAt: null });
  }

  // ---- what shows ------------------------------------------------------------------------------------------------

  var DATE = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

  function say(which) { showOne(main, 'data-say', which || ''); }

  function render() {
    showOne(main, 'data-live', failing ? 'offline' : loaded ? 'live' : 'connecting');
    if (!loaded) { showOne(main, 'data-state', failing ? 'failed' : 'loading'); return; }
    showOne(main, 'data-state', '');
    $('[data-group]', main).hidden = false;
    var list = $('[data-list]', main), docs = agreements();
    $('[data-empty]', main).hidden = docs.length > 0;
    list.textContent = '';
    docs.forEach(function (d, i) {
      var card = tpl('agreement');
      card.setAttribute('data-id', d.id);
      $('[data-v="name"]', card).textContent = d.title;
      $('[data-v="line"]', card).textContent = [i === 0 ? words('signs') : null, words('edited') + ' ' + DATE.format(new Date(d.updatedAt))].filter(Boolean).join(' · ');
      $('[data-edit]', card).addEventListener('click', function () { open(d, i === 0); });
      list.appendChild(card);
    });
  }

  // ---- one agreement ---------------------------------------------------------------------------------------------

  var dialog = $('[data-dialog]'), form = $('[data-form]');
  var editing = null;   // the agreement being changed, or null for a new one
  // A new agreement's id and times, given when the dialog opens and kept for every Save in it: a Save that failed
  // may still have landed, and a retry must change that same row, never make a second.
  var draft = null;

  function armDelete(armed) {
    var b = $('[data-delete]', form);
    b.setAttribute('data-armed', armed ? '1' : '0');
    showOne(b, 'data-arm', armed ? '1' : '0');
  }

  function open(d, signs) {
    editing = d;
    draft = d ? null : { id: newId(), createdAt: null, updatedAt: 0 };
    showOne(form, 'data-title', d ? 'edit' : 'new');
    form.elements.name.value = d ? d.title : '';
    form.elements.words.value = d ? d.body : '';
    form.elements.signs.checked = false;
    tab('write');
    $('[data-starter]', form).hidden = !!d || !starter;
    $('[data-only="choose"]', form).hidden = !d || signs;
    $('[data-only="signs"]', form).hidden = !d || !signs;
    $('[data-delete]', form).hidden = !d;
    armDelete(false);
    showOne(form, 'data-problem', '');
    say('');
    brought = { filled: 0, signatures: 0, unknown: [] };
    showBrought();
    dialog.showModal();
    form.elements.name.focus();
  }

  function fields() {
    var name = dartTrim(form.elements.name.value), body = dartTrim(form.elements.words.value);
    if (name === '') return { problem: 'name' };
    if (characters(name) > NAME_MAX) return { problem: 'name_long' };
    if (body === '') return { problem: 'words' };
    if (bytes(body) > WORDS_MAX_BYTES) return { problem: 'words_long' };
    return { title: name, body: body };
  }

  form.addEventListener('submit', function (e) {
    e.preventDefault();
    var f = fields();
    showOne(form, 'data-problem', f.problem || '');
    if (f.problem) return;
    // An edit is dated after the freshest copy held, not the one the dialog opened with: after a Save refused for a
    // newer copy from elsewhere (its pull brought that copy), Save again keeps what is on screen. Last writer wins.
    var was = editing, held = was ? rows['legal_documents/' + was.id] : null;
    var at = nextAt(was ? (held ? held.data : was) : draft);
    if (!was) {
      if (draft.createdAt === null) draft.createdAt = at;
      draft.updatedAt = at;
    }
    var data = {
      id: was ? was.id : draft.id,
      ownerAccountId: me,
      kind: 'agreement',
      title: f.title,
      body: f.body,
      createdAt: was ? was.createdAt : draft.createdAt,
      updatedAt: at,
      deletedAt: null,
    };
    var push = [wire('legal_documents', data)];
    // The first agreement becomes the one clients sign (the phone's add); one ticked here becomes it too.
    if ((!was && standing().length === 0) || (was && form.elements.signs.checked)) push.push(signsWire(data.id));
    finish(push, 'saved');
  });

  $('[data-delete]', form).addEventListener('click', function () {
    var b = $('[data-delete]', form);
    if (b.getAttribute('data-armed') !== '1') { armDelete(true); return; }
    var copy = Object.assign({}, editing), when = Date.now(), held = rows['legal_documents/' + editing.id];
    var last = held ? held.data.updatedAt : copy.updatedAt;
    copy.updatedAt = last >= when ? last + 1 : when;
    copy.deletedAt = when;
    finish([wire('legal_documents', copy)], 'deleted');
  });

  /* Sends one change; closes the dialog and says so when it is kept, else keeps the dialog open and says why. */
  var busy = false;
  function finish(push, done) {
    if (busy) return;
    busy = true;
    all('button', dialog).forEach(function (b) { b.disabled = true; });
    send(push).then(function (outcome) {
      busy = false;
      all('button', dialog).forEach(function (b) { b.disabled = false; });
      if (outcome === 'saved') { dialog.close(); say(done); return; }
      say(outcome);
    });
  }

  all('[data-close]').forEach(function (b) { b.addEventListener('click', function () { dialog.close(); }); });
  all('[data-add="agreement"]').forEach(function (b) { b.addEventListener('click', function () { open(null, false); }); });

  // ---- the starter, the blanks and the preview (job 7, W14) --------------------------------------------------------

  // The starter is offered only while the page holds it (it waits on Moises's word: tools/starter_agreement_draft.html).
  var starterTpl = document.querySelector('template[data-t="starter"]');
  var starter = starterTpl ? starterTpl.content : null;
  all('[data-starter-open]').forEach(function (b) { b.hidden = !starter; });
  all('[data-only-starter]').forEach(function (p) { p.hidden = !starter; });
  all('[data-no-starter]').forEach(function (p) { p.hidden = !!starter; });
  // The starter's name and words in the dialog: only for a new one, and never over words he has typed.
  function useStarter() {
    var w = form.elements.words;
    if (dartTrim(w.value) !== '' && !window.confirm(words('replace'))) return;
    if (dartTrim(form.elements.name.value) === '') form.elements.name.value = $('[data-s="name"]', starter).textContent;
    w.value = $('[data-s="words"]', starter).textContent;
    showUnknown();
    tab('preview');
  }
  $('[data-starter]', form).addEventListener('click', useStarter);
  all('[data-starter-open]').forEach(function (b) { b.addEventListener('click', function () { open(null, false); useStarter(); }); });

  // A blank goes where he is typing, as one piece.
  all('[data-blank]', form).forEach(function (b) {
    b.addEventListener('click', function () {
      var w = form.elements.words, at = w.selectionStart == null ? w.value.length : w.selectionStart;
      w.setRangeText(b.getAttribute('data-blank'), at, w.selectionEnd == null ? at : w.selectionEnd, 'end');
      w.focus();
      showUnknown();
    });
  });

  // ---- another app's blanks (switch, 2026-11-27) -----------------------------------------------------------------
  // Words pasted in from Spectora, ISN, Horizon or Palmtech have their blanks written Inspyx's way by the phone's own
  // code (inspyx_import.js: placeholder_translate.dart), and the dialog says what was done. A client's initial spot
  // becomes an [Initials] box; a signature spot is taken out (the client signs once, at the end, as always). The blanks
  // Inspyx can't fill are named under the words, as the phone's editor names them, and marked in the preview.
  var brought = { filled: 0, signatures: 0, unknown: [] };
  var reader = function () {
    var r = window.inspyxImport;
    return r && typeof r.placeholders === 'function' && typeof r.unknownBlanks === 'function' ? r : null;
  };
  var put = function (key, n, list) { return words(key).replace('{n}', String(n)).replace('{list}', list || ''); };
  function broughtLine() {
    var b = brought, parts = [];
    if (b.filled > 0) parts.push(b.filled === 1 ? words('filled-1') : put('filled-n', b.filled));
    if (b.unknown.length > 0) parts.push(put('not-known', b.unknown.length, b.unknown.join(', ')));
    var head = parts.join(' · ');
    if (b.signatures === 0) return head;
    var sign = b.signatures === 1 ? words('sign-1') : put('sign-n', b.signatures);
    return head ? head + '. ' + sign : sign;
  }
  function showBrought() {
    var el = $('[data-brought]', form), line = broughtLine();
    el.textContent = line;
    el.hidden = !line;
    el.classList.toggle('agr-look', brought.unknown.length > 0);
    showUnknown();
  }
  // The blanks in the words that Inspyx can't fill, each once; none while the phone's reader hasn't loaded.
  function unknownNow() {
    var r = reader();
    if (!r) return [];
    try { var u = JSON.parse(r.unknownBlanks(form.elements.words.value)); return Array.isArray(u) ? u : []; } catch (e) { return []; }
  }
  function showUnknown() {
    var el = $('[data-unknown]', form), u = unknownNow();
    el.textContent = u.length === 0 ? '' : u.length === 1 ? put('cant-fill-1', 1, u[0]) : put('cant-fill-n', u.length, u.join(', '));
    el.hidden = u.length === 0;
  }
  form.elements.words.addEventListener('input', showUnknown);
  form.elements.words.addEventListener('paste', function (e) {
    var r = reader(), cd = e.clipboardData;
    if (!r || !cd) return;
    var text = cd.getData('text/plain');
    if (!text) return;
    var t;
    try { t = JSON.parse(r.placeholders(text, 'agreement')); } catch (err) { return; }
    if (!t || t.status !== 'ok' || !t.changes.length) return;
    e.preventDefault();
    var w = form.elements.words, from = w.selectionStart == null ? w.value.length : w.selectionStart;
    w.setRangeText(t.text, from, w.selectionEnd == null ? from : w.selectionEnd, 'end');
    t.changes.forEach(function (c) { if (c.to !== '' && t.unknown.indexOf(c.to) < 0) brought.filled++; });
    brought.signatures += t.signatures_moved;
    t.unknown.forEach(function (u) { if (brought.unknown.indexOf(u) < 0) brought.unknown.push(u); });
    showBrought();
  });

  function tab(which) {
    // The tab pattern (WAI-ARIA): the chosen tab is the one Tab reaches; arrow keys move between them.
    all('[data-tab]', form).forEach(function (t) { var on = t.getAttribute('data-tab') === which; t.setAttribute('aria-selected', String(on)); t.tabIndex = on ? 0 : -1; });
    showOne(form, 'data-pane', which);
    if (which === 'preview') paint();
  }
  all('[data-tab]', form).forEach(function (t) { t.addEventListener('click', function () { tab(t.getAttribute('data-tab')); }); });
  all('[data-tab]', form).forEach(function (t) {
    t.addEventListener('keydown', function (e) {
      if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight' && e.key !== 'Home' && e.key !== 'End') return;
      var tabs = all('[data-tab]', form), i = tabs.indexOf(t);
      var next = e.key === 'Home' ? 0 : e.key === 'End' ? tabs.length - 1 : (i + (e.key === 'ArrowRight' ? 1 : tabs.length - 1)) % tabs.length;
      e.preventDefault();
      tab(tabs[next].getAttribute('data-tab'));
      tabs[next].focus();
    });
  });

  var BLANK = /\[(Client name|Property address|Inspection date|Fee|Your name|Your company|License number|Today's date)\]|\{\{([^{}\r\n]*)\}\}/g;
  var DAY = new Intl.DateTimeFormat('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
  // What each blank reads as in the preview, and whose it is: his own from his profile, a sample client's, or missing.
  function fill(blank) {
    var p = rows['inspector_profile/profile'], d = p && p.deleted_at === null ? p.data : {};
    var mine = function (v, missing) { var t = typeof v === 'string' ? dartTrim(v) : ''; return t ? [t, 'yours'] : [words(missing), 'missing']; };
    switch (blank) {
      case 'Client name': return [words('sample-client'), 'sample'];
      case 'Property address': return [words('sample-address'), 'sample'];
      case 'Inspection date': return [words('sample-date'), 'sample'];
      case 'Fee': return [words('sample-fee'), 'sample'];
      case 'Your name': return mine(d.inspectorName, 'missing-name');
      case 'Your company': return mine(d.companyName, 'missing-company');
      case 'License number': return mine(d.licenseNumber, 'missing-license');
      default: return [DAY.format(new Date()), 'yours'];
    }
  }
  // The words as the client reads them: paragraphs, each blank filled and marked.
  function paint() {
    var paper = $('[data-paper]', form), cant = unknownNow();
    paper.textContent = '';
    form.elements.words.value.split(/\n{2,}/).forEach(function (para) {
      if (dartTrim(para) === '') return;
      var el = document.createElement('p'), last = 0, m;
      BLANK.lastIndex = 0;
      while ((m = BLANK.exec(para))) {
        el.appendChild(document.createTextNode(para.slice(last, m.index)));
        // A {{blank}}: marked when Inspyx can't fill it, else left as written (the phone fills those).
        if (m[1] === undefined) {
          var named = '{{' + dartTrim(m[2]) + '}}';
          if (cant.indexOf(named) < 0 && cant.indexOf(m[0]) < 0) { el.appendChild(document.createTextNode(m[0])); last = BLANK.lastIndex; continue; }
          var odd = document.createElement('mark');
          odd.className = 'agr-fill';
          odd.setAttribute('data-fill', 'unknown');
          odd.textContent = m[0];
          el.appendChild(odd);
          last = BLANK.lastIndex;
          continue;
        }
        var f = fill(m[1]), mark = document.createElement('mark');
        mark.className = 'agr-fill';
        mark.setAttribute('data-fill', f[1]);
        mark.textContent = f[0];
        el.appendChild(mark);
        last = BLANK.lastIndex;
      }
      el.appendChild(document.createTextNode(para.slice(last)));
      paper.appendChild(el);
    });
    var sign = document.createElement('p');
    sign.className = 'agr-sign';
    sign.textContent = words('signed-by') + ' ' + words('sample-client');
    paper.appendChild(sign);
  }

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
