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
  var KINDS = ['legal_documents', 'legal_default'], SIGNS = 'signs';

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
      var mine = (answer.skipped || []).filter(function (s) {
        return push.some(function (p) { return p.kind === s.kind && p.id === s.id; });
      });
      var outcome = mine.length === 0 ? 'saved' : 'refused';
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

  function armDelete(armed) {
    var b = $('[data-delete]', form);
    b.setAttribute('data-armed', armed ? '1' : '0');
    showOne(b, 'data-arm', armed ? '1' : '0');
  }

  function open(d, signs) {
    editing = d;
    showOne(form, 'data-title', d ? 'edit' : 'new');
    form.elements.name.value = d ? d.title : '';
    form.elements.words.value = d ? d.body : '';
    form.elements.signs.checked = false;
    $('[data-only="choose"]', form).hidden = !d || signs;
    $('[data-only="signs"]', form).hidden = !d || !signs;
    $('[data-delete]', form).hidden = !d;
    armDelete(false);
    showOne(form, 'data-problem', '');
    say('');
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
    var was = editing, at = nextAt(was);
    var data = {
      id: was ? was.id : newId(),
      ownerAccountId: me,
      kind: 'agreement',
      title: f.title,
      body: f.body,
      createdAt: was ? was.createdAt : at,
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
    var copy = Object.assign({}, editing), when = Date.now();
    copy.updatedAt = copy.updatedAt >= when ? copy.updatedAt + 1 : when;
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
