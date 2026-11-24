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
      if (!one) { one = by[k] = { name: p.name, email: email, phone: phone, company: p.company, at: -1, jobs: [] }; groups[p.role].push(one); return; }
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
    show('data-live', last.live === 'failed' ? 'offline' : last.live);
    if (!last.loaded) {
      show('data-state', last.live === 'failed' ? 'failed' : 'loading');
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
  $('[data-add-person]').addEventListener('click', function () {
    form.reset();
    problem('');
    said('');
    draft = book.newDraft();
    dialog.showModal();
    form.elements.name.focus();
  });
  form.querySelector('[data-close]').addEventListener('click', function () { dialog.close(); });
  form.addEventListener('submit', function (e) {
    e.preventDefault();
    var p = book.personOf(form);
    problem(p.problem || '');
    if (p.problem) return;
    var go = form.querySelector('button[type="submit"]');
    go.disabled = true;
    book.add(p, draft).then(function (outcome) {
      go.disabled = false;
      if (outcome === 'saved') { dialog.close(); said('saved'); draw(); return; }
      problem(outcome);
    });
  });

  if (!auth.who()) { window.location.replace('/signin'); return; }
  main.hidden = false;
  draw();
  data.start(draw);
  if (book) book.start(function () { draw(); });
})();
