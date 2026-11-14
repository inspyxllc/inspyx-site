// Prepares the private sample for the home page's pictures: a realistic address that is nobody's home, the
// inspector's own name, his photo on the inspector's card, and a signature made for his name.
// usage: node tools/report_sample_touch.js <sample folder> --address "7314 Willet Marsh Ct." --inspector "Moises Avila"
//          --photo <picture file> [--no-associations] [--swap "old words=new words"]...
// --no-associations empties the inspector's list of associations: the sample's inspector is a real person, and
// the sample must not say he belongs to a body he has not told us he belongs to.
// --swap replaces words wherever they stand in the report (the company, the license, the client, the dates);
// "old=" with nothing after it takes the words out.
const fs = require('fs'); const path = require('path'); const { chromium } = require('playwright');
const args = process.argv.slice(2); const dir = args[0];
const opt = (n) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : null; };
const address = opt('--address'), who = opt('--inspector'), photo = opt('--photo');
(async () => {
  const b = await chromium.launch();
  // the signature: the name in a pen-like hand, a little uphill, on nothing (so it sits on any paper)
  let p = await b.newPage({ viewport: { width: 900, height: 320 }, deviceScaleFactor: 3 });
  await p.setContent('<body style="margin:0;background:transparent"><div id="s" style="display:inline-block;padding:12px 16px 4px 8px"><span style="font-family:\'Savoye LET\';font-size:96px;color:#14233b;transform:rotate(-4deg);display:inline-block;white-space:nowrap;line-height:1">' + who + '</span></div></body>');
  await p.waitForTimeout(400);
  const el = await p.$('#s'); await el.screenshot({ path: path.join(dir, 'files', 'signature.png'), omitBackground: true });
  const sb = await el.boundingBox(); await p.close();
  // his photo: a square around his face, small, for the round picture on the inspector's card
  p = await b.newPage();
  const data = 'data:image/webp;base64,' + fs.readFileSync(photo).toString('base64');
  const face = await p.evaluate(async (data) => {
    const img = new Image(); img.src = data; await img.decode();
    const side = Math.round(img.width * 0.62), x = Math.round((img.width - side) / 2), y = Math.round(img.height * 0.03);
    const c = document.createElement('canvas'); c.width = 360; c.height = 360; const g = c.getContext('2d'); g.imageSmoothingQuality = 'high';
    g.drawImage(img, x, y, side, side, 0, 0, 360, 360);
    return { jpg: c.toDataURL('image/jpeg', 0.86), from: [img.width, img.height, x, y, side] };
  }, data);
  fs.writeFileSync(path.join(dir, 'files', 'inspector.jpg'), Buffer.from(face.jpg.split(',')[1], 'base64'));
  await b.close();
  // the report's own words: the address and the inspector's name wherever they stand
  let txt = fs.readFileSync(path.join(dir, 'report.json'), 'utf8');
  const before = { address: (txt.match(/1234 Main St\./g) || []).length, name: (txt.match(/Inspector Name/g) || []).length };
  txt = txt.split('1234 Main St.').join(address).split('Inspector Name').join(who);
  const swaps = args.map((a, i) => (a === '--swap' ? args[i + 1] : null)).filter(Boolean).map((p) => { const k = p.indexOf('='); return [p.slice(0, k), p.slice(k + 1)]; });
  for (const [from, to] of swaps) { before[from] = txt.split(JSON.stringify(from).slice(1, -1)).length - 1; txt = txt.split(JSON.stringify(from).slice(1, -1)).join(JSON.stringify(to).slice(1, -1)); }
  const d = JSON.parse(txt);
  d.files.inspector = { url: '/sample-report/files/inspector.jpg', thumb: '/sample-report/files/inspector.jpg', w: 360, h: 360 };
  d.files.signature = { url: '/sample-report/files/signature.png', thumb: '/sample-report/files/signature.png', w: Math.round(sb.width * 3), h: Math.round(sb.height * 3) };
  d.report.cover.inspector.photo = 'inspector';
  if (args.includes('--no-associations')) d.report.cover.inspector.associations = [];
  d.report.signature.image = 'signature';
  fs.writeFileSync(path.join(dir, 'report.json'), JSON.stringify(d));
  console.log('replaced', JSON.stringify(before), '| photo cut', JSON.stringify(face.from), '| signature', Math.round(sb.width) + 'x' + Math.round(sb.height), 'pt');
  console.log('cover now:', d.report.cover.address + ', ' + d.report.cover.locality, '| inspector', d.report.cover.inspector.name, '| signature', JSON.stringify(d.report.signature), '| pdf name', d.report.pdf_name);
})();
