/* People (2026-11-16, Inspyx 4): Moises's dashboard interview, answer 4 ("Calendar, Inspections, Numbers, People").
   Everyone on the inspector's inspections, as the phone keeps them (the inspection_people table: any number of
   clients, buyer's agents and listing agents per inspection), grouped by role, each with their inspections.
   One person across many inspections shows once in a role: the same email, else the same phone number (its last ten
   digits), else the same name. The name, email and phone shown are the ones on the most recent of those inspections.
   Read only; a change on the phone shows here within seconds. With them, everyone kept in People (the People book,
   people-book.js, job 7): one person in both shows once, with the company the book keeps; a person can be added.
   This file says no words. The page holds every sentence. */
(function () {
  'use strict';
  var main = document.querySelector('[data-ppl]');
  var data = window.InspyxInspections, auth = window.InspyxAuth, book = window.InspyxPeopleBook;
  if (!main || !data || !auth) return;

  var $ = function (sel) { return main.querySelector(sel); };
  var all = function (sel) { return [].slice.call(main.querySelectorAll(sel)); };
  var tpl = function (name) { return document.querySelector('template[data-t="' + name + '"]').content.firstElementChild.cloneNode(true); };
  var show = function (attr, which) { all('[' + attr + ']').forEach(function (el) { el.hidden = el.getAttribute(attr) !== which; }); };
  var DAY = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  var ROLES = ['client', 'buyer_agent', 'listing_agent'];
  var ID = /^[A-Za-z0-9_.:-]{1,64}$/;
  // Plain addresses only: nothing a mailto: link would read as more than the address (?, &, #, %).
  var EMAIL = /^[A-Za-z0-9._+-]{1,64}@[A-Za-z0-9-]{1,63}(\.[A-Za-z0-9-]{1,63})+$/;
  var text = function (v) { return typeof v === 'string' ? v.trim() : ''; };
  var digits = function (s) { return s.replace(/[^0-9]/g, ''); };
  var folded = function (s) { return s.toLowerCase().replace(/\s+/g, ' '); };

  /* Everyone, by role: [{ name, email, phone, jobs: [{ id, at }] }], each role in name order. */
  function everyone() {
    var groups = { client: [], buyer_agent: [], listing_agent: [] }, by = Object.create(null);
    data.parts('person').forEach(function (p) {
      var role = data.val('person', p, 'role');
      if (ROLES.indexOf(role) < 0) return;
      var name = text(data.val('person', p, 'name')), inspection = data.owner('person', p);
      if (!name || !ID.test(inspection || '')) return;
      var email = text(data.val('person', p, 'email')), phone = text(data.val('person', p, 'phone'));
      if (!EMAIL.test(email)) email = '';
      if (digits(phone).length < 7) phone = '';
      var k = role + '|' + (email ? 'e:' + email.toLowerCase() : phone ? 'p:' + digits(phone).slice(-10) : 'n:' + folded(name));
      var w = data.when(inspection), at = w ? w.at : 0;
      var one = by[k];
      if (!one) { one = by[k] = { name: name, email: email, phone: phone, company: '', at: -1, jobs: [] }; groups[role].push(one); }
      if (at > one.at) {
        one.at = at; one.name = name;
        if (email) one.email = email;
        if (phone) one.phone = phone;
      } else {
        if (!one.email) one.email = email;
        if (!one.phone) one.phone = phone;
      }
      if (!one.jobs.some(function (j) { return j.id === inspection; })) one.jobs.push({ id: inspection, at: at });
    });
    // The People book: the same person kept there shows once, with the company it keeps.
    (book ? book.people() : []).forEach(function (p) {
      var email = EMAIL.test(p.email) ? p.email : '', phone = digits(p.phone).length >= 7 ? p.phone : '';
      var k = p.role + '|' + (email ? 'e:' + email.toLowerCase() : phone ? 'p:' + digits(phone).slice(-10) : 'n:' + folded(p.name));
      var one = by[k];
      if (!one) { one = by[k] = { name: p.name, email: email, phone: phone, company: p.company, at: -1, jobs: [], kept: [p.id] }; groups[p.role].push(one); return; }
      one.kept = (one.kept || []).concat(p.id);
      if (!one.email) one.email = email;
      if (!one.phone) one.phone = phone;
      if (p.company) one.company = p.company;
    });
    ROLES.forEach(function (role) {
      groups[role].sort(function (a, b) { return a.name.localeCompare(b.name, 'en', { sensitivity: 'base' }) || b.at - a.at; });
      groups[role].forEach(function (one) { one.jobs.sort(function (a, b) { return b.at - a.at || (a.id < b.id ? -1 : 1); }); });
    });
    return groups;
  }

  /* Does [one] match what is typed in Find: a part of the name or email, or of the phone number's digits. */
  function matches(one, q) {
    if (!q) return true;
    var lower = q.toLowerCase().trim(), nums = digits(q);
    if (one.name.toLowerCase().indexOf(lower) >= 0 || one.email.toLowerCase().indexOf(lower) >= 0) return true;
    return nums.length >= 3 && digits(one.phone).indexOf(nums) >= 0;
  }

  var last = { live: 'connecting', loaded: false };
  function draw(state) {
    if (state) last = state;
    // Both readers: the inspections and the People book. Either one not loaded, or failing, is never shown as an
    // empty or current list (Codex on #87).
    var bookLoaded = !book || book.loaded(), bookFailing = !!book && book.failing();
    var down = last.live === 'failed' || bookFailing;
    show('data-live', down ? 'offline' : bookLoaded ? last.live : 'connecting');
    if (!last.loaded || !bookLoaded) {
      show('data-state', down ? 'failed' : 'loading');
      all('[data-role]').forEach(function (s) { s.hidden = true; });
      return;
    }
    var groups = everyone(), q = $('[data-find]').value, total = 0, shown = 0;
    ROLES.forEach(function (role) {
      var section = $('[data-role="' + role + '"]'), list = section.querySelector('.ppl-list');
      var them = groups[role].filter(function (one) { return matches(one, q); });
      total += groups[role].length; shown += them.length;
      section.hidden = them.length === 0;
      section.querySelector('[data-count]').textContent = String(them.length);
      list.textContent = '';
      them.forEach(function (one) {
        var li = tpl('person');
        li.querySelector('[data-v="name"]').textContent = one.name;
        var company = li.querySelector('[data-v="company"]');
        company.hidden = !one.company;
        company.textContent = one.company || '';
        var email = li.querySelector('[data-v="email"]'), phone = li.querySelector('[data-v="phone"]');
        email.hidden = !one.email;
        if (one.email) { email.href = 'mailto:' + one.email; email.textContent = one.email; }
        phone.hidden = !one.phone;
        if (one.phone) { phone.href = 'tel:' + (/^\s*\+/.test(one.phone) ? '+' : '') + digits(one.phone); phone.textContent = one.phone; }
        // Delete: only someone kept in People (every row they are kept as); the inspections keep their own people.
        var del = li.querySelector('[data-del]');
        del.hidden = !one.kept;
        if (one.kept) {
          del.setAttribute('aria-label', del.textContent.trim() + ' ' + one.name);
          del.addEventListener('click', function () { askDelete(one); });
        }
        var jobs = li.querySelector('.ppl-jobs');
        one.jobs.forEach(function (j) {
          var job = tpl('job'), day = job.querySelector('[data-v="day"]');
          job.querySelector('a').href = '/inspections#' + j.id;
          job.querySelector('[data-v="title"]').textContent = text(data.val('inspection', j.id, 'title'));
          day.hidden = !(j.at > 0);
          if (j.at > 0) day.textContent = DAY.format(new Date(j.at));
          jobs.appendChild(job);
        });
        list.appendChild(li);
      });
    });
    show('data-state', total === 0 ? 'empty' : shown === 0 ? 'nomatch' : '');
  }

  var typing = null;
  $('[data-find]').addEventListener('input', function () { clearTimeout(typing); typing = setTimeout(draw, 120); });

  // ---- adding a person (job 7, W19) -------------------------------------------------------------------------------
  var dialog = document.querySelector('[data-dialog]'), form = document.querySelector('[data-form]'), draft = null;
  var problem = function (which) { [].slice.call(form.querySelectorAll('[data-problem]')).forEach(function (p) { p.hidden = p.getAttribute('data-problem') !== which; }); };
  var said = function (which) { all('[data-say]').forEach(function (p) { p.hidden = p.getAttribute('data-say') !== which; }); };
  $('[data-add-person]').hidden = !book;
  // While an Add waits on its answer the dialog stays open and can't be reopened as another person's, so its answer
  // always lands on its own draft and he sees it (Codex on #87).
  var pending = false;
  dialog.addEventListener('cancel', function (e) { if (pending) e.preventDefault(); });
  $('[data-add-person]').addEventListener('click', function () {
    if (pending) return;
    form.reset();
    problem('');
    said('');
    draft = book.newDraft();
    dialog.showModal();
    form.elements.name.focus();
  });
  form.querySelector('[data-close]').addEventListener('click', function () { if (!pending) dialog.close(); });
  form.addEventListener('submit', function (e) {
    e.preventDefault();
    var p = book.personOf(form);
    problem(p.problem || '');
    if (p.problem) return;
    var go = form.querySelector('button[type="submit"]'), close = form.querySelector('[data-close]');
    go.disabled = true; close.disabled = true; pending = true;
    book.add(p, draft).then(function (outcome) {
      go.disabled = false; close.disabled = false; pending = false;
      if (outcome === 'saved') { dialog.close(); gone = null; said('saved'); draw(); return; }
      problem(outcome);
    });
  });

  // ---- deleting a kept person (the rehearsal, round 2), as the phone's deleteContact: the row is marked, never
  // removed, so Undo brings it back (restoreContact), unless someone else is kept under that name by then.
  var delDialog = document.querySelector('[data-del-dialog]'), delForm = document.querySelector('[data-del-form]');
  var delOne = null, delPending = false, gone = null;
  var delProblem = function (which) { [].slice.call(delForm.querySelectorAll('[data-del-problem]')).forEach(function (p) { p.hidden = p.getAttribute('data-del-problem') !== which; }); };
  var who = function (root, name) { [].slice.call(root.querySelectorAll('[data-v="who"]')).forEach(function (b) { b.textContent = name; }); };
  delDialog.addEventListener('cancel', function (e) { if (delPending) e.preventDefault(); });
  function askDelete(one) {
    if (delPending || pending || undoing) return;
    // The names Undo would bring back are the kept rows' own, not the card's (which may be an inspection's: Codex on
    // #123).
    var ids = one.kept.slice();
    var named = Object.create(null);
    book.people().forEach(function (p) { if (ids.indexOf(p.id) >= 0) named[p.id] = p.name; });
    delOne = { name: one.name, kept: ids, named: named };
    who(delDialog, one.name);
    delForm.querySelector('[data-del-jobs]').hidden = one.jobs.length === 0;
    delProblem('');
    delDialog.showModal();
    delForm.querySelector('[data-del-keep]').focus();
  }
  delForm.querySelector('[data-del-keep]').addEventListener('click', function () { if (!delPending) delDialog.close(); });
  delForm.addEventListener('submit', function (e) {
    e.preventDefault();
    if (delPending || !delOne) return;
    var go = delForm.querySelector('button[type="submit"]'), keep = delForm.querySelector('[data-del-keep]'), one = delOne;
    go.disabled = true; keep.disabled = true; delPending = true; delProblem('');
    book.mark(one.kept, true).then(function (r) {
      go.disabled = false; keep.disabled = false; delPending = false;
      // Some kept and one refused: those kept are deleted, and Undo is theirs (Codex on #123).
      if (r.outcome !== 'saved' && r.kept.length === 0) { delProblem(r.outcome); return; }
      delDialog.close();
      // Undo's names are only those of the rows deleted: a refused row's name never blocks it (Codex on #123, r2).
      gone = { name: one.name, kept: r.kept, names: r.kept.map(function (id) { return one.named[id]; }).filter(function (n) { return typeof n === 'string'; }), partly: r.outcome !== 'saved' };
      who(main, one.name); said(gone.partly ? 'deleted-partly' : 'deleted'); draw();
    });
  });
  var undoing = false;
  all('[data-undo]').forEach(function (b) {
    b.addEventListener('click', function () {
      if (!gone || undoing) return;
      var one = gone, lower = one.names.map(function (n) { return n.toLowerCase(); });
      // One person is kept per name (restoreContact's ContactNameTaken): someone kept under a name it would bring
      // back stands.
      if (book.people().some(function (p) { return lower.indexOf(p.name.toLowerCase()) >= 0; })) { gone = null; who(main, one.name); said('taken'); return; }
      undoing = true;
      all('[data-undo]').forEach(function (u) { u.disabled = true; });
      book.mark(one.kept, false).then(function (r) {
        undoing = false;
        all('[data-undo]').forEach(function (u) { u.disabled = false; });
        // Only this Undo's own state (Codex on #123): a delete made since stands with its own Undo.
        if (gone !== one) { draw(); return; }
        who(main, one.name);
        if (r.outcome === 'saved') { gone = null; said('restored'); }
        else if (r.outcome === 'refused') { gone = null; said('undo-refused'); }
        else said('undo-failed');
        draw();
      });
    });
  });

  if (!auth.who()) { window.location.replace('/signin'); return; }
  main.hidden = false;
  draw();
  data.start(draw);
  if (book) book.start(function () { draw(); });
})();
