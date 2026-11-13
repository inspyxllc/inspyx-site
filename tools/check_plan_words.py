# Are the plan page's sentences the app's own, word for word? Reads the app's Dart file and the page.
# usage: python3 -I tools/check_plan_words.py <app repo> <site repo>
import re, sys
app_repo, site = sys.argv[1:3]
dart = open(app_repo + '/lib/src/shell/plan_billing.dart', encoding='utf-8').read()
html = open(site + '/coming-soon/plan.html', encoding='utf-8').read()
flat = lambda t: re.sub(r'\s+', ' ', t).strip()

# The app's sentences, read out of the Dart file itself.
def literal(src):
    # adjacent string literals, in either kind of quotes, joined as Dart joins them
    parts = re.findall(r"r?'((?:[^'\\]|\\.)*)'|\"((?:[^\"\\]|\\.)*)\"", src)
    return ''.join(a or b for a, b in parts).replace("\\'", "'").replace('\\$', '$')
consts = {m.group(1): literal(m.group(2)) for m in re.finditer(r'const String (plan\w+)\s*=\s*((?:\s*r?(?:\'(?:[^\'\\]|\\.)*\'|"(?:[^"\\]|\\.)*"))+);', dart)}
price = consts['planOfferPriceWords']
fill = lambda s: s.replace('$planOfferPriceWords', price)
sentences = [fill(consts[k]) for k in ('planCheckingWords', 'planOfferFreeMonthWords', 'planOfferWords', 'planPaymentProblemWords', 'planNeedsAttentionWords', 'planEndedWords', 'planNotSetUpWords', 'planFailedWords', 'planPageFailedWords')]
# the sentences planWords() builds: its return lines, with the date and the price as holes
body = dart[dart.index('String planWords(PlanStatus plan)'):dart.index('/// Why the plan couldn\'t be checked')]
built = [literal(m) for m in re.findall(r"\?\s*('(?:[^'\\]|\\.)*')|:\s*('(?:[^'\\]|\\.)*')\s*;", body) for m in m if m]
built = [re.sub(r'\$\{planDate\(\w+\)\}', '{date}', b).replace('$price', '{amount} a {every}') for b in built]
app = sentences + built
buttons_app = [consts[k] for k in ('planStartLabel', 'planManageLabel', 'planUpdateCardLabel', 'planTryAgainLabel')]

page = [flat(re.sub(r'<span data-fill="(\w+)"></span>', lambda m: '{' + m.group(1) + '}', re.sub(r'</?p[^>]*>', '', m))) for m in re.findall(r'<p data-(?:stands|say)[^>]*>.*?</p>', html)]
buttons_page = [flat(m) for m in re.findall(r'<button[^>]*>(.*?)</button>', html)]
print('the app\'s sentences:', len(set(app)), '(', len(sentences), 'kept as they are,', len(set(built)), 'built with a date or a price )')
print('  of them on the page:', sum(1 for s in set(app) if s in page), '| not on the page:', sorted(set(app) - set(page)))
print('sentences on the page that are not the app\'s:', sorted(set(page) - set(app)))
print('buttons:', len(buttons_app), 'in the app,', len(buttons_page), 'on the page, the same:', buttons_app == buttons_page)
print('the app\'s one sentence the page leaves out on purpose:', repr(consts['planSignedOutWords']))
ok = set(app) == set(page) and buttons_app == buttons_page
print('WORD FOR WORD THE SAME' if ok else 'DIFFERENT')
sys.exit(0 if ok else 1)
