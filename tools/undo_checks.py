"""Undo checks for the home page: break one thing at a time and see that a self-check notices.

Passing checks prove little by themselves: a check that cannot fail guards nothing. Each entry in the list below
is one way to break the page (a piece of text in home.js or index.html, and what to put in its place). The script
makes the change, runs tools/check_home.js, counts the change as caught if a check fails, and takes it back.

usage: python3 -I tools/undo_checks.py <site repo> [--pages | --signin | --plan] [--part=i/n] [--first=N] [words]
  The page must be served at $URL, or at http://localhost:4173/ (node tools/serve.js).
  --pages tries the changes to the pricing and policy pages instead, against tools/check_pages.js.
  --signin tries the changes to signing in (/signin and /account) instead, against tools/check_signin.js.
  --plan tries the changes to "Your plan" (/plan) instead, against tools/check_plan.js.
  With words given, only the changes whose name holds them are tried.
  --first=N tries only the first N changes of the list (the newest part of the page stands first).
  --part=0/2 and --part=1/2 split the list in two, for two copies of the repo served on two ports:
      git worktree add --detach ../copy HEAD && node ../copy/tools/serve.js 4174 &
      URL=http://localhost:4174/ python3 -I tools/undo_checks.py ../copy --part=1/2

The work must be committed first: each change is taken back with `git checkout -- <file>`.
Each piece of text must be found exactly once. When the code moves on, this list must follow it: the script stops
and names the piece it could not find.

A change counts as caught only by a check that passes on the unchanged page: the unchanged page is checked first,
and nothing is tried unless every check passes. (2026-11-12: one check named port 4173, so on another port it
failed every time and would have made every change look caught. That check now reads the port from $URL.)
"""
import os
import subprocess
import sys

repo = sys.argv[1]
JS = 'coming-soon/assets/home.js'
HTML = 'coming-soon/index.html'
PRICING = 'coming-soon/pricing.html'
TERMS = 'coming-soon/terms.html'

