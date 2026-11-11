// Builds a stand-alone web page from the design-canvas artboard, so the mock-up
// can be opened as a normal page on a phone.
//
// usage: node build_standalone.js <Main.dc.html> <uploadsDir> <out.html> [--test <test.html>]
const fs = require('fs');
const path = require('path');

const [dcPath, uploadsDir, outPath] = process.argv.slice(2, 5);
const testIdx = process.argv.indexOf('--test');
const testPath = testIdx > 0 ? process.argv[testIdx + 1] : null;

const src = fs.readFileSync(dcPath, 'utf8');
const xdc = /<x-dc>([\s\S]*?)<\/x-dc>/.exec(src)[1];
const helmet = /<helmet>([\s\S]*?)<\/helmet>/.exec(xdc)[1];
const helmetCss = /<style>([\s\S]*?)<\/style>/.exec(helmet)[1].trim();
let markup = xdc.replace(/<helmet>[\s\S]*?<\/helmet>/, '').trim();
const sm = /<script type="text\/x-dc" data-dc-script data-props='([^']*)'>([\s\S]*?)<\/script>/.exec(src);
if (!sm) throw new Error('logic script not found');
const dataProps = sm[1];
const logic = sm[2].trim();

// Each change must land exactly as many times as expected, or the build stops.
function swap(from, to, times) {
  const parts = typeof from === 'string' ? markup.split(from) : null;
  const n = parts ? parts.length - 1 : (markup.match(from) || []).length;
  if (n !== times) throw new Error('expected ' + times + ' of ' + from + ', found ' + n);
  markup = parts ? parts.join(to) : markup.replace(from, to);
}

// 1. The report pages travel inside the file.
const blobs = {
  '4c8f62b40e278f5e8890eb4cf81b3126': 'inspyx-report-cover.jpg',
  '767697cf89e79153a162fb68757116c6': 'inspyx-report-findings.jpg',
  'd07aedecfc6b0871dd703949cf3d7564': 'inspyx-report-photos.jpg'
};
let embedded = 0;
markup = markup.replace(/\/_blob\/([a-f0-9]{32})/g, (m, id) => {
  if (!blobs[id]) throw new Error('unknown image ' + id);
  embedded++;
  return 'data:image/jpeg;base64,' + fs.readFileSync(path.join(uploadsDir, blobs[id])).toString('base64');
});
if (embedded !== 3) throw new Error('expected 3 images, embedded ' + embedded);

// 2. One phone screen: the page fills the frame it is given instead of measuring the window.
swap('height: 100vh', 'height: 100%', 3);

// 3. Side gutters that also clear a system bar at the phone's side.
swap('<div style="position: sticky; top: 0; z-index: 6; height: 0">', '<div class="g16" style="position: sticky; top: 0; z-index: 6; height: 0">', 1);
swap('position: relative; top: 12px; margin: 0 12px; height: 56px;', 'position: relative; top: 12px; margin: 0; height: 56px;', 1);
swap('<section data-scene="0" style="min-height: 100%; box-sizing: border-box; padding: 92px 24px 18px 24px;', '<section data-scene="0" class="g24" style="min-height: 100%; box-sizing: border-box; padding-top: 92px; padding-bottom: 18px;', 1);
swap(/(<section data-scene="[123]") style="min-height: 1300px; box-sizing: border-box; padding: 0 12px 16px 12px">/g, '$1 class="g16" style="min-height: 1300px; box-sizing: border-box; padding-top: 0; padding-bottom: 16px">', 3);
swap('<section data-scene="4" style="min-height: 1300px; box-sizing: border-box; padding: 0 12px 104px 12px">', '<section data-scene="4" class="g16" style="min-height: 1300px; box-sizing: border-box; padding-top: 0; padding-bottom: 104px">', 1);
swap('<div style="position: relative; display: flex; flex-direction: column; background: #FFFFFF; border-radius: 32px 32px 0 0; padding: 0 20px 44px 20px;', '<div class="g20" style="position: relative; display: flex; flex-direction: column; background: #FFFFFF; border-radius: 32px 32px 0 0; padding-top: 0; padding-bottom: 44px;', 1);
// The waitlist heading also has to clear the floating header when a button jumps here.
swap('<section id="waitlist" style="display: flex; flex-direction: column; gap: 16px; background: #000000; color: #FFFFFF; padding: 44px 24px 40px 24px">', '<section id="waitlist" class="g24" style="display: flex; flex-direction: column; gap: 16px; background: #000000; color: #FFFFFF; padding-top: 92px; padding-bottom: 40px">', 1);
swap('<footer class="ix-foot" style="display: flex; flex-direction: column; align-items: flex-start; gap: 14px; background: #FFFFFF; padding: 32px 24px 48px 24px">', '<footer class="ix-foot g24" style="display: flex; flex-direction: column; align-items: flex-start; gap: 14px; background: #FFFFFF; padding-top: 32px; padding-bottom: 48px">', 1);

