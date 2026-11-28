/* Your inspections, read only: what the calendar and the people page show, the inspector's inspections as their phone
   has them, read from the inspection-sync function (in the app's repo at backend/supabase/functions/inspection-sync)
   with the same rules as /inspections: one register per field, the newest change wins, deletion is final. These pages
   send nothing: every pull carries an empty push.
   They read only each inspection's own row and its people, so only those kinds are pulled (the list's kinds, which
   /inspections pulls and keeps the same way); kept in this browser between visits (insp-cache.js), they draw at once.
   It pulls only what changed after its point, and again whenever the server pings "something changed"
   (InspyxAuth.listen), when the tab comes back into view, and once a minute as a fallback.
   Each page calls InspyxInspections.start(draw); draw(state) runs after every pull, state = { live, loaded }:
   live is 'live', 'connecting', 'offline' or 'failed' (nothing could be loaded yet).
   This file says no words. The pages hold every sentence. */
(function (root) {
  'use strict';
  var auth = root.InspyxAuth;
  if (!auth) return;
  var DEADLINE = 20000, FALLBACK = 60000, RETRY = 5000;
  var DEVICE_KEY = 'inspyx.sync.device';

  /* This browser's sync name, the one /inspections makes: "web-" and 18 hex digits, made once. */
  function device() {
    var name = null;
    try { name = root.localStorage.getItem(DEVICE_KEY); } catch (e) { name = null; }
    if (name && /^web-[0-9a-f]{18}$/.test(name)) return name;
    var bytes = new Uint8Array(9);
    root.crypto.getRandomValues(bytes);
    name = 'web-' + [].map.call(bytes, function (b) { return ('0' + b.toString(16)).slice(-2); }).join('');
    try { root.localStorage.setItem(DEVICE_KEY, name); } catch (e) { /* kept for this visit only */ }
    return name;
  }
  var me = device();

  // "entity/id.field" -> { inspection, entity, id, field, value, at, device }; "entity/id" -> its inspection
  var fields = Object.create(null), owners = Object.create(null);
  var point = null, pulling = null, again = false, loaded = false, listening = false, draw = null;
  // The kinds these pages read: the same as /inspections's list, so the two share what is kept.
  var LIST_KINDS = ['inspection', 'person'];
  var cache = root.InspyxInspCache, account = auth.who() ? auth.who().owner : null;

  var key = function (entity, id, field) { return entity + '/' + id + '.' + field; };
  var later = function (a, b) { return a.at > b.at || (a.at === b.at && a.device > b.device); };
  function take(f) {
    if (!f || typeof f.entity !== 'string' || typeof f.id !== 'string' || typeof f.field !== 'string') return;
    var k = key(f.entity, f.id, f.field), held = fields[k];
    owners[f.entity + '/' + f.id] = f.inspection;
    if (!held || later(f, held)) fields[k] = f;
  }

  function val(entity, id, field) { var f = fields[key(entity, id, field)]; return f ? f.value : undefined; }
  function deleted(entity, id) { return val(entity, id, '_del') === true; }
  function owner(entity, id) { return owners[entity + '/' + id]; }

  /* An inspection the page may show: the phone's inspection always has a title, and a deleted one is gone. */
  function shown(id) { return typeof id === 'string' && !deleted('inspection', id) && typeof val('inspection', id, 'title') === 'string'; }

  /* The ids of every part of [entity] still standing, whose inspection is shown too. */
  function parts(entity) {
    var seen = Object.create(null), out = [];
    Object.keys(fields).forEach(function (k) {
      var f = fields[k];
      if (f.entity !== entity || seen[f.id]) return;
      seen[f.id] = true;
      if (deleted(entity, f.id)) return;
      if (!shown(entity === 'inspection' ? f.id : owner(entity, f.id))) return;
      out.push(f.id);
    });
    return out;
  }

  /* The inspection's day, by the phone's own rule (HomeInspection.day): its start, else the time it is booked for,
     else when it was made. timed: false when only the making time is known (that time is no appointment). */
  function when(id) {
    var num = function (v) { return typeof v === 'number' && isFinite(v) ? v : null; };
    var started = num(val('inspection', id, 'inspection_at')), booked = num(val('inspection', id, 'scheduled_at'));
    var made = num(val('inspection', id, 'created_at'));
    var at = started !== null ? started : booked !== null ? booked : made;
    return at === null ? null : { at: at, timed: started !== null || booked !== null };
  }

  function exchange() {
    return auth.ask('inspection-sync', { device: me, push: [], after: point, entities: LIST_KINDS, limit: 5000 }, DEADLINE).then(function (r) {
      if (r === null) { root.location.replace('/signin'); return false; }
      if (r.status !== 200 || !r.json || !Array.isArray(r.json.fields)) throw new Error('sync');
      r.json.fields.forEach(take);
      if (typeof r.json.next === 'number') point = r.json.next;
      return r.json.more === true;
    });
  }

  function tell(live) { if (draw) draw({ live: live, loaded: loaded }); }

  function sync() {
    if (pulling) { again = true; return pulling; }
    var loop = function () { return exchange().then(function (more) { return more ? loop() : null; }); };
    pulling = loop().then(function () {
      loaded = true;
      keep();
      tell(listening ? 'live' : 'connecting');
    }, function () {
      tell(loaded ? 'offline' : 'failed');
      setTimeout(sync, RETRY);
    }).then(function () {
      pulling = null;
      if (again) { again = false; sync(); }
    });
    return pulling;
  }

  /* Keeps what was pulled, as /inspections keeps its list: every field of the list's kinds, with the point. */
  function keep() {
    if (!cache || !account || point === null) return;
    var list = [];
    Object.keys(fields).forEach(function (k) { if (LIST_KINDS.indexOf(fields[k].entity) >= 0) list.push(fields[k]); });
    cache.write(account, 'list', point, list);
  }
  /* What was kept: drawn at once, then pulled after its point. */
  function fromKept() {
    if (!cache || !account) return Promise.resolve();
    return cache.read(account, 'list').then(function (got) {
      if (!got || point !== null) return;
      got.fields.forEach(take); point = got.point; loaded = true;
      tell('connecting');
    }, function () { /* nothing kept: the pull brings it */ });
  }

  var started = false;
  function start(onDraw) {
    if (started) return;
    started = true;
    draw = onDraw;
    if (!auth.who()) { root.location.replace('/signin'); return; }
    document.addEventListener('visibilitychange', function () { if (document.visibilityState === 'visible') sync(); });
    setInterval(function () { if (document.visibilityState === 'visible') sync(); }, FALLBACK);
    auth.listen(function (ping) {
      if (ping && ping.signedOut) { root.location.replace('/signin'); return; }
      if (ping && ping.joined) { listening = true; if (loaded) tell('live'); }
      sync();
    });
    fromKept().then(sync);
  }

  root.InspyxInspections = { start: start, val: val, parts: parts, owner: owner, when: when };
})(window);
