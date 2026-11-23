#!/usr/bin/env python3
# Run from anywhere: python3 tools/dash_nav.py (it edits coming-soon/*.html in this checkout).
# Puts the dashboard navigation (job 5, 2026-11-23) into every signed-in page, the page's own item marked.
import os, re, sys
os.chdir(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'coming-soon'))
I = lambda d: '<svg viewBox="0 0 24 24" aria-hidden="true">' + d + '</svg>'
ITEMS = [
 ('today', '/today', 'What needs you', I('<path d="M4 13h4l2 3h4l2-3h4"/><path d="M5.5 6.5 4 13v5a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-5l-1.5-6.5A2 2 0 0 0 16.6 5H7.4a2 2 0 0 0-1.9 1.5Z"/>')),
 ('inspections', '/inspections', 'Inspections', I('<rect x="5" y="4" width="14" height="17" rx="2"/><path d="M9 4h6v3H9z"/><path d="m9 13 2 2 4-4"/>')),
 ('calendar', '/calendar', 'Calendar', I('<rect x="4" y="5" width="16" height="15" rx="2"/><path d="M4 10h16M9 3v4M15 3v4"/>')),
 ('prices', '/prices', 'Prices', I('<path d="M3 12V5a2 2 0 0 1 2-2h7l9 9-9 9Z"/><circle cx="8" cy="8" r="1.5"/>')),
 ('booking', '/booking', 'Booking', I('<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18"/>')),
 ('emails', '/emails', 'Emails', I('<rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 7 9 6 9-6"/>')),
 ('payments', '/payments', 'Payments', I('<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 10h18M7 15h4"/>')),
 ('agreements', '/agreements', 'Agreements', I('<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8Z"/><path d="M14 3v5h5M8 17c1.5-2 2.5-2 3 0s1.5 1 2.5-1 2-1 3 1"/>')),
 ('people', '/people', 'People', I('<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20a6.5 6.5 0 0 1 13 0"/><path d="M16 4.5a3.5 3.5 0 0 1 0 7M18 14.5a6.5 6.5 0 0 1 3.5 5.5"/>')),
 ('account', '/account', 'Account', I('<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>')),
]
# The tab bar's own shorter word, where the full one doesn't fit a phone's tab (the lead, 11-23).
SHORT = {'today': 'To do'}
MORE = I('<circle cx="5" cy="12" r="1.6"/><circle cx="12" cy="12" r="1.6"/><circle cx="19" cy="12" r="1.6"/>')
FIRST = 4   # on a phone, the bar holds these; the rest are under More

def li(item, here):
    key, href, label, icon = item
    cur = ' aria-current="page"' if key == here else ''
    short = '<span class="dash-s">%s</span>' % SHORT[key] if key in SHORT else ''
    return '<li><a href="%s"%s>%s<span class="dash-l">%s</span>%s</a></li>' % (href, cur, icon, label, short)

def nav(here):
    more_here = any(k == here for k, *_ in ITEMS[FIRST:])
    return ('<nav class="dash" aria-label="Your dashboard">\n'
      '<ul class="dash-items">' + ''.join(li(x, here) for x in ITEMS) + '</ul>\n'
      '<details class="dash-more"><summary' + (' aria-current="page"' if more_here else '') + '>' + MORE + '<span>More</span></summary>'
      '<ul>' + ''.join(li(x, here) for x in ITEMS[FIRST:]) + '</ul></details>\n'
      '</nav>\n')

PAGES = {'today': 'today', 'inspections': 'inspections', 'calendar': 'calendar', 'prices': 'prices', 'booking': 'booking',
         'emails': 'emails', 'payments': 'payments', 'agreements': 'agreements', 'people': 'people', 'account': 'account',
         'numbers': None, 'reports': None, 'templates': None, 'profile': None}
NAV_HREFS = {h for _, h, _, _ in ITEMS}
for page, here in PAGES.items():
    p = page + '.html'; s = open(p).read()
    s = re.sub(r'<nav class="dash" aria-label="Your dashboard">.*?</nav>\n', '', s, flags=re.S)
    assert s.count('</header>\n') == 1, p
    s = s.replace('</header>\n', '</header>\n' + nav(here), 1)
    if '/assets/dash.css' not in s:
        s = s.replace('<link rel="stylesheet" href="/assets/app.css">', '<link rel="stylesheet" href="/assets/app.css">\n<link rel="stylesheet" href="/assets/dash.css">', 1)
        assert '/assets/dash.css' in s, p
    # The bottom row of links keeps only what the navigation doesn't hold; an empty row goes.
    def trim(m):
        links = re.findall(r'<a href="([^"]+)">[^<]*</a>', m.group(2))
        kept = ''.join(a for a in re.findall(r'<a href="[^"]+">[^<]*</a>', m.group(2)) if re.search(r'href="([^"]+)"', a).group(1) not in NAV_HREFS)
        return '' if not kept else m.group(1) + kept + m.group(3)
    s = re.sub(r'(<p class="[a-z]+-links">)(.*?)(</p>)\n?', lambda m: (trim(m) + '\n') if trim(m) else '', s)
    open(p, 'w').write(s)
print('ok')
