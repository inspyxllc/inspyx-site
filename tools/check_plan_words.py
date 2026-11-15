# Are the plan page's sentences the app's own, word for word? Reads the app's Dart file and the page.
# usage: python3 -I tools/check_plan_words.py <app repo> <site repo>
# The app keeps two sets of words while its free days from the invite and "Get my money back" are switched off
# (2026-11-15: planMoneyBackInApp); the page says the switched-on set, which is the one compared here.
import re, sys
app_repo, site = sys.argv[1:3]
dart = open(app_repo + '/lib/src/shell/plan_billing.dart', encoding='utf-8').read()
html = open(site + '/coming-soon/plan.html', encoding='utf-8').read()
flat = lambda t: re.sub(r'\s+', ' ', t).strip()
problems = []

def literal(src):
    # adjacent string literals, in either kind of quotes, joined as Dart joins them
    parts = re.findall(r"r?'((?:[^'\\]|\\.)*)'|\"((?:[^\"\\]|\\.)*)\"", src)
    return ''.join(a or b for a, b in parts).replace("\\'", "'").replace('\\$', '$')

# The app's sentences that stand as they are.
consts = {m.group(1): literal(m.group(2)) for m in re.finditer(r'const String (plan\w+)\s*=\s*((?:\s*r?(?:\'(?:[^\'\\]|\\.)*\'|"(?:[^"\\]|\\.)*"))+);', dart)}
def const(name):
    if name not in consts: problems.append('the app has no const ' + name)
    return consts.get(name, '')
price = const('planOfferPriceWords')
fill = lambda s: s.replace('$planOfferPriceWords', price)

# The app's sentences built with a number, a date or a card: each function's one expression, its holes named as the
# page names them.
def built(name):
    m = re.search(r'String ' + name + r'\([^)]*\)\s*=>\s*(.*?);\n', dart, re.S)
    if not m: problems.append('the app has no function ' + name); return ''
    return m.group(1)
HOLES = [(r'\$\{planDate\(\w+\)\}', '{date}'), (r'\$\{planMoney\(\w+\)\}', '{amount}'), (r'\$days\b', '{days}'), (r'\$last4\b', '{last4}')]
def holes(s):
    for pat, to in HOLES: s = re.sub(pat, to, s)
    return s
ask_src = built('planMoneyBackAsk')
CARD = r"\$\{last4 == null \? '' : ' ending \$last4'\}"
if not re.search(CARD, ask_src): problems.append('planMoneyBackAsk no longer names the card the way this check reads it')
asks = [holes(literal(re.sub(CARD, w, ask_src))) for w in (" ending $last4", "")]
free_days = holes(literal(built('planFreeDaysWords'))).replace('$price', price)
sentences = [fill(const(k)) for k in ('planCheckingWords', 'planWaitsForInviteWords', 'planOfferWords', 'planPaymentProblemWords',
             'planNeedsAttentionWords', 'planEndedWords', 'planNotSetUpWords', 'planFailedWords', 'planPageFailedWords',
             'planMoneyBackOverWords', 'planMoneyBackUsedWords', 'planRefundFailedWords')]
sentences += [free_days, holes(literal(built('planFreeUntilWords'))), holes(literal(built('planMoneyBackDone')))] + asks
# The 30-day sentence for an older answer is the same sentence with 30.
if fill(const('planOfferFreeDaysWords')) != free_days.replace('{days}', '30'):
    problems.append('planOfferFreeDaysWords is not planFreeDaysWords with 30')
# The sentences planWords() builds about a running plan: its single-literal returns, with the date and the price as holes.
body = dart[dart.index('case PlanStanding.freeMonth:'):dart.index('case PlanStanding.paymentProblem:')]
running = [holes(literal(m)).replace('$price', '{amount} a {every}') for m in re.findall(r"(?:\?|:|return)\s*('(?:[^'\\]|\\.)*')", body)]
# Each level's offer is the server's price, then the same words: compared as one shape.
offer_shape = lambda s: re.sub(r'^\$[\d,]+(?:\.\d\d)? a month(?: or \$[\d,]+(?:\.\d\d)? a year)?(?=, first charged when you start\.$)', '{offer}', s)
app = {offer_shape(s) for s in sentences + running}
labels_app = [const(k) for k in ('planStartLabel', 'planManageLabel', 'planUpdateCardLabel', 'planTryAgainLabel', 'planMoneyBackLabel', 'planRefundLabel', 'planKeepPlanLabel')]

# The page's sentences: where the plan stands, under it, troubles, the money back's done line, and the sheet.
def text_of(p):
    return flat(re.sub(r'<span data-fill="(\w+)"></span>', lambda m: '{' + m.group(1) + '}', re.sub(r'</?p[^>]*>', '', p)))
page_all = [text_of(m) for m in re.findall(r'<p data-(?:stands|say|under|ask|back="refunded")[^>]*>.*?</p>', html)]
page = {offer_shape(s) for s in page_all}
labels_page = [flat(m) for m in re.findall(r'<button[^>]*>(.*?)</button>', html)]
founder_free = [s for s in page_all if s.startswith('{days} days free')]
if founder_free != [free_days]: problems.append('the founder\'s free days on the page are not the app\'s, with its price: ' + repr(founder_free))

print('the app\'s sentences:', len(app), '| on the page:', len(app & page))
print('  the app\'s, not on the page:', sorted(app - page))
print('  the page\'s, not the app\'s:', sorted(page - app))
print('buttons:', len(labels_app), 'in the app,', len(labels_page), 'on the page, the same:', labels_app == labels_page)
print('the app\'s one sentence the page leaves out on purpose:', repr(const('planSignedOutWords')))
for p in problems: print('PROBLEM:', p)
ok = app == page and labels_app == labels_page and not problems
print('WORD FOR WORD THE SAME' if ok else 'DIFFERENT')
sys.exit(0 if ok else 1)