// 4. Glass on older iPhones, links that leave the page, and plain hooks for the small runtime.
markup = markup.replace(/backdrop-filter: ([^;"]+)/g, '-webkit-backdrop-filter: $1; backdrop-filter: $1');
markup = markup.replace(/<a href="https:\/\//g, '<a target="_blank" rel="noopener" href="https://');
markup = markup.replace(/ onClick="\{\{ (\w+) \}\}"/g, ' data-on-click="$1"');
markup = markup.replace(/ ref="\{\{ (\w+) \}\}"/g, ' data-ref="$1"');
markup = markup.replace(/ hint-placeholder-val="\{\{ (true|false) \}\}"/g, '');
if (/ on[A-Z]\w*="/.test(markup) || / ref="/.test(markup)) throw new Error('an event or ref was not converted');

const runtime = `
(function () {
  var props = JSON.parse(document.getElementById('ix-props').textContent);
  var p = {};
  for (var k in props) if (k.charAt(0) !== '$' && props[k] && 'default' in props[k]) p[k] = props[k].default;
  var comp = new Component(p);
  comp.props = p;
  var mount = document.getElementById('mount');
  mount.appendChild(document.getElementById('ix-tpl').content.cloneNode(true));
  var vals = comp.renderVals();
  var ups = [];
  var list = function (x) { return Array.prototype.slice.call(x); };
  var get = function (pth) {
    pth = pth.trim();
    if (pth === 'true') return true;
    if (pth === 'false') return false;
    return pth.split('.').reduce(function (o, key) { return o == null ? undefined : o[key]; }, vals);
  };
  var WHOLE = /^\\s*\\{\\{\\s*([^}]+?)\\s*\\}\\}\\s*$/;
  var sub = function (s) { return s.replace(/\\{\\{\\s*([^}]+?)\\s*\\}\\}/g, function (_, q) { var v = get(q); return v == null ? '' : String(v); }); };
  var has = function (s) { return s.indexOf('{{') >= 0; };
  var walk = function (node) {
    if (node.nodeType === 3) {
      var s = node.nodeValue;
      if (has(s)) ups.push(function () { var t = sub(s); if (node.nodeValue !== t) node.nodeValue = t; });
      return;
    }
    if (node.nodeType !== 1) return;
    if (node.tagName.toLowerCase() === 'sc-if') {
      var m = WHOLE.exec(node.getAttribute('value') || '');
      var span = document.createElement('span');
      while (node.firstChild) span.appendChild(node.firstChild);
      node.parentNode.replaceChild(span, node);
      var q = m ? m[1] : 'false';
      ups.push(function () { span.style.display = get(q) ? 'contents' : 'none'; });
      list(span.childNodes).forEach(walk);
      return;
    }
    list(node.attributes).forEach(function (attr) {
      var name = attr.name, val = attr.value;
      if (name === 'data-on-click') {
        node.removeAttribute(name);
        node.addEventListener('click', function (e) { var fn = get(val); if (typeof fn === 'function') fn(e); });
        return;
      }
      if (name === 'data-ref') {
        node.removeAttribute(name);
        var fn = get(val);
        if (typeof fn === 'function') fn(node);
        return;
      }
      if (has(val)) {
        var w = WHOLE.exec(val);
        ups.push(function () {
          var next = w ? get(w[1]) : sub(val);
          if (next == null) node.removeAttribute(name);
          else if (node.getAttribute(name) !== String(next)) node.setAttribute(name, String(next));
        });
      }
    });
    list(node.childNodes).forEach(walk);
  };
  list(mount.childNodes).forEach(walk);
  comp.__update = function () { vals = comp.renderVals(); ups.forEach(function (u) { u(); }); };
  comp.__update();
  /* links inside the page scroll the phone screen */
  mount.addEventListener('click', function (e) {
    var a = e.target && e.target.closest ? e.target.closest('a[href^="#"]') : null;
    if (!a) return;
    e.preventDefault();
    var id = a.getAttribute('href').slice(1);
    var t = id ? document.getElementById(id) : null;
    var calm = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (t) t.scrollIntoView({ behavior: calm ? 'auto' : 'smooth', block: 'start' });
  });
  if (comp.componentDidMount) comp.componentDidMount();
})();
`;

const page = `<title>Inspyx Home Page Preview</title>
<meta name="claude:viewport-fit-sides" content="cover">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Noto+Sans:wght@300&display=swap">
<style>
/* Layout: one phone screen. A scroll film sits behind floating glass cards; the page scrolls inside that screen. */
:root{--ink:#1D1D1F;--ink-soft:#424245;--ink-faint:#6E6E73;--paper:#FFFFFF;--alt:#F5F5F7;--night:#0B0B0C;
--font-text:-apple-system,BlinkMacSystemFont,"SF Pro Text","Segoe UI",Roboto,Helvetica,Arial,sans-serif;
--font-mark:"Noto Sans","Helvetica Neue",Arial,sans-serif}
html{box-sizing:border-box;height:100%}
body{height:100%;margin:0;overflow:hidden;background:var(--night);color:var(--ink);font-family:var(--font-text)}
#mount{height:100%}
.ix-root{font-size:16px}
.g16{padding-left:max(16px, env(safe-area-inset-left, 0px));padding-right:max(16px, env(safe-area-inset-right, 0px))}
.g20{padding-left:max(20px, env(safe-area-inset-left, 0px));padding-right:max(20px, env(safe-area-inset-right, 0px))}
.g24{padding-left:max(24px, env(safe-area-inset-left, 0px));padding-right:max(24px, env(safe-area-inset-right, 0px))}
${helmetCss.replace(/^body\{margin:0\}\n?/, '')}
</style>
<div id="mount"></div>
<template id="ix-tpl">
${markup}
</template>
<script type="application/json" id="ix-props">${dataProps}</script>
<script>
class DCLogic {
  constructor(props) { this.props = props || {}; }
  setState(s) { this.state = Object.assign({}, this.state, typeof s === 'function' ? s(this.state) : s); if (this.__update) this.__update(); }
  forceUpdate() { if (this.__update) this.__update(); }
}
</script>
<script>
${logic}
</script>
<script>${runtime}</script>
`;

fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, page);
console.log('wrote ' + outPath + ' (' + Math.round(page.length / 1024) + ' KB)');

if (testPath) {
  // The publish step wraps the file in a skeleton like this one; this copy is only for local testing.
  const shell = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<style>:root{color-scheme:light;padding:env(safe-area-inset-top,0px) 0 env(safe-area-inset-bottom,0px)}body{margin:0;font:14px system-ui,sans-serif}img{max-width:100%}[hidden]{display:none!important}</style>
</head><body>
${page.replace(/<link[^>]*>/g, '')}
</body></html>`;
  fs.writeFileSync(testPath, shell);
  console.log('wrote ' + testPath);
}
