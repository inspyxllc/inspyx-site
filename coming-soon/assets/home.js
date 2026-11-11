/* The Inspyx home page (2026-11-11): the scroll film, the calculator and the waitlist form.
   Plain JavaScript, no libraries. The words all live in index.html. */
(function () {
'use strict';

var doc = document;
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
const hk = Math.max(-120, Math.round(this._heroY));
if (!resized && hk === this._lastHk && Math.abs(T - this._lastT) < 0.0004 && (still || now - this._lastDraw < 45)) return;
this._lastT = T; this._lastDraw = now; this._lastHk = hk;
this._Hc = Hc;
this._draw(this._ctx, W, H, dpr, T, still ? 0 : now / 1000);
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
}
this._heroY = this._heroB0 - st;
for (let i = 0; i < this._geo.length; i++) {
const g = this._geo[i];
const pushed = st - g.limit;
const op = pushed <= 0 ? '' : String(Math.round(Math.max(0, 1 - pushed / 100) * 50) / 50);
if (g.el.style.opacity !== op) g.el.style.opacity = op;
}
}

/* Film time: 1 at the top of the page, then one unit for each scene's stretch of page. */
_filmTime(st, still) {
const V = this._V, a = this._scn || [];
let T = 1;
for (let i = 0; i < a.length; i++) {
const e = st + V - a[i].top;
if (e <= 0) break;
const q = Math.min(1, e / a[i].h);
T = a[i].n + (still ? (q < 0.5 ? 0 : 0.995) : q);
}
return T;
}

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
   office scene: the tablet stays below its reply chips on shorter screens */