MUTATIONS = [
    # ---- opened at its waitlist, from the pricing page's button (2026-11-12)
    ('arriving at the waitlist runs the whole film past first', HTML,
     'html[data-arrive]{scroll-behavior:auto}\n',
     ''),
    ('the page never glides again after arriving at the waitlist', HTML,
     'setTimeout(function () { root.removeAttribute("data-arrive"); }, 400);',
     ''),
    # ---- the lid: Safari's top bar follows the page (2026-11-12)
    ('the strip no longer follows the film into the attic', JS,
     "over = !m || st < m.sheet ? this._topCol :",
     "over = !m || st < m.sheet ? '' :"),
    ('the strip keeps the film\'s colour over the white sheet', JS,
     "st < m.wait ? 'rgb(255, 255, 255)' : st < m.foot ? 'rgb(0, 0, 0)' : 'rgb(255, 255, 255)'; }\nif (over !== this._lidOn)",
     "st < m.wait ? this._topCol : st < m.foot ? 'rgb(0, 0, 0)' : 'rgb(255, 255, 255)'; }\nif (over !== this._lidOn)"),
    ('the strip is switched on for every phone, where nothing reads it', JS,
     "this._lidUse = !!this._lid && /iP(hone|od)/.test(navigator.userAgent || '');",
     "this._lidUse = !!this._lid;"),
    ('the strip is 4 px deep, too thin for Safari to read', HTML,
     'height:12px; z-index:7; pointer-events:none; background-color:var(--sky)}',
     'height:4px; z-index:7; pointer-events:none; background-color:var(--sky)}'),
    # ---- the colour of a phone browser's top bar (2026-11-12)
    ("the page's grounds on a phone are white again", HTML,
     '  html,body{background:var(--sky)}',
     '  html,body{background:var(--bg)}'),
    ("the film's box has no colour of its own again, only its gradient", HTML,
     'z-index:0; background:var(--sky) linear-gradient(180deg, var(--sky) 0%, #D9E4EA 55%, #F8DDBE 100%)}',
     'z-index:0; background:linear-gradient(180deg, #A9CBE8 0%, #D9E4EA 55%, #F8DDBE 100%)}'),
    ('the theme-color tag names another colour', HTML,
     '<meta name="theme-color" media="(max-width: 520px)" content="#94B2CB">',
     '<meta name="theme-color" media="(max-width: 520px)" content="#FFFFFF">'),
    ("the named blue is the lighter one again, a band over the film's top row", HTML,
     '--sky:#94B2CB;',
     '--sky:#A9CBE8;'),
    # ---- the calculator's starting numbers (2026-11-12)
    ('the calculator starts at the old, high numbers again', JS,
     'var v = { insp: 3, hrs: 1, calls: 1, fee: 400 };',
     'var v = { insp: 8, hrs: 2, calls: 5, fee: 400 };'),
    ("the page's own starting number of calls differs from the script's", HTML,
     '<span class="val" data-v="calls" aria-live="polite">1</span>',
     '<span class="val" data-v="calls" aria-live="polite">5</span>'),
    ('one hour a week reads "1 hours" again', JS,
     "put('hoursUnit', v.insp * v.hrs === 1 ? 'hour' : 'hours');",
     ""),
    # ---- the report section: the web report as a product shot (2026-11-12)
    ('the web report picture is missing from the report section', HTML,
     'srcset="/assets/report-web.webp"',
     'srcset="/assets/report-wb.webp"'),
    ("the JPEG behind the web report picture has a wrong address in the report section", HTML,
     'src="/assets/report-web.jpg"',
     'src="/assets/report-wb.jpg"'),
    ("the signature's picture has a wrong address", HTML,
     'src="/assets/report-signature.png"',
     'src="/assets/report-signatur.png"'),
    ('the report section no longer says the web report arrives with the pilot', HTML,
     '<div class="tag pages-tag">',
     '<div class="tag pages-tag" hidden>'),
    ('the phone lies flat again', HTML,
     'transform:rotateY(calc(-34deg + 16deg * var(--p, 1) + 5deg * var(--mx, 0))) rotateX(calc(13deg - 6deg * var(--p, 1) - 4deg * var(--my, 0))) rotateZ(calc(3deg - 2deg * var(--p, 1)))}',
     'transform:none}'),
    ("the video card stands out past the screen's edge", HTML,
     '.fl-clip{right:max(16px, calc(50% - 176px));',
     '.fl-clip{right:max(-30px, calc(50% - 226px));'),
    ('the stage no longer cuts off a card on its way in, and the page gets wider than the screen', HTML,
     '0 calc(-1 * max(20px, env(safe-area-inset-left, 0px))); overflow-x:clip}',
     '0 calc(-1 * max(20px, env(safe-area-inset-left, 0px))); overflow-x:visible}'),
    ("the phone stands 150 px above the sheet again, over the film card's last line", HTML,
     '.shot{position:relative; margin:-88px calc(',
     '.shot{position:relative; margin:-150px calc('),
    ('on a wide screen the phone stands out over the film again', HTML,
     '  .shot{margin:64px -40px 0}',
     '  .shot{margin:-210px -40px 0}'),
    ('on a narrow desk screen the stage cuts the side cards off', HTML,
     '  .shot{margin:64px -40px 0}',
     '  .shot{margin:64px 0 0}'),
    ('the phone no longer turns as the stage scrolls in', JS,
     "shot.style.setProperty('--p', Math.max(0, Math.min(1, p)).toFixed(3));",
     "shot.style.setProperty('--p', '1.000');"),
    ('a touch screen leans the scene toward a pointer too', JS,
     "if (!window.matchMedia || !window.matchMedia('(hover: hover) and (pointer: fine)').matches) return;",
     ""),
    ('a mouse over the stage no longer leans the scene', JS,
     "shot.style.setProperty('--mx', (((e.clientX - r.left) / r.width) * 2 - 1).toFixed(3));",
     "shot.style.setProperty('--mx', '0');"),
    ('with motion off the cards still drift', HTML,
     '  .fl{animation:none}',
     '  .fl{animation-duration:9s}'),
    ('a word on a card is changed (the license)', HTML,
     '<figcaption><b>Moises Avila</b><span class="fl-sub">License HI18352</span></figcaption>',
     '<figcaption><b>Moises Avila</b><span class="fl-sub">License HI0000</span></figcaption>'),
    # ---- the attic in the Spex scene (2026-11-12)
    ("Spex's light never comes on in the attic", JS,
     'const amb = (0.86 - 0.16 * light) * (1 - 0.95 * flash), core = amb * (1 - 0.96 * light);',
     'const amb = 0.86 * (1 - 0.95 * flash), core = amb;'),
    ('the flash no longer lights the attic', JS,
     'const amb = (0.86 - 0.16 * light) * (1 - 0.95 * flash), core = amb * (1 - 0.96 * light);',
     'const amb = (0.86 - 0.16 * light), core = amb * (1 - 0.96 * light);'),
    ('the attic is lit before Spex is asked for the light', JS,
     'const amb = (0.86 - 0.16 * light) * (1 - 0.95 * flash), core = amb * (1 - 0.96 * light);',
     'const amb = (0.3 - 0.16 * light) * (1 - 0.95 * flash), core = amb * (1 - 0.96 * light);'),
    ('the page under the attic keeps a daylight colour', JS,
     'attic = this._atticGround || [34, 33, 37];',
     'attic = [160, 170, 172];'),
    ("the attic's first line is changed in the page", HTML,
     '<q>Spex, open the camera.</q>',
     '<q>Spex, open camera.</q>'),
    # ---- the promise and its terms (2026-11-12)
    ("the promise's terms are gone from the pricing page", PRICING,
     '<h2>Faster reports, or three months free</h2>',
     '<h2>Faster reports</h2>'),
    ('a condition of the promise is changed on the pricing page', PRICING,
     'Your reports during your 30 free days are timed the same way.',
     'Your reports during your first 60 days are timed the same way.'),
    ('the Terms no longer name the promise', TERMS,
     ' The one promise we make on top of this is the faster-reports promise on our <a href="/pricing">pricing page</a>, on the conditions written there.',
     ''),
    # ---- under the film, behind Safari's bar on an iPhone (2026-11-12)
    ('the ground under the film stays white', JS,
     'if (this._story && ground !== this._groundOn) { this._groundOn = ground; this._story.style.backgroundColor = ground; }',
     'this._groundOn = ground;'),
    ('the body stays white under the film (the strip under a tucked-away bar)', JS,
     'if (under !== this._underOn) { this._underOn = under; doc.body.style.backgroundColor = under; }',
     'this._underOn = under;'),
    ('the body stays street-coloured under the waitlist', JS,
     "under = !m || b < m.sheet ? ground : b < m.wait ? 'rgb(255, 255, 255)' : b < m.foot ? 'rgb(0, 0, 0)' : 'rgb(255, 255, 255)';",
     'under = ground;'),
    ('a wide screen gets the ground colours too', JS,
     "const phone = !this._isWide && window.innerWidth <= 520 && !!this._groundCol;",
     "const phone = !!this._groundCol;"),
    # ---- very tall windows (2026-11-12)
    ('on a very tall window a sequence runs on past the end of its stretch again', JS,
     'const t0 = Math.max(SEQ_HOLD[n] + 40, Math.min(Math.max(SEQ_HOLD[n], V - 80) + 40, t1 - 900));',
     'const t0 = Math.max(SEQ_HOLD[n], V - 80) + 40;'),
    # ---- Mia's phone call (2026-11-12)
    ('Mia never answers the phone', JS,
     'const pRing = pop(0), pAns = pop(1), pq1 = pop(2),',
     'const pRing = pop(0), pAns = 0, pq1 = pop(2),'),
    ("Mia's second answer never comes", JS,
     'pq2 = pop(4), pr2 = pop(5), pc = pop(6);',
     'pq2 = pop(4), pr2 = 0, pc = pop(6);'),
    ('the job never lands on the calendar at the end of the call', JS,
     'pq2 = pop(4), pr2 = pop(5), pc = pop(6);',
     'pq2 = pop(4), pr2 = pop(5), pc = 0;'),
    ('a small phone stacks a question over its answer anyway', JS,
     'const roomyB = sB >= 0.78;',
     'const roomyB = true;'),
    ('the truck no longer sits lower on a phone with its bars showing', JS,
     'let ayB = downB(CALL_ROOMY * sB0, 45), sB =',
     'let ayB = 0.76, sB ='),
    ('the cards start above the eave, over the man on the roof', JS,
     'const yTop = Math.max(this._tops[1] + 14, eave + 8);',
     'const yTop = this._tops[1] + 14;'),
    ("the clock no longer waits in Mia's scene", JS,
     'var SEQ_HOLD = { 1: 780, 2: 845, 3: 735 };',
     'var SEQ_HOLD = { 2: 845, 3: 735 };'),
    ("Mia's words are drawn like the caller's, on a white card", JS,
     "voice = box.who === 'spex' || box.who === 'mia', dark",
     "voice = box.who === 'spex', dark"),
    ('captions keep the typewriter apostrophe', JS,
     "line.text.replace(/'/g, '\u2019')",
     'line.text'),
    ('the time Mia books no longer matches the calendar in the next scene', HTML,
     'data-booked="Tomorrow, 9:00 AM"',
     'data-booked="Tomorrow, 9:30 AM"'),
    ("Mia's price is changed in the page", HTML,
     '<q>A house that size is $425.</q>',
     '<q>A house that size is $400.</q>'),
    ("Mia's stretch of page is back to the short one", HTML,
     '<section class="scene scene-call" data-scene="1">',
     '<section class="scene" data-scene="1">'),
    # ---- the Spex Business scene and the header (2026-11-12, earlier)
    ('the reply never comes', JS,
     'const pq = pop(3 * e), pr = pop(3 * e + 1);',
     'const pq = pop(3 * e), pr = 0;'),
    ('the second job never lands on the calendar', JS,
     'const p2 = pop(2), p5 = pop(5);',
     'const p2 = pop(2), p5 = 0;'),
    ('a small phone keeps the reply over the calendar', JS,
     'const cramped = !roomy && yTop + exH + gap + calH(3) > H - 6;',
     'const cramped = false;'),
    ('a phone with its bars showing stacks request and reply anyway', JS,
     'const roomy = roomC >= DESK_ROOMY;',
     'const roomy = true;'),
    ('the clock no longer waits in the Spex Business scene', JS,
     'var SEQ_HOLD = { 1: 780, 2: 845, 3: 735 };',
     'var SEQ_HOLD = { 1: 780, 3: 735 };'),
    ('motion off no longer gives stills in a sequence', JS,
     'u = e < sp[0] ? 0 : stills[Math.min(stills.length - 1, Math.floor(raw * stills.length))];',
     'u = raw;'),
    ('a calendar tag is changed in the page', HTML,
     'data-when="Monday, 10:00 AM" data-from="Website"',
     'data-when="Monday, 10:00 AM" data-from="Web"'),
    ('a reply is changed in the page', HTML,
     '<q>Friday at 2:00 PM is open. The inspection is $425.</q>',
     '<q>Friday at 2:00 PM is open.</q>'),
    ('the Pricing link is hidden on wide screens too', HTML,
     '  .bar-link{display:flex}\n',
     ''),
    ('the Pricing link shows on phones', HTML,
     '.bar-link{display:none; align-items:center;',
     '.bar-link{display:flex; align-items:center;'),
]


