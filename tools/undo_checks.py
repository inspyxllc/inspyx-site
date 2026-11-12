"""Undo checks for the home page: break one thing at a time and see that a self-check notices.

Passing checks prove little by themselves: a check that cannot fail guards nothing. Each entry in the list below
is one way to break the page (a piece of text in home.js or index.html, and what to put in its place). The script
makes the change, runs tools/check_home.js, counts the change as caught if a check fails, and takes it back.

usage: python3 -I tools/undo_checks.py <site repo> [--part=i/n] [words]
  The page must be served at $URL, or at http://localhost:4173/ (node tools/serve.js).
  With words given, only the changes whose name holds them are tried.
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
     'if (ground !== this._ground) { this._ground = ground; this._story.style.backgroundColor = ground; }',
     'this._ground = ground;'),
    ('a wide screen gets the ground colour too', JS,
     "const ground = this._isWide ? '' : 'rgb('",
     "const ground = false ? '' : 'rgb('"),
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


def run_checks():
    env = dict(os.environ)
    out = subprocess.run(['node', 'tools/check_home.js'], cwd=repo, env=env, capture_output=True, text=True, timeout=600)
    lines = (out.stdout + out.stderr).splitlines()
    fails = [l[6:].split('  [')[0] for l in lines if l.startswith('FAIL')]
    passes = sum(1 for l in lines if l.startswith('PASS'))
    return passes, fails, out.returncode


def git(*args):
    return subprocess.run(['git', *args], cwd=repo, capture_output=True, text=True)


assert git('status', '--porcelain', '--', 'coming-soon', 'tools').stdout.strip() == '', 'commit first'
args = sys.argv[2:]
part = [a for a in args if a.startswith('--part=')]
only = ' '.join(a for a in args if not a.startswith('--'))
if only:
    MUTATIONS = [m for m in MUTATIONS if only in m[0]]
    assert MUTATIONS, 'no change is named like that'
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