const zA = W / 620;
const ayTree = (this._heroB0 + 12 + 0.84 * 290 * zA) / (0.84 * H) - 0.0952;
const ayTruck = (0.5 * (1 + G.k) * H - 64 - G.k * G.yG * zA) / (G.k * H);
const ayA = Math.min(ayTruck, Math.max(0.8, ayTree));
const sC = Math.max(0.82, Math.min(1.12, W / 390, (H - tops[2] - 98) / 221));
const ayC = Math.min(0.95, Math.max(0.77, (tops[2] + 14 + 221 * sC + 27 * G.k * W / 262) / H));
this._sC = sC;
const A = this._pose(1, -40, 0, 0.5, ayA, 620);
const B = this._pose(G.k, G.xF + 118, G.yG - 75, 0.56, 0.76, 292);
const B2 = this._pose(G.k, G.xF + 118, G.yG - 75, 0.56, 0.76, 274);
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
if (T > 1.5 && T < 2.25) this._chipsB(ctx, W, H, t, T);
if (T > 2.5 && T < 3.56) this._chipsC(ctx, W, H, t, T);
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
/* the phone on the dash, seen through the window */
const ringing = this._ramp(1.57, 1.59, T) * (1 - this._ramp(2.02, 2.1, T));
ctx.fillStyle = '#15171B'; this._rr(ctx, 103.5, -74, 5.2, 9.6, 1.2); ctx.fill();
if (ringing > 0) {
const pulse = 0.72 + 0.28 * Math.sin(t * 9);
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

_chip(ctx, x, y, w, h, alpha, pop, r) {
const d = this._dpr, k = 0.94 + 0.06 * pop;
ctx.save();
ctx.globalAlpha = Math.max(0, Math.min(1, alpha * pop));
ctx.translate(x + w / 2, y + h / 2 + (1 - pop) * 10);
ctx.scale(k, k);
ctx.translate(-w / 2, -h / 2);
ctx.shadowColor = 'rgba(0,0,0,0.30)'; ctx.shadowBlur = 22 * d; ctx.shadowOffsetY = 9 * d;
ctx.fillStyle = 'rgba(255,255,255,0.94)';
this._rr(ctx, 0, 0, w, h, r == null ? h / 2 : r); ctx.fill();
ctx.shadowColor = 'rgba(0,0,0,0)'; ctx.shadowBlur = 0; ctx.shadowOffsetY = 0;
ctx.lineWidth = 1; ctx.strokeStyle = 'rgba(255,255,255,0.95)'; ctx.stroke();
}

_icon(ctx, kind, cx, cy, r) {
ctx.save();
ctx.fillStyle = '#000000'; ctx.beginPath(); ctx.arc(cx, cy, r, 0, 6.2832); ctx.fill();
ctx.strokeStyle = '#FFFFFF'; ctx.fillStyle = '#FFFFFF'; ctx.lineWidth = r * 0.17; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
if (kind === 'check') {
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

_chipsB(ctx, W, H, t, T) {
const ramp = this._ramp, ease = this._ease, G = this._G;
const s = Math.min(1.12, W / 390);
const a = ramp(1.6, 1.97, T);
const fade = 1 - ramp(2.06, 2.2, T);
if (fade <= 0 || a <= 0) return;
this._screen(ctx);
const pp = this._pt(G.k, G.xF + 106, G.yG - 69);
ctx.font = '600 ' + (15 * s) + 'px ' + this._FONT;
const h1 = 46 * s, w1 = h1 / 2 + 22 * s + ctx.measureText(a >= 0.36 ? 'Mia answered' : 'Incoming call').width + (a >= 0.36 ? 62 : 22) * s;
const x1 = Math.max(12, Math.min(W - w1 - 12, pp[0] - w1 * 0.86));
const yA = Math.max(this._tops[1] + 16, pp[1] - 206 * s);
const answered = a >= 0.36;
if (!answered) {
for (let i = 0; i < 3; i++) {
const ph = (t * 0.9 + i / 3) % 1;
ctx.strokeStyle = 'rgba(255,255,255,' + (0.8 * (1 - ph) * fade).toFixed(3) + ')'; ctx.lineWidth = 2 * s;
ctx.beginPath(); ctx.arc(pp[0], pp[1], (9 + ph * 36) * s, 0, 6.2832); ctx.stroke();
}
}
const p1 = ease(ramp(0.02, 0.12, a));
if (p1 > 0) {
ctx.strokeStyle = 'rgba(255,255,255,' + (0.85 * fade * p1).toFixed(3) + ')'; ctx.lineWidth = 1.5 * s;
ctx.beginPath(); ctx.moveTo(pp[0], pp[1] - 8 * s); ctx.lineTo(x1 + w1 * 0.82, yA + h1 + 4 * s); ctx.stroke();
this._chip(ctx, x1, yA, w1, h1, fade, p1);
this._icon(ctx, answered ? 'check' : 'ring', h1 / 2, h1 / 2, 15 * s);
ctx.fillStyle = '#1D1D1F'; ctx.font = '600 ' + (15 * s) + 'px ' + this._FONT; ctx.textBaseline = 'middle'; ctx.textAlign = 'left';
ctx.fillText(answered ? 'Mia answered' : 'Incoming call', h1 / 2 + 22 * s, h1 / 2 + 0.5);
if (answered) {
for (let i = 0; i < 5; i++) {
const hh = (5 + 9 * Math.abs(Math.sin(t * 5.2 + i * 1.3))) * s;
ctx.fillStyle = '#1D1D1F'; this._rr(ctx, w1 - (46 - i * 6.4) * s, h1 / 2 - hh / 2, 3 * s, hh, 1.5 * s); ctx.fill();
}
}
ctx.restore();
}
const p2 = ease(ramp(0.64, 0.76, a));
if (p2 > 0) {
ctx.font = '500 ' + (13.5 * s) + 'px ' + this._FONT;
const tb = ctx.measureText('Booked on your calendar').width;
ctx.font = '700 ' + (15.5 * s) + 'px ' + this._FONT;
const h2 = 62 * s, w2 = 58 * s + Math.max(tb, ctx.measureText('Tomorrow, 9:00 AM').width) + 24 * s;
const x2 = Math.max(12, Math.min(W - w2 - 12, x1 - 8 * s));
this._chip(ctx, x2, yA + h1 + 10 * s, w2, h2, fade, p2, 20 * s);
this._icon(ctx, 'cal', 31 * s, h2 / 2, 17 * s);
ctx.fillStyle = '#1D1D1F'; ctx.font = '700 ' + (15.5 * s) + 'px ' + this._FONT; ctx.textBaseline = 'middle'; ctx.textAlign = 'left';
ctx.fillText('Tomorrow, 9:00 AM', 58 * s, h2 / 2 - 9.5 * s);
ctx.fillStyle = '#424245'; ctx.font = '500 ' + (13.5 * s) + 'px ' + this._FONT;
ctx.fillText('Booked on your calendar', 58 * s, h2 / 2 + 10.5 * s);
ctx.restore();
}
}

_chipsC(ctx, W, H, t, T) {
const ramp = this._ramp, ease = this._ease, G = this._G;
const s = this._sC || Math.min(1.12, W / 390);
const a = ramp(2.62, 2.99, T);
const inn = ease(ramp(2.575, 2.635, T));
const fade = (1 - ramp(3.36, 3.52, T));
if (fade <= 0 || inn <= 0) return;
this._screen(ctx);
const tp = this._pt(G.k, G.xF + 324, G.yG - 79);
const rows = [
['Agent', 'Can you do Friday at 2?', 'Friday at 2 works.'],
['Client', 'What does it include?', 'Here is the full list.'],
['Client', 'Can we move to Monday?', 'Monday at 10 is open.']
];
const w = 262 * s, h = 56 * s, gap = 9 * s;
const x = Math.max(12, Math.min(W - w - 12, tp[0] - 44 * s));
const yTop = Math.max(this._tops[2] + 14, tp[1] - (h + gap) * 3 - 26 * s);
ctx.strokeStyle = 'rgba(255,255,255,' + (0.85 * fade * inn).toFixed(3) + ')'; ctx.lineWidth = 1.5 * s;
ctx.beginPath(); ctx.moveTo(tp[0], tp[1] - 4 * s); ctx.lineTo(x + 44 * s, yTop + (h + gap) * 3 - gap + 4 * s); ctx.stroke();
for (let i = 0; i < 3; i++) {
const done = ease(ramp(0.10 + i * 0.28, 0.22 + i * 0.28, a));
const y = yTop + i * (h + gap);
this._chip(ctx, x, y, w, h, fade, inn, 19 * s);
if (done < 0.5) {
ctx.globalAlpha = ctx.globalAlpha * (1 - done * 2);
this._icon(ctx, 'msg', 28 * s, h / 2, 16 * s);
ctx.fillStyle = '#424245'; ctx.font = '600 ' + (12.5 * s) + 'px ' + this._FONT; ctx.textBaseline = 'middle'; ctx.textAlign = 'left';
ctx.fillText(rows[i][0], 54 * s, h / 2 - 10 * s);
ctx.fillStyle = '#1D1D1F'; ctx.font = '600 ' + (15 * s) + 'px ' + this._FONT;
ctx.fillText(rows[i][1], 54 * s, h / 2 + 9 * s);
} else {
ctx.globalAlpha = ctx.globalAlpha * (done * 2 - 1);
this._icon(ctx, 'check', 28 * s, h / 2, 16 * s);
ctx.fillStyle = '#424245'; ctx.font = '600 ' + (12.5 * s) + 'px ' + this._FONT; ctx.textBaseline = 'middle'; ctx.textAlign = 'left';
ctx.fillText('Reply ready', 54 * s, h / 2 - 10 * s);
ctx.fillStyle = '#1D1D1F'; ctx.font = '500 ' + (13.5 * s) + 'px ' + this._FONT;
ctx.fillText(rows[i][2], 54 * s, h / 2 + 9 * s, w - 124 * s);
ctx.fillStyle = '#000000'; this._rr(ctx, w - 62 * s, h / 2 - 15 * s, 52 * s, 30 * s, 15 * s); ctx.fill();
ctx.fillStyle = '#FFFFFF'; ctx.font = '600 ' + (13 * s) + 'px ' + this._FONT; ctx.textAlign = 'center';
ctx.fillText('Send', w - 36 * s, h / 2 + 0.5);
ctx.textAlign = 'left';
}
ctx.restore();
}
}

_panel(ctx, cx, cy, s, mark) {
const P = this._P, me = this;
const c = (b, sh, dp, a) => me._c(b, sh, dp, a);
ctx.fillStyle = c(P.metalD); this._poly(ctx, [[cx - 75 * s, cy - 106 * s], [cx - 132 * s, cy - 94 * s], [cx - 132 * s, cy + 118 * s], [cx - 75 * s, cy + 106 * s]]); ctx.fill();
ctx.fillStyle = 'rgba(255,255,255,0.5)'; this._poly(ctx, [[cx - 84 * s, cy - 60 * s], [cx - 122 * s, cy - 52 * s], [cx - 122 * s, cy + 30 * s], [cx - 84 * s, cy + 26 * s]]); ctx.fill();
ctx.fillStyle = c(P.metal); this._rr(ctx, cx - 75 * s, cy - 106 * s, 150 * s, 212 * s, 6 * s); ctx.fill();
ctx.fillStyle = c(P.metalD, 0.2); this._rr(ctx, cx - 64 * s, cy - 95 * s, 128 * s, 190 * s, 4 * s); ctx.fill();
ctx.fillStyle = c(P.box); this._rr(ctx, cx - 36 * s, cy - 86 * s, 72 * s, 17 * s, 3 * s); ctx.fill();
ctx.fillStyle = '#D9DCE0'; this._rr(ctx, cx - 9 * s, cy - 83 * s, 18 * s, 11 * s, 2 * s); ctx.fill();
for (let r = 0; r < 8; r++) {
for (let k = 0; k < 2; k++) {
const bx = cx + (k === 0 ? -56 : 6) * s, by = cy - 60 * s + r * 19 * s;
const bad = (r === 3 && k === 1);
ctx.fillStyle = bad ? '#3A2A22' : c(P.box); this._rr(ctx, bx, by, 50 * s, 14 * s, 2.5 * s); ctx.fill();
ctx.fillStyle = bad ? '#8A6A55' : '#D9DCE0';
this._rr(ctx, bx + (k === 0 ? 30 : 6) * s + ((r * 7 + k * 3) % 3 === 0 ? 0 : (k === 0 ? 4 : -2) * s), by + 3.5 * s, 14 * s, 7 * s, 1.6 * s); ctx.fill();
if (bad) {
const g = ctx.createRadialGradient(bx + 25 * s, by + 7 * s, 0, bx + 25 * s, by + 7 * s, 30 * s);
g.addColorStop(0, 'rgba(40,20,8,0.55)'); g.addColorStop(1, 'rgba(40,20,8,0)');
ctx.fillStyle = g; ctx.fillRect(bx - 8 * s, by - 24 * s, 66 * s, 62 * s);
}
}
}
if (mark > 0) {
const mx = cx + 31 * s, my = cy - 60 * s + 3 * 19 * s + 7 * s;
ctx.strokeStyle = '#FF453A'; ctx.lineWidth = 3.4 * s; ctx.lineCap = 'round';
ctx.beginPath(); ctx.ellipse(mx, my, 37 * s, 17 * s, -0.08, -1.9, -1.9 + 6.5 * mark); ctx.stroke();
}
}

_shotD(ctx, W, H, t, T) {
const P = this._P, me = this;
const c = (b, sh, dp, a) => me._c(b, sh, dp, a);
const ramp = this._ramp, ease = this._ease;
const d = this._dpr, Hc = this._Hc || H;
const top = this._tops[3];
const s = Math.max(0.76, Math.min(W / 390, (H - top) / 440));
const ox = W / 2 - 195 * s, oy = Math.max(top, H - 492 * s);
const X = (v) => ox + v * s, Y = (v) => oy + v * s;
const a = ramp(3.6, 3.97, T);
ctx.setTransform(d, 0, 0, d, 0, 0);
ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
const zoom = 1 + 0.05 * ramp(3.36, 4.5, T);
ctx.save();
ctx.translate(X(170), Y(300)); ctx.scale(zoom, zoom); ctx.translate(-X(170), -Y(300));

/* the wall */
let g = ctx.createLinearGradient(0, 0, 0, H);
g.addColorStop(0, c(P.siding2)); g.addColorStop(1, c(P.siding, 0.3));
ctx.fillStyle = g; ctx.fillRect(-30, -30, W + 60, Hc + 60);
const step = 31 * s;
for (let y = Y(20) % step - step; y < Hc + step; y += step) {
ctx.fillStyle = 'rgba(20,30,45,0.15)'; ctx.fillRect(-30, y, W + 60, 2.2 * s);
ctx.fillStyle = 'rgba(255,255,255,0.22)'; ctx.fillRect(-30, y + 2.2 * s, W + 60, 1.3 * s);
}
g = ctx.createLinearGradient(0, Y(-150), 0, Y(70));
g.addColorStop(0, 'rgba(24,30,58,0.5)'); g.addColorStop(1, 'rgba(24,30,58,0)');
ctx.fillStyle = g; ctx.fillRect(-30, -30, W + 60, Y(70) + 30);
for (let i = 0; i < 8; i++) {
const lx = X(20 + ((i * 97) % 380)) + Math.sin(t * 0.7 + i) * 5 * s, ly = Y(60 + ((i * 61) % 250)) + Math.cos(t * 0.6 + i * 2) * 4 * s, lr = (34 + (i * 13) % 30) * s;
const lg = ctx.createRadialGradient(lx, ly, 0, lx, ly, lr);
lg.addColorStop(0, 'rgba(24,30,58,0.16)'); lg.addColorStop(1, 'rgba(24,30,58,0)');
ctx.fillStyle = lg; ctx.fillRect(lx - lr, ly - lr, lr * 2, lr * 2);
}

/* conduit and the panel */
ctx.fillStyle = c(P.metal, 0.2); ctx.fillRect(X(94), -30, 13 * s, Y(172) + 30);
ctx.fillStyle = 'rgba(255,255,255,0.35)'; ctx.fillRect(X(96.5), -30, 2.6 * s, Y(172) + 30);
ctx.fillStyle = 'rgba(18,24,46,0.22)'; ctx.fillRect(X(24), Y(172), 164 * s, 222 * s);
this._panel(ctx, X(100), Y(276), s, 0);

/* his shadow on the wall */
g = ctx.createRadialGradient(X(250), Y(420), 0, X(250), Y(420), 210 * s);
g.addColorStop(0, 'rgba(18,24,46,0.34)'); g.addColorStop(1, 'rgba(18,24,46,0)');
ctx.fillStyle = g; ctx.fillRect(X(20), Y(190), 460 * s, 330 * s);

/* forearm and hand */
ctx.strokeStyle = c(P.cap, 0.2); ctx.lineWidth = 46 * s; ctx.lineCap = 'round';
/* Where the canvas is taller than the scene (a phone with the browser's bars tucked away) his arm
   and his back run on down to the canvas's bottom edge. Anywhere else they are drawn exactly as composed. */
const fb = Y(520) - 23 * s < Hc + 2 ? Math.max(0, (Hc + 60 - Y(520)) / (64 * s)) : 0;
ctx.beginPath(); ctx.moveTo(X(232 + 36 * fb), Y(520 + 64 * fb)); ctx.lineTo(X(196), Y(456)); ctx.stroke();
ctx.fillStyle = c(P.skin, 0.25);
this._rr(ctx, X(160), Y(410), 62 * s, 50 * s, 20 * s); ctx.fill();

/* the phone */
ctx.save();
ctx.translate(X(166), Y(294)); ctx.rotate(-0.045);
const pw = 138 * s, ph = 280 * s;
ctx.shadowColor = 'rgba(0,0,0,0.42)'; ctx.shadowBlur = 30 * d; ctx.shadowOffsetY = 14 * d;
ctx.fillStyle = '#0E0F12'; this._rr(ctx, -pw / 2, -ph / 2, pw, ph, 24 * s); ctx.fill();
ctx.shadowColor = 'rgba(0,0,0,0)'; ctx.shadowBlur = 0; ctx.shadowOffsetY = 0;
ctx.save();
this._rr(ctx, -pw / 2 + 5 * s, -ph / 2 + 5 * s, pw - 10 * s, ph - 10 * s, 19 * s); ctx.clip();
g = ctx.createLinearGradient(0, -ph / 2, 0, ph / 2);
g.addColorStop(0, c(P.siding2, 0.25)); g.addColorStop(1, c(P.siding, 0.5));
ctx.fillStyle = g; ctx.fillRect(-pw / 2, -ph / 2, pw, ph);
for (let y = -ph / 2 + 12 * s; y < ph / 2; y += 20 * s) { ctx.fillStyle = 'rgba(20,30,45,0.16)'; ctx.fillRect(-pw / 2, y, pw, 1.5 * s); }
const mark = ease(ramp(0.50, 0.68, a));
this._panel(ctx, 6 * s, -18 * s, s * 0.57, mark);
/* viewfinder corners */
const bp = 1 + 0.03 * Math.sin(t * 3);
ctx.strokeStyle = 'rgba(255,255,255,0.92)'; ctx.lineWidth = 2.4 * s; ctx.lineCap = 'round';
const bw = 50 * s * bp, bh = 76 * s * bp, bl = 13 * s;
ctx.beginPath();
ctx.moveTo(-bw, -18 * s - bh + bl); ctx.lineTo(-bw, -18 * s - bh); ctx.lineTo(-bw + bl, -18 * s - bh);
ctx.moveTo(bw - bl, -18 * s - bh); ctx.lineTo(bw, -18 * s - bh); ctx.lineTo(bw, -18 * s - bh + bl);
ctx.moveTo(bw, -18 * s + bh - bl); ctx.lineTo(bw, -18 * s + bh); ctx.lineTo(bw - bl, -18 * s + bh);
ctx.moveTo(-bw + bl, -18 * s + bh); ctx.lineTo(-bw, -18 * s + bh); ctx.lineTo(-bw, -18 * s + bh - bl);
ctx.stroke();
/* listening bar */
ctx.fillStyle = 'rgba(10,12,16,0.72)'; this._rr(ctx, -pw / 2 + 14 * s, ph / 2 - 58 * s, pw - 28 * s, 40 * s, 20 * s); ctx.fill();
this._icon(ctx, 'mic', -pw / 2 + 34 * s, ph / 2 - 38 * s, 13 * s);
for (let i = 0; i < 9; i++) {
const hh = (4 + 13 * Math.abs(Math.sin(t * 6 + i * 0.9)) * (a < 0.34 ? 1 : 0.35)) * s;
ctx.fillStyle = '#FFFFFF'; this._rr(ctx, -pw / 2 + (56 + i * 8) * s, ph / 2 - 38 * s - hh / 2, 3.4 * s, hh, 1.7 * s); ctx.fill();
}
const flash = ramp(0.30, 0.34, a) * (1 - ramp(0.34, 0.46, a));
if (flash > 0) { ctx.fillStyle = 'rgba(255,255,255,' + (0.92 * flash).toFixed(3) + ')'; ctx.fillRect(-pw / 2, -ph / 2, pw, ph); }
ctx.restore();
/* thumb over the lower edge */
ctx.fillStyle = c(P.skin, 0.15);
ctx.save(); ctx.translate(pw / 2 - 8 * s, ph / 2 - 44 * s); ctx.rotate(-0.5); this._rr(ctx, -13 * s, -30 * s, 26 * s, 64 * s, 13 * s); ctx.fill(); ctx.restore();
ctx.restore();

/* the inspector, from behind */
g = ctx.createLinearGradient(0, Y(350), 0, Y(520));
g.addColorStop(0, c(P.vest)); g.addColorStop(1, c(P.vest, 0.7));
ctx.fillStyle = g;
const yb = Y(540) < Hc + 2 ? Hc + 60 : 0;
ctx.beginPath();
if (yb) { ctx.moveTo(X(206), yb); ctx.lineTo(X(206), Y(540)); } else ctx.moveTo(X(206), Y(540));
ctx.bezierCurveTo(X(204), Y(440), X(232), Y(392), X(286), Y(376));
ctx.lineTo(X(352), Y(376));
ctx.bezierCurveTo(X(392), Y(384), X(420), Y(402), X(440), Y(430));
ctx.lineTo(X(440), Y(540));
if (yb) ctx.lineTo(X(440), yb);
ctx.closePath(); ctx.fill();
ctx.fillStyle = 'rgba(245,245,235,0.78)';
this._poly(ctx, [[X(214), Y(470)], [X(440), Y(450)], [X(440), Y(468)], [X(212), Y(488)]]); ctx.fill();
ctx.fillStyle = c(P.skin, 0.35); this._rr(ctx, X(292), Y(338), 54 * s, 50 * s, 14 * s); ctx.fill();
ctx.fillStyle = c(P.cap, 0.3);
ctx.beginPath(); ctx.moveTo(X(282), Y(380)); ctx.quadraticCurveTo(X(319), Y(400), X(356), Y(380)); ctx.lineTo(X(356), Y(372)); ctx.quadraticCurveTo(X(319), Y(388), X(282), Y(372)); ctx.closePath(); ctx.fill();
ctx.fillStyle = c(P.hair); ctx.beginPath(); ctx.arc(X(319), Y(304), 47 * s, 0, 6.2832); ctx.fill();
ctx.fillStyle = c(P.cap);
ctx.beginPath(); ctx.arc(X(319), Y(298), 49 * s, Math.PI * 0.98, Math.PI * 2.02); ctx.quadraticCurveTo(X(319), Y(322), X(270), Y(301)); ctx.closePath(); ctx.fill();
ctx.fillStyle = c(P.cap, 0.5); this._rr(ctx, X(303), Y(310), 32 * s, 8 * s, 4 * s); ctx.fill();
ctx.fillStyle = c(P.cap); this._poly(ctx, [[X(272), Y(296)], [X(248), Y(304)], [X(250), Y(311)], [X(274), Y(306)]]); ctx.fill();
ctx.restore();

/* what he says, and what Spex does with it */
ctx.setTransform(d, 0, 0, d, 0, 0);
const cs = Math.max(s, 0.9), cr = W - 12;
const pv = ease(ramp(0.04, 0.14, a));
if (pv > 0) {
const h = 44 * cs;
ctx.font = '600 ' + (14 * cs) + 'px ' + this._FONT;
const w = h / 2 + 20 * cs + ctx.measureText('“Photo. Mark that breaker.”').width + 18 * cs;
this._chip(ctx, cr - w, Y(18), w, h, 1, pv);
this._icon(ctx, 'mic', h / 2, h / 2, 14 * cs);
ctx.fillStyle = '#1D1D1F'; ctx.font = '600 ' + (14 * cs) + 'px ' + this._FONT; ctx.textBaseline = 'middle'; ctx.textAlign = 'left';
ctx.fillText('“Photo. Mark that breaker.”', h / 2 + 20 * cs, h / 2 + 0.5);
ctx.restore();
}
const pf = ease(ramp(0.76, 0.88, a));
if (pf > 0) {
const h = 60 * cs;
ctx.font = '700 ' + (15.5 * cs) + 'px ' + this._FONT;
const w = 57 * cs + ctx.measureText('Filed under Electrical').width + 22 * cs;
this._chip(ctx, cr - w, Y(18) + 54 * cs, w, h, 1, pf, 20 * cs);
this._icon(ctx, 'check', 30 * cs, h / 2, 17 * cs);
ctx.fillStyle = '#1D1D1F'; ctx.font = '700 ' + (15.5 * cs) + 'px ' + this._FONT; ctx.textBaseline = 'middle'; ctx.textAlign = 'left';
ctx.fillText('Filed under Electrical', 57 * cs, h / 2 - 9.5 * cs);
ctx.fillStyle = '#424245'; ctx.font = '500 ' + (13.5 * cs) + 'px ' + this._FONT;
ctx.fillText('Photo taken and marked', 57 * cs, h / 2 + 10.5 * cs);
ctx.restore();
}
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

})();