# ---- the pricing and policy pages (--pages): each of these must make tools/check_pages.js fail
CSS = 'coming-soon/assets/page.css'
PJS = 'coming-soon/assets/page.js'
REFUNDS = 'coming-soon/refunds.html'
PRIVACY = 'coming-soon/privacy.html'
LOST = 'coming-soon/404.html'
PAGE_MUTATIONS = [
    ('the pricing button no longer goes to the waitlist', PRICING,
     '<a class="btn" href="/#waitlist">Join the waitlist</a>',
     '<a class="btn" href="/">Join the waitlist</a>'),
    ('a word is changed on the pricing page', PRICING,
     'Cancel before then and you pay nothing.',
     'Cancel before then and you pay little.'),
    ('a sentence is dropped from the refunds page', REFUNDS,
     '<li><strong>Where the law requires a refund.</strong></li>\n',
     ''),
    ('a link in the Terms goes somewhere else', TERMS,
     'on our <a href="/pricing">pricing page</a>',
     'on our <a href="/">pricing page</a>'),
    ('the privacy page\'s title is changed', PRIVACY,
     '<title>Inspyx — Privacy Policy</title>',
     '<title>Inspyx — Privacy</title>'),
    ('the page-not-found page loses its button', LOST,
     '<a class="btn" href="/">Go to the home page</a>\n',
     ''),
    ('a typeface is fetched from another site', CSS,
     ':root{\n  color-scheme:light;',
     '@import url("https://fonts.googleapis.com/css2?family=Inter&display=swap");\n:root{\n  color-scheme:light;'),
    ('the pages are set in another typeface', CSS,
     'body{font-family:var(--font);',
     'body{font-family:Georgia, serif;'),
    ('a tile is too wide for a phone', CSS,
     '.includes li{position:relative; flex:1 1 200px; min-width:0;',
     '.includes li{position:relative; flex:1 1 200px; min-width:460px;'),
    ('the price breaks onto two lines', CSS,
     '.price span{font-size:22px;',
     '.price span{display:block; font-size:22px;'),
    ('the top links show on a phone', CSS,
     '  .bar nav{display:none}',
     '  .bar nav{display:flex}'),
    ('the top links are too small to tap', CSS,
     '.bar nav a{display:inline-flex; align-items:center; min-height:44px;',
     '.bar nav a{display:inline-flex; align-items:center; min-height:30px;'),
    ('the footer links are too small to tap', CSS,
     'footer a{display:inline-flex; align-items:center; min-height:44px; padding:0 4px; color:var(--ink-soft)}',
     'footer a{color:var(--ink-soft)}'),
    ('the pricing page no longer marks itself in the top links', PRICING,
     '<a href="/pricing" aria-current="page">Pricing</a>',
     '<a href="/pricing">Pricing</a>'),
    ('the card says something the plan does not', PRICING,
     '<span class="y">or $649 a year, and save $179</span>',
     '<span class="y">or $599 a year</span>'),
    ('the card is read out a second time by a screen reader', PRICING,
     '<div class="hero-art" aria-hidden="true">',
     '<div class="hero-art">'),
    ('the card no longer leans', PJS,
     'if (hero && !calm) {',
     'if (hero && false) {'),
    ('the card leans with motion turned off', PJS,
     'if (hero && !calm) {',
     'if (hero) {'),
    ('motion turned off no longer stills the card', CSS,
     '  .hero::before, .hero::after, .floor, .glow, .float, .sweep{animation:none}',
     '  .hero::before, .hero::after, .floor, .glow, .sweep{animation:none}'),
    ('the script is gone from the pricing page', PRICING,
     '<script src="/assets/page.js" defer></script>\n',
     ''),
    ('the Terms\' list of headings loses an entry', TERMS,
     '<a href="#the-pilot">8. The pilot</a>\n',
     ''),
    ('a heading\'s address no longer matches the list', PRIVACY,
     '<h2 id="security">Security</h2>',
     '<h2 id="safe">Security</h2>'),
    ('the list of headings follows the page on a phone', CSS,
     '  .toc{position:static; flex:1 1 100%; max-height:none}',
     '  .toc{flex:1 1 100%; max-height:none}'),
    ('the list of headings scrolls away on a wide screen', CSS,
     '.toc{flex:0 1 250px; min-width:200px; position:sticky;',
     '.toc{flex:0 1 250px; min-width:200px; position:static;'),
    ('choosing a heading no longer marks it', PJS,
     "a.addEventListener('click', function () { chosen = i; landed = null; mark(); });",
     "a.addEventListener('click', function () { });"),
    ('a line of policy text grows too long to read', CSS,
     '.doc article > *{max-width:720px}',
     '.doc article > *{max-width:none}'),
    ('a policy title runs out of a phone\'s window', CSS,
     '  .title h1{font-size:34px}',
     '  .title h1{font-size:64px}'),
]

