/* The Inspyx home page (2026-11-11): the scroll film, the calculator and the waitlist form.
   Plain JavaScript, no libraries. The words all live in index.html. */
(function () {
'use strict';

var doc = document;

/* The conversation in the Spex scene, as shares of its stretch of page: when each piece comes in
   (his words, Spex's answer, three times over, then the "filed" card), and the stills shown one by one
   when the visitor has motion turned off. */
var TALK_BEATS = [0.05, 0.19, 0.34, 0.49, 0.65, 0.79, 0.90];
var TALK_STILLS = [0.12, 0.27, 0.42, 0.60, 0.72, 0.87, 1];
/* The attic's floor in the Spex scene, lit: the insulation in the film's last rows. The dark of the moment is laid over it. */
var ATTIC_FLOOR = [198, 171, 127];
/* The Spex Business scene, the same way: a request comes in, Spex Business replies, the job lands on the
   calendar; then the same again for the second request. */
var DESK_BEATS = [0.04, 0.19, 0.33, 0.50, 0.65, 0.79];
var DESK_STILLS = [0.12, 0.27, 0.42, 0.60, 0.72, 1];
/* Mia's scene, the same way: the phone rings, Mia answers, the caller asks and Mia answers, twice over, and
   the job lands on the calendar. */
var CALL_BEATS = [0.03, 0.13, 0.25, 0.39, 0.54, 0.68, 0.83];
var CALL_STILLS = [0.09, 0.20, 0.33, 0.47, 0.62, 0.77, 1];
/* A scene with a sequence in it has a longer stretch of page than the others. Its clock stops this many px
   into the stretch, once the scene is fully on, and the sequence plays through the pause. */
var SEQ_HOLD = { 1: 780, 2: 845, 3: 735 };
var SEQ_STILLS = { 1: CALL_STILLS, 2: DESK_STILLS, 3: TALK_STILLS };
/* How tall the Spex Business scene's cards stand, before scaling: a request with its reply under it and
   the full calendar (roomy), or one card's place and the full calendar (tight). */
var DESK_ROOMY = 310, DESK_TIGHT = 225;
/* How tall the cards of Mia's scene stand, before scaling: a question with its answer under it (roomy), or
   one card at a time (tight). */
var CALL_ROOMY = 145, CALL_TIGHT = 75;
/* After Stripe's checkout the page shows one message and nothing else runs. */
if (doc.documentElement.hasAttribute('data-billing')) return;

/* ------------------------------------------------------------------
   The film. One day drawn in code, from the first call to the finished
   report. Scrolling moves the time of day. On phones it fills the
   screen behind the page; on wide screens it plays in a window.
   ------------------------------------------------------------------ */
class Film {

constructor(cv) {
this._cv = cv; this._box = cv.parentNode; this._ctx = null;
this._raf = 0; this._lastT = -1; this._lastDraw = 0; this._lastHk = null; this._isOff = false;
this._geo = null; this._geoAt = 0; this._geoKey = ''; this._geoSig = ''; this._scn = [];
this._tops = { 1: 353, 2: 376, 3: 325, 4: 315 }; this._heroB0 = 430; this._heroY = 430;
this._V = 0; this._Hs = 0; this._end = Infinity; this._isWide = false;
this._talkU = 0; this._lastTalk = -1; this._talkLive = [];
/* The words the film shows are written in the page (index.html), so the people and programs that can't see
   the film read the same words. Each spoken or written line is marked data-who, with the words in a <q>. */
const lines = (root) => {
const out = [], ps = root.querySelectorAll('[data-who]');
for (let i = 0; i < ps.length; i++) {
const q = ps[i].querySelector('q');
out.push({ who: ps[i].getAttribute('data-who'), label: ps[i].getAttribute('data-label') || '', text: (q ? q.textContent : ps[i].textContent).trim() });
}
return out;
};
/* The conversation in the Spex scene ([data-talk]). */
this._say = []; this._filed = null;
const talk = doc.querySelector('[data-talk]');
if (talk) {
this._say = lines(talk);
if (talk.getAttribute('data-filed')) this._filed = [talk.getAttribute('data-filed'), talk.getAttribute('data-filed-note') || ''];
}
/* The phone call in Mia's scene ([data-call]): what the caller asks and Mia answers, twice over, and the
   words on the small cards before and after. */
this._call = null; this._callU = 0; this._lastCall = -1; this._callLive = []; this._callBoxes = [];
const call = doc.querySelector('[data-call]');
if (call) {
const say = lines(call);
if (say.length >= 4) this._call = { say: say, ring: call.getAttribute('data-ring') || '', answered: call.getAttribute('data-answered') || '', booked: [call.getAttribute('data-booked') || '', call.getAttribute('data-booked-note') || ''] };
}
/* The Spex Business scene's words ([data-desk]): two requests with their replies, and the three lines of
   the calendar. */
this._desk = null; this._deskU = 0; this._lastDesk = -1; this._deskLive = [];
const desk = doc.querySelector('[data-desk]');
if (desk) {
const say = lines(desk), rows = [];
const rs = desk.querySelectorAll('[data-row]');
for (let i = 0; i < rs.length; i++) rows.push({ when: rs[i].getAttribute('data-when') || '', from: rs[i].getAttribute('data-from') || '' });
if (say.length >= 4 && rows.length >= 3) this._desk = { say: say, rows: rows, title: desk.getAttribute('data-cal') || '', count: desk.getAttribute('data-count') || '' };
}
/* what an iPhone's Safari shows behind its own bars (see _bars) */
this._story = doc.querySelector('[data-story]'); this._groundOn = null; this._underOn = null;
this._groundCol = ''; this._marks = null;
this._mq = window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : null;
this._wide = window.matchMedia ? window.matchMedia('(min-width: 860px) and (min-height: 520px)') : null;
this._initFilm();
}

start() {
if (this._raf) return;
const tick = (now) => {
this._raf = requestAnimationFrame(tick);
try { this._frame(now); } catch (e) { if (!this._warned) { this._warned = true; console.error(e); } }
};
this._raf = requestAnimationFrame(tick);
}

_still() {
return !!(this._mq && this._mq.matches);
}

_frame(now) {
const cv = this._cv;
const y0 = window.pageYOffset || doc.documentElement.scrollTop || 0;
const st = Math.max(0, y0);
this._layout(y0, st, now);
/* nothing to draw once the story has scrolled away */
const off = st > this._end;
if (off !== this._isOff) { this._isOff = off; this._box.classList.toggle('off', off); }
this._bars(st);
if (off) return;
const W = cv.clientWidth, Hc = cv.clientHeight;
if (!W || !Hc) return;
/* On a phone the canvas is as tall as the screen with the browser's bars tucked away;
   the scene is composed for the shorter screen you see first, and the rest is more ground. */
const H = this._isWide ? Hc : Math.min(Hc, this._Hs || Hc);
const dpr = Math.min(window.devicePixelRatio || 1, 2);
const pw = Math.round(W * dpr), ph = Math.round(Hc * dpr);
let resized = false;
if (cv.width !== pw || cv.height !== ph) { cv.width = pw; cv.height = ph; resized = true; }
if (!this._ctx) { this._ctx = cv.getContext('2d'); resized = true; }
if (H !== this._lastH) { this._lastH = H; resized = true; }
const still = this._still();
const T = this._filmTime(st, still);
const talk = this._talkU, desk = this._deskU, call = this._callU;
const hk = Math.max(-120, Math.round(this._heroY));
if (!resized && hk === this._lastHk && Math.abs(T - this._lastT) < 0.0004 && Math.abs(talk - this._lastTalk) < 0.0004 && Math.abs(desk - this._lastDesk) < 0.0004 && Math.abs(call - this._lastCall) < 0.0004 && (still || now - this._lastDraw < 45)) return;
this._lastT = T; this._lastTalk = talk; this._lastDesk = desk; this._lastCall = call; this._lastDraw = now; this._lastHk = hk;
this._Hc = Hc;
this._draw(this._ctx, W, H, dpr, T, still ? 0 : now / 1000);
this._bars(st);
}

/* An iPhone's Safari (iOS 26) floats its own bars over the page and colours what shows behind them itself.
   Measured in the iOS Simulator on 2026-11-12 (iPhone 17, iOS 26.2), with pages in loud colours:
   - behind the bottom of the screen, with Safari's bar open: the page that scrolls, here the story's own
     ground (a picture pinned to the screen, like the film, stops at the bar);
   - behind the bottom, with the bar tucked away: the body's background. A strip pinned to the bottom of the
     screen changes nothing there, and neither does the html element's background;
   - behind the top: the background of whatever is pinned to the top edge when the page loads, here the film's
     box as the stylesheet colours it (morning blue). Safari reads that once: a colour set later by script, a
     forced new layout, a nudge of the box and a theme-color tag were all tried, and none changed it.
   Left alone, the bottom was a white strip under the street. So on phones the story's ground takes the colour
   of the film's last row, and the body the colour of whatever lies at the bottom of the screen: the film's
   last row, the white sheet, the black waitlist, the white footer.
   On wider screens nothing is set: the film plays in a window there, and the page keeps its own grounds. */
_bars(st) {
const phone = !this._isWide && window.innerWidth <= 520 && !!this._groundCol;
const ground = phone ? this._groundCol : '';
if (this._story && ground !== this._groundOn) { this._groundOn = ground; this._story.style.backgroundColor = ground; }
let under = '';
if (phone) {
const m = this._marks, b = st + (window.innerHeight || 0);
under = !m || b < m.sheet ? ground : b < m.wait ? 'rgb(255, 255, 255)' : b < m.foot ? 'rgb(0, 0, 0)' : 'rgb(255, 255, 255)';
}
if (under !== this._underOn) { this._underOn = under; doc.body.style.backgroundColor = under; }
}

/* Reads where the sections and cards sit, and fades a card out as the next section pushes it away. */
_layout(y0, st, now) {
const wide = !!(this._wide && this._wide.matches);
const key = window.innerWidth + ':' + doc.documentElement.scrollHeight + ':' + (wide ? 'w' : 'n');
if (!this._geo || this._geoKey !== key || now - this._geoAt > 600) {
this._geoKey = key; this._geoAt = now; this._isWide = wide;
const top = (el) => el.getBoundingClientRect().top + y0;
const secs = doc.querySelectorAll('[data-scene]');
const scn = [];
let hero = null;
for (let i = 0; i < secs.length; i++) {
const n = parseFloat(secs[i].getAttribute('data-scene'));
if (n === 0) hero = secs[i];
if (n >= 1 && secs[i].offsetHeight > 0) scn.push({ n: n, top: top(secs[i]), h: secs[i].offsetHeight });
}
const cards = doc.querySelectorAll('[data-card]');
/* on a phone the cards lie over the film, so each scene keeps clear of its card;
   in the wide layout nothing covers the film */
const geo = [], tops = wide ? { 1: 20, 2: 20, 3: 20, 4: 20 } : { 1: 353, 2: 376, 3: 325, 4: 315 };
for (let i = 0; i < cards.length; i++) {
const el = cards[i], sec = el.parentNode;
if (!sec || !sec.getAttribute) continue;
const n = parseInt(sec.getAttribute('data-scene'), 10), h = el.offsetHeight;
if (!(h > 0)) continue;
const stick = parseFloat(window.getComputedStyle(el).top) || 0;
if (!wide && n >= 1 && n <= 4) tops[n] = stick + h;
const pb = parseFloat(window.getComputedStyle(sec).paddingBottom) || 0;
geo.push({ el: el, limit: top(sec) + sec.offsetHeight - pb - h - stick });
}
const he = doc.querySelector('[data-hero-end]');
const hb = wide ? 0 : (he ? top(he) + he.offsetHeight : 430);
const probe = doc.querySelector('[data-svh]');
const story = doc.querySelector('[data-story]');
const sheet = doc.querySelector('[data-sheet]');
this._Hs = probe ? probe.offsetHeight : 0;
this._V = hero ? hero.offsetHeight : (this._Hs || window.innerHeight);
this._end = wide ? (story ? top(story) + story.offsetHeight : Infinity) : (sheet ? top(sheet) + 90 : Infinity);
const sig = (wide ? 'w' : 'n') + hb + '|' + tops[1] + '|' + tops[2] + '|' + tops[3] + '|' + tops[4] + '|' + this._Hs;
if (sig !== this._geoSig) { this._geoSig = sig; this._lastT = -1; }
this._scn = scn; this._geo = geo; this._tops = tops; this._heroB0 = hb;
const wait = doc.querySelector('.wait'), foot = doc.querySelector('.foot');
this._marks = sheet && wait && foot ? { sheet: top(sheet), wait: top(wait), foot: top(foot) } : null;
}
this._heroY = this._heroB0 - st;
for (let i = 0; i < this._geo.length; i++) {
const g = this._geo[i];
const pushed = st - g.limit;
const op = pushed <= 0 ? '' : String(Math.round(Math.max(0, 1 - pushed / 100) * 50) / 50);
if (g.el.style.opacity !== op) g.el.style.opacity = op;
}
}

/* Film time: 1 at the top of the page, then one unit for each scene's stretch of page.
   Mia's scene, the Spex Business scene and the Spex scene have longer stretches than the last one. There the
   film's clock runs its usual 1,300 px with a pause in the middle, and the scene's own sequence plays through
   the pause: this._callU (the phone call), this._deskU (the two requests) and this._talkU (the conversation)
   each go 0 to 1. */
_filmTime(st, still) {
const V = this._V, a = this._scn || [];
let T = 1, talk = 0, desk = 0, call = 0;
for (let i = 0; i < a.length; i++) {
const e = st + V - a[i].top;
if (e <= 0) break;
const n = a[i].n, h = a[i].h, hold = SEQ_HOLD[n];
if (n > 1) call = 1;
if (n > 2) desk = 1;
if (n > 3) talk = 1;
if (hold && h > 1300) {
const sp = this._seqSpan(n, V, h);
const raw = Math.min(1, Math.max(0, (e - sp[0]) / (sp[1] - sp[0])));
/* the clock stops just after the scene is fully on, and starts again that far from the end */
const pl = e <= hold ? e : Math.max(hold, e - (h - 1300));
let u;
if (still) {
/* motion off: the scene before holds until the sequence starts; then each piece is a still of its own */
const stills = SEQ_STILLS[n];
T = n + (e < sp[0] ? 0 : 0.995);
u = e < sp[0] ? 0 : stills[Math.min(stills.length - 1, Math.floor(raw * stills.length))];
} else {
T = n + Math.min(1, pl / 1300);
u = raw;
}
if (n === 1) call = u; else if (n === 2) desk = u; else talk = u;
} else {
const q = Math.min(1, e / h);
T = n + (still ? (q < 0.5 ? 0 : 0.995) : q);
}
}
this._talkU = talk; this._deskU = desk; this._callU = call;
return T;
}

/* Where a scene's sequence starts and ends, in px from where its stretch enters the screen:
   from just after the scene is fully on and its card has settled, to a little before the stretch ends.
   On a very tall window the card settles late, and the sequence would run on past the end of its stretch
   (and be cut off as the next scene comes in). There it starts sooner, so that it keeps 900 px of its own. */
_seqSpan(n, V, h) {
const t1 = h - 150;
const t0 = Math.max(SEQ_HOLD[n] + 40, Math.min(Math.max(SEQ_HOLD[n], V - 80) + 40, t1 - 900));
return [t0, Math.max(t0 + 600, t1)];
}

/* For the tools: the scroll position that shows scene n's sequence at u (0 at its start, 1 at its end). */
seqScroll(n, u) {
const a = this._scn || [];
for (let i = 0; i < a.length; i++) {
if (a[i].n === n) { const sp = this._seqSpan(n, this._V, a[i].h); return Math.round(a[i].top - this._V + sp[0] + u * (sp[1] - sp[0])); }
}
return 0;
}
talkScroll(u) { return this.seqScroll(3, u); }
deskScroll(u) { return this.seqScroll(2, u); }
callScroll(u) { return this.seqScroll(1, u); }

_initFilm() {
const H = (h) => { const n = parseInt(h.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
const K = (d, o) => { const r = { d: d }; for (const k in o) r[k] = typeof o[k] === 'string' ? H(o[k]) : o[k]; return r; };
this._keys = [
K(0.00, { top: '#A9CBE8', mid: '#D9E4EA', hor: '#F8DDBE', tint: '#FFEBD6', shade: 0.97, sh: '#BDC2E0', haze: '#F4DCC6', hazeAmt: 0.42, sx: 0.14, sy: 0.10, sun: '#FFF1D6', glow: 0.9, win: 0, cloud: '#FFF6EC', cloudSh: '#EBCDB6', shDir: 1.6, shA: 0.24, stars: 0, alt: 0.25 }),
K(0.33, { top: '#62A8E2', mid: '#9FCDF0', hor: '#DCEEFA', tint: '#FFFFFF', shade: 1.0, sh: '#A9B4D8', haze: '#D9EAF7', hazeAmt: 0.20, sx: 0.50, sy: 0.66, sun: '#FFFFFF', glow: 0.5, win: 0, cloud: '#FFFFFF', cloudSh: '#D5E3F0', shDir: 0.15, shA: 0.32, stars: 0, alt: 1 }),
K(0.62, { top: '#6AA7DC', mid: '#B4D2EA', hor: '#F2E4CC', tint: '#FFF4E2', shade: 0.99, sh: '#B3B5D2', haze: '#EFE3CE', hazeAmt: 0.26, sx: 0.80, sy: 0.40, sun: '#FFF4DC', glow: 0.6, win: 0, cloud: '#FFF9EE', cloudSh: '#E6DCCB', shDir: -0.8, shA: 0.30, stars: 0, alt: 0.6 }),
K(0.84, { top: '#6F8FC0', mid: '#EFC79B', hor: '#FFAD6B', tint: '#FFD9A8', shade: 0.93, sh: '#A99DBE', haze: '#FFC896', hazeAmt: 0.46, sx: 0.90, sy: 0.13, sun: '#FFC98A', glow: 1.0, win: 0.3, cloud: '#FFD9B3', cloudSh: '#E99A6E', shDir: -2.0, shA: 0.24, stars: 0, alt: 0.2 }),
K(1.00, { top: '#17223F', mid: '#3F3F6E', hor: '#E57F5A', tint: '#7E86AD', shade: 0.62, sh: '#C9CCE3', haze: '#4A4A78', hazeAmt: 0.5, sx: 0.95, sy: -0.04, sun: '#FF9A6A', glow: 0.7, win: 1, cloud: '#75709A', cloudSh: '#3E3D66', shDir: -2.6, shA: 0.08, stars: 1, alt: 0 })
];
const pal = { siding: '#B7C3C8', siding2: '#C6D0D3', shake: '#CBD4D6', trim: '#F5F2EB', roof: '#5A5F67', roofEdge: '#3F444B', door: '#9B5A3A', gdoor: '#EEEAE1', shutter: '#3C4750', brick: '#A56F5A', found: '#9D9C97', lawnA: '#86AE62', lawnB: '#6C9B4D', walk: '#CFCBC3', drive: '#C7C3BB', sidewalk: '#D4D1CA', curbTop: '#DAD7D0', curbFace: '#A9A7A1', street: '#74787D', street2: '#5E6267', shrubA: '#5C8A49', shrubB: '#7BA85C', treeA: '#4F7F4A', treeB: '#6F9E55', fence: '#B99C7B', ladder: '#C9CED4', truck: '#F3F3F0', tire: '#23262B', rim: '#B9BEC4', bumper: '#3A3E44', vest: '#E8853B', jeans: '#3B475A', cap: '#2C3D57', skin: '#C99B7C', hair: '#4A3B32', metal: '#A9AEB4', metalD: '#858A91', box: '#2E3237' };
this._P = {};
for (const k in pal) this._P[k] = H(pal[k]);
this._G = { k: 1.22, yG: 40, swT: -16.9, swB: 1.4, curb: 9.2, xF: -128 };
this._FONT = "-apple-system, BlinkMacSystemFont, 'SF Pro Text', 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";
}

_lightAt(d) {
const ks = this._keys;
let i = 0;
while (i < ks.length - 2 && d > ks[i + 1].d) i++;
const a = ks[i], b = ks[i + 1];
const u = Math.min(1, Math.max(0, (d - a.d) / (b.d - a.d)));
const o = {};
for (const k in a) {
const va = a[k], vb = b[k];
o[k] = typeof va === 'number' ? va + (vb - va) * u : [va[0] + (vb[0] - va[0]) * u, va[1] + (vb[1] - va[1]) * u, va[2] + (vb[2] - va[2]) * u];
}
return o;
}

_c(b, sh, dp, a) {
const L = this._L;
let r = b[0] * L.tint[0] / 255 * L.shade, g = b[1] * L.tint[1] / 255 * L.shade, bl = b[2] * L.tint[2] / 255 * L.shade;
if (sh) { r += (r * L.sh[0] / 255 - r) * sh; g += (g * L.sh[1] / 255 - g) * sh; bl += (bl * L.sh[2] / 255 - bl) * sh; }
if (dp) { const h = L.hazeAmt * dp; r += (L.haze[0] - r) * h; g += (L.haze[1] - g) * h; bl += (L.haze[2] - bl) * h; }
return a == null ? 'rgb(' + (r | 0) + ',' + (g | 0) + ',' + (bl | 0) + ')' : 'rgba(' + (r | 0) + ',' + (g | 0) + ',' + (bl | 0) + ',' + a + ')';
}

/* The same colour sum as _c, as three numbers, for mixing two colours. */
_rgb(b, sh) {
const L = this._L, o = [];
for (let i = 0; i < 3; i++) { let v = b[i] * L.tint[i] / 255 * L.shade; if (sh) v += (v * L.sh[i] / 255 - v) * sh; o.push(v); }
return o;
}

_rgba(c, a) { return 'rgba(' + (c[0] | 0) + ',' + (c[1] | 0) + ',' + (c[2] | 0) + ',' + (a == null ? 1 : Math.max(0, a).toFixed(3)) + ')'; }

_glass() {
const L = this._L;
const d = [34 + (L.mid[0] - 34) * 0.38, 46 + (L.mid[1] - 46) * 0.38, 60 + (L.mid[2] - 60) * 0.38];
const k = 0.55 + 0.45 * L.shade;
const w = L.win;
return this._rgba([d[0] * k + (255 - d[0] * k) * w, d[1] * k + (214 - d[1] * k) * w, d[2] * k + (140 - d[2] * k) * w], 1);
}

_shadow(al) { return 'rgba(18,24,46,' + Math.max(0, al).toFixed(3) + ')'; }

_layer(ctx, k) {
const z = this._cam.z * k, d = this._dpr;
ctx.setTransform(z * d, 0, 0, z * d, (this._W / 2 - this._cam.x * z) * d, (this._Hh / 2 - this._cam.y * z) * d);
}

_screen(ctx) { const d = this._dpr; ctx.setTransform(d, 0, 0, d, 0, 0); }

_pt(k, x, y) {
const z = this._cam.z * k;
return [this._W / 2 + (x - this._cam.x) * z, this._Hh / 2 + (y - this._cam.y) * z];
}

_rr(ctx, x, y, w, h, r) {
r = Math.max(0, Math.min(r, w / 2, h / 2));
ctx.beginPath();
ctx.moveTo(x + r, y);
ctx.arcTo(x + w, y, x + w, y + h, r);
ctx.arcTo(x + w, y + h, x, y + h, r);
ctx.arcTo(x, y + h, x, y, r);
ctx.arcTo(x, y, x + w, y, r);
ctx.closePath();
}

_poly(ctx, pts) {
ctx.beginPath();
ctx.moveTo(pts[0][0], pts[0][1]);
for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
ctx.closePath();
}

_pose(k, px, py, ax, ay, vw) {
const W = this._W, H = this._Hh, z = W / vw;
return { x: px - (ax * W - W / 2) / (z * k), y: py - (ay * H - H / 2) / (z * k), z: z };
}

_mixPose(a, b, u) {
return { x: a.x + (b.x - a.x) * u, y: a.y + (b.y - a.y) * u, z: a.z * Math.pow(b.z / a.z, u) };
}

_draw(ctx, W, H, dpr, T, t) {
this._W = W; this._Hh = H; this._dpr = dpr;
const Hc = this._Hc || H;
const cl = (x) => Math.min(1, Math.max(0, x));
const ramp = (a, b, x) => cl((x - a) / (b - a));
const ease = (x) => x * x * (3 - 2 * x);
this._ramp = ramp; this._ease = ease;

const tab = [[1, 0], [1.6, 0.08], [2.55, 0.33], [3.5, 0.62], [4.3, 0.78], [4.62, 0.86], [5, 1]];
let d = 1;
for (let i = 0; i < tab.length - 1; i++) {
if (T <= tab[i + 1][0]) { d = tab[i][1] + (tab[i + 1][1] - tab[i][1]) * ramp(tab[i][0], tab[i + 1][0], T); break; }
}
this._L = this._lightAt(d);

const G = this._G, tops = this._tops;
/* first screen: the trees sit below the words where there is room, and the truck stays clear of the scroll hint;
   office scene: the tablet stays below its cards on shorter screens. Where there is room (a wide window,
   a tall tablet) a request and its reply sit one above the other; on a phone, where the page's own card
   covers the top of the film, the reply takes the request's place. */
const zA = W / 620;
const ayTree = (this._heroB0 + 12 + 0.84 * 290 * zA) / (0.84 * H) - 0.0952;
const ayTruck = (0.5 * (1 + G.k) * H - 64 - G.k * G.yG * zA) / (G.k * H);
const ayA = Math.min(ayTruck, Math.max(0.8, ayTree));
const roomC = H - tops[2] - 98;
const roomy = roomC >= DESK_ROOMY;
const sC = roomy ? Math.min(1.3, W / 390, roomC / DESK_ROOMY) : Math.max(0.82, Math.min(1.12, W / 390, roomC / DESK_TIGHT));
const ayC = Math.min(0.95, Math.max(0.77, (tops[2] + 14 + (roomy ? DESK_ROOMY : DESK_TIGHT) * sC + 27 * G.k * W / 262) / H));
this._sC = sC; this._deskRoomy = roomy;
/* Mia's scene: the cards of the phone call hang between the eave, where he kneels on the roof, and the roof
   of the truck. That gap belongs to the drawing, so the cards are sized to it. Where the page's own card
   comes lower than the eave (a phone with its browser bars showing), the truck sits lower on the screen to
   keep the gap; where even that leaves no room for a question with its answer (a small phone), one card
   shows at a time.
   The numbers, measured from the point on the cab the camera aims at: the truck's roof is 18 of its units
   above it and the eave 104 of the house's units; `keep` is how much of the truck below it must stay on the
   screen (45 shows the tops of the wheels, 30 the door handles). */
const zB = W / 292, zkB = zB * G.k, sB0 = Math.max(0.82, Math.min(1.12, W / 390));
const gapB = (ay) => ay * H - 18 * zkB + 6 - Math.max(tops[1] + 14, H / 2 - 104 * zB + (ay - 0.5) * H / G.k + 8);
const downB = (tall, keep) => Math.max(0.76, Math.min((H - keep * zkB) / H, (tops[1] + 8 + tall + 18 * zkB) / H));
let ayB = downB(CALL_ROOMY * sB0, 45), sB = Math.min(sB0, gapB(ayB) / CALL_ROOMY);
const roomyB = sB >= 0.78;
if (!roomyB) { ayB = downB(CALL_TIGHT * sB0, 30); sB = sB0; }
this._sB = sB; this._callRoomy = roomyB;
const A = this._pose(1, -40, 0, 0.5, ayA, 620);
const B = this._pose(G.k, G.xF + 118, G.yG - 75, 0.56, ayB, 292);
const B2 = this._pose(G.k, G.xF + 118, G.yG - 75, 0.56, ayB, 274);
const C = this._pose(G.k, G.xF + 318, G.yG - 52, 0.52, ayC, 262);
const C2 = this._pose(G.k, G.xF + 318, G.yG - 52, 0.52, ayC, 248);
const E = this._pose(1, -40, 0, 0.5, 0.82, 585);
const E2 = this._pose(1, -40, 0, 0.5, 0.82, 640);
let cam;
if (T < 1.06) cam = A;
else if (T < 1.55) cam = this._mixPose(A, B, ease(ramp(1.06, 1.55, T)));
else if (T < 2.06) cam = this._mixPose(B, B2, ramp(1.55, 2.06, T));
else if (T < 2.55) cam = this._mixPose(B2, C, ease(ramp(2.06, 2.55, T)));
else if (T < 3.6) cam = this._mixPose(C, C2, ramp(2.55, 3.3, T));
else cam = this._mixPose(E, E2, ramp(4.0, 5.0, T));
cam = { x: cam.x + Math.sin(t * 0.23) * 1.6 / cam.z, y: cam.y + Math.sin(t * 0.31 + 1) * 0.9 / cam.z, z: cam.z * (1 + 0.007 * Math.sin(t * 0.17)) };
this._cam = cam;

const aD = ramp(3.36, 3.56, T) * (1 - ramp(4.36, 4.56, T));
this._screen(ctx);
ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
ctx.clearRect(0, 0, W, Hc);
if (aD < 1) {
this._sky(ctx, W, H, t);
this._world(ctx, W, H, t, T);
this._fx(ctx, W, H, t, T);
if (T < 1.8) this._mist(ctx, W, H);
if (T > 1.5 && T < 2.25) this._reception(ctx, W, H, t, T);
if (T > 2.5 && T < 3.56) this._office(ctx, W, H, t, T);
if (T > 4.5) this._pagesE(ctx, W, H, t, T);
}
if (aD >= 1) {
this._shotD(ctx, W, H, t, T);
} else if (aD > 0) {
if (!this._off) this._off = document.createElement('canvas');
const off = this._off;
if (off.width !== ctx.canvas.width || off.height !== ctx.canvas.height) { off.width = ctx.canvas.width; off.height = ctx.canvas.height; }
const octx = off.getContext('2d');
octx.setTransform(1, 0, 0, 1, 0, 0); octx.globalAlpha = 1; octx.clearRect(0, 0, off.width, off.height);
this._shotD(octx, W, H, t, T);
ctx.setTransform(1, 0, 0, 1, 0, 0);
ctx.globalAlpha = aD;
ctx.drawImage(off, 0, 0);
ctx.globalAlpha = 1;
}
this._screen(ctx);
const vg = ctx.createRadialGradient(W / 2, Hc * 0.56, Hc * 0.34, W / 2, Hc * 0.56, Hc * 0.82);
vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(0,0,0,0.24)');
ctx.fillStyle = vg; ctx.fillRect(0, 0, W, Hc);
/* The colour of the film's last row, for _bars: the street in the light of the hour, or the dark the attic
   ends in in the Spex scene (a little darker still under the darkened corners).
   Stepped by fours, so that the page's grounds are repainted now and then and not at every pixel of scroll. */
const step = (v) => Math.max(0, Math.min(255, Math.round(v / 4) * 4));
const street = this._rgb(this._P.street2, 0.3), attic = this._atticGround || [34, 33, 37];
this._groundCol = 'rgb(' + [0, 1, 2].map((i) => step(street[i] + (attic[i] * 0.92 - street[i]) * aD)).join(', ') + ')';
}

_sky(ctx, W, H, t) {
const L = this._L, Hc = this._Hc || H;
this._screen(ctx);
const hy = Math.max(H * 0.5, Math.min(H, this._pt(1, 0, -60)[1]));
const g = ctx.createLinearGradient(0, 0, 0, hy);
g.addColorStop(0, this._rgba(L.top)); g.addColorStop(0.58, this._rgba(L.mid)); g.addColorStop(1, this._rgba(L.hor));
ctx.fillStyle = g; ctx.fillRect(0, 0, W, Hc);
if (L.stars > 0.02) {
for (let i = 0; i < 46; i++) {
const rx = Math.abs((Math.sin(i * 127.1) * 43758.5453) % 1), ry = Math.abs((Math.sin(i * 311.7) * 43758.5453) % 1);
const tw = 0.6 + 0.4 * Math.sin(t * 1.3 + i);
ctx.fillStyle = 'rgba(255,255,255,' + (L.stars * 0.8 * tw * (1 - ry * 0.6)).toFixed(3) + ')';
ctx.fillRect(rx * W, ry * hy * 0.62, 1.5, 1.5);
}
}
const sx = L.sx * W, sy = H * 0.77 - L.sy * H;
const g2 = ctx.createRadialGradient(sx, sy, 0, sx, sy, W * 0.95);
g2.addColorStop(0, this._rgba(L.sun, 0.78 * L.glow)); g2.addColorStop(0.22, this._rgba(L.sun, 0.30 * L.glow)); g2.addColorStop(1, this._rgba(L.sun, 0));
ctx.fillStyle = g2; ctx.fillRect(0, 0, W, Hc);
ctx.fillStyle = 'rgba(255,252,240,0.96)';
ctx.beginPath(); ctx.arc(sx, sy, W * 0.043, 0, 6.2832); ctx.fill();
const cls = [[0.05, 0.10, 1.0, 1.0], [0.60, 0.065, 0.8, 0.7], [0.98, 0.21, 1.25, 0.85], [0.36, 0.29, 0.72, 1.2], [1.30, 0.15, 0.9, 0.6]];
const span = W * 1.9;
for (let i = 0; i < cls.length; i++) {
const q = cls[i];
const x = (((q[0] * W + t * q[3] * W * 0.006 - this._cam.x * 0.03 * this._cam.z) % span) + span) % span - W * 0.45;
ctx.save(); ctx.translate(x, q[1] * H); ctx.scale(1, 0.6);
this._cloud(ctx, 0, 0, q[2] * W * 0.118);
ctx.restore();
}
}

_cloud(ctx, x, y, s) {
const L = this._L;
const pf = [[0, 0, 1], [-1.1, 0.2, 0.72], [1.05, 0.22, 0.78], [-0.5, -0.28, 0.7], [0.48, -0.34, 0.8], [2.0, 0.32, 0.5], [-1.9, 0.32, 0.46]];
for (let pass = 0; pass < 2; pass++) {
for (let i = 0; i < pf.length; i++) {
const p = pf[i];
const cx = x + p[0] * s, cy = y + p[1] * s + (pass === 0 ? 0.26 * s : -0.04 * s), r = p[2] * s * (pass === 0 ? 1.0 : 0.94);
const col = pass === 0 ? L.cloudSh : L.cloud;
const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
g.addColorStop(0, this._rgba(col, pass === 0 ? 0.5 : 0.96)); g.addColorStop(0.62, this._rgba(col, pass === 0 ? 0.36 : 0.82)); g.addColorStop(1, this._rgba(col, 0));
ctx.fillStyle = g; ctx.fillRect(cx - r, cy - r, r * 2, r * 2);
}
}
}

_canopy(ctx, x, y, r, base, depth, hx) {
const pts = [[0, 0, 1], [-0.66, 0.2, 0.74], [0.66, 0.22, 0.76], [-0.32, -0.44, 0.72], [0.36, -0.42, 0.74], [0, 0.4, 0.86]];
ctx.fillStyle = this._c(base, 0.5, depth);
ctx.beginPath();
for (let i = 0; i < pts.length; i++) { const p = pts[i]; const cx = x + p[0] * r, cy = y + p[1] * r, q = p[2] * r * 0.62; ctx.moveTo(cx + q, cy); ctx.arc(cx, cy, q, 0, 6.2832); }
ctx.fill();
ctx.fillStyle = this._c(base, 0, depth, 0.6);
ctx.beginPath();
for (let i = 0; i < pts.length; i++) { const p = pts[i]; const cx = x + p[0] * r + hx * r * 0.15, cy = y + p[1] * r - r * 0.13, q = p[2] * r * 0.45; ctx.moveTo(cx + q, cy); ctx.arc(cx, cy, q, 0, 6.2832); }
ctx.fill();
}

_siding(ctx, x, y, w, h, step) {
ctx.strokeStyle = 'rgba(30,40,50,0.09)'; ctx.lineWidth = 0.9;
ctx.beginPath();
for (let yy = y + step; yy < y + h; yy += step) { ctx.moveTo(x, yy); ctx.lineTo(x + w, yy); }
ctx.stroke();
}

_win(ctx, x, y, w, h, cols, rows) {
const P = this._P, L = this._L;
ctx.fillStyle = this._c(P.trim); ctx.fillRect(x - 5, y - 5, w + 10, h + 11);
ctx.fillStyle = this._glass(); ctx.fillRect(x, y, w, h);
if (L.win < 0.6) {
ctx.fillStyle = 'rgba(255,255,255,' + (0.12 * (1 - L.win)).toFixed(3) + ')';
this._poly(ctx, [[x, y + h * 0.72], [x + w * 0.5, y], [x + w * 0.8, y], [x, y + h]]); ctx.fill();
} else {
ctx.fillStyle = 'rgba(170,110,50,0.20)'; ctx.fillRect(x, y, w * 0.14, h); ctx.fillRect(x + w * 0.86, y, w * 0.14, h);
}
ctx.fillStyle = this._c(P.trim);
for (let i = 1; i < cols; i++) ctx.fillRect(x + w * i / cols - 1.5, y, 3, h);
for (let j = 1; j < rows; j++) ctx.fillRect(x, y + h * j / rows - 1.2, w, 2.4);
ctx.fillStyle = this._shadow(L.shA * 0.8 * (1 - L.win)); ctx.fillRect(x, y, w, 3 + 4 * L.alt);
}

_shutter(ctx, x, y, w, h) {
ctx.fillStyle = this._c(this._P.shutter); ctx.fillRect(x, y, w, h);
ctx.fillStyle = 'rgba(255,255,255,0.10)';
for (let yy = y + 4; yy < y + h - 2; yy += 6) ctx.fillRect(x + 1.5, yy, w - 3, 1.2);
}

_shrub(ctx, x, r, hx, alt) {
const P = this._P;
const pts = [[0, -0.55, 0.78], [-0.62, -0.3, 0.56], [0.64, -0.32, 0.6]];
ctx.fillStyle = this._c(alt ? P.shrubB : P.shrubA, 0.5);
ctx.beginPath();
for (let i = 0; i < 3; i++) { const p = pts[i]; ctx.moveTo(x + p[0] * r + p[2] * r, p[1] * r); ctx.arc(x + p[0] * r, p[1] * r, p[2] * r, 0, 6.2832); }
ctx.fill();
ctx.fillStyle = this._c(alt ? P.shrubB : P.shrubA, 0, 0, 0.75);
ctx.beginPath();
for (let i = 0; i < 3; i++) { const p = pts[i]; ctx.moveTo(x + p[0] * r + hx * r * 0.14 + p[2] * r * 0.66, p[1] * r - r * 0.12); ctx.arc(x + p[0] * r + hx * r * 0.14, p[1] * r - r * 0.12, p[2] * r * 0.66, 0, 6.2832); }
ctx.fill();
}

_world(ctx, W, H, t, T) {
const L = this._L, P = this._P, G = this._G, me = this;
const c = (b, sh, dp, a) => me._c(b, sh, dp, a);
const sd = (al) => me._shadow(al);
const hx = (L.sx - 0.5) * 2;
let g;

/* far: neighbours and backyard trees */
this._layer(ctx, 0.9);
ctx.fillStyle = c(P.siding2, 0.25, 0.62); ctx.fillRect(455, -118, 300, 118); ctx.fillRect(-770, -110, 255, 110);
ctx.fillStyle = c(P.roof, 0.15, 0.62);
this._poly(ctx, [[440, -118], [770, -118], [715, -200], [495, -200]]); ctx.fill();
this._poly(ctx, [[-785, -110], [-500, -110], [-550, -190], [-735, -190]]); ctx.fill();
this._layer(ctx, 0.84);
ctx.fillStyle = c(P.treeA, 0.5, 0.5); ctx.fillRect(-1200, -138, 2500, 200);
const trees = [[-660, -142, 96], [-480, -160, 102], [-310, -178, 88], [-160, -196, 92], [0, -188, 84], [150, -200, 98], [305, -182, 88], [450, -166, 98], [615, -150, 92], [780, -142, 96]];
for (let i = 0; i < trees.length; i++) {
const tr = trees[i];
this._canopy(ctx, tr[0] + Math.sin(t * 0.5 + i * 1.7) * 1.3, tr[1], tr[2], i % 2 ? P.treeA : P.treeB, 0.5, hx);
}

/* the house */
this._layer(ctx, 1);
const fence = (x0, x1) => {
ctx.fillStyle = c(P.fence, 0.15, 0.12); ctx.fillRect(x0, -64, x1 - x0, 64);
ctx.strokeStyle = 'rgba(60,40,20,0.18)'; ctx.lineWidth = 0.8;
ctx.beginPath();
for (let x = x0; x <= x1; x += 9) { ctx.moveTo(x, -64); ctx.lineTo(x, 0); }
ctx.stroke();
ctx.fillStyle = c(P.fence, 0.45, 0.12); ctx.fillRect(x0, -66, x1 - x0, 3.5);
};
fence(290, 700); fence(-800, -400);

ctx.fillStyle = c(P.siding); ctx.fillRect(-90, -140, 380, 140);
this._siding(ctx, -90, -140, 380, 140, 9);
ctx.fillStyle = c(P.found, 0.2); ctx.fillRect(-90, -5, 380, 5);
if (L.shDir > 0.2) {
const sw = Math.min(46, 14 * L.shDir);
g = ctx.createLinearGradient(-90, 0, -90 + sw, 0);
g.addColorStop(0, sd(L.shA)); g.addColorStop(1, sd(0));
ctx.fillStyle = g; ctx.fillRect(-90, -140, sw, 140);
}
const es = 9 + 20 * L.alt;
g = ctx.createLinearGradient(0, -139, 0, -139 + es);
g.addColorStop(0, sd(L.shA * 1.5)); g.addColorStop(1, sd(0));
ctx.fillStyle = g; ctx.fillRect(-90, -139, 380, es);
this._shutter(ctx, 46, -106, 14, 67); this._shutter(ctx, 170, -106, 14, 67);
this._win(ctx, 62, -106, 106, 66, 2, 2);
this._shutter(ctx, 196, -106, 10, 55); this._shutter(ctx, 258, -106, 10, 55);
this._win(ctx, 208, -106, 48, 54, 1, 2);

ctx.fillStyle = c(P.trim); ctx.fillRect(-67, -111, 60, 111);
ctx.fillStyle = c(P.door, 0.1); ctx.fillRect(-61, -105, 48, 105);
ctx.fillStyle = this._glass(); ctx.fillRect(-52, -96, 30, 26);
ctx.fillStyle = c(P.door, 0.1); ctx.fillRect(-37.7, -96, 1.4, 26); ctx.fillRect(-52, -83.7, 30, 1.4);
ctx.strokeStyle = sd(0.24); ctx.lineWidth = 1;
ctx.strokeRect(-53, -62, 13.5, 24); ctx.strokeRect(-35.5, -62, 13.5, 24); ctx.strokeRect(-53, -33, 13.5, 26); ctx.strokeRect(-35.5, -33, 13.5, 26);
ctx.fillStyle = '#D8C7A0'; ctx.beginPath(); ctx.arc(-18.5, -50, 2, 0, 6.2832); ctx.fill();
ctx.fillStyle = sd(L.shA * 0.9); ctx.fillRect(-61, -105, 48, 4 + 6 * L.alt);
ctx.fillStyle = c(P.shutter); this._rr(ctx, -79, -99, 6, 11, 1.5); ctx.fill();

ctx.fillStyle = c(P.roof); this._poly(ctx, [[-100, -146], [308, -146], [286, -244], [-78, -244]]); ctx.fill();
g = ctx.createLinearGradient(0, -244, 0, -146);
g.addColorStop(0, 'rgba(255,255,255,' + (0.10 + 0.08 * L.alt).toFixed(3) + ')'); g.addColorStop(1, 'rgba(255,255,255,0)');
ctx.fillStyle = g; this._poly(ctx, [[-100, -146], [308, -146], [286, -244], [-78, -244]]); ctx.fill();
ctx.strokeStyle = 'rgba(0,0,0,0.15)'; ctx.lineWidth = 0.9;
ctx.beginPath();
for (let y = -236; y < -146; y += 10) { const u = (y + 244) / 98; ctx.moveTo(-78 - 22 * u, y); ctx.lineTo(286 + 22 * u, y); }
ctx.stroke();
ctx.strokeStyle = c(P.roofEdge); ctx.lineWidth = 3;
ctx.beginPath(); ctx.moveTo(-78, -244); ctx.lineTo(286, -244); ctx.stroke();
ctx.fillStyle = c(P.brick); ctx.fillRect(204, -268, 32, 58);
ctx.fillStyle = c(P.brick, 0.7); ctx.fillRect(hx < 0 ? 226 : 204, -268, 10, 58);
ctx.fillStyle = c(P.found); ctx.fillRect(200, -273, 40, 6);
ctx.fillStyle = c(P.trim); ctx.fillRect(-100, -147, 408, 8);
ctx.fillStyle = sd(0.2); ctx.fillRect(-100, -140.5, 408, 1.5);

/* garage wing, set forward */
ctx.fillStyle = c(P.siding2); ctx.fillRect(-400, -130, 310, 130);
this._siding(ctx, -400, -130, 310, 130, 9);
ctx.fillStyle = c(P.found, 0.2); ctx.fillRect(-400, -5, 310, 5);
ctx.fillStyle = c(P.shake); this._poly(ctx, [[-408, -128], [-82, -128], [-245, -229]]); ctx.fill();
ctx.strokeStyle = 'rgba(30,40,50,0.085)'; ctx.lineWidth = 0.9;
ctx.beginPath();
for (let y = -221; y < -128; y += 8) { const hw = 163 * (y + 229) / 101; ctx.moveTo(-245 - hw, y); ctx.lineTo(-245 + hw, y); }
ctx.stroke();
ctx.fillStyle = c(P.trim); ctx.fillRect(-408, -134, 326, 7);
g = ctx.createLinearGradient(0, -127, 0, -127 + es * 0.7);
g.addColorStop(0, sd(L.shA * 1.3)); g.addColorStop(1, sd(0));
ctx.fillStyle = g; ctx.fillRect(-400, -127, 310, es * 0.7);
ctx.lineJoin = 'miter'; ctx.lineCap = 'butt';
ctx.strokeStyle = c(P.roofEdge); ctx.lineWidth = 7;
ctx.beginPath(); ctx.moveTo(-423, -126); ctx.lineTo(-245, -243); ctx.lineTo(-67, -126); ctx.stroke();
ctx.strokeStyle = c(P.trim); ctx.lineWidth = 7;
ctx.beginPath(); ctx.moveTo(-416, -123); ctx.lineTo(-245, -234); ctx.lineTo(-74, -123); ctx.stroke();
ctx.fillStyle = c(P.trim); ctx.fillRect(-260, -198, 30, 28);
ctx.fillStyle = c(P.shutter, 0.2);
for (let y = -194; y < -173; y += 5) ctx.fillRect(-256, y, 22, 2.4);
ctx.fillStyle = c(P.trim); ctx.fillRect(-400, -130, 5, 130); ctx.fillRect(-95, -130, 5, 130);
ctx.fillStyle = c(P.trim); ctx.fillRect(-365, -107, 240, 107);
ctx.fillStyle = c(P.gdoor, 0.12); ctx.fillRect(-359, -101, 228, 101);
for (let r = 0; r < 4; r++) {
const y0 = -101 + r * 25.25;
ctx.fillStyle = sd(0.12); ctx.fillRect(-359, y0, 228, 1.2);
for (let k = 0; k < 4; k++) {
const x0 = -354 + k * 56;
if (r === 0) {
ctx.fillStyle = this._glass(); ctx.fillRect(x0 + 2, y0 + 6, 46, 13.5);
ctx.fillStyle = c(P.gdoor, 0.12); ctx.fillRect(x0 + 24.3, y0 + 6, 1.4, 13.5);
} else {
ctx.strokeStyle = sd(0.11); ctx.lineWidth = 0.9; ctx.strokeRect(x0 + 2, y0 + 5.5, 46, 14.5);
}
}
}
ctx.fillStyle = sd(L.shA * 0.8); ctx.fillRect(-359, -101, 228, 3 + 5 * L.alt);
ctx.fillStyle = c(P.shutter); this._rr(ctx, -385, -101, 6, 11, 1.5); ctx.fill(); this._rr(ctx, -111, -101, 6, 11, 1.5); ctx.fill();

/* ground: lawn, drive, walk, sidewalk, curb, street */
this._screen(ctx);
const y1 = this._pt(1, 0, 0)[1], y2 = this._pt(G.k, 0, G.swT)[1], y3 = this._pt(G.k, 0, G.swB)[1], y4 = this._pt(G.k, 0, G.curb)[1];
g = ctx.createLinearGradient(0, y1, 0, y2);
g.addColorStop(0, c(P.lawnA, 0.1, 0.22)); g.addColorStop(1, c(P.lawnB));
ctx.fillStyle = g; ctx.fillRect(0, y1 - 0.5, W, y2 - y1 + 1);
g = ctx.createLinearGradient(0, y1, 0, y1 + 12 * this._cam.z);
g.addColorStop(0, 'rgba(14,28,18,0.30)'); g.addColorStop(1, 'rgba(14,28,18,0)');
ctx.fillStyle = g; ctx.fillRect(0, y1, W, 12 * this._cam.z);
ctx.fillStyle = c(P.drive);
this._poly(ctx, [this._pt(1, -364, 0), this._pt(1, -126, 0), this._pt(G.k, -150, G.swT), this._pt(G.k, -436, G.swT)]); ctx.fill();
ctx.fillStyle = c(P.walk);
this._poly(ctx, [this._pt(1, -60, 0), this._pt(1, -14, 0), this._pt(G.k, 4, G.swT), this._pt(G.k, -56, G.swT)]); ctx.fill();
ctx.fillStyle = c(P.sidewalk); ctx.fillRect(0, y2 - 0.5, W, y3 - y2 + 1);
ctx.strokeStyle = 'rgba(40,40,40,0.14)'; ctx.lineWidth = 1;
ctx.beginPath();
for (let x = -1240; x < 1300; x += 62) { const p = this._pt(G.k, x, G.swT), q = this._pt(G.k, x - 3, G.swB); if (q[0] < -20 || p[0] > W + 20) continue; ctx.moveTo(p[0], p[1]); ctx.lineTo(q[0], q[1]); }
ctx.stroke();
ctx.fillStyle = c(P.curbTop); ctx.fillRect(0, y3 - 0.5, W, (y4 - y3) * 0.5 + 0.5);
ctx.fillStyle = c(P.curbFace, 0.3); ctx.fillRect(0, y3 + (y4 - y3) * 0.5, W, (y4 - y3) * 0.5 + 0.5);
g = ctx.createLinearGradient(0, y4, 0, Math.max(y4 + 1, H));
g.addColorStop(0, c(P.street)); g.addColorStop(1, c(P.street2, 0.3));
ctx.fillStyle = g; ctx.fillRect(0, y4, W, Math.max(0, (this._Hc || H) - y4) + 2);

/* things standing on the ground in front of the house */
this._layer(ctx, 1);
ctx.fillStyle = c(P.walk, 0.2); ctx.fillRect(-76, -6, 78, 8);
ctx.fillStyle = c(P.curbTop); ctx.fillRect(-76, -7, 78, 2.2);
const shrubs = [[-386, 26, 0], [-112, 22, 1], [-8, 15, 0], [44, 20, 1], [112, 27, 0], [186, 23, 1], [268, 26, 0]];
for (let i = 0; i < shrubs.length; i++) { ctx.save(); ctx.translate(0, 2); this._shrub(ctx, shrubs[i][0], shrubs[i][1], hx, shrubs[i][2]); ctx.restore(); }
ctx.strokeStyle = sd(L.shA * 0.7); ctx.lineWidth = 2;
ctx.beginPath(); ctx.moveTo(24 + L.shDir * 2.5, 0); ctx.lineTo(24 + L.shDir * 2.5, -139); ctx.moveTo(37 + L.shDir * 2.5, 0); ctx.lineTo(37 + L.shDir * 2.5, -139); ctx.stroke();
ctx.strokeStyle = c(P.ladder, 0.15); ctx.lineWidth = 2.3; ctx.lineCap = 'butt';
ctx.beginPath(); ctx.moveTo(20, 2); ctx.lineTo(20, -164); ctx.moveTo(33, 2); ctx.lineTo(33, -164); ctx.stroke();
ctx.lineWidth = 1.5;
ctx.beginPath();
for (let y = -8; y > -160; y -= 12.5) { ctx.moveTo(20, y); ctx.lineTo(33, y); }
ctx.stroke();
if (T < 3.6) this._roofGuy(ctx);

this._truck(ctx, t, T);
}

_roofGuy(ctx) {
const P = this._P, me = this;
const c = (b, sh, dp, a) => me._c(b, sh, dp, a);
ctx.save();
ctx.translate(70, -150);
ctx.fillStyle = c(P.jeans); this._rr(ctx, -10, -11, 30, 10, 4); ctx.fill();
ctx.fillStyle = c(P.tire); this._rr(ctx, 17, -9.5, 9, 8.5, 3); ctx.fill();
ctx.save(); ctx.translate(-2, -10); ctx.rotate(-0.28);
ctx.fillStyle = c(P.vest); this._rr(ctx, -8, -26, 16, 27, 5); ctx.fill();
ctx.fillStyle = 'rgba(245,245,235,0.85)'; ctx.fillRect(-8, -15, 16, 2.4);
ctx.restore();
/* He is the same man as in the close-up at the panel: a navy shirt under the vest, a navy cap, dark hair.
   His sleeve is that navy shirt. */
ctx.strokeStyle = c(P.cap, 0.2); ctx.lineWidth = 4.6; ctx.lineCap = 'round';
ctx.beginPath(); ctx.moveTo(-9, -30); ctx.lineTo(-20, -14); ctx.stroke();
ctx.fillStyle = c(P.skin); ctx.beginPath(); ctx.arc(-21, -12, 2.6, 0, 6.2832); ctx.fill();
/* His head is in profile, looking left. The face is the very same skin colour as his hand; his hair shows
   only at the back of his head, under the cap. (Until 2026-11-11 the whole head was drawn in the hair colour,
   which read as a brown face above tan hands.) */
ctx.fillStyle = c(P.skin); ctx.beginPath(); ctx.arc(-12, -41, 6.2, 0, 6.2832); ctx.fill();
ctx.save(); ctx.beginPath(); ctx.arc(-12, -41, 6.2, 0, 6.2832); ctx.clip();
ctx.fillStyle = c(P.hair); ctx.beginPath(); ctx.ellipse(-6.6, -42.6, 4.7, 7.2, 0, 0, 6.2832); ctx.fill();
ctx.restore();
ctx.fillStyle = c(P.skin, 0.2); ctx.beginPath(); ctx.arc(-10.9, -40.2, 1.3, 0, 6.2832); ctx.fill();
ctx.fillStyle = c(P.cap); ctx.beginPath(); ctx.arc(-12, -42.5, 6.6, Math.PI, 0); ctx.closePath(); ctx.fill();
/* the brim, and the cap's band running on to the back of his head in one clean line */
ctx.fillRect(-22, -43.6, 16.6, 2.3);
ctx.restore();
}

_truck(ctx, t, T) {
const G = this._G, P = this._P, L = this._L, me = this;
const c = (b, sh, dp, a) => me._c(b, sh, dp, a);
const sd = (al) => me._shadow(al);
this._layer(ctx, G.k);
ctx.save();
ctx.translate(G.xF, G.yG);
ctx.fillStyle = sd(L.shA + 0.16);
ctx.beginPath(); ctx.ellipse(152 + L.shDir * 9, 1.5, 168, 8, 0, 0, 6.2832); ctx.fill();
/* tailgate, down */
ctx.fillStyle = c(P.truck, 0.12); this._poly(ctx, [[298, -57], [340, -54], [340, -48], [298, -51]]); ctx.fill();
ctx.fillStyle = c(P.truck, 0.75); this._poly(ctx, [[298, -51], [340, -48], [340, -45.4], [298, -48.4]]); ctx.fill();
/* wheel wells and wheels */
ctx.fillStyle = c(P.box, 0.3);
ctx.beginPath(); ctx.arc(52, -19, 24.5, 0, 6.2832); ctx.arc(232, -19, 24.5, 0, 6.2832); ctx.fill();
const wheel = (x) => {
ctx.fillStyle = c(P.tire); ctx.beginPath(); ctx.arc(x, -19, 19, 0, 6.2832); ctx.fill();
ctx.fillStyle = c(P.rim); ctx.beginPath(); ctx.arc(x, -19, 11.5, 0, 6.2832); ctx.fill();
ctx.strokeStyle = c(P.bumper, 0.2); ctx.lineWidth = 1.6;
ctx.beginPath();
for (let i = 0; i < 5; i++) { const an = i * 1.2566 + 0.3; ctx.moveTo(x, -19); ctx.lineTo(x + Math.cos(an) * 10.5, -19 + Math.sin(an) * 10.5); }
ctx.stroke();
ctx.fillStyle = c(P.bumper); ctx.beginPath(); ctx.arc(x, -19, 3.4, 0, 6.2832); ctx.fill();
};
wheel(52); wheel(232);
/* body */
const body = () => {
ctx.beginPath();
ctx.moveTo(3, -16); ctx.lineTo(1, -38); ctx.quadraticCurveTo(2, -50, 13, -52);
ctx.lineTo(74, -57); ctx.lineTo(100, -90); ctx.quadraticCurveTo(103, -93, 109, -93);
ctx.lineTo(174, -93); ctx.quadraticCurveTo(181, -93, 181, -86);
ctx.lineTo(182, -58); ctx.lineTo(298, -58); ctx.lineTo(300, -52); ctx.lineTo(300, -18);
ctx.lineTo(258, -16); ctx.arc(232, -19, 25, 0, Math.PI, true);
ctx.lineTo(77, -16); ctx.arc(52, -19, 25, 0, Math.PI, true);
ctx.closePath();
};
let g = ctx.createLinearGradient(0, -93, 0, -16);
g.addColorStop(0, c(P.truck)); g.addColorStop(0.55, c(P.truck, 0.08)); g.addColorStop(1, c(P.truck, 0.6));
ctx.fillStyle = g; body(); ctx.fill();
ctx.strokeStyle = sd(0.20); ctx.lineWidth = 0.8;
ctx.beginPath();
ctx.moveTo(182, -58); ctx.lineTo(182, -18);
ctx.moveTo(142, -90); ctx.lineTo(142, -20);
ctx.moveTo(92, -60); ctx.lineTo(88, -20);
ctx.moveTo(14, -40); ctx.lineTo(298, -40);
ctx.stroke();
/* glass */
const glass = this._glass();
ctx.fillStyle = glass;
this._poly(ctx, [[98, -62], [112, -87.5], [139, -87.5], [139, -62]]); ctx.fill();
this._poly(ctx, [[146, -87.5], [172, -87.5], [176, -62], [146, -62]]); ctx.fill();
ctx.fillStyle = sd(0.5);
this._poly(ctx, [[80, -59.5], [101, -89], [105, -89], [91, -60.5]]); ctx.fill();
ctx.fillStyle = 'rgba(255,255,255,0.14)';
this._poly(ctx, [[101, -66], [112, -86], [121, -86], [108, -62]]); ctx.fill();
/* the phone on the dash, seen through the window: it rings until Mia answers, stays lit through the call,
   and dims once the job is booked */
const ringing = this._ramp(1.57, 1.59, T) * (1 - this._ramp(2.02, 2.1, T));
ctx.fillStyle = '#15171B'; this._rr(ctx, 103.5, -74, 5.2, 9.6, 1.2); ctx.fill();
if (ringing > 0) {
const cu = this._call ? this._callU || 0 : 0;
const taken = this._ease(this._ramp(CALL_BEATS[1], CALL_BEATS[1] + 0.035, cu)), over = this._ease(this._ramp(CALL_BEATS[6], CALL_BEATS[6] + 0.035, cu));
const pulse = (0.72 + 0.28 * Math.sin(t * 9)) * (1 - taken) + taken * (1 - 0.6 * over);
ctx.fillStyle = 'rgba(190,228,255,' + (ringing * pulse).toFixed(3) + ')'; this._rr(ctx, 104.2, -73.2, 3.8, 8, 0.8); ctx.fill();
ctx.globalCompositeOperation = 'lighter';
const gl = ctx.createRadialGradient(106, -69, 0, 106, -69, 26);
gl.addColorStop(0, 'rgba(150,205,255,' + (0.55 * ringing * pulse).toFixed(3) + ')'); gl.addColorStop(1, 'rgba(150,205,255,0)');
ctx.fillStyle = gl; ctx.fillRect(80, -95, 52, 52);
ctx.globalCompositeOperation = 'source-over';
}
/* trim, lights, handles */
ctx.fillStyle = c(P.bumper); this._rr(ctx, 88, -68, 8, 6, 2); ctx.fill();
ctx.fillStyle = c(P.bumper, 0.2); this._rr(ctx, 126, -55, 9, 2.6, 1.2); ctx.fill(); this._rr(ctx, 160, -55, 9, 2.6, 1.2); ctx.fill();
ctx.fillStyle = c(P.bumper); this._rr(ctx, -2, -27, 13, 10, 3); ctx.fill(); this._rr(ctx, 294, -27, 11, 10, 3); ctx.fill();
ctx.fillStyle = '#FFF4CF'; this._rr(ctx, 1.5, -47, 9, 7, 2); ctx.fill();
ctx.fillStyle = '#B3261E'; this._rr(ctx, 296, -53, 4.2, 13, 1.2); ctx.fill();
ctx.strokeStyle = c(P.bumper); ctx.lineWidth = 2.4;
ctx.beginPath(); ctx.moveTo(182, -58.5); ctx.lineTo(298, -58.5); ctx.stroke();
ctx.fillStyle = 'rgba(40,50,70,0.55)';
ctx.font = '700 4.4px ' + this._FONT; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
ctx.fillText('HOME INSPECTION', 116, -31);
ctx.textAlign = 'left';
/* the office on the tailgate: a tablet and a coffee */
ctx.strokeStyle = '#17191D'; ctx.lineWidth = 1.6; ctx.lineCap = 'round';
ctx.beginPath(); ctx.moveTo(333.5, -70); ctx.lineTo(338.6, -54.6); ctx.stroke();
ctx.fillStyle = '#17191D'; this._poly(ctx, [[310, -56.2], [333, -54.5], [336, -77], [313, -78.7]]); ctx.fill();
const lit = 0.45 + 0.55 * this._ramp(2.4, 2.6, T) * (1 - this._ramp(3.4, 3.6, T));
ctx.fillStyle = 'rgba(214,234,255,' + lit.toFixed(3) + ')'; this._poly(ctx, [[312, -58], [331.4, -56.6], [333.8, -75], [314.4, -76.4]]); ctx.fill();
ctx.fillStyle = c(P.trim); this._rr(ctx, 301, -65.6, 6, 8.8, 1.3); ctx.fill();
ctx.fillStyle = c(P.bumper); ctx.fillRect(300.5, -67, 7, 2);
ctx.restore();
}

_fx(ctx, W, H, t, T) {
const L = this._L;
this._screen(ctx);
const sx = L.sx * W, sy = H * 0.77 - L.sy * H;
ctx.globalCompositeOperation = 'lighter';
const g = ctx.createRadialGradient(sx, sy, 0, sx, sy, W * 1.3);
g.addColorStop(0, this._rgba(L.sun, 0.22 * L.glow)); g.addColorStop(0.5, this._rgba(L.sun, 0.07 * L.glow)); g.addColorStop(1, this._rgba(L.sun, 0));
ctx.fillStyle = g; ctx.fillRect(0, 0, W, this._Hc || H);
if (L.win > 0.02) {
this._layer(ctx, 1);
const spots = [[115, -73, 105], [232, -79, 74], [-37, -83, 52], [-76, -93, 58], [-382, -95, 66], [-108, -95, 66], [-245, -88, 120]];
for (let i = 0; i < spots.length; i++) {
const s = spots[i];
const gl = ctx.createRadialGradient(s[0], s[1], 0, s[0], s[1], s[2]);
gl.addColorStop(0, 'rgba(255,190,110,' + (0.46 * L.win).toFixed(3) + ')'); gl.addColorStop(1, 'rgba(255,190,110,0)');
ctx.fillStyle = gl; ctx.fillRect(s[0] - s[2], s[1] - s[2], s[2] * 2, s[2] * 2);
}
}
ctx.globalCompositeOperation = 'source-over';
this._screen(ctx);
}

/* Morning mist, only where a short screen would put the first screen's words over the trees. */
_mist(ctx, W, H) {
const hy = this._heroY;
if (!(hy > 40)) return;
const tt = this._pt(0.84, 0, -290)[1];
const over = hy + 14 - tt;
if (over <= 0) return;
const L = this._L;
const al = Math.min(1, over / 36) * 0.84;
const col = [(L.hor[0] + 510) / 3, (L.hor[1] + 510) / 3, (L.hor[2] + 510) / 3];
const y0 = Math.max(0, tt - 50), y1 = hy + 60;
const p1 = Math.min(0.97, Math.max(0.01, (tt - 6 - y0) / (y1 - y0)));
const p2 = Math.min(0.99, Math.max(p1 + 0.01, (hy + 2 - y0) / (y1 - y0)));
this._screen(ctx);
const g = ctx.createLinearGradient(0, y0, 0, y1);
g.addColorStop(0, this._rgba(col, 0)); g.addColorStop(p1, this._rgba(col, al)); g.addColorStop(p2, this._rgba(col, al)); g.addColorStop(1, this._rgba(col, 0));
ctx.fillStyle = g; ctx.fillRect(0, y0, W, y1 - y0);
}

/* ---- small interface pieces laid over the film ---- */

_chip(ctx, x, y, w, h, alpha, pop, r, dark) {
const d = this._dpr, k = 0.94 + 0.06 * pop;
ctx.save();
ctx.globalAlpha = Math.max(0, Math.min(1, alpha * pop));
ctx.translate(x + w / 2, y + h / 2 + (1 - pop) * 10);
ctx.scale(k, k);
ctx.translate(-w / 2, -h / 2);
ctx.shadowColor = 'rgba(0,0,0,0.30)'; ctx.shadowBlur = 22 * d; ctx.shadowOffsetY = 9 * d;
ctx.fillStyle = dark ? 'rgba(16,17,20,0.95)' : 'rgba(255,255,255,0.94)';
this._rr(ctx, 0, 0, w, h, r == null ? h / 2 : r); ctx.fill();
ctx.shadowColor = 'rgba(0,0,0,0)'; ctx.shadowBlur = 0; ctx.shadowOffsetY = 0;
ctx.lineWidth = 1; ctx.strokeStyle = dark ? 'rgba(255,255,255,0.2)' : 'rgba(255,255,255,0.95)'; ctx.stroke();
}

/* A round badge with a small sign in it: white on black, or (inv) black on white for the dark cards. */
_icon(ctx, kind, cx, cy, r, inv) {
const disc = inv ? '#FFFFFF' : '#000000', ink = inv ? '#101114' : '#FFFFFF';
ctx.save();
ctx.fillStyle = disc; ctx.beginPath(); ctx.arc(cx, cy, r, 0, 6.2832); ctx.fill();
ctx.strokeStyle = ink; ctx.fillStyle = ink; ctx.lineWidth = r * 0.17; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
if (kind === 'mail') {
/* an envelope */
this._rr(ctx, cx - r * 0.5, cy - r * 0.35, r, r * 0.7, r * 0.12); ctx.stroke();
ctx.beginPath(); ctx.moveTo(cx - r * 0.44, cy - r * 0.26); ctx.lineTo(cx, cy + r * 0.08); ctx.lineTo(cx + r * 0.44, cy - r * 0.26); ctx.stroke();
} else if (kind === 'form') {
/* a web page with a form on it: its top bar, a field and a button */
this._rr(ctx, cx - r * 0.48, cy - r * 0.42, r * 0.96, r * 0.84, r * 0.14); ctx.stroke();
ctx.beginPath(); ctx.moveTo(cx - r * 0.48, cy - r * 0.16); ctx.lineTo(cx + r * 0.48, cy - r * 0.16);
ctx.moveTo(cx - r * 0.24, cy + r * 0.06); ctx.lineTo(cx + r * 0.24, cy + r * 0.06); ctx.stroke();
this._rr(ctx, cx - r * 0.26, cy + r * 0.2, r * 0.3, r * 0.1, r * 0.05); ctx.fill();
} else if (kind === 'sent') {
/* a paper plane: the reply has gone */
ctx.beginPath(); ctx.moveTo(cx - r * 0.52, cy - r * 0.04); ctx.lineTo(cx + r * 0.5, cy - r * 0.46); ctx.lineTo(cx + r * 0.1, cy + r * 0.52); ctx.lineTo(cx - r * 0.08, cy + r * 0.12); ctx.closePath(); ctx.fill();
ctx.strokeStyle = disc; ctx.lineWidth = r * 0.1;
ctx.beginPath(); ctx.moveTo(cx - r * 0.08, cy + r * 0.12); ctx.lineTo(cx + r * 0.42, cy - r * 0.38); ctx.stroke();
} else if (kind === 'phone') {
/* a telephone handset, lying at a slant: the handle, with the earpiece and the mouthpiece standing up from its ends */
ctx.translate(cx - r * 0.06, cy + r * 0.06); ctx.rotate(0.7854);
ctx.lineWidth = r * 0.24;
ctx.beginPath(); ctx.arc(0, -r * 0.66, r * 0.84, Math.PI * 0.31, Math.PI * 0.69); ctx.stroke();
this._rr(ctx, -r * 0.62, -r * 0.24, r * 0.3, r * 0.36, r * 0.1); ctx.fill();
this._rr(ctx, r * 0.32, -r * 0.24, r * 0.3, r * 0.36, r * 0.1); ctx.fill();
} else if (kind === 'check') {
ctx.beginPath(); ctx.moveTo(cx - r * 0.42, cy + r * 0.04); ctx.lineTo(cx - r * 0.1, cy + r * 0.36); ctx.lineTo(cx + r * 0.46, cy - r * 0.32); ctx.stroke();
} else if (kind === 'ring') {
ctx.beginPath(); ctx.arc(cx - r * 0.3, cy + r * 0.3, r * 0.14, 0, 6.2832); ctx.fill();
ctx.beginPath(); ctx.arc(cx - r * 0.3, cy + r * 0.3, r * 0.48, -1.5708, 0); ctx.stroke();
ctx.beginPath(); ctx.arc(cx - r * 0.3, cy + r * 0.3, r * 0.82, -1.5708, 0); ctx.stroke();
} else if (kind === 'cal') {
this._rr(ctx, cx - r * 0.46, cy - r * 0.4, r * 0.92, r * 0.84, r * 0.14); ctx.stroke();
ctx.beginPath(); ctx.moveTo(cx - r * 0.46, cy - r * 0.12); ctx.lineTo(cx + r * 0.46, cy - r * 0.12); ctx.stroke();
} else if (kind === 'mic') {
this._rr(ctx, cx - r * 0.17, cy - r * 0.52, r * 0.34, r * 0.66, r * 0.17); ctx.fill();
ctx.beginPath(); ctx.arc(cx, cy - r * 0.02, r * 0.38, 0.15, Math.PI - 0.15); ctx.stroke();
ctx.beginPath(); ctx.moveTo(cx, cy + r * 0.36); ctx.lineTo(cx, cy + r * 0.56); ctx.stroke();
} else if (kind === 'msg') {
this._rr(ctx, cx - r * 0.48, cy - r * 0.36, r * 0.96, r * 0.66, r * 0.16); ctx.stroke();
ctx.beginPath(); ctx.moveTo(cx - r * 0.2, cy + r * 0.3); ctx.lineTo(cx - r * 0.3, cy + r * 0.54); ctx.lineTo(cx + r * 0.06, cy + r * 0.3); ctx.fill();
}
ctx.restore();
}

/* Mia's scene. His phone rings on the truck's dash while he is on the roof. Mia answers; the caller asks
   what callers ask and Mia answers, twice over; and the job lands on his calendar. Mia's words hang on a
   thin line from the phone, and a ring spreads from it as the caller speaks.
   The words are read from the page (index.html, [data-call]); u runs 0 to 1 through the call. */
_reception(ctx, W, H, t, T) {
const D = this._call;
const ramp = this._ramp, ease = this._ease, G = this._G, F = this._FONT;
const fade = 1 - ramp(2.06, 2.2, T);
if (!D || fade <= 0) { this._callLive = []; this._callBoxes = []; return; }
const s = this._sB || Math.min(1.12, W / 390), roomy = !!this._callRoomy;
const u = this._callU || 0, B = CALL_BEATS;
const pop = (i) => ease(ramp(B[i], B[i] + 0.035, u));
this._screen(ctx);
/* the phone on the dash, and the bottom of the eave he kneels above */
const pp = this._pt(G.k, G.xF + 106, G.yG - 69), eave = this._pt(1, 0, -139)[1];
const gap = 8 * s, maxW = Math.min(W - 24, 372 * s);
const box = [];
for (let i = 0; i < 4; i++) box.push(this._sayBox(ctx, D.say[i], s, maxW));
/* the small cards: the pill that says the phone is ringing and then that Mia answered, and the job on the calendar */
ctx.font = '600 ' + (15 * s) + 'px ' + F;
const hP = 46 * s, wRing = hP / 2 + 44 * s + ctx.measureText(D.ring).width, wAns = hP / 2 + 84 * s + ctx.measureText(D.answered).width;
ctx.font = '500 ' + (13.5 * s) + 'px ' + F;
const wNote = ctx.measureText(D.booked[1]).width;
ctx.font = '700 ' + (15.5 * s) + 'px ' + F;
const hC = 62 * s, wC = 82 * s + Math.max(wNote, ctx.measureText(D.booked[0]).width);
let widest = Math.max(wRing, wAns, wC);
for (let i = 0; i < 4; i++) widest = Math.max(widest, box[i].w);
/* every card starts at the same left edge: over the truck's cab where there is room, at the screen's edge on a phone */
const x0 = Math.max(12, Math.min(W - 12 - widest, pp[0] - 150 * s));
const yTop = Math.max(this._tops[1] + 14, eave + 8);
const pRing = pop(0), pAns = pop(1), pq1 = pop(2), pr1 = pop(3), pq2 = pop(4), pr2 = pop(5), pc = pop(6);

/* What is on screen at this point of the call, top to bottom. With room, a question sits over its answer,
   and at the end the caller's last words make way for the job on the calendar; without, one card shows at a time. */
const items = [];
const add = (kind, y, a, p, w, h, ref, line) => { if (a * p > 0.004) items.push({ kind: kind, y: y, a: a, p: p, w: w, h: h, ref: ref, line: line }); };
if (roomy) {
const pillOut = 1 - ramp(B[2] - 0.03, B[2], u), out1 = 1 - ramp(B[4] - 0.03, B[4], u);
add('ring', yTop, pillOut * (1 - pAns), pRing, wRing, hP, null, 1);
add('answered', yTop, pillOut, pAns, wAns, hP, null, 1);
add('say', yTop, out1, pq1, box[0].w, box[0].h, box[0], 0);
add('say', yTop + box[0].h + gap, out1, pr1, box[1].w, box[1].h, box[1], 1);
add('say', yTop, 1 - pc, pq2, box[2].w, box[2].h, box[2], 0);
const yR = yTop + (box[2].h + gap) * (1 - pc);
add('say', yR, 1, pr2, box[3].w, box[3].h, box[3], 1 - pc);
add('booked', yR + box[3].h + gap, 1, pc, wC, hC, null, 1);
} else {
add('ring', yTop, (1 - pAns) * (1 - pq1), pRing, wRing, hP, null, 1);
add('answered', yTop, 1 - pq1, pAns, wAns, hP, null, 1);
add('say', yTop, 1 - pr1, pq1, box[0].w, box[0].h, box[0], 0);
add('say', yTop, 1 - pq2, pr1, box[1].w, box[1].h, box[1], 1);
add('say', yTop, 1 - pr2, pq2, box[2].w, box[2].h, box[2], 0);
add('say', yTop, 1 - pc, pr2, box[3].w, box[3].h, box[3], 1);
add('booked', yTop, 1, pc, wC, hC, null, 1);
}

/* the phone rings until Mia answers; after that, a ring spreads from it as the caller speaks */
const ringing = pRing * (1 - pAns) * fade;
if (ringing > 0) {
for (let i = 0; i < 3; i++) {
const ph = (t * 0.9 + i / 3) % 1;
ctx.strokeStyle = 'rgba(255,255,255,' + (0.8 * (1 - ph) * ringing).toFixed(3) + ')'; ctx.lineWidth = 2 * s;
ctx.beginPath(); ctx.arc(pp[0], pp[1], (9 + ph * 36) * s, 0, 6.2832); ctx.stroke();
}
}
for (let e = 0; e < 2; e++) {
const ph = ramp(B[2 + 2 * e] - 0.025, B[2 + 2 * e] + 0.075, u);
if (ph <= 0 || ph >= 1) continue;
for (let i = 0; i < 2; i++) {
const q = (ph + i * 0.5) % 1;
ctx.strokeStyle = 'rgba(255,255,255,' + (0.8 * (1 - q) * fade).toFixed(3) + ')'; ctx.lineWidth = 2 * s;
ctx.beginPath(); ctx.arc(pp[0], pp[1], (8 + q * 32) * s, 0, 6.2832); ctx.stroke();
}
}

/* the thin lines from the phone: to the pill, to Mia's words, to the job on the calendar */
for (let i = 0; i < items.length; i++) {
const it = items[i], al = it.a * it.p * it.line * fade;
if (al <= 0.01 || it.y + it.h + 10 * s > pp[1] - 8 * s) continue;
ctx.strokeStyle = 'rgba(255,255,255,' + (0.85 * al).toFixed(3) + ')'; ctx.lineWidth = 1.5 * s;
ctx.beginPath(); ctx.moveTo(pp[0], pp[1] - 8 * s); ctx.lineTo(Math.max(x0 + 26 * s, Math.min(x0 + it.w - 26 * s, pp[0])), it.y + it.h + 4 * s); ctx.stroke();
}

/* what is showing, for the page's self-checks: the words, and where each card sits */
const live = [], boxes = [];
for (let i = 0; i < items.length; i++) {
const it = items[i], h = it.h;
if (it.a * it.p >= 0.5) boxes.push([it.kind === 'say' ? it.ref.who : it.kind, x0, it.y, it.w, h]);
if (it.kind === 'say') {
this._sayDraw(ctx, it.ref, x0, it.y, fade * it.a, it.p, s, t);
if (it.a * it.p >= 0.5) live.push(it.ref.rows.join(' '));
continue;
}
/* (_chip saves the drawing state and moves to the card's corner; the restore below gives it back) */
const answered = it.kind === 'answered';
this._chip(ctx, x0, it.y, it.w, h, fade * it.a, it.p, it.kind === 'booked' ? 20 * s : null);
ctx.textBaseline = 'middle'; ctx.textAlign = 'left';
if (it.kind === 'booked') {
this._icon(ctx, 'cal', 31 * s, h / 2, 17 * s);
ctx.fillStyle = '#1D1D1F'; ctx.font = '700 ' + (15.5 * s) + 'px ' + F;
ctx.fillText(D.booked[0], 58 * s, h / 2 - 9.5 * s);
ctx.fillStyle = '#424245'; ctx.font = '500 ' + (13.5 * s) + 'px ' + F;
ctx.fillText(D.booked[1], 58 * s, h / 2 + 10.5 * s);
} else {
this._icon(ctx, answered ? 'check' : 'ring', h / 2, h / 2, 15 * s);
ctx.fillStyle = '#1D1D1F'; ctx.font = '600 ' + (15 * s) + 'px ' + F;
ctx.fillText(answered ? D.answered : D.ring, h / 2 + 22 * s, h / 2 + 0.5);
if (answered) {
/* her voice */
for (let k = 0; k < 5; k++) {
const hh = (5 + 9 * Math.abs(Math.sin(t * 5.2 + k * 1.3))) * s;
ctx.fillStyle = '#1D1D1F'; this._rr(ctx, it.w - (46 - k * 6.4) * s, h / 2 - hh / 2, 3 * s, hh, 1.5 * s); ctx.fill();
}
}
}
ctx.restore();
if (it.a * it.p >= 0.5) live.push(it.kind === 'booked' ? D.booked[0] : it.kind === 'answered' ? D.answered : D.ring);
}
this._callLive = live; this._callBoxes = boxes;
}

/* The Spex Business scene. The office runs itself on the tailgate while he is on the roof: a request comes
   in (an email, then the form on his website), Spex Business replies with the time and the price, and the
   job lands on his calendar, under the one Mia booked by phone.
   The words are read from the page (index.html, [data-desk]); u runs 0 to 1 through the scene. */
_office(ctx, W, H, t, T) {
const D = this._desk;
const ramp = this._ramp, ease = this._ease, G = this._G, F = this._FONT;
const inn = ease(ramp(2.575, 2.635, T));
const fade = 1 - ramp(3.36, 3.52, T);
if (!D || fade <= 0 || inn <= 0) { this._deskLive = []; return; }
const s = this._sC || Math.min(1.12, W / 390), roomy = !!this._deskRoomy;
const u = this._deskU || 0, B = DESK_BEATS;
const pop = (i) => ease(ramp(B[i], B[i] + 0.035, u));
const A = fade * inn;
this._screen(ctx);
/* the top of the tablet on the tailgate, and its middle */
const tp = this._pt(G.k, G.xF + 324, G.yG - 79), tc = this._pt(G.k, G.xF + 323, G.yG - 66);
const cr = W - 12, maxW = Math.min(W - 24, 372 * s), gap = 8 * s;
const box = [];
let slot = 0;
for (let i = 0; i < 4; i++) { box.push(this._sayBox(ctx, D.say[i], s, maxW)); slot = Math.max(slot, box[i].h); }
const rowH = 34 * s, headH = 32 * s, calW = Math.min(W - 24, 300 * s);
const calH = (n) => headH + n * rowH + 8 * s;
/* with room, a request and its reply sit one above the other; without, the reply takes the request's place */
const exH = roomy ? slot * 2 + gap : slot;
const yTop = Math.max(this._tops[2] + 14, tp[1] - (exH + gap + calH(3)) - 26 * s);
const p2 = pop(2), p5 = pop(5);
const hCal = calH(1 + p2 + p5);
/* On a short screen the cards can't all fit. There, once a job is on the calendar its reply makes way
   and the calendar moves up to show every line, until the next request comes in. */
const cramped = !roomy && yTop + exH + gap + calH(3) > H - 6;
const up1 = cramped ? ease(ramp(B[2] + 0.04, B[2] + 0.08, u)) : 0;
const up2 = cramped ? ease(ramp(B[5] + 0.04, B[5] + 0.08, u)) : 0;
const lift = Math.max(up1 * (1 - ease(ramp(B[3] - 0.07, B[3] - 0.02, u))), up2);
const yCal = yTop + (exH + gap) * (1 - lift), xCal = cr - calW;
const live = [];

/* a ring spreads from the tablet as each request lands */
for (let e = 0; e < 2; e++) {
const ph = ramp(B[3 * e] - 0.025, B[3 * e] + 0.075, u);
if (ph <= 0 || ph >= 1) continue;
for (let i = 0; i < 2; i++) {
const q = (ph + i * 0.5) % 1;
ctx.strokeStyle = 'rgba(255,255,255,' + (0.8 * (1 - q) * A).toFixed(3) + ')'; ctx.lineWidth = 2 * s;
ctx.beginPath(); ctx.arc(tc[0], tc[1], (8 + q * 32) * s, 0, 6.2832); ctx.stroke();
}
}

/* the calendar hangs over the tablet on a thin line, where there is room for one */
if (yCal + hCal + 10 * s < tp[1]) {
ctx.strokeStyle = 'rgba(255,255,255,' + (0.85 * A).toFixed(3) + ')'; ctx.lineWidth = 1.5 * s;
ctx.beginPath(); ctx.moveTo(tp[0], tp[1] - 4 * s); ctx.lineTo(Math.max(xCal + 30 * s, Math.min(cr - 30 * s, tp[0])), yCal + hCal + 4 * s); ctx.stroke();
}

/* the two requests, each with its reply; the first pair makes way for the second */
for (let e = 0; e < 2; e++) {
const out = e === 0 ? (cramped ? 1 - up1 : 1 - ramp(B[3] - 0.03, B[3], u)) : 1 - up2;
const pq = pop(3 * e), pr = pop(3 * e + 1);
if (out <= 0 || pq <= 0) continue;
const q = box[2 * e], r = box[2 * e + 1];
const yR = yTop + exH - r.h;
if (roomy) this._sayDraw(ctx, q, cr - q.w, yR - gap - q.h, A * out, pq, s, t);
else if (pr < 1) this._sayDraw(ctx, q, cr - q.w, yTop + exH - q.h, A * out * (1 - pr), pq, s, t);
if (pr > 0) this._sayDraw(ctx, r, cr - r.w, yR, A * out, pr, s, t);
if (out > 0.5) {
if (roomy || pr < 0.5) live.push(q.rows.join(' '));
if (pr >= 0.5) live.push(r.rows.join(' '));
}
}

/* the calendar: one line a job, each with the door it came in through */
this._chip(ctx, xCal, yCal, calW, hCal, A, 1, 18 * s);
this._icon(ctx, 'cal', 23 * s, headH / 2 + 2 * s, 10.5 * s);
ctx.textBaseline = 'middle'; ctx.textAlign = 'left';
ctx.fillStyle = '#424245'; ctx.font = '600 ' + (12.5 * s) + 'px ' + F;
ctx.fillText(D.title, 41 * s, headH / 2 + 2.5 * s);
const n = 1 + (p2 >= 0.5 ? 1 : 0) + (p5 >= 0.5 ? 1 : 0);
ctx.textAlign = 'right'; ctx.fillStyle = '#1D1D1F';
ctx.fillText(n + ' ' + D.count, calW - 16 * s, headH / 2 + 2.5 * s);
for (let i = 0; i < 3; i++) {
const p = i === 0 ? 1 : (i === 1 ? p2 : p5);
if (p <= 0) continue;
/* the newest line's tag is black until the next request comes in */
const fresh = i === 0 ? 0 : (i === 1 ? p2 * (1 - ramp(B[3] - 0.03, B[3] + 0.02, u)) : p5);
const y = headH + i * rowH, row = D.rows[i];
ctx.save();
ctx.globalAlpha = ctx.globalAlpha * p;
ctx.fillStyle = 'rgba(0,0,0,0.09)'; ctx.fillRect(16 * s, y, calW - 32 * s, 1);
ctx.textAlign = 'left'; ctx.fillStyle = '#1D1D1F'; ctx.font = '700 ' + (14.5 * s) + 'px ' + F;
ctx.fillText(row.when, 16 * s, y + rowH / 2 + 0.5);
ctx.font = '600 ' + (11.5 * s) + 'px ' + F;
const pw = ctx.measureText(row.from).width + 18 * s, ph = 21 * s, px = calW - 14 * s - pw, py = y + rowH / 2 - ph / 2 + 0.5;
ctx.fillStyle = 'rgba(0,0,0,' + (0.07 + 0.93 * fresh).toFixed(3) + ')'; this._rr(ctx, px, py, pw, ph, ph / 2); ctx.fill();
ctx.fillStyle = 'rgb(' + Math.round(66 + 189 * fresh) + ',' + Math.round(66 + 189 * fresh) + ',' + Math.round(69 + 186 * fresh) + ')'; ctx.textAlign = 'center';
ctx.fillText(row.from, px + pw / 2, y + rowH / 2 + 0.5);
ctx.restore();
if (p >= 0.5) live.push(row.when);
}
ctx.textAlign = 'left';
ctx.restore();
this._deskLive = live;
}

/* What he photographs in the attic: the stain a leak has left on the underside of the roof, with its tide line
   and the streaks that ran down from it. Drawn flat around (cx, cy); the caller lays it on the roof's slope. */
_stain(ctx, cx, cy, s) {
const blob = (x, y, rx, ry, rot, col) => { ctx.fillStyle = col; ctx.beginPath(); ctx.ellipse(cx + x * s, cy + y * s, rx * s, ry * s, rot, 0, 6.2832); ctx.fill(); };
const run = [[-21, 22, 64, 6], [4, 26, 92, 8], [25, 20, 52, 5]];
ctx.strokeStyle = 'rgba(60,38,22,0.62)'; ctx.lineCap = 'round';
for (let i = 0; i < run.length; i++) { const r = run[i]; ctx.lineWidth = r[3] * s; ctx.beginPath(); ctx.moveTo(cx + r[0] * s, cy + r[1] * s); ctx.lineTo(cx + (r[0] + 3) * s, cy + (r[1] + r[2]) * s); ctx.stroke(); }
blob(0, 0, 47, 36, -0.2, 'rgba(104,72,42,0.6)');
blob(1, 1, 41, 30, -0.2, 'rgba(62,40,24,0.82)');
blob(-12, -6, 23, 17, 0.4, 'rgba(36,24,16,0.82)');
blob(15, 7, 18, 13, -0.5, 'rgba(36,24,16,0.72)');
}

/* A caption in the conversation: who is speaking, and the words. Measured first, so its tail can be drawn under it. */
_sayBox(ctx, line, cs, maxW) {
const F = this._FONT;
const q = '“' + line.text.replace(/'/g, '’') + '”';
ctx.font = '600 ' + (15 * cs) + 'px ' + F;
const room = maxW - 74 * cs;
let rows = [q];
if (ctx.measureText(q).width > room) {
/* too long for one row on this screen: break it at the space nearest the middle */
const words = q.split(' ');
let best = null;
for (let i = 1; i < words.length; i++) {
const a = words.slice(0, i).join(' '), b = words.slice(i).join(' ');
const wa = ctx.measureText(a).width, wb = ctx.measureText(b).width;
const score = Math.max(wa, wb);
if (!best || score < best.score) best = { score: score, rows: [a, b] };
}
if (best) rows = best.rows;
}
let tw = 0;
for (let i = 0; i < rows.length; i++) tw = Math.max(tw, ctx.measureText(rows[i]).width);
ctx.font = '600 ' + (12.5 * cs) + 'px ' + F;
tw = Math.max(tw, ctx.measureText(line.label).width);
return { who: line.who, label: line.label, rows: rows, w: Math.min(maxW, 54 * cs + tw + 20 * cs), h: (rows.length > 1 ? 75 : 56) * cs };
}

_sayDraw(ctx, box, x, y, alpha, pop, cs, t) {
const F = this._FONT, voice = box.who === 'spex' || box.who === 'mia', dark = voice || box.who === 'biz', h = box.h;
this._chip(ctx, x, y, box.w, h, alpha, pop, 19 * cs, dark);
if (voice) {
/* Spex, or Mia on the phone: a white disc with a voice in it */
ctx.fillStyle = '#FFFFFF'; ctx.beginPath(); ctx.arc(28 * cs, h / 2, 16 * cs, 0, 6.2832); ctx.fill();
for (let i = 0; i < 4; i++) {
const hh = (5 + 11 * Math.abs(Math.sin(t * 5.2 + i * 1.3 + 0.6))) * cs;
ctx.fillStyle = '#101114'; this._rr(ctx, (20.3 + i * 4.4) * cs, h / 2 - hh / 2, 2.4 * cs, hh, 1.2 * cs); ctx.fill();
}
} else if (box.who === 'biz') {
/* Spex Business writes, it doesn't speak: a white disc with a sent reply in it */
this._icon(ctx, 'sent', 28 * cs, h / 2, 16 * cs, true);
} else {
/* a person: speaking to Spex, calling on the phone, writing an email, or filling out the form on the website */
this._icon(ctx, box.who === 'mail' ? 'mail' : box.who === 'form' ? 'form' : box.who === 'call' ? 'phone' : 'mic', 28 * cs, h / 2, 16 * cs);
}
ctx.textBaseline = 'middle'; ctx.textAlign = 'left';
const n = box.rows.length, y0 = n > 1 ? 16 * cs : h / 2 - 10 * cs;
ctx.fillStyle = dark ? 'rgba(255,255,255,0.72)' : '#424245'; ctx.font = '600 ' + (12.5 * cs) + 'px ' + F;
ctx.fillText(box.label, 54 * cs, y0);
ctx.fillStyle = dark ? '#FFFFFF' : '#1D1D1F'; ctx.font = '600 ' + (15 * cs) + 'px ' + F;
for (let i = 0; i < n; i++) ctx.fillText(box.rows[i], 54 * cs, y0 + (19 + i * 19) * cs);
ctx.restore();
}

/* The Spex scene. He is up in a dark attic with his iPhone in his hand, at its real size, and talks with
   Spex: his words show in a white caption, Spex's answers in a black one, and the scene does what Spex says
   it did. The camera comes up; the light comes on and shows the attic, and the stain a leak has left under the
   roof; the flash fires and lights all of it for an instant.
   The words are read from the page (index.html, [data-talk]); u runs 0 to 1 through the conversation.
   (Until 2026-11-12 he stood at an electrical panel on an outside wall, in daylight. Moises: "it'd send a
   bolder statement to have them like in an attic ... turn the flashlight on and the flash on to take photos
   and basically light up the dark attic".) */
_shotD(ctx, W, H, t, T) {
const P = this._P, me = this;
const c = (b, sh, dp, a) => me._c(b, sh, dp, a);
const ramp = this._ramp, ease = this._ease;
const d = this._dpr, Hc = this._Hc || H;
const top = this._tops[3];
/* on a very short screen the scene is drawn smaller, down to 0.6, so the panel, the phone and his head still fit under the words */
const s = Math.max(Math.min(0.76, Math.max(0.6, (H - top - 6) / 336)), Math.min(W / 390, (H - top) / 440));
const ox = W / 2 - 195 * s, oy = Math.max(top, H - 492 * s);
const X = (v) => ox + v * s, Y = (v) => oy + v * s;
const u = this._talkU || 0, B = TALK_BEATS;
const pop = (i) => ease(ramp(B[i], B[i] + 0.035, u));
const raise = ease(ramp(B[1] - 0.045, B[1] + 0.035, u));
const light = ease(ramp(B[3] - 0.035, B[3] + 0.035, u));
const zin = ease(ramp(B[3] - 0.035, B[3] + 0.05, u));
const flash = ramp(B[5] - 0.05, B[5] - 0.035, u) * (1 - ramp(B[5] - 0.035, B[5] + 0.045, u));
ctx.setTransform(d, 0, 0, d, 0, 0);
ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
const zoom = 1 + 0.035 * ease(u), zx = X(170), zy = Y(285);
const Z = (p) => [zx + (p[0] - zx) * zoom, zy + (p[1] - zy) * zoom];
ctx.save();
ctx.translate(zx, zy); ctx.scale(zoom, zoom); ctx.translate(-zx, -zy);

/* The attic, drawn as it looks lit, in one-point perspective toward the far gable. Every pair of rafters is
   the far gable's triangle again, k times nearer: its top at PA(k), its feet at PL(k) and PR(k). The dark is
   laid over all of it further down. */
const vx = 150, vy = 236, far = 12;
const PA = (k) => [X(vx), Y(vy - 64 * k)], PL = (k) => [X(vx - 54 * k), Y(vy + 32 * k)], PR = (k) => [X(vx + 54 * k), Y(vy + 32 * k)];
const KS = [1, 1.5, 2.3, 3.6, 5.7, 9];
let g;
ctx.fillStyle = '#2B2118'; ctx.fillRect(-60, -60, W + 120, Hc + 120);
/* the two slopes of the roof from underneath: boards, lighter the nearer they are */
for (let i = 0; i < 2; i++) {
const PF = i === 0 ? PL : PR, a = PA(1), f1 = PF(1), n = PF(far), an = PA(far);
g = ctx.createLinearGradient(f1[0], f1[1], f1[0] + (n[0] - f1[0]) * 0.45, f1[1] + (n[1] - f1[1]) * 0.45);
g.addColorStop(0, i === 0 ? '#8C6C48' : '#7E6040'); g.addColorStop(1, i === 0 ? '#B8925F' : '#A6835A');
ctx.fillStyle = g; this._poly(ctx, [a, f1, n, [n[0], an[1]], an]); ctx.fill();
ctx.strokeStyle = 'rgba(40,26,14,0.3)'; ctx.lineWidth = 1 * s;
for (let j = 1; j < 5; j++) {
const h = j * 0.2;
ctx.beginPath(); ctx.moveTo(f1[0] + (a[0] - f1[0]) * h, f1[1] + (a[1] - f1[1]) * h); ctx.lineTo(n[0] + (an[0] - n[0]) * h, n[1] + (an[1] - n[1]) * h); ctx.stroke();
}
}
/* where the pipe goes through the roof, on the left slope: the stain lies there, and his light and his camera
   are aimed at it. Across, the stain runs toward the far gable; down, it runs down the rafters. */
const sl = PL(2.9), sa = PA(2.9);
const bx = sl[0] + (sa[0] - sl[0]) * 0.42, by = sl[1] + (sa[1] - sl[1]) * 0.42;
{
const ax = X(vx) - bx, ay = Y(vy) - by, al = Math.hypot(ax, ay), rx = sl[0] - sa[0], ry = sl[1] - sa[1], rl = Math.hypot(rx, ry), q = 0.86 * s;
ctx.save(); ctx.transform(ax / al * q, ay / al * q, rx / rl * q, ry / rl * q, bx, by + 8 * s);
this._stain(ctx, 0, 0, 1);
ctx.restore();
}
/* the far gable, with the vent that lets a little daylight in */
ctx.fillStyle = '#8F7150'; this._poly(ctx, [PA(1), PL(1), PR(1)]); ctx.fill();
ctx.strokeStyle = '#6F553A'; ctx.lineWidth = 2.2 * s; ctx.lineCap = 'butt';
for (let j = -2; j <= 2; j++) {
if (j === 0) continue;
ctx.beginPath(); ctx.moveTo(X(vx + j * 18), Y(vy + 32)); ctx.lineTo(X(vx + j * 18), Y(vy - 64 + Math.abs(j) * 18 / 54 * 96)); ctx.stroke();
}
ctx.fillStyle = '#5E4C39'; ctx.fillRect(X(vx - 11.5), Y(vy - 35.5), 23 * s, 27 * s);
ctx.fillStyle = '#BFD6F2'; ctx.fillRect(X(vx - 9.5), Y(vy - 33.5), 19 * s, 23 * s);
ctx.fillStyle = '#5E4C39';
for (let j = 0; j < 5; j++) ctx.fillRect(X(vx - 9.5), Y(vy - 31 + j * 4.6), 19 * s, 2.3 * s);
/* the floor: joists from eave to eave, and insulation lying between them */
ctx.save();
this._poly(ctx, [PL(1), PR(1), PR(far), [PR(far)[0], Hc + 80], [PL(far)[0], Hc + 80], PL(far)]); ctx.clip();
ctx.fillStyle = '#A88C62'; ctx.fillRect(-60, PL(1)[1], W + 120, Hc + 120);
for (let i = 0; i < KS.length; i++) {
const k = KS[i], k2 = i + 1 < KS.length ? KS[i + 1] : far, y0 = PL(k)[1], y1 = PL(k2)[1], xl = PL(k2)[0] - 20, xr = PR(k2)[0] + 20, hump = 9 * k * s;
g = ctx.createLinearGradient(0, y0, 0, y1); g.addColorStop(0, '#DCC49A'); g.addColorStop(1, '#A98D64');
ctx.fillStyle = g; ctx.beginPath(); ctx.moveTo(xl, y1); ctx.lineTo(xl, y0);
for (let x = xl; x < xr; x += hump) ctx.quadraticCurveTo(x + hump / 2, y0 - 0.36 * hump, x + hump, y0);
ctx.lineTo(xr, y1); ctx.closePath(); ctx.fill();
ctx.fillStyle = '#7C5E3D'; ctx.fillRect(xl, y1 - 1.5 * k2 * s, xr - xl, 2.4 * k2 * s);
}
ctx.restore();
/* the rafters, pair by pair, and the ridge they meet at */
for (let i = 0; i < KS.length; i++) {
const k = KS[i], a = PA(k), w = 3.1 * k * s;
for (let j = 0; j < 2; j++) {
const pf = (j === 0 ? PL : PR)(k);
ctx.strokeStyle = '#5F452C'; ctx.lineWidth = w + 1.8 * s; ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(pf[0], pf[1]); ctx.stroke();
ctx.strokeStyle = j === 0 ? '#CDAA78' : '#B8966A'; ctx.lineWidth = w; ctx.beginPath(); ctx.moveTo(a[0], a[1] + 1.3 * s); ctx.lineTo(pf[0], pf[1] + 1.3 * s); ctx.stroke();
}
}
ctx.fillStyle = '#6E5134'; this._poly(ctx, [[X(vx) - 1.8 * s, PA(1)[1]], [X(vx) + 1.8 * s, PA(1)[1]], [X(vx) + 1.8 * far * s, PA(far)[1]], [X(vx) - 1.8 * far * s, PA(far)[1]]]); ctx.fill();
/* two ties across, from rafter to rafter */
for (let i = 0; i < 2; i++) {
const k = i === 0 ? 2.3 : 5.7, l = PL(k), a = PA(k), y = l[1] + (a[1] - l[1]) * 0.55, x0 = l[0] + (a[0] - l[0]) * 0.55, x1 = 2 * X(vx) - x0, w = 2.5 * k * s;
ctx.fillStyle = '#5F452C'; ctx.fillRect(x0, y - w / 2 - 0.9 * s, x1 - x0, w + 1.8 * s);
ctx.fillStyle = '#C4A070'; ctx.fillRect(x0, y - w / 2 + 0.5 * s, x1 - x0, w);
}
/* the vent pipe, up from the floor and through the roof where the stain is */
{
const kf = (X(vx) - bx) / (54 * s), yf = Y(vy + 32 * kf) + 7 * s;
ctx.fillStyle = '#A9AEB2'; ctx.fillRect(bx - 4.5 * s, by, 9 * s, yf - by);
ctx.fillStyle = 'rgba(255,255,255,0.3)'; ctx.fillRect(bx - 2.6 * s, by, 2.2 * s, yf - by);
ctx.fillStyle = 'rgba(40,46,58,0.3)'; ctx.fillRect(bx + 2 * s, by, 2.5 * s, yf - by);
ctx.fillStyle = '#979CA1'; ctx.fillRect(bx - 5.6 * s, by + (yf - by) * 0.52, 11.2 * s, 7 * s);
ctx.fillStyle = 'rgba(30,20,12,0.75)'; ctx.beginPath(); ctx.ellipse(bx, by, 6.4 * s, 2.8 * s, -0.5, 0, 6.2832); ctx.fill();
}

/* The phone is low at first and comes up to aim once the camera opens. */
const wx = 181 - 4 * raise, wy = 372 - 36 * raise, hx = wx - 9, hy = wy - 27;

/* The inspector, from behind. He is drawn to a man's proportions, counted in heads (his head with its cap
   is 67 units tall): his shoulders two heads wide with his arms, the hem of his vest three heads below the top
   of his head, his legs under it, and arms that are thicker above the elbow than below it.
   Until 2026-11-12 his body was one slab, two and three quarter heads wide, that ran off the bottom of the
   screen with no waist and no legs, and his arms were two thin bars. On a phone with its bars tucked away the
   slab was four heads long. Moises saw it on the live page: he did not look like a person. */
const mx = 272, yFloor = Y(492) + Math.max(0, Hc - Y(492)) + 90;
/* his jeans: his hips, and two legs with a gap between them */
ctx.fillStyle = c(P.jeans, 0.12);
ctx.beginPath();
ctx.moveTo(X(mx - 52.8), Y(466)); ctx.lineTo(X(mx + 52.8), Y(466));
ctx.bezierCurveTo(X(mx + 57.2), Y(500), X(mx + 56.1), Y(560), X(mx + 50.6), Y(640));
ctx.lineTo(X(mx + 50.6), yFloor); ctx.lineTo(X(mx + 7.7), yFloor); ctx.lineTo(X(mx + 5.5), Y(640));
ctx.quadraticCurveTo(X(mx + 3.3), Y(560), X(mx), Y(534));
ctx.quadraticCurveTo(X(mx - 3.3), Y(560), X(mx - 5.5), Y(640));
ctx.lineTo(X(mx - 7.7), yFloor); ctx.lineTo(X(mx - 50.6), yFloor); ctx.lineTo(X(mx - 50.6), Y(640));
ctx.bezierCurveTo(X(mx - 56.1), Y(560), X(mx - 57.2), Y(500), X(mx - 52.8), Y(466));
ctx.closePath(); ctx.fill();
ctx.fillStyle = 'rgba(12,18,34,0.2)';
this._rr(ctx, X(mx - 40), Y(494), 28 * s, 29 * s, 5 * s); ctx.fill();
this._rr(ctx, X(mx + 12), Y(494), 28 * s, 29 * s, 5 * s); ctx.fill();
/* his navy shirt: his shoulders and his sides, where the vest leaves them bare */
ctx.fillStyle = c(P.cap, 0.2);
ctx.beginPath();
ctx.moveTo(X(mx - 18.7), Y(344));
ctx.quadraticCurveTo(X(mx - 44), Y(348), X(mx - 64.9), Y(357));
ctx.lineTo(X(mx - 57.2), Y(404)); ctx.lineTo(X(mx - 51.7), Y(472)); ctx.lineTo(X(mx + 51.7), Y(472)); ctx.lineTo(X(mx + 57.2), Y(404));
ctx.lineTo(X(mx + 64.9), Y(357));
ctx.quadraticCurveTo(X(mx + 44), Y(348), X(mx + 18.7), Y(344));
ctx.closePath(); ctx.fill();
/* his vest: straps over his shoulders, cut in at the arms, and a hem at his hips */
g = ctx.createLinearGradient(0, Y(350), 0, Y(484));
g.addColorStop(0, c(P.vest)); g.addColorStop(1, c(P.vest, 0.7));
ctx.fillStyle = g;
ctx.beginPath();
ctx.moveTo(X(mx - 23.1), Y(346));
ctx.quadraticCurveTo(X(mx - 41.8), Y(349), X(mx - 55), Y(356));
ctx.quadraticCurveTo(X(mx - 47.3), Y(380), X(mx - 56.1), Y(406));
ctx.bezierCurveTo(X(mx - 57.2), Y(430), X(mx - 55), Y(456), X(mx - 56.1), Y(478));
ctx.quadraticCurveTo(X(mx), Y(486), X(mx + 56.1), Y(478));
ctx.bezierCurveTo(X(mx + 55), Y(456), X(mx + 57.2), Y(430), X(mx + 56.1), Y(406));
ctx.quadraticCurveTo(X(mx + 47.3), Y(380), X(mx + 55), Y(356));
ctx.quadraticCurveTo(X(mx + 41.8), Y(349), X(mx + 23.1), Y(346));
ctx.quadraticCurveTo(X(mx), Y(374), X(mx - 23.1), Y(346));
ctx.closePath(); ctx.fill();
/* the vest's pale stripes, kept inside the vest: one around his back, two down from his shoulders */
ctx.save(); ctx.clip();
ctx.fillStyle = 'rgba(245,245,235,0.78)';
ctx.beginPath();
ctx.moveTo(X(mx - 61.6), Y(436)); ctx.quadraticCurveTo(X(mx), Y(443), X(mx + 61.6), Y(436));
ctx.lineTo(X(mx + 61.6), Y(450)); ctx.quadraticCurveTo(X(mx), Y(457), X(mx - 61.6), Y(450));
ctx.closePath(); ctx.fill();
this._poly(ctx, [[X(mx - 44), Y(344)], [X(mx - 31.9), Y(344)], [X(mx - 30.8), Y(441)], [X(mx - 42.9), Y(440)]]); ctx.fill();
this._poly(ctx, [[X(mx + 44), Y(344)], [X(mx + 31.9), Y(344)], [X(mx + 30.8), Y(441)], [X(mx + 42.9), Y(440)]]); ctx.fill();
ctx.restore();
/* His neck, his ears, his collar, his hair and his cap keep the size and the place they had: the lines from
   the captions end at his head. */
ctx.save();
const f = 0.66;
ctx.translate(X(272), Y(300)); ctx.scale(f, f); ctx.translate(-X(319), -Y(304));
/* his neck, and his ears either side of his hair: the same skin as his hand */
ctx.fillStyle = c(P.skin, 0.28); this._rr(ctx, X(292), Y(338), 54 * s, 50 * s, 14 * s); ctx.fill();
ctx.fillStyle = c(P.skin, 0.25);
ctx.beginPath(); ctx.ellipse(X(272.5), Y(322), 7.5 * s, 11 * s, -0.12, 0, 6.2832); ctx.fill();
ctx.beginPath(); ctx.ellipse(X(365.5), Y(322), 7.5 * s, 11 * s, 0.12, 0, 6.2832); ctx.fill();
ctx.fillStyle = c(P.cap, 0.3);
ctx.beginPath(); ctx.moveTo(X(282), Y(380)); ctx.quadraticCurveTo(X(319), Y(400), X(356), Y(380)); ctx.lineTo(X(356), Y(372)); ctx.quadraticCurveTo(X(319), Y(388), X(282), Y(372)); ctx.closePath(); ctx.fill();
ctx.fillStyle = c(P.hair); ctx.beginPath(); ctx.arc(X(319), Y(304), 47 * s, 0, 6.2832); ctx.fill();
ctx.fillStyle = c(P.cap);
ctx.beginPath(); ctx.arc(X(319), Y(298), 49 * s, Math.PI * 0.98, Math.PI * 2.02); ctx.quadraticCurveTo(X(319), Y(322), X(270), Y(301)); ctx.closePath(); ctx.fill();
ctx.fillStyle = c(P.cap, 0.5); this._rr(ctx, X(303), Y(310), 32 * s, 8 * s, 4 * s); ctx.fill();
ctx.fillStyle = c(P.cap); this._poly(ctx, [[X(272), Y(296)], [X(248), Y(304)], [X(250), Y(311)], [X(274), Y(306)]]); ctx.fill();
ctx.restore();

/* His arms, in the sleeves of his navy shirt. One hangs at his side, with his hand below the cuff; the other
   holds the phone up, his elbow low and his forearm rising to it. */
ctx.lineCap = 'round'; ctx.lineJoin = 'round';
ctx.fillStyle = c(P.skin, 0.25); this._rr(ctx, X(mx + 56), Y(526), 17 * s, 38 * s, 8 * s); ctx.fill();
ctx.strokeStyle = c(P.cap, 0.2);
ctx.lineWidth = 22 * s; ctx.beginPath(); ctx.moveTo(X(mx + 68), Y(456)); ctx.lineTo(X(mx + 65), Y(528)); ctx.stroke();
ctx.lineWidth = 26 * s; ctx.beginPath(); ctx.moveTo(X(mx + 63), Y(368)); ctx.lineTo(X(mx + 68), Y(456)); ctx.stroke();
const ex = 194 - 2 * raise, ey = 416 - 6 * raise;
ctx.lineWidth = 22 * s; ctx.beginPath(); ctx.moveTo(X(ex), Y(ey)); ctx.lineTo(X(wx), Y(wy)); ctx.stroke();
ctx.lineWidth = 26 * s; ctx.beginPath(); ctx.moveTo(X(mx - 63), Y(368)); ctx.lineTo(X(ex), Y(ey)); ctx.stroke();

/* The dark, over the attic and over him. `amb` is how dark it is away from the light, `core` how dark it is
   where the light falls. Before the light there is no difference; the flash takes nearly all of it away. */
const amb = (0.86 - 0.16 * light) * (1 - 0.95 * flash), core = amb * (1 - 0.96 * light);
const dk = (a) => 'rgba(9,12,24,' + Math.max(0, Math.min(1, a)).toFixed(3) + ')';
g = ctx.createRadialGradient(bx, by, 0, bx, by, 230 * s);
g.addColorStop(0, dk(core)); g.addColorStop(0.26, dk(core)); g.addColorStop(0.55, dk(core + (amb - core) * 0.62)); g.addColorStop(1, dk(amb));
ctx.fillStyle = g; ctx.fillRect(-60, -60, W + 120, Hc + 120);
ctx.save(); ctx.globalCompositeOperation = 'lighter';
/* daylight through the vent in the far gable: all the light there is before Spex's */
g = ctx.createRadialGradient(X(vx), Y(vy - 22), 0, X(vx), Y(vy - 22), 50 * s);
g.addColorStop(0, 'rgba(150,185,255,0.46)'); g.addColorStop(0.28, 'rgba(120,160,240,0.17)'); g.addColorStop(1, 'rgba(120,160,240,0)');
ctx.fillStyle = g; ctx.fillRect(X(vx - 52), Y(vy - 74), 104 * s, 104 * s);
g = ctx.createLinearGradient(0, Y(vy - 22), 0, Y(vy + 60));
g.addColorStop(0, 'rgba(140,175,250,0.10)'); g.addColorStop(1, 'rgba(140,175,250,0)');
ctx.fillStyle = g; this._poly(ctx, [[X(vx - 9), Y(vy - 22)], [X(vx + 9), Y(vy - 22)], [X(vx + 62), Y(vy + 60)], [X(vx - 30), Y(vy + 60)]]); ctx.fill();
if (light > 0) {
/* Spex's light: the beam from the back of the phone to the roof, the dust in it, and the glow where it lands */
const lx = X(hx) - 2 * s, ly = Y(hy) - 19 * s, ang = Math.atan2(by - ly, bx - lx), nx = -Math.sin(ang), ny = Math.cos(ang), half = 58 * s;
g = ctx.createLinearGradient(lx, ly, bx, by);
g.addColorStop(0, 'rgba(255,244,214,' + (0.3 * light).toFixed(3) + ')'); g.addColorStop(0.5, 'rgba(255,244,214,' + (0.1 * light).toFixed(3) + ')'); g.addColorStop(1, 'rgba(255,244,214,' + (0.03 * light).toFixed(3) + ')');
ctx.fillStyle = g; this._poly(ctx, [[lx + nx * 2.5 * s, ly + ny * 2.5 * s], [bx + nx * half, by + ny * half], [bx - nx * half, by - ny * half], [lx - nx * 2.5 * s, ly - ny * 2.5 * s]]); ctx.fill();
g = ctx.createRadialGradient(bx, by, 0, bx, by, 84 * s);
g.addColorStop(0, 'rgba(255,240,205,' + (0.1 * light).toFixed(3) + ')'); g.addColorStop(1, 'rgba(255,240,205,0)');
ctx.fillStyle = g; ctx.fillRect(bx - 86 * s, by - 86 * s, 172 * s, 172 * s);
for (let i = 0; i < 16; i++) {
const along = (i * 0.137 + t * 0.012 * (1 + i % 3)) % 1, side = ((i * 37) % 17 / 8.5 - 1) * along * 0.8;
ctx.fillStyle = 'rgba(255,246,224,' + (0.5 * light * (0.4 + 0.6 * Math.abs(Math.sin(t * 1.3 + i * 2.1)))).toFixed(3) + ')';
ctx.beginPath(); ctx.arc(lx + (bx - lx) * along + nx * half * side, ly + (by - ly) * along + ny * half * side + Math.sin(t * 0.9 + i) * 2 * s, (0.7 + (i % 3) * 0.35) * s, 0, 6.2832); ctx.fill();
}
/* the instant it comes on */
const on = ramp(B[3] - 0.035, B[3], u) * (1 - ramp(B[3], B[3] + 0.07, u));
if (on > 0) {
g = ctx.createRadialGradient(bx, by, 0, bx, by, 170 * s);
g.addColorStop(0, 'rgba(255,246,224,' + (0.4 * on).toFixed(3) + ')'); g.addColorStop(1, 'rgba(255,246,224,0)');
ctx.fillStyle = g; ctx.fillRect(bx - 174 * s, by - 174 * s, 348 * s, 348 * s);
}
}
if (flash > 0) {
g = ctx.createRadialGradient(bx, by, 0, bx, by, 230 * s);
g.addColorStop(0, 'rgba(255,255,255,' + (0.95 * flash).toFixed(3) + ')'); g.addColorStop(0.4, 'rgba(255,255,255,' + (0.42 * flash).toFixed(3) + ')'); g.addColorStop(1, 'rgba(255,255,255,0)');
ctx.fillStyle = g; ctx.fillRect(bx - 234 * s, by - 234 * s, 468 * s, 468 * s);
}
/* his phone's screen lights his hand and the side of his head a little */
g = ctx.createRadialGradient(X(hx), Y(hy), 0, X(hx), Y(hy), 44 * s);
g.addColorStop(0, 'rgba(170,195,255,0.16)'); g.addColorStop(1, 'rgba(170,195,255,0)');
ctx.fillStyle = g; ctx.fillRect(X(hx - 46), Y(hy - 46), 92 * s, 92 * s);
ctx.restore();
/* his hand is as dark as the attic around it, less a little for the screen's light */
const skin = (sh) => { const v = me._rgb(P.skin, sh), q = amb * 0.7; return me._rgba([v[0] + (9 - v[0]) * q, v[1] + (12 - v[1]) * q, v[2] + (24 - v[2]) * q]); };

/* his hand and the iPhone, at its real size beside his head */
ctx.save();
ctx.translate(X(hx), Y(hy)); ctx.rotate(-0.26 + 0.2 * raise);
const pw = 22 * s, ph = 45 * s;
ctx.fillStyle = skin(0.25); this._rr(ctx, -pw / 2 - 1.5 * s, ph * 0.03, pw + 9 * s, ph * 0.6, 8 * s); ctx.fill();
ctx.shadowColor = 'rgba(0,0,0,0.38)'; ctx.shadowBlur = 9 * d; ctx.shadowOffsetY = 3 * d;
ctx.fillStyle = '#0E0F12'; this._rr(ctx, -pw / 2, -ph / 2, pw, ph, 5.2 * s); ctx.fill();
ctx.shadowColor = 'rgba(0,0,0,0)'; ctx.shadowBlur = 0; ctx.shadowOffsetY = 0;
ctx.save();
this._rr(ctx, -pw / 2 + 1.5 * s, -ph / 2 + 1.5 * s, pw - 3 * s, ph - 3 * s, 3.9 * s); ctx.clip();
ctx.fillStyle = '#16181C'; ctx.fillRect(-pw / 2, -ph / 2, pw, ph);
if (raise > 0) {
/* the camera's view: the underside of the roof, dark until the light comes on, then closer in on the stain at 4x */
ctx.globalAlpha = raise;
const k = 0.11 * (1 + 3 * zin), cy0 = -ph * 0.07;
ctx.fillStyle = '#AD8960'; ctx.fillRect(-pw / 2, -ph / 2, pw, ph);
ctx.fillStyle = 'rgba(40,26,14,0.3)';
for (let i = -3; i <= 3; i++) ctx.fillRect(-pw / 2, cy0 + (i * 62 + 31) * k * s, pw, Math.max(0.5 * s, 2.4 * k * s));
ctx.fillStyle = '#C9A678'; ctx.fillRect(-78 * k * s, -ph / 2, 20 * k * s, ph);
this._stain(ctx, 0, cy0 + 10 * k * s, k * s);
ctx.fillStyle = '#C6CACD'; ctx.fillRect(-9 * k * s, cy0, 18 * k * s, ph);
ctx.fillStyle = 'rgba(255,255,255,0.55)'; ctx.fillRect(-5.2 * k * s, cy0, 4.4 * k * s, ph);
ctx.fillStyle = 'rgba(30,20,12,0.75)'; ctx.beginPath(); ctx.ellipse(0, cy0, 12.8 * k * s, 5.6 * k * s, 0, 0, 6.2832); ctx.fill();
ctx.fillStyle = 'rgba(9,12,24,' + (0.8 * (1 - light) * (1 - flash)).toFixed(3) + ')'; ctx.fillRect(-pw / 2, -ph / 2, pw, ph);
if (light > 0) { ctx.fillStyle = 'rgba(255,244,214,' + (0.12 * light).toFixed(3) + ')'; ctx.fillRect(-pw / 2, -ph / 2, pw, ph); }
ctx.globalAlpha = 1;
}
/* Spex listening: its voice, low on the screen */
for (let i = 0; i < 5; i++) {
const hh = (1.6 + 3.2 * Math.abs(Math.sin(t * 6 + i * 0.9))) * s;
ctx.fillStyle = 'rgba(255,255,255,0.92)'; this._rr(ctx, (-5.6 + i * 2.5) * s, ph / 2 - 7.5 * s - hh / 2, 1.3 * s, hh, 0.65 * s); ctx.fill();
}
if (flash > 0) { ctx.fillStyle = 'rgba(255,255,255,' + (0.9 * flash).toFixed(3) + ')'; ctx.fillRect(-pw / 2, -ph / 2, pw, ph); }
ctx.restore();
/* fingertips on the far edge, thumb on the near one */
ctx.fillStyle = skin(0.2);
for (let i = 0; i < 3; i++) { this._rr(ctx, -pw / 2 - 2.6 * s, ph * (0.05 + i * 0.135), 5.2 * s, 5 * s, 2.4 * s); ctx.fill(); }
ctx.fillStyle = skin(0.18);
ctx.save(); ctx.translate(pw / 2 - 0.5 * s, ph * 0.2); ctx.rotate(-0.42); this._rr(ctx, -4.2 * s, -10 * s, 8.4 * s, 21 * s, 4.2 * s); ctx.fill(); ctx.restore();
ctx.restore();
ctx.restore();

ctx.setTransform(d, 0, 0, d, 0, 0);
/* The film's last rows are the attic's floor, away from the light: as dark as the attic is at that moment, and
   brighter for the instant of the flash. The page under the film takes that colour on a phone. */
this._atticGround = ATTIC_FLOOR.map((v, i) => { const q = v + ([9, 12, 24][i] - v) * amb; return q + (255 - q) * 0.22 * flash; });
/* where the light falls, in the screen's own pixels (for the page's self-checks) */
this._atticSpot = Z([bx, by]);
/* the whole scene brightens for an instant as the flash fires */
if (flash > 0) { ctx.fillStyle = 'rgba(255,255,255,' + (0.22 * flash).toFixed(3) + ')'; ctx.fillRect(0, 0, W, Hc); }

/* the conversation: his words in white with a line to him, Spex's in black with a line to the phone */
const say = this._say || [];
const cs = Math.max(s, 0.9), cr = W - 12, maxW = Math.min(W - 24, 372 * cs), gap = 8 * cs;
const head = Z([X(272), Y(300 - 49 * f)]), phone = Z([X(hx), Y(hy) - ph / 2]);
const shown = [];
for (let k = 0; k < 3; k++) {
const out = k < 2 ? 1 - ramp(B[2 * k + 2] - 0.03, B[2 * k + 2], u) : 1;
if (out <= 0) continue;
for (let j = 0; j < 2; j++) {
const line = say[2 * k + j], p = pop(2 * k + j);
if (!line || p <= 0) continue;
shown.push({ box: this._sayBox(ctx, line, cs, maxW), a: out, p: p, spex: j === 1 });
}
}
const pf = pop(6), filed = this._filed;
/* three captions fit over his head on most screens; where they don't, his last words make way for the card */
let all = 60 * cs;
for (let i = 0; i < shown.length; i++) all += shown[i].box.h + gap;
const tight = pf > 0 && filed && shown.length > 1 && Y(18) + all > head[1] - 10 * s;
let y = Y(18);
const live = [];
for (let i = 0; i < shown.length; i++) {
const it = shown[i];
/* Spex's answer always sits under his words, also while his are still alone on screen */
if (it.spex && i === 0) y += 56 * cs + gap;
if (tight && i === 0) { it.a *= 1 - pf; y -= (it.box.h + gap) * pf; }
it.x = cr - it.box.w; it.y = y; y += it.box.h + gap;
if (it.a <= 0.01) continue;
const to = it.spex ? phone : head;
const fx = it.spex ? it.x + Math.min(34 * cs, it.box.w * 0.3) : Math.max(it.x + 26 * cs, Math.min(it.x + it.box.w - 26 * cs, to[0]));
ctx.strokeStyle = 'rgba(255,255,255,' + (0.85 * it.a * it.p).toFixed(3) + ')'; ctx.lineWidth = 1.5 * s;
ctx.beginPath(); ctx.moveTo(to[0], to[1] - 3 * s); ctx.lineTo(fx, it.y + it.box.h + 3 * s); ctx.stroke();
live.push(it.box.rows.join(' '));
}
for (let i = 0; i < shown.length; i++) { const it = shown[i]; if (it.a > 0.01) this._sayDraw(ctx, it.box, it.x, it.y, it.a, it.p, cs, t); }
if (pf > 0 && filed) {
const h = 60 * cs;
ctx.font = '500 ' + (13.5 * cs) + 'px ' + this._FONT;
const nw = ctx.measureText(filed[1]).width;
ctx.font = '700 ' + (15.5 * cs) + 'px ' + this._FONT;
const w = 57 * cs + Math.max(nw, ctx.measureText(filed[0]).width) + 22 * cs;
this._chip(ctx, cr - w, y, w, h, 1, pf, 20 * cs);
this._icon(ctx, 'check', 30 * cs, h / 2, 17 * cs);
ctx.fillStyle = '#1D1D1F'; ctx.font = '700 ' + (15.5 * cs) + 'px ' + this._FONT; ctx.textBaseline = 'middle'; ctx.textAlign = 'left';
ctx.fillText(filed[0], 57 * cs, h / 2 - 9.5 * cs);
ctx.fillStyle = '#424245'; ctx.font = '500 ' + (13.5 * cs) + 'px ' + this._FONT;
ctx.fillText(filed[1], 57 * cs, h / 2 + 10.5 * cs);
ctx.restore();
live.push(filed[0]);
}
this._talkLive = live;
}

_pagesE(ctx, W, H, t, T) {
const ramp = this._ramp, ease = this._ease, G = this._G;
const d = this._dpr;
const top = this._tops[4];
const s = Math.min(W / 390, (H - top) / 492);
const a = ramp(4.58, 4.97, T);
if (a <= 0) return;
this._screen(ctx);
const ex = W / 2, ey = top + (H - top) * 0.56;
const from = [this._pt(1, 115, -73), this._pt(1, -37, -60), this._pt(1, -245, -55), this._pt(G.k, G.xF + 118, G.yG - 75), this._pt(1, 232, -79), this._pt(1, 70, -175)];
const w = 122 * s, h = 158 * s;
for (let i = 0; i < 6; i++) {
const u = ease(ramp(i * 0.115, i * 0.115 + 0.42, a));
if (u <= 0) continue;
const f = from[i];
const x = f[0] + (ex + (i - 2.5) * 2.2 * s - f[0]) * u, y = f[1] + (ey - i * 2.4 * s - f[1]) * u - Math.sin(Math.PI * u) * 46 * s;
const sc = 0.22 + 0.78 * u, rot = (1 - u) * (i % 2 ? 0.7 : -0.7) + (i - 2.5) * 0.022;
ctx.save();
ctx.globalAlpha = Math.min(1, u * 4);
ctx.translate(x, y); ctx.rotate(rot); ctx.scale(sc, sc);
ctx.shadowColor = 'rgba(0,0,0,0.38)'; ctx.shadowBlur = 20 * d; ctx.shadowOffsetY = 9 * d;
ctx.fillStyle = '#FFFFFF'; this._rr(ctx, -w / 2, -h / 2, w, h, 6 * s); ctx.fill();
ctx.shadowColor = 'rgba(0,0,0,0)'; ctx.shadowBlur = 0; ctx.shadowOffsetY = 0;
if (i === 5) {
ctx.save(); this._rr(ctx, -w / 2, -h / 2, w, h, 6 * s); ctx.clip();
ctx.fillStyle = '#1F4E79'; ctx.fillRect(-w / 2, -h / 2, w, 26 * s);
ctx.fillStyle = 'rgba(255,255,255,0.9)'; ctx.fillRect(-w / 2 + 10 * s, -h / 2 + 9 * s, 38 * s, 3.4 * s); ctx.fillRect(-w / 2 + 10 * s, -h / 2 + 16 * s, 24 * s, 2 * s);
ctx.restore();
ctx.fillStyle = '#C8B49A'; this._rr(ctx, -w / 2 + 10 * s, -h / 2 + 34 * s, w - 20 * s, 40 * s, 3 * s); ctx.fill();
ctx.fillStyle = '#8FB3D6'; ctx.fillRect(-w / 2 + 10 * s, -h / 2 + 34 * s, w - 20 * s, 13 * s);
ctx.fillStyle = '#1F4E79'; ctx.fillRect(-w / 2 + 10 * s, -h / 2 + 82 * s, 46 * s, 4 * s);
ctx.fillStyle = 'rgba(0,0,0,0.16)';
for (let k = 0; k < 4; k++) ctx.fillRect(-w / 2 + 10 * s, -h / 2 + (96 + k * 9) * s, (w - 20 * s) * (k === 3 ? 0.55 : 1), 2.6 * s);
} else {
ctx.fillStyle = 'rgba(31,78,121,0.85)'; ctx.fillRect(-w / 2 + 10 * s, -h / 2 + 12 * s, 40 * s, 3.4 * s);
ctx.fillStyle = 'rgba(0,0,0,0.15)';
for (let k = 0; k < 9; k++) ctx.fillRect(-w / 2 + 10 * s, -h / 2 + (26 + k * 9) * s, (w - 20 * s) * ((k + i) % 4 === 3 ? 0.6 : 1), 2.6 * s);
if (i % 2 === 0) { ctx.fillStyle = '#C9A98A'; this._rr(ctx, -w / 2 + 10 * s, -h / 2 + 112 * s, 44 * s, 32 * s, 3 * s); ctx.fill(); }
}
ctx.restore();
}
}
}

var cv = doc.querySelector('canvas[data-film]');
if (cv && cv.getContext && window.requestAnimationFrame) {
var film = new Film(cv);
film.start();
window.__inspyxFilm = film;
}

/* ------------------------------------------------------------------
   The time-back calculator
   ------------------------------------------------------------------ */
(function () {
var box = doc.querySelector('[data-calc]');
if (!box) return;
var v = { insp: 8, hrs: 2, calls: 5, fee: 400 };
var lim = { insp: [1, 20, 1], hrs: [0.5, 8, 0.5], calls: [0, 40, 1], fee: [150, 1500, 25] };
var num = function (n) { return String(Math.round(n * 10) / 10); };
var put = function (k, t) { var el = box.querySelector('[data-v="' + k + '"]'); if (el && el.textContent !== t) el.textContent = t; };
var render = function () {
var callsMonth = Math.round(v.calls * 52 / 12);
put('insp', String(v.insp)); put('hrs', num(v.hrs)); put('calls', String(v.calls)); put('fee', '$' + v.fee);
put('hoursWeek', num(v.insp * v.hrs));
put('dollars', '$' + (callsMonth * v.fee).toLocaleString('en-US'));
var btns = box.querySelectorAll('[data-step]');
for (var i = 0; i < btns.length; i++) {
var k = btns[i].getAttribute('data-step'), d = parseFloat(btns[i].getAttribute('data-d'));
btns[i].disabled = d < 0 ? v[k] <= lim[k][0] : v[k] >= lim[k][1];
}
};
box.addEventListener('click', function (e) {
var b = e.target && e.target.closest ? e.target.closest('[data-step]') : null;
if (!b || b.disabled) return;
var k = b.getAttribute('data-step'), d = parseFloat(b.getAttribute('data-d'));
if (!lim[k]) return;
v[k] = Math.min(lim[k][1], Math.max(lim[k][0], v[k] + d * lim[k][2]));
render();
});
render();
})();

/* ------------------------------------------------------------------
   The waitlist form. It saves to Inspyx's own database (Supabase):
   join_waitlist() takes the email and the two answers and gives back
   "ok", "invalid" or "busy". The key below is the public one that is
   meant to sit in a web page.
   ------------------------------------------------------------------ */
(function () {
var form = doc.querySelector('[data-join]');
if (!form) return;
var API = 'https://btxlrfvqifnrnxffohsz.supabase.co/rest/v1/rpc/join_waitlist';
var KEY = 'sb_publishable_iFfCyDj7e5cnTsWC7aDO8Q_BD5bG_io';
/* the words for a busy moment and a failed send are written on the form in index.html */
var MSG = {
busy: form.getAttribute('data-msg-busy') || '',
fail: form.getAttribute('data-msg-fail') || '',
wait: form.getAttribute('data-label-busy') || ''
};
var email = form.querySelector('input[type=email]');
var err = form.querySelector('.err');
var fail = form.querySelector('[data-fail]');
var btn = form.querySelector('[data-submit]');
var done = doc.querySelector('[data-joined]');
var label = btn ? btn.textContent : '';
var picked = { who: '', uses: '' };
var busy = false;

form.addEventListener('click', function (e) {
var b = e.target && e.target.closest ? e.target.closest('[data-pick]') : null;
if (!b) return;
var k = b.getAttribute('data-pick'), val = b.getAttribute('data-val');
picked[k] = picked[k] === val ? '' : val;
var all = form.querySelectorAll('[data-pick="' + k + '"]');
for (var i = 0; i < all.length; i++) all[i].setAttribute('aria-pressed', all[i].getAttribute('data-val') === picked[k] ? 'true' : 'false');
});

var showErr = function (on) {
if (err) err.hidden = !on;
if (email) { if (on) email.setAttribute('aria-invalid', 'true'); else email.removeAttribute('aria-invalid'); }
};
var showFail = function (text) {
if (!fail) return;
fail.textContent = text || '';
fail.hidden = !text;
};
var setBusy = function (on) {
busy = on;
if (!btn) return;
btn.disabled = on;
btn.textContent = on && MSG.wait ? MSG.wait : label;
};
var finish = function () {
form.hidden = true;
if (done) { done.hidden = false; try { done.focus({ preventScroll: true }); } catch (e) { done.focus(); } }
};
if (email) email.addEventListener('input', function () { showErr(false); showFail(''); });

/* which page, and which ad or link, brought them here (no cookies) */
var source = function () {
var out = [];
try {
var q = new URLSearchParams(location.search), keys = ['utm_source', 'utm_medium', 'utm_campaign', 'ref'];
for (var i = 0; i < keys.length; i++) { var s = q.get(keys[i]); if (s) out.push(keys[i].replace('utm_', '') + '=' + s.slice(0, 40)); }
} catch (e) { /* older browsers: no source */ }
return out.join(' ').slice(0, 160);
};

form.addEventListener('submit', function (e) {
e.preventDefault();
if (busy) return;
var value = ((email && email.value) || '').trim();
if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(value) || value.length > 160) { showErr(true); if (email) email.focus(); return; }
showErr(false); showFail('');
/* a hidden field people never see; whatever fills it in is not a person */
var trap = form.querySelector('input[name="website"]');
if (trap && trap.value) { finish(); return; }
/* a preview copy of the page (the form is marked data-preview) shows the result and sends nothing */
if (form.hasAttribute('data-preview')) { finish(); return; }
setBusy(true);
var ctl = window.AbortController ? new AbortController() : null;
var timer = setTimeout(function () { if (ctl) ctl.abort(); }, 12000);
fetch(API, {
method: 'POST',
headers: { 'Content-Type': 'application/json', 'apikey': KEY, 'Authorization': 'Bearer ' + KEY },
body: JSON.stringify({ p_email: value, p_who: picked.who, p_uses: picked.uses, p_page: (location.host + location.pathname).slice(0, 120), p_source: source() }),
signal: ctl ? ctl.signal : undefined
}).then(function (r) {
return r.ok ? r.json() : Promise.reject(new Error('http ' + r.status));
}).then(function (answer) {
clearTimeout(timer); setBusy(false);
if (answer === 'ok') finish();
else if (answer === 'invalid') { showErr(true); if (email) email.focus(); }
else if (answer === 'busy') showFail(MSG.busy);
else showFail(MSG.fail);
}).catch(function () {
clearTimeout(timer); setBusy(false);
showFail(MSG.fail);
});
});
})();

/* The report's product shot under the film: --p runs 0 to 1 as it scrolls into view, and the stylesheet
   turns the phone toward the reader by it. With "reduce motion" on it is left alone, at its resting pose. */
(function () {
var shot = doc.querySelector('[data-shot]');
if (!shot || !window.requestAnimationFrame) return;
if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
var asked = false;
function turn() {
asked = false;
var r = shot.getBoundingClientRect(), vh = window.innerHeight || 1;
var p = (vh - r.top) / (vh * 0.62 + r.height * 0.3);
shot.style.setProperty('--p', Math.max(0, Math.min(1, p)).toFixed(3));
}
function ask() { if (!asked) { asked = true; window.requestAnimationFrame(turn); } }
window.addEventListener('scroll', ask, { passive: true });
window.addEventListener('resize', ask);
turn();
// a mouse over the stage leans the scene a little toward it (never on touch screens, where a finger is scrolling)
if (!window.matchMedia || !window.matchMedia('(hover: hover) and (pointer: fine)').matches) return;
shot.addEventListener('pointermove', function (e) {
if (e.pointerType && e.pointerType !== 'mouse') return;
var r = shot.getBoundingClientRect();
if (!r.width || !r.height) return;
shot.style.setProperty('--mx', (((e.clientX - r.left) / r.width) * 2 - 1).toFixed(3));
shot.style.setProperty('--my', (((e.clientY - r.top) / r.height) * 2 - 1).toFixed(3));
});
shot.addEventListener('pointerleave', function () {
shot.style.setProperty('--mx', '0');
shot.style.setProperty('--my', '0');
});
})();

})();
