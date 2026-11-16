/* Your calendar (2026-11-16, Inspyx 4): Moises's dashboard interview, answer 4 ("Calendar, Inspections, Numbers,
   People, ... more than the phone app can"). One month at a time: each inspection on its day by the phone's own rule
   (its start, else the time it's booked for, else the day it was made; see InspyxInspections.when), in this browser's
   time zone, live as the phone syncs. A month is its own address (/calendar#2026-11), so Back and a bookmark work.
   On a wide screen the month is a grid of weeks; on a phone it is the list of the days that have inspections.
   This file says no words. The page holds every sentence. */
(function () {
  'use strict';
  var main = document.querySelector('[data-cal]');
  var data = window.InspyxInspections, auth = window.InspyxAuth;
  if (!main || !data || !auth) return;

  var $ = function (sel) { return main.querySelector(sel); };
  var all = function (sel) { return [].slice.call(main.querySelectorAll(sel)); };
  var tpl = function (name) { return document.querySelector('template[data-t="' + name + '"]').content.firstElementChild.cloneNode(true); };
  var show = function (attr, which) { all('[' + attr + ']').forEach(function (el) { el.hidden = el.getAttribute(attr) !== which; }); };
  var fmt = function (o) { return new Intl.DateTimeFormat('en-US', o); };
  var MONTH = fmt({ month: 'long', year: 'numeric' }), TIME = fmt({ hour: 'numeric', minute: '2-digit' });
  var WEEKDAY = fmt({ weekday: 'short' }), LONG = fmt({ weekday: 'long', month: 'long', day: 'numeric' });
  var ID = /^[A-Za-z0-9_.:-]{1,64}$/;
  var text = function (v) { return typeof v === 'string' ? v : ''; };
  var two = function (n) { return (n < 10 ? '0' : '') + n; };

  /* The month on show: the address's #YYYY-MM, else this month. */
  function chosen() {
    var m = /^#(\d{4})-(\d{2})$/.exec(window.location.hash);
    if (m && +m[1] >= 2000 && +m[1] <= 2100 && +m[2] >= 1 && +m[2] <= 12) return { y: +m[1], m: +m[2] - 1 };
    var now = new Date();
    return { y: now.getFullYear(), m: now.getMonth() };
  }
  function go(step) {
    var c = chosen(), d = step === 0 ? new Date() : new Date(c.y, c.m + step, 1);
    var hash = '#' + d.getFullYear() + '-' + two(d.getMonth() + 1);
    if (window.location.hash !== hash) window.location.hash = hash; else draw();
  }

  var last = { live: 'connecting', loaded: false };
  function draw(state) {
    if (state) last = state;
    show('data-live', last.live === 'failed' ? 'offline' : last.live);
    var c = chosen(), first = new Date(c.y, c.m, 1), next = new Date(c.y, c.m + 1, 1);
    $('[data-month]').textContent = MONTH.format(first);
    var days = $('[data-days]');
    if (!last.loaded) { show('data-state', last.live === 'failed' ? 'failed' : 'loading'); days.hidden = true; return; }

    // This month's inspections, by day of the month, in time order.
    var ids = data.parts('inspection').filter(function (id) { return ID.test(id); });
    var byDay = Object.create(null), count = 0;
    ids.forEach(function (id) {
      var w = data.when(id);
      if (!w || w.at < first.getTime() || w.at >= next.getTime()) return;
      var d = new Date(w.at).getDate();
      (byDay[d] = byDay[d] || []).push({ id: id, at: w.at, timed: w.timed });
      count++;
    });
    show('data-state', ids.length === 0 ? 'empty' : count === 0 ? 'none' : '');
    days.hidden = ids.length === 0;

    days.textContent = '';
    // The week's day names (Sunday first, as the US calendar), then blanks up to the 1st.
    for (var i = 0; i < 7; i++) {
      var wd = tpl('weekday');
      wd.textContent = WEEKDAY.format(new Date(2026, 10, 15 + i));   // 2026-11-15 was a Sunday
      days.appendChild(wd);
    }
    for (var p = 0; p < first.getDay(); p++) days.appendChild(tpl('pad'));
    var now = new Date(), inMonth = now.getFullYear() === c.y && now.getMonth() === c.m;
    var length = new Date(c.y, c.m + 1, 0).getDate();
    for (var d = 1; d <= length; d++) {
      var date = new Date(c.y, c.m, d), cell = tpl('day'), jobs = byDay[d] || [];
      cell.setAttribute('data-date', c.y + '-' + two(c.m + 1) + '-' + two(d));
      cell.querySelector('[data-v="dname"]').textContent = WEEKDAY.format(date);
      cell.querySelector('[data-v="num"]').textContent = String(d);
      cell.querySelector('.cal-date').setAttribute('aria-label', LONG.format(date));
      if (inMonth && now.getDate() === d) cell.setAttribute('aria-current', 'date');
      cell.classList.toggle('cal-empty', jobs.length === 0);
      var ul = cell.querySelector('.cal-jobs');
      ul.hidden = jobs.length === 0;
      jobs.sort(function (a, b) { return a.at - b.at || (a.id < b.id ? -1 : 1); }).forEach(function (j) {
        var job = tpl('job'), a = job.querySelector('a'), time = job.querySelector('[data-v="time"]');
        a.href = '/inspections#' + j.id;
        time.hidden = !j.timed;
        if (j.timed) { time.textContent = TIME.format(new Date(j.at)); time.setAttribute('datetime', new Date(j.at).toISOString()); }
        job.querySelector('[data-v="title"]').textContent = text(data.val('inspection', j.id, 'title'));
        job.querySelector('[data-v="address"]').textContent = text(data.val('inspection', j.id, 'address'));
        ul.appendChild(job);
      });
      days.appendChild(cell);
    }
  }

  all('[data-go]').forEach(function (b) { b.addEventListener('click', function () { go(+b.getAttribute('data-go')); }); });
  window.addEventListener('hashchange', function () { draw(); });

  if (!auth.who()) { window.location.replace('/signin'); return; }
  main.hidden = false;
  draw();
  data.start(draw);
})();