# ---- signing in on the website (--signin): each of these must make tools/check_signin.js fail
AUTH = 'coming-soon/assets/auth.js'
SJS = 'coming-soon/assets/signin.js'
AJS = 'coming-soon/assets/account.js'
ACSS = 'coming-soon/assets/app.css'
SIGNIN = 'coming-soon/signin.html'
ACCOUNT = 'coming-soon/account.html'
RULES = 'coming-soon/vercel.json'
SITEMAP = 'coming-soon/sitemap.xml'
SIGNIN_MUTATIONS = [
    # -- signing out
    ('signing out on the website signs the phone out too', AUTH,
     "return send('POST', BASE + '/logout?scope=local', s.access)",
     "return send('POST', BASE + '/logout', s.access)"),
    ('a browser that keeps nothing ends every sign-in the person has', AUTH,
     "if (!keep(s)) { send('POST', BASE + '/logout?scope=local', s.access)",
     "if (!keep(s)) { send('POST', BASE + '/logout', s.access)"),
    ('signing out keeps the sign-in in the browser', AUTH,
     "    var s = stored();\n    forget();\n    if (!s) return Promise.resolve();",
     "    var s = stored();\n    if (!s) return Promise.resolve();"),
    ('signing out does not tell the server', AUTH,
     "return send('POST', BASE + '/logout?scope=local', s.access).then(function () {}, function () {});",
     "return Promise.resolve();"),
    ('signing out with no connection leaves the page where it is', AUTH,
     "return send('POST', BASE + '/logout?scope=local', s.access).then(function () {}, function () {});",
     "return send('POST', BASE + '/logout?scope=local', s.access).then(function () {});"),
    # -- signing in
    ('the password travels in an address', AUTH,
     "return send('POST', BASE + '/token?grant_type=password', null, { email: email, password: password })",
     "return send('POST', BASE + '/token?grant_type=password&password=' + encodeURIComponent(password), null, { email: email })"),
    ('the browser keeps the password', AUTH,
     "      var s = whole(r.json);\n      if (!keep(s))",
     "      var s = whole(r.json);\n      s.password = password;\n      if (!keep(s))"),
    ('a failing server is taken for a wrong password', AUTH,
     "if (r.status === 400 || r.status === 401) throw new Refusal('rejected', r.status);\n      if (r.status !== 200) throw new Refusal('server', r.status);",
     "if (r.status !== 200) throw new Refusal('rejected', r.status);"),
    ('half an answer is taken for a sign-in', AUTH,
     "|| !u || !text(u.id) || !text(u.email) || !ends)",
     "|| !u || !text(u.email) || !ends)"),
    ('the key is not sent', AUTH,
     "var headers = { apikey: KEY };",
     "var headers = {};"),
    ('a call that never ends is never given up on', AUTH,
     "var DEADLINE = 30000;",
     "var DEADLINE = 3000000;"),
    ('a call is given up on too soon', AUTH,
     "var DEADLINE = 30000;",
     "var DEADLINE = 3000;"),
    ('the sign-in talks to another server', AUTH,
     "var SERVER = 'https://btxlrfvqifnrnxffohsz.supabase.co';",
     "var SERVER = 'https://example.supabase.co';"),
    ('the sign-in uses another key than the waitlist form', AUTH,
     "var KEY = 'sb_publishable_iFfCyDj7e5cnTsWC7aDO8Q_BD5bG_io';",
     "var KEY = 'sb_publishable_another_key_000000000000000000';"),
    # -- renewing
    ('a renewed sign-in is not kept', AUTH,
     "      var next = whole(r.json);\n      if (!keep(next)) throw new Refusal('storage');\n      return next;",
     "      var next = whole(r.json);\n      return next;"),
    ('a sign-in about to end is used as it is', AUTH,
     "    if (!anew && s.ends - Date.now() > EARLY) return Promise.resolve(s);",
     "    if (!anew && s.ends > 0) return Promise.resolve(s);"),
    ('every page view renews the sign-in', AUTH,
     "var EARLY = 60000;",
     "var EARLY = 60000000;"),
    ('a renewal the server rejects leaves the browser signed in', AUTH,
     "if (r.status === 400 || r.status === 401) { forget(); throw new Refusal('rejected', r.status); }",
     "if (r.status === 400 || r.status === 401) { throw new Refusal('rejected', r.status); }"),
    ('a renewal with no connection signs the browser out', AUTH,
     "function (e) { renewing = null; if (e && e.kind === 'rejected') return null; throw e; });",
     "function (e) { renewing = null; forget(); return null; });"),
    # -- the gate
    ('half a stored sign-in counts as signed in', AUTH,
     "return s && typeof s.access === 'string' && typeof s.renew === 'string' && typeof s.ends === 'number' && typeof s.id === 'string' && typeof s.email === 'string' ? s : null;",
     "return s ? s : null;"),
    ('the gate lets a signed-out browser onto the account page', AUTH,
     "    if (want === 'in' && !stored()) root.location.replace('/signin');\n",
     ""),
    ('the gate keeps a signed-in browser on the sign-in page', AUTH,
     "    if (want === 'out' && stored()) root.location.replace('/account');\n",
     ""),
    ('another tab does not hear of a sign-out or a sign-in', AUTH,
     "  root.addEventListener('storage', function (e) { if (e.key === STORE || e.key === null) gate(); });\n",
     ""),
    ('an account page brought back by the Back button is not asked again', AUTH,
     "  root.addEventListener('pageshow', function (e) { if (e.persisted) gate(); });\n",
     ""),
    # -- the form
    ('the form can be sent twice', SJS,
     "    if (busy) return;\n",
     ""),
    ('the button does not say it is working', SJS,
     "button.textContent = on ? button.getAttribute('data-busy') || idle : idle;",
     "button.textContent = idle;"),
    ('the button stays dead after a refusal', SJS,
     "    }, function (why) {\n      working(false);",
     "    }, function (why) {"),
    ('a wrong password stays in its box', SJS,
     "      if (kind === 'rejected') { password.value = ''; password.focus(); }\n",
     ""),
    ('two messages show at once', SJS,
     "lines.forEach(function (p) { p.hidden = p.getAttribute('data-say') !== kind; });",
     "lines.forEach(function (p) { if (p.getAttribute('data-say') === kind) p.hidden = false; });"),
    ('a trouble with no sentence of its own says nothing', SJS,
     "say(kind === 'rejected' || kind === 'network' || kind === 'malformed' || kind === 'server' ? kind : 'other');",
     "say(kind);"),
    ('after signing in the browser goes somewhere else', SJS,
     "window.location.assign('/account');",
     "window.location.assign('/');"),
    ('the form is sent without the browser checking it', SJS,
     "  form.addEventListener('submit', function (e) {\n    e.preventDefault();\n    if (busy) return;\n    if (form.reportValidity && !form.reportValidity()) return;",
     "  button.addEventListener('click', function (e) {\n    e.preventDefault();\n    if (busy) return;"),
    ('a script says a sentence of its own', SJS,
     "var idle = button.textContent;",
     "var idle = button.textContent || 'Sign in now.';"),
    ('a sign-in page brought back by the Back button stays stuck', SJS,
     "  window.addEventListener('pageshow', function (e) { if (e.persisted) { working(false); say(''); } });\n",
     ""),
    ('the sign-in page calls the account server before anyone signs in', SJS,
     "  var busy = false;\n",
     "  var busy = false;\n  window.fetch('https://btxlrfvqifnrnxffohsz.supabase.co/auth/v1/settings');\n"),
    # -- the account page's script
    ('the account page never shows the account', AJS,
     "function show(s) { who.textContent = s.email; main.hidden = false; }",
     "function show(s) { who.textContent = s.email; }"),
    ('a renewal the server rejects leaves the account page up', AJS,
     "  window.InspyxAuth.current().then(function (s) {\n    if (!s) { window.location.replace('/signin'); return; }",
     "  window.InspyxAuth.current().then(function (s) {\n    if (!s) return;"),
    ('a renewal that does not go through says nothing', AJS,
     "    say(kind === 'network' ? 'network' : kind === 'server' || kind === 'malformed' ? 'server' : '');\n",
     ""),
    ('a failing server is blamed on the connection', AJS,
     "say(kind === 'network' ? 'network' : kind === 'server' || kind === 'malformed' ? 'server' : '');",
     "say('network');"),
    ('somebody else signing in from another tab is not named', AJS,
     "  window.addEventListener('storage', function (e) { if (e.key === 'inspyx.signin') again(); });\n",
     ""),
    # -- the look
    ('a hidden part of a page shows anyway', ACSS,
     "[hidden]{display:none !important}\n",
     ""),
    ('the cards show on a phone, over the phone picture', ACSS,
     "  .side{display:none}\n",
     ""),
    ('a card hangs out of the picture', ACSS,
     ".side-video{right:2.375em;",
     ".side-video{right:-9em;"),
    ('motion turned off does not still the phone', ACSS,
     "  .stage::before, .stage::after, .pulse, .phone-float, .band, .side{animation:none}",
     "  .stage::before, .stage::after, .pulse, .band, .side{animation:none}"),
    ('the phone no longer leans to the pointer', ACSS,
     "transform:rotateY(calc(-16deg + var(--mx, 0) * 10deg)) rotateX(calc(8deg - var(--my, 0) * 8deg)) rotateZ(1deg)}",
     "transform:rotateY(-16deg) rotateX(8deg) rotateZ(1deg)}"),
    ('the phone leans with motion turned off', PJS,
     'if (hero && !calm) {',
     'if (hero) {'),
    ('the boxes are too small to tap', ACSS,
     ".fields input{width:100%; height:52px;",
     ".fields input{width:100%; height:36px;"),
    ('the waitlist link is too small to tap', ACSS,
     ".help .line{display:inline-flex; align-items:center; min-height:44px}",
     ".help .line{display:inline-flex; align-items:center}"),
    ('the sign-in page scrolls sideways on a phone', ACSS,
     ".signin{flex:1 1 430px; min-width:0;",
     ".signin{flex:1 1 430px; min-width:460px;"),
    # -- the sign-in page itself
    ('a style is written into the sign-in page', SIGNIN,
     '<h1>Welcome back.</h1>',
     '<h1 style="letter-spacing:0">Welcome back.</h1>'),
    ('a word is changed on the sign-in page', SIGNIN,
     '<h1>Welcome back.</h1>',
     '<h1>Welcome.</h1>'),
    ('a refusal\'s sentence is changed', SIGNIN,
     'Check both and try again.</p>',
     'Please try again.</p>'),
    ('the picture is read out by a screen reader', SIGNIN,
     '<div class="stage" data-lean aria-hidden="true">',
     '<div class="stage" data-lean>'),
    ('the picture holds something the Tab key stops at', SIGNIN,
     '<div class="spot"></div>',
     '<a class="spot" href="/pricing"></a>'),
    ('search engines may list the sign-in page', SIGNIN,
     '<meta name="robots" content="noindex">\n',
     ''),
    ('the password box is not marked for password managers', SIGNIN,
     'autocomplete="current-password"',
     'autocomplete="off"'),
    ('the password shows as it is typed', SIGNIN,
     'name="password" type="password"',
     'name="password" type="text"'),
    ('the form would put the password in an address if the script failed', SIGNIN,
     'method="post" action="/signin"',
     'method="get" action="/signin"'),
    ('a script from another site is loaded on the sign-in page', SIGNIN,
     '<script src="/assets/auth.js"></script>\n',
     '<script src="/assets/auth.js"></script>\n<script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script>\n'),
    ('the form\'s script is gone', SIGNIN,
     '<script src="/assets/signin.js" defer></script>\n',
     ''),
    ('the sign-in page has no gate', SIGNIN,
     '<html lang="en" data-gate="out">',
     '<html lang="en">'),
    ('the Tab key skips the Sign in button', SIGNIN,
     '<button class="btn" type="submit" data-busy="Signing in…">',
     '<button class="btn" type="submit" tabindex="-1" data-busy="Signing in…">'),
    # -- the account page itself
    ('the account page has no gate', ACCOUNT,
     '<html lang="en" data-gate="in">',
     '<html lang="en">'),
    ('the account page shows before the sign-in is known', ACCOUNT,
     '<main class="doc account" data-account hidden>',
     '<main class="doc account" data-account>'),
    ('a word is changed on the account page', ACCOUNT,
     'data-signout>Sign out</button>',
     'data-signout>Log out</button>'),
    ('search engines may list the account page', ACCOUNT,
     '<meta name="robots" content="noindex">\n',
     ''),
    # -- the server's rule for the two pages
    ('scripts written into a page may run', RULES,
     "script-src 'self';",
     "script-src 'self' 'unsafe-inline';"),
    ('the pages may call any server', RULES,
     "connect-src https://btxlrfvqifnrnxffohsz.supabase.co;",
     "connect-src *;"),
    ('the pages may be shown inside another site', RULES,
     "frame-ancestors 'none'",
     "frame-ancestors *"),
    ('a form on the page may post to another site', RULES,
     "form-action 'none';",
     "form-action *;"),
    ('the account page is served without the rule', RULES,
     '"source": "/(signin|account|plan)"',
     '"source": "/(signin|plan)"'),
    ('browsers may keep the pages', RULES,
     '"value": "no-store"',
     '"value": "public, max-age=3600"'),
    # -- the rest of the site
    ('the home page links to the sign-in page', HTML,
     '<nav><a href="/pricing">Pricing</a>',
     '<nav><a href="/signin">Sign in</a><a href="/pricing">Pricing</a>'),
    ('search engines are told of the sign-in page', SITEMAP,
     '</urlset>',
     '  <url><loc>https://inspyx.com/signin</loc></url>\n</urlset>'),
]
# ---- "Your plan" on the website (/plan): the breaks for tools/check_plan.js.
PJS2 = 'coming-soon/assets/plan.js'
PLAN = 'coming-soon/plan.html'
PRICING2 = 'coming-soon/pricing.html'
PLAN_MUTATIONS = [
    # -- what is asked, and of whom
    ('the plan is asked for with another word', PJS2, "return billing('status').then(", "return billing('start').then("),
    ('another function is asked', PJS2, "auth.ask('billing', { action: action }, DEADLINE)", "auth.ask('payments', { action: action }, DEADLINE)"),
    ('the ask may take 30 seconds', PJS2, 'var DEADLINE = 20000;', 'var DEADLINE = 30000;'),
    ('the plan page does not say how long an ask may take', PJS2, "auth.ask('billing', { action: action }, DEADLINE)", "auth.ask('billing', { action: action })"),
    ('the sign-in script ignores how long an ask may take', AUTH, '}, deadline || DEADLINE);', '}, DEADLINE);'),
    ('the sign-in travels in the address', AUTH, "return send('POST', FUNCTIONS + name, s.access, body, deadline);", "return send('POST', FUNCTIONS + name + '?token=' + s.access, null, body, deadline);"),
    ('the functions are asked on another server', AUTH, "var FUNCTIONS = SERVER + '/functions/v1/';", "var FUNCTIONS = 'https://example.net/functions/v1/';"),
    ('a function can be named anything', AUTH, "if (!/^[a-z][a-z-]*$/.test(name)) return Promise.reject(new Refusal('malformed'));\n", ''),
    # -- a sign-in the billing server refuses
    ('a refused sign-in is not looked into', AUTH, 'if (r.status !== 401) return r;\n        return current(true)', 'return r;\n        return current(true)'),
    ('a refused sign-in is asked again without asking the sign-in server', AUTH, 'return current(true).then(function (fresh)', 'return current().then(function (fresh)'),
    ('a sign-in that still looks good is never renewed, even when asked to', AUTH, '    if (!anew && s.ends - Date.now() > EARLY) return Promise.resolve(s);', '    if (s.ends - Date.now() > EARLY) return Promise.resolve(s);'),
    ('renewed, the request is not sent again', AUTH, 'return fresh ? once(fresh) : null;', 'return fresh ? r : null;'),
    ('a sign-in ended elsewhere leaves the plan page as it is', PJS2, "        if (a.gone) { signedOut(); return; }\n        var plan = a.trouble", "        var plan = a.trouble"),
    ('a sign-in ended elsewhere leaves a page being asked for', PJS2, "      if (a.gone) { signedOut(); return; }\n      var to = null;", "      var to = null;"),
    ('the browser is sent to the account page instead of the sign-in page', PJS2, "function signedOut() { window.location.replace('/signin'); }", "function signedOut() { window.location.replace('/account'); }"),
    # -- reading the answer
    ('an answer that does not say whether there is a plan counts as one', PJS2, "typeof json.status !== 'string' || typeof json.has_plan !== 'boolean'", "typeof json.status !== 'string'"),
    ('an answer with no word for where the plan stands counts as one', PJS2, "typeof json.status !== 'string' || typeof json.has_plan !== 'boolean'", "typeof json.has_plan !== 'boolean'"),
    ('a price that is not whole cents is shown', PJS2, "cents >= 0 && Math.floor(cents) === cents ? cents : null", "cents >= 0 ? cents : null"),
    ('a price below nothing is shown', PJS2, "typeof cents === 'number' && cents >= 0 && Math.floor(cents)", "typeof cents === 'number' && Math.floor(cents)"),
    ('a price that comes as words is shown', PJS2, "typeof cents === 'number' && cents >= 0 && Math.floor(cents) === cents ? cents : null", "cents >= 0 && Math.floor(Number(cents)) === Number(cents) ? Number(cents) : null"),
    ('any word is taken for how often', PJS2, "every === 'month' || every === 'year' ? every : null", "typeof every === 'string' ? every : null"),
    ('a date that is not one is written anyway', PJS2, 'return isNaN(t) ? null : new Date(t);', 'return new Date(t);'),
    ('a 404 is taken for no connection', PJS2, "if (r.status === 404 || (r.json && r.json.error === 'not_configured')) return { trouble: 'not-set-up' };", "if (r.json && r.json.error === 'not_configured') return { trouble: 'not-set-up' };"),
    ('a server with no Stripe key is taken for no connection', PJS2, "if (r.status === 404 || (r.json && r.json.error === 'not_configured')) return { trouble: 'not-set-up' };", "if (r.status === 404) return { trouble: 'not-set-up' };"),
    ('any refusal is taken for an answer', PJS2, "if (r.status === 200) return { json: r.json };", "if (r.status !== 404) return { json: r.json };"),
    ('no connection leaves the page checking for ever', PJS2, "    }, function () { return { trouble: 'failed' }; });", "    });"),
    # -- which sentence, which button
    ('a canceled plan is shown as running on', PJS2, "      if (plan.ending) return { line: 'ending', date: plan.periodEnd || plan.trialEnd, button: 'manage' };\n", ''),
    ('a plan canceled in the free month has no end date', PJS2, "date: plan.periodEnd || plan.trialEnd, button: 'manage' };", "date: plan.periodEnd, button: 'manage' };"),
    ('the free month is shown as paid up', PJS2, "if (s === 'trialing') return { line: 'free', date: plan.trialEnd,", "if (s === 'trialing') return { line: 'active', date: plan.trialEnd,"),
    ('the free month ends on the wrong date', PJS2, "if (s === 'trialing') return { line: 'free', date: plan.trialEnd,", "if (s === 'trialing') return { line: 'free', date: plan.periodEnd,"),
    ('an amount with no "how often" is shown', PJS2, "price: plan.cents !== null && plan.every !== null, button", "price: plan.cents !== null, button"),
    ('a failed payment offers "Manage billing"', PJS2, "if (s === 'past_due') return { line: 'problem', button: 'card' };", "if (s === 'past_due') return { line: 'problem', button: 'manage' };"),
    ('a failed payment is not said', PJS2, "    if (s === 'past_due') return { line: 'problem', button: 'card' };\n", ''),
    ('a paused plan is shown as never started', PJS2, "s === 'incomplete' || s === 'unpaid' || s === 'paused'", "s === 'incomplete' || s === 'unpaid'"),
    ('an unpaid plan is shown as never started', PJS2, "s === 'incomplete' || s === 'unpaid' || s === 'paused'", "s === 'incomplete' || s === 'paused'"),
    ('a first payment never finished is shown as never started', PJS2, "s === 'canceled' || s === 'incomplete_expired'", "s === 'canceled'"),
    ('an ended plan is shown as never started', PJS2, "s === 'canceled' || s === 'incomplete_expired'", "s === 'incomplete_expired'"),
    ('an ended plan offers "Manage billing"', PJS2, "return { line: 'ended', button: 'start' };", "return { line: 'ended', button: 'manage' };"),
    ('the two offers are swapped', PJS2, "plan.freeMonth ? 'offer-free' : 'offer'", "plan.freeMonth ? 'offer' : 'offer-free'"),
    ('the free month is offered to everyone', PJS2, "freeMonth: json.free_month !== false,", "freeMonth: true,"),
    ('a canceled plan is not seen as canceled', PJS2, "ending: json.cancel_at_period_end === true,", "ending: false,"),
    ('the date is written short', PJS2, "{ month: 'long', day: 'numeric', year: 'numeric' }", "{ month: 'short', day: 'numeric', year: 'numeric' }"),
    ('the date is London\'s, not the inspector\'s', PJS2, "{ month: 'long', day: 'numeric', year: 'numeric' }", "{ month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC' }"),
    ('whole dollars get cents', PJS2, 'var digits = cents % 100 === 0 ? 0 : 2;', 'var digits = 2;'),
    ('cents are dropped', PJS2, 'var digits = cents % 100 === 0 ? 0 : 2;', 'var digits = 0;'),
    ('the amount is taken for dollars', PJS2, '.format(cents / 100);', '.format(cents);'),
    ('the buttons all show', PJS2, "b.hidden = b.getAttribute('data-do') !== what.button;", "b.hidden = false;"),
    ('the sentences all show', PJS2, "      p.hidden = !on;\n", ''),
    ('a sentence is picked by its name alone', PJS2, "var on = p.getAttribute('data-stands') === what.line && (p.getAttribute('data-with') || '') === need;", "var on = p.getAttribute('data-stands') === what.line;"),
    ('the date is not written in', PJS2, "      fill(p, 'date', what.date ? longDate(what.date) : '');\n", ''),
    ('how often is not written in', PJS2, "      fill(p, 'every', what.price ? plan.every : '');\n", ''),
    # -- looking again
    ('the page does not say it is checking', PJS2, "    show({ line: 'checking' });\n", ''),
    ('a late answer replaces a newer one', PJS2, "        if (mine !== asked) return;\n", ''),
    ('"Try again" does nothing', PJS2, "if (what === 'again') check(false); else open(", "if (what === 'again') return; else open("),
    ('no answer offers nothing to press', PJS2, "button: a.trouble === 'not-set-up' ? '' : 'again' });", "button: '' });"),
    ('a server not set up is said as no connection', PJS2, "show({ line: a.trouble === 'not-set-up' ? 'not-set-up' : 'failed',", "show({ line: 'failed',"),
    # -- back from Stripe
    ('the plan is never looked for again after a checkout', PJS2, "  check(back === 'done');\n})();", "  check(false);\n})();"),
    ('every visit waits as if back from a checkout', PJS2, "  check(back === 'done');\n})();", "  check(true);\n})();"),
    ('a plan already there is still looked for again', PJS2, 'if (plan && !plan.hasPlan && left > 0)', 'if (plan && left > 0)'),
    ('the plan is looked for twice more, not three times', PJS2, 'var SETTLE = 2000, MORE = 3;', 'var SETTLE = 2000, MORE = 2;'),
    ('the plan is looked for four times more', PJS2, 'var SETTLE = 2000, MORE = 3;', 'var SETTLE = 2000, MORE = 4;'),
    ('the looks are five seconds apart', PJS2, 'var SETTLE = 2000, MORE = 3;', 'var SETTLE = 5000, MORE = 3;'),
    ('"You\'re all set." is said with no plan', PJS2, "var said = plan && back === 'done' && plan.hasPlan ? 'done'", "var said = plan && back === 'done' ? 'done'"),
    ('"No charge was made." is said over a running plan', PJS2, "plan && back === 'canceled' && !plan.hasPlan ? 'canceled' : '';", "plan && back === 'canceled' ? 'canceled' : '';"),
    ('Stripe\'s word is never said', PJS2, "    backs.forEach(function (p) { p.hidden = p.getAttribute('data-back') !== said; });\n", ''),
    ('Stripe\'s word stays in the address', PJS2, "  if (back) { try { window.history.replaceState(null, '', window.location.pathname); } catch (e) { /* the address stays as it is */ } }\n", ''),
    ('Stripe\'s word is said to the next person too', PJS2, "    busy = false;\n    back = null;\n    check(false);", "    busy = false;\n    check(false);"),
    ('a page brought back keeps its button off', PJS2, "    name(now);\n    busy = false;\n", "    name(now);\n"),
    ('a page brought back is left as it was', PJS2, "  window.addEventListener('pageshow', function (e) { if (e.persisted) again(); });\n", ''),
    ('another tab\'s sign-in is not noticed', PJS2, "  window.addEventListener('storage', function (e) { if (e.key === 'inspyx.signin') again(); });\n", ''),
    # -- Stripe's pages
    ('"Manage billing" asks for a checkout', PJS2, "open(what === 'start' ? 'start' : 'portal');", "open('start');"),
    ('"Start your plan" asks for the billing page', PJS2, "open(what === 'start' ? 'start' : 'portal');", "open('portal');"),
    ('the button stays usable while a page is asked for', PJS2, "    say('');\n    buttons.forEach(function (b) { b.disabled = true; });\n", "    say('');\n"),
    ('any https address is gone to', PJS2, "to.protocol === 'https:' && STRIPE.indexOf(to.host) >= 0 && !to.username", "to.protocol === 'https:' && !to.username"),
    ('plain http is gone to', PJS2, "if (to && to.protocol === 'https:' && STRIPE", "if (to && STRIPE"),
    ('any port is gone to', PJS2, 'STRIPE.indexOf(to.host) >= 0', 'STRIPE.indexOf(to.hostname) >= 0'),
    ('an address with a name in front is gone to', PJS2, ' && !to.username && !to.password) {', ') {'),
    ('any site with stripe.com in its name is gone to', PJS2, 'STRIPE.indexOf(to.host) >= 0', "to.host.indexOf('stripe.com') >= 0"),
    ('all of stripe.com is gone to', PJS2, "var STRIPE = ['checkout.stripe.com', 'billing.stripe.com'];", "var STRIPE = ['checkout.stripe.com', 'billing.stripe.com', 'stripe.com', 'dashboard.stripe.com'];"),
    ('the billing page is not one of Stripe\'s', PJS2, "var STRIPE = ['checkout.stripe.com', 'billing.stripe.com'];", "var STRIPE = ['checkout.stripe.com'];"),
    ('after a page that could not be opened the button stays dead', PJS2, "      busy = false;\n      buttons.forEach(function (b) { b.disabled = false; });\n      say(", "      buttons.forEach(function (b) { b.disabled = false; });\n      say("),
    ('after a page that could not be opened the button stays off', PJS2, "      busy = false;\n      buttons.forEach(function (b) { b.disabled = false; });\n      say(", "      busy = false;\n      say("),
    ('a page that could not be opened says nothing', PJS2, "      say(a.trouble === 'not-set-up' ? 'not-set-up' : 'page');\n", ''),
    ('a server with no Stripe key says the page could not be opened', PJS2, "say(a.trouble === 'not-set-up' ? 'not-set-up' : 'page');", "say('page');"),
    ('an old message stays while the page is asked for again', PJS2, "    busy = true;\n    say('');\n", "    busy = true;\n"),
    # -- who is signed in
    ('the page does not name who is signed in', PJS2, "  name(s);\n  main.hidden = false;", "  main.hidden = false;"),
    ('the plan never shows', PJS2, "  name(s);\n  main.hidden = false;", "  name(s);"),
    # -- the page itself
    ('the plan page has no gate', PLAN, '<html lang="en" data-gate="in">', '<html lang="en">'),
    ('the plan page shows before anybody is known to be signed in', PLAN, '<main class="planpage" data-plan hidden>', '<main class="planpage" data-plan>'),
    ('search engines may list the plan page', PLAN, '<meta name="robots" content="noindex">\n', ''),
    ('a sentence of the plan is reworded', PLAN, 'Cancel before then and you pay nothing.', 'Cancel anytime.'),
    ('a button is renamed', PLAN, '>Start your plan</button>', '>Start my 30 free days</button>'),
    ('the plan is renamed', PLAN, '<span class="badge">Founding inspector</span>', '<span class="badge">Pilot inspector</span>'),
    ('a sentence is added', PLAN, '<p class="who">Signed in as', '<p>Your card is safe with us.</p>\n<p class="who">Signed in as'),
    ('two sentences answer to the same facts', PLAN, '<p data-stands="free" data-with="date" hidden>', '<p data-stands="free" data-with="price" hidden>'),
    ('the price has no place in its sentence', PLAN, 'Free until <span data-fill="date"></span>, then <span data-fill="amount"></span> a <span data-fill="every"></span>.', 'Free until <span data-fill="date"></span>, then <span data-fill="amount"></span> a month.'),
    ('a style is written into the page', PLAN, '<h1>Your plan</h1>', '<h1 style="letter-spacing:0">Your plan</h1>'),
    ('a script from elsewhere is loaded', PLAN, '<script src="/assets/plan.js" defer></script>', '<script src="/assets/plan.js" defer></script>\n<script src="https://example.net/count.js" defer></script>'),
    ('the card is read out to screen readers', PLAN, '<div class="hero-art" aria-hidden="true">', '<div class="hero-art">'),
    ('the card does not name the inspector', PLAN, '<span class="holder" data-email></span>', '<span class="holder"></span>'),
    ('the link to the account page goes elsewhere', PLAN, '<p class="more"><a href="/account">Account</a></p>', '<p class="more"><a href="/pricing">Account</a></p>'),
    ('the page is titled like the account page', PLAN, '<title>Inspyx — Your plan</title>', '<title>Inspyx — Account</title>'),
    ('the card does not lean', PLAN, '<section class="hero" data-lean>', '<section class="hero">'),
    ('the account page does not link to the plan', ACCOUNT, '<a class="btn quiet" href="/plan">Your plan</a>', '<a class="btn quiet" href="/pricing">Your plan</a>'),
    ('the account page\'s link is renamed', ACCOUNT, '<a class="btn quiet" href="/plan">Your plan</a>', '<a class="btn quiet" href="/plan">Billing</a>'),
    ('the pricing page links to the plan page', PRICING2, '<a class="btn" href="/#waitlist">Join the waitlist</a>', '<a class="btn" href="/plan">Join the waitlist</a>'),
    ('search engines are told of the plan page', SITEMAP, '</urlset>', '<url><loc>https://inspyx.com/plan</loc></url>\n</urlset>'),
    ('the plan page is served without the rule', RULES, '"source": "/(signin|account|plan)"', '"source": "/(signin|account)"'),
    ('the rule lets the page call anyone', RULES, "connect-src https://btxlrfvqifnrnxffohsz.supabase.co;", "connect-src *;"),
    # -- the look
    ('hidden things show', ACSS, '[hidden]{display:none !important}', '[hidden]{}'),
    ('the heading touches the card', ACSS, '.planpage h1{margin-bottom:26px}', '.planpage h1{margin-bottom:0}'),
    ('the account link is too small to tap', ACSS, '.more a{display:inline-flex; align-items:center; min-height:44px;', '.more a{display:inline-flex; align-items:center; min-height:20px;'),
    ('the plan\'s button is too small to tap', ACSS, '.acts .btn{margin-top:22px; border:0;', '.acts .btn{margin-top:22px; min-height:30px; border:0;'),
    ('the account page\'s link is too small to tap', ACSS, '.account .links .btn{margin-top:0}', '.account .links .btn{margin-top:0; min-height:30px}'),
]

