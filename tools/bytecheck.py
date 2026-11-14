"""Compare what an address serves with the site's files at a commit, byte for byte.

usage: python3 -I tools/bytecheck.py <commit> <address> [cookie jar]
  python3 -I tools/bytecheck.py main https://inspyx.com
  python3 -I tools/bytecheck.py 6a4b384 https://<a private build>.vercel.app jar.txt

Every file under coming-soon/ at that commit is fetched from the address (index.html as /, page.html as /page,
since vercel.json turns clean URLs on) and compared with the repo's copy. README.md and vercel.json must NOT be
served (404). The files are read from git, not from the folder on disk, so an edit that is not committed cannot
make the check pass.

A private build on Vercel sits behind a sign-in. Make a share link for it (Vercel's "Share", or the Vercel
connector's get_access_to_vercel_url), open it once with `curl -s -L -o /dev/null -c jar.txt "<the share link>"`,
and pass jar.txt as the cookie jar. Vercel adds one line of its own to a private build's pages (its toolbar
script, vercel.live): a page that differs only by such lines is reported as "same but for Vercel's toolbar
line", and counted apart. The live site carries no such line: there every file must be the same.
"""
import hashlib
import os
import subprocess
import sys

if len(sys.argv) < 3:
    sys.exit(__doc__)
repo = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ref, base = sys.argv[1], sys.argv[2].rstrip('/')
jar = sys.argv[3] if len(sys.argv) > 3 else None
NOT_SERVED = ('README.md', 'vercel.json')


def git(*a):
    return subprocess.run(['git', *a], cwd=repo, capture_output=True, check=True).stdout


def fetch(url_path):
    cmd = ['curl', '-s', '-o', '-', '-w', '\n%{http_code}', '--max-time', '30']
    if jar:
        cmd += ['-b', jar, '-c', jar]
    out = subprocess.run(cmd + [base + url_path], capture_output=True).stdout
    body, _, code = out.rpartition(b'\n')
    return body, code.decode()


names = [n for n in git('ls-tree', '-r', '--name-only', ref, 'coming-soon/').decode().split('\n') if n]
same = toolbar = diff = 0
for n in names:
    rel = n[len('coming-soon/'):]
    if rel in NOT_SERVED:
        continue
    if rel == 'index.html':
        url_path = '/'
    elif rel.endswith('.html'):
        url_path = '/' + rel[:-5]
    else:
        url_path = '/' + rel
    want = git('show', ref + ':' + n)
    got, code = fetch(url_path)
    if code == '200' and got == want:
        same += 1
        print('SAME     ' + hashlib.sha256(got).hexdigest()[:16] + '  ' + url_path)
        continue
    extra = [l for l in got.split(b'\n') if l not in set(want.split(b'\n'))]
    missing = [l for l in want.split(b'\n') if l not in set(got.split(b'\n'))]
    if code == '200' and not missing and extra and all(b'vercel.live' in l for l in extra):
        toolbar += 1
        print('TOOLBAR  ' + url_path + '  (the page plus ' + str(len(extra)) + " line of Vercel's own, naming vercel.live)")
    else:
        diff += 1
        print('DIFF     ' + url_path + '  http ' + code + ', ' + str(len(got)) + ' bytes served, ' + str(len(want)) + ' in the repo')
hidden = 0
for rel in NOT_SERVED:
    _, code = fetch('/' + rel)
    ok = code == '404'
    hidden += ok
    print(('HIDDEN   ' if ok else 'SERVED!  ') + '/' + rel + '  http ' + code)
total = same + toolbar + diff
print(str(same) + ' of ' + str(total) + ' the same byte for byte; ' + str(toolbar) + " the same but for Vercel's toolbar line; "
      + str(diff) + ' different; ' + str(hidden) + ' of ' + str(len(NOT_SERVED)) + ' private files not served')
sys.exit(0 if diff == 0 and hidden == len(NOT_SERVED) else 1)
