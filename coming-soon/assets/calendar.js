/* Your calendar (2026-11-16, Inspyx 4): Moises's dashboard interview, answer 4 ("Calendar, Inspections, Numbers,
   People, ... more than the phone app can"). One month at a time: each inspection on its day by the phone's own rule
   (its start, else the time it's booked for, else the day it was made; see InspyxInspections.when), in this browser's
   time zone, live as the phone syncs. A month is its own address (/calendar#2026-11), so Back and a bookmark work.
   On a wide screen the month is a grid of weeks; on a phone it is the list of the days that have inspections.
   Day and Week (2026-11-23, job 4 of the lead's inspector review): the hours of a day, or of a week from Sunday, with
   each inspection at its start time (/calendar#week-2026-11-22, /calendar#day-2026-11-23). No inspection says when it
   ends, so each shows as a block of HOLD minutes from its start, and only its start time is written. On a phone the
   week is the list of its days, as the month is.
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
  var TIME_H = fmt({ hour: 'numeric' }), SHORT = fmt({ month: 'short', day: 'numeric' });
  var RANGE = function (a, b) { return SHORT.format(a) + ' – ' + SHORT.format(b) + ', ' + b.getFullYear(); };
  var ID = /^[A-Za-z0-9_.:-]{1,64}$/;
  var text = function (v) { return typeof v === 'string' ? v : ''; };
  var two = function (n) { return (n < 10 ? '0' : '') + n; };

  var HOLD = 90, HOUR = 3600000;
  var narrow = window.matchMedia('(max-width: 760px)');
  var iso = function (d) { return d.getFullYear() + '-' + two(d.getMonth() + 1) + '-' + two(d.getDate()); };
  var sunday = function (d) { return new Date(d.getFullYear(), d.getMonth(), d.getDate() - d.getDay()); };

  /* What is on show, from the address: #YYYY-MM a month, #week-YYYY-MM-DD the week holding that day (from Sunday),
     #day-YYYY-MM-DD one day; else this month. */
  function chosen() {
    var h = window.location.hash, m = /^#(\d{4})-(\d{2})$/.exec(h), w = /^#(week|day)-(\d{4})-(\d{2})-(\d{2})$/.exec(h);
    if (m && +m[1] >= 2000 && +m[1] <= 2100 && +m[2] >= 1 && +m[2] <= 12) return { view: 'month', y: +m[1], m: +m[2] - 1, d: 1 };
    if (w && +w[2] >= 2000 && +w[2] <= 2100) {
      var at = new Date(+w[2], +w[3] - 1, +w[4]);
      if (at.getMonth() === +w[3] - 1 && at.getDate() === +w[4]) {
        if (w[1] === 'week') at = sunday(at);
        return { view: w[1], y: at.getFullYear(), m: at.getMonth(), d: at.getDate() };
      }
    }
    var now = new Date();
    return { view: 'month', y: now.getFullYear(), m: now.getMonth(), d: 1 };
  }
  function hashFor(view, d) {
    return view === 'month' ? '#' + d.getFullYear() + '-' + two(d.getMonth() + 1) : '#' + view + '-' + iso(view === 'week' ? sunday(d) : d);
  }
  /* step 0: today's month, week or day; else one month, week or day back or on. */
  function go(step) {
    var c = chosen(), d;
    if (step === 0) d = new Date();
    else if (c.view === 'month') d = new Date(c.y, c.m + step, 1);
    else d = new Date(c.y, c.m, c.d + step * (c.view === 'week' ? 7 : 1));
    var hash = hashFor(c.view, d);
    if (window.location.hash !== hash) window.location.hash = hash; else draw();
  }
  /* Another view of the same time: the month of the day on show, or the week or day of the first day on show (today,
     when that's in it). */
  function viewHref(view) {
    var c = chosen(), d = new Date(c.y, c.m, c.d), now = new Date();
    var start = c.view === 'month' ? new Date(c.y, c.m, 1) : d;
    var end = c.view === 'month' ? new Date(c.y, c.m + 1, 1) : new Date(c.y, c.m, c.d + (c.view === 'week' ? 7 : 1));
    if (now >= start && now < end) d = now; else d = start;
    return hashFor(view, d);
  }

  /* Each inspection on show between [from] and [to] (ms), with its time. */
  function between(from, to) {
    var out = [];
    data.parts('inspection').forEach(function (id) {
      if (!ID.test(id)) return;
      var w = data.when(id);
      if (w && w.at >= from && w.at < to) out.push({ id: id, at: w.at, timed: w.timed });
    });
    return out.sort(function (a, b) { return a.at - b.at || (a.id < b.id ? -1 : 1); });
  }
  function jobLink(j) {
    var job = tpl('job'), a = job.querySelector('a'), time = job.querySelector('[data-v="time"]');
    a.href = '/inspections#' + j.id;
    time.hidden = !j.timed;
    if (j.timed) { time.textContent = TIME.format(new Date(j.at)); time.setAttribute('datetime', new Date(j.at).toISOString()); }
    job.querySelector('[data-v="title"]').textContent = text(data.val('inspection', j.id, 'title'));
    job.querySelector('[data-v="address"]').textContent = text(data.val('inspection', j.id, 'address'));
    return job;
  }

  var last = { live: 'connecting', loaded: false };
  function draw(state) {
    if (state) last = state;
    show('data-live', last.live === 'failed' ? 'offline' : last.live);
    var c = chosen();
    // The view's own words and links: its title, which button is on, and the other views of the same time.
    all('[data-view]').forEach(function (a) {
      var v = a.getAttribute('data-view');
      a.href = '/calendar' + viewHref(v);
      if (v === c.view) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
    });
    show('data-step', c.view);
    var days = $('[data-days]'), grid = $('[data-grid]');
    if (!last.loaded) {
      $('[data-month]').textContent = c.view === 'month' ? MONTH.format(new Date(c.y, c.m, 1)) : LONG.format(new Date(c.y, c.m, c.d));
      show('data-state', last.live === 'failed' ? 'failed' : 'loading'); days.hidden = true; grid.hidden = true; return;
    }
    if (c.view === 'month') { grid.hidden = true; drawMonth(c, days); return; }
    days.hidden = true;
    var first = new Date(c.y, c.m, c.d), n = c.view === 'week' ? 7 : 1;
    var after = new Date(c.y, c.m, c.d + n);
    $('[data-month]').textContent = c.view === 'day' ? LONG.format(first) : RANGE(first, new Date(c.y, c.m, c.d + 6));
    var jobs = between(first.getTime(), after.getTime());
    var any = data.parts('inspection').some(function (id) { return ID.test(id); });
    show('data-state', !any ? 'empty' : jobs.length === 0 ? 'none-' + c.view : '');
    if (!any) { grid.hidden = true; return; }
    // A week on a phone: the list of its days, as the month is there.
    if (c.view === 'week' && narrow.matches) { grid.hidden = true; drawList(first, n, jobs, days); return; }
    drawGrid(first, n, jobs, grid);
  }

  /* Days [first] … +[n] as a list of the days that have inspections (a phone's week). */
  function drawList(first, n, jobs, days) {
    days.textContent = '';
    days.hidden = false;
    days.classList.add('cal-list');
    for (var i = 0; i < n; i++) {
      var date = new Date(first.getFullYear(), first.getMonth(), first.getDate() + i), next = new Date(date.getFullYear(), date.getMonth(), date.getDate() + 1);
      var on = jobs.filter(function (j) { return j.at >= date.getTime() && j.at < next.getTime(); });
      days.appendChild(dayCell(date, on));
    }
  }
  function dayCell(date, jobs) {
    var cell = tpl('day'), now = new Date();
    cell.setAttribute('data-date', iso(date));
    cell.querySelector('[data-v="dname"]').textContent = WEEKDAY.format(date);
    cell.querySelector('[data-v="num"]').textContent = String(date.getDate());
    cell.querySelector('.cal-date').setAttribute('aria-label', LONG.format(date));
    if (iso(now) === iso(date)) cell.setAttribute('aria-current', 'date');
    cell.classList.toggle('cal-empty', jobs.length === 0);
    var ul = cell.querySelector('.cal-jobs');
    ul.hidden = jobs.length === 0;
    jobs.forEach(function (j) { ul.appendChild(jobLink(j)); });
    return cell;
  }

  /* Days [first] … +[n] as columns of hours: each timed inspection at its start, HOLD minutes tall, side by side when
     they meet; ones with no set time in a row above. The hours shown: 7 AM to 7 PM, and wider when one starts outside. */
  function drawGrid(first, n, jobs, grid) {
    grid.hidden = false;
    grid.textContent = '';
    grid.style.setProperty('--cols', String(n));
    var from = 7, to = 19;
    jobs.forEach(function (j) {
      if (!j.timed) return;
      var t = new Date(j.at), h = t.getHours() + t.getMinutes() / 60;
      if (h < from) from = Math.floor(h);
      if (h + HOLD / 60 > to) to = Math.min(24, Math.ceil(h + HOLD / 60));
    });
    grid.style.setProperty('--hours', String(to - from));
    var head = tpl('grid-head'), untimed = tpl('grid-untimed'), body = tpl('grid-body');
    var hours = body.querySelector('[data-hours]');
    for (var h = from; h < to; h++) {
      var lab = tpl('hour');
      lab.textContent = TIME_H.format(new Date(2026, 0, 1, h));
      hours.appendChild(lab);
    }
    var anyUntimed = false, now = new Date();
    for (var i = 0; i < n; i++) {
      var date = new Date(first.getFullYear(), first.getMonth(), first.getDate() + i), next = new Date(date.getFullYear(), date.getMonth(), date.getDate() + 1);
      var on = jobs.filter(function (j) { return j.at >= date.getTime() && j.at < next.getTime(); });
      var dh = tpl('grid-day'), link = dh.querySelector('a');
      link.href = '/calendar#day-' + iso(date);
      link.querySelector('[data-v="dname"]').textContent = WEEKDAY.format(date);
      link.querySelector('[data-v="num"]').textContent = String(date.getDate());
      link.setAttribute('aria-label', LONG.format(date));
      if (iso(now) === iso(date)) dh.setAttribute('aria-current', 'date');
      head.appendChild(dh);
      var cell = tpl('grid-untimed-day'), loose = cell.querySelector('ul');
      on.filter(function (j) { return !j.timed; }).forEach(function (j) { anyUntimed = true; loose.appendChild(jobLink(j)); });
      untimed.appendChild(cell);
      var col = tpl('grid-col');
      col.setAttribute('data-date', iso(date));
      if (iso(now) === iso(date)) col.setAttribute('aria-current', 'date');
      // Side by side when they meet: each takes the first lane free at its start.
      var lanes = [], placed = [];
      on.filter(function (j) { return j.timed; }).forEach(function (j) {
        var lane = 0;
        while (lanes[lane] !== undefined && lanes[lane] > j.at) lane++;
        lanes[lane] = j.at + HOLD * 60000;
        placed.push({ j: j, lane: lane });
      });
      placed.forEach(function (p) {
        var t = new Date(p.j.at), start = (t.getHours() - from) * 60 + t.getMinutes();
        var block = jobLink(p.j);
        block.className = 'cal-block';
        block.style.setProperty('--start', String(start));
        block.style.setProperty('--len', String(HOLD));
        block.style.setProperty('--lane', String(p.lane));
        block.style.setProperty('--lanes', String(lanes.length));
        col.appendChild(block);
      });
      body.appendChild(col);
    }
    untimed.hidden = !anyUntimed;
    grid.appendChild(head);
    grid.appendChild(untimed);
    grid.appendChild(body);
  }

  function drawMonth(c, days) {
    var first = new Date(c.y, c.m, 1), next = new Date(c.y, c.m + 1, 1);
    $('[data-month]').textContent = MONTH.format(first);
    days.classList.remove('cal-list');
    var ids = data.parts('inspection').filter(function (id) { return ID.test(id); });
    var jobs = between(first.getTime(), next.getTime());
    show('data-state', ids.length === 0 ? 'empty' : jobs.length === 0 ? 'none' : '');
    days.hidden = ids.length === 0;
    days.textContent = '';
    // The week's day names (Sunday first, as the US calendar), then blanks up to the 1st.
    for (var i = 0; i < 7; i++) {
      var wd = tpl('weekday');
      wd.textContent = WEEKDAY.format(new Date(2026, 10, 15 + i));   // 2026-11-15 was a Sunday
      days.appendChild(wd);
    }
    for (var p = 0; p < first.getDay(); p++) days.appendChild(tpl('pad'));
    var length = new Date(c.y, c.m + 1, 0).getDate();
    for (var d = 1; d <= length; d++) {
      var date = new Date(c.y, c.m, d), nx = new Date(c.y, c.m, d + 1);
      days.appendChild(dayCell(date, jobs.filter(function (j) { return j.at >= date.getTime() && j.at < nx.getTime(); })));
    }
  }

  all('[data-go]').forEach(function (b) { b.addEventListener('click', function () { go(+b.getAttribute('data-go')); }); });
  window.addEventListener('hashchange', function () { draw(); });
  narrow.addEventListener('change', function () { draw(); });

  if (!auth.who()) { window.location.replace('/signin'); return; }
  main.hidden = false;
  draw();
  data.start(draw);
})();