CHECK = 'tools/check_home.js'


def run_checks():
    env = dict(os.environ)
    out = subprocess.run(['node', CHECK], cwd=repo, env=env, capture_output=True, text=True, timeout=600)
    lines = (out.stdout + out.stderr).splitlines()
    fails = [l[6:].split('  [')[0] for l in lines if l.startswith('FAIL')]
    passes = sum(1 for l in lines if l.startswith('PASS'))
    return passes, fails, out.returncode


def git(*args):
    return subprocess.run(['git', *args], cwd=repo, capture_output=True, text=True)


assert git('status', '--porcelain', '--', 'coming-soon', 'tools').stdout.strip() == '', 'commit first'
args = sys.argv[2:]
if '--pages' in args:
    MUTATIONS, CHECK = PAGE_MUTATIONS, 'tools/check_pages.js'
if '--signin' in args:
    MUTATIONS, CHECK = SIGNIN_MUTATIONS, 'tools/check_signin.js'
if '--plan' in args:
    MUTATIONS, CHECK = PLAN_MUTATIONS, 'tools/check_plan.js'
part = [a for a in args if a.startswith('--part=')]
only = ' '.join(a for a in args if not a.startswith('--'))
if only:
    MUTATIONS = [m for m in MUTATIONS if only in m[0]]
    assert MUTATIONS, 'no change is named like that'
first = [a for a in args if a.startswith('--first=')]
if first:
    MUTATIONS = MUTATIONS[:int(first[0][8:])]
if part:
    i, n = part[0][7:].split('/')
    MUTATIONS = MUTATIONS[int(i)::int(n)]
passes, fails, code = run_checks()
print('unchanged, before: ' + str(passes) + ' pass, ' + str(len(fails)) + ' fail' + (': ' + ' ; '.join(fails) if fails else ''), flush=True)
if fails or code != 0 or passes == 0:
    sys.exit('the unchanged page must pass every check first')
caught = 0
for name, rel, old, new in MUTATIONS:
    path = os.path.join(repo, rel)
    src = open(path, encoding='utf-8').read()
    assert src.count(old) == 1, (name, src.count(old))
    open(path, 'w', encoding='utf-8').write(src.replace(old, new))
    try:
        passes, fails, code = run_checks()
    finally:
        git('checkout', '--', rel)
    back = open(path, encoding='utf-8').read()
    assert back == src, 'the file did not come back: ' + rel
    ok = len(fails) > 0 and code != 0
    caught += ok
    print(('CAUGHT  ' if ok else 'MISSED  ') + name + '  [' + str(len(fails)) + ' failed: ' + ' ; '.join(f[:70] for f in fails[:4]) + ']', flush=True)

passes, fails, code = run_checks()
print('\n' + str(caught) + ' of ' + str(len(MUTATIONS)) + ' caught; afterwards, unchanged: ' + str(passes) + ' pass, ' + str(len(fails)) + ' fail')
sys.exit(0 if caught == len(MUTATIONS) and not fails else 1)
