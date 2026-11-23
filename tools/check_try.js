// Self-checks for TRY SPEX (the home page's "Try Spex now", 2026-11-23, Inspyx Spex & Converter).
// NOTHING REAL IS ASKED HERE. The Spex relay is a stand-in this test plays itself: /demo-challenge answers a real
// challenge whose number is 5, and the demo session (WebSocket routing) checks the page solved it, then plays a
// scripted visit: what the visitor said, Spex's tool calls, a little of Spex's voice, and its end. A quiet tone
// stands in for the visitor's microphone. Any other request that tries to leave the site is stopped and counted.
// The page's switch is off in the repo (try.js ON = false); the test serves it switched on.
// usage: node tools/serve.js &   then   node tools/check_try.js     (Chrome; the microphone is a tone the test makes)
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { chromium } = require('playwright');

const url = process.env.URL || 'http://localhost:4173/';
const HOME = new URL(url).origin;
const RELAY = 'chat---spex-relay-yu5bdad2fa-uc.a.run.app';
const SITE = path.join(__dirname, '..', 'coming-soon');
let failed = 0;
const ok = (name, cond, extra) => { if (!cond) failed++; console.log((cond ? 'PASS  ' : 'FAIL  ') + name + (extra ? '  [' + extra + ']' : '')); };
const group = async (label, fn) => { try { await fn(); } catch (e) { ok(label + ': these checks could not run', false, String((e && e.message) || e).split('\n')[0]); } };
const salt = 'a'.repeat(24) + '?expires=9999999999';
const CHALLENGE = { algorithm: 'SHA-256', challenge: crypto.createHash('sha256').update(salt + '5').digest('hex'), maxnumber: 1000000, salt, signature: 'b'.repeat(64) };
const PCM = Buffer.alloc(4800 * 2).toString('base64');   // 0.2 s of silence at 24 kHz

/* The relay stand-in. `plan` is what it does after admitting: a list of steps, each a message to send, or
   {wait: 'tool_response'} to wait for the page's answer to the last tool call. */
function relay(opts) {
  const o = Object.assign({ deny: null, plan: [], seconds: 180, lateDenyFirst: false }, opts || {});
  const r = { hellos: [], audio: 0, responses: [], challenges: 0, o };
  return r;
}

async function open(browser, r, opts) {
  const o = Object.assign({ width: 1440, height: 900, on: true, mic: true }, opts || {});
  const ctx = await browser.newContext({ viewport: { width: o.width, height: o.height }, isMobile: !!o.phone, hasTouch: !!o.phone, permissions: o.mic ? ['microphone'] : [] });
  // The visitor's microphone: a quiet tone from the page's own audio (headless Chrome has no capture device).
  if (o.mic) await ctx.addInitScript(() => {
    navigator.mediaDevices.getUserMedia = () => {
      const a = new AudioContext(), osc = a.createOscillator(), gain = a.createGain(), dest = a.createMediaStreamDestination();
      gain.gain.value = 0.05; osc.connect(gain).connect(dest); osc.start();
      window.__micAsked = (window.__micAsked || 0) + 1; window.__stream = dest.stream;
      return Promise.resolve(dest.stream);
    };
  });
  const page = await ctx.newPage();
  page.errors = [];
  page.outside = [];
  page.on('pageerror', (e) => page.errors.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) page.errors.push(m.text()); });
  await page.route('**/*', async (route) => {
    const u = new URL(route.request().url());
    if (u.origin === HOME) {
      if (o.on && u.pathname === '/assets/try/try.js') {
        return route.fulfill({ status: 200, contentType: 'text/javascript', body: fs.readFileSync(path.join(SITE, 'assets/try/try.js'), 'utf8').replace('var ON = false || !LIVE;', 'var ON = true;') });
      }
      if (!o.on && u.pathname === '/assets/try/try.js') {
        // As on inspyx.com itself: the live domain, switched off.
        return route.fulfill({ status: 200, contentType: 'text/javascript', body: fs.readFileSync(path.join(SITE, 'assets/try/try.js'), 'utf8').replace("location.hostname", "'inspyx.com'") });
      }
      return route.continue();
    }
    if (u.origin === 'https://' + RELAY && u.pathname === '/demo-challenge') {
      r.challenges++;
      return route.fulfill({ status: 200, contentType: 'application/json', headers: { 'Access-Control-Allow-Origin': HOME }, body: JSON.stringify(CHALLENGE) });
    }
    page.outside.push(route.request().url());
    return route.abort();
  });
  await page.routeWebSocket('wss://' + RELAY + '/', (ws) => {
    let waiting = null, steps = r.o.plan.slice();
    const next = async () => {
      while (steps.length) {
        const s = steps.shift();
        if (s.wait) { await new Promise((res) => { waiting = res; }); continue; }
        if (s.sleep) { await new Promise((res) => setTimeout(res, s.sleep)); continue; }
        ws.send(JSON.stringify(s));
      }
    };
    ws.onMessage((raw) => {
      const m = JSON.parse(String(raw));
      if (m.hello) {
        r.hellos.push(m.hello);
        const p = m.hello.pow || {};
        const solved = p.number === 5 && p.salt === salt && p.challenge === CHALLENGE.challenge;
        if (r.o.deny || !solved) { ws.send(JSON.stringify({ relay: { status: 'denied', reason: r.o.deny || 'demo-check' } })); return; }
        if (r.o.lateDenyFirst && r.hellos.length === 1) { setTimeout(() => { try { ws.send(JSON.stringify({ relay: { status: 'denied', reason: 'demo-busy' } })); } catch (e) { /* closed */ } }, 1500); return; }
        ws.send(JSON.stringify({ relay: { status: 'admitted', mode: 'demo', seconds: r.o.seconds } }));
        next();
      } else if (m.realtime_input) {
        r.audio++;
      } else if (m.tool_response) {
        r.responses.push(m.tool_response);
        if (waiting) { const w = waiting; waiting = null; w(); }
      }
    });
  });
  await page.goto(url);
  return { ctx, page };
}

const said = (text) => ({ serverContent: { inputTranscription: { text } } });
const spexSays = (text) => ({ serverContent: { outputTranscription: { text }, modelTurn: { parts: [{ inlineData: { mimeType: 'audio/pcm;rate=24000', data: PCM } }] } } });
const call = (id, name, args) => ({ toolCall: { functionCalls: [{ id, name, args }] } });
const turnDone = { serverContent: { turnComplete: true } };

(async () => {
  const browser = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] });

  await group('switched off', async () => {
    const r = relay(); const { ctx, page } = await open(browser, r, { on: false });
    await page.waitForTimeout(800);
    ok('with its switch off, the home page shows nothing new', (await page.locator('[data-try]').count()) === 0 && r.challenges === 0);
    await ctx.close();
  });

  await group('the button and the overlay', async () => {
    const r = relay(); const { ctx, page } = await open(browser, r);
    await page.waitForSelector('[data-try]');
    ok('"Try Spex now" sits in the hero, beside "Join the waitlist"', await page.evaluate(() => { const b = document.querySelector('[data-try]'); return b.previousElementSibling && /waitlist/.test(b.previousElementSibling.getAttribute('href')); }));
    ok('the overlay\'s code waits for the click', !(await page.evaluate(() => !!window.TrySpex)));
    await page.mouse.wheel(0, 900); await page.waitForTimeout(400);
    const y = await page.evaluate(() => window.scrollY);
    await page.evaluate(() => document.querySelector('[data-try]').click());
    await page.waitForSelector('.ty-try-veil');
    ok('it opens front and centre: the phone, the dimmed page, the side panel', await page.locator('.ty-iph').isVisible() && await page.locator('.ty-try-side').isVisible());
    ok('the mic is not asked for on open', !(await page.evaluate(() => window.__micAsked)));
    await page.waitForTimeout(500);
    ok('the bot check started while the visitor looks around', r.challenges === 1);
    ok('the first-time hint says what to try', (await page.locator('[data-ty-hint]').innerText()).includes('go to the water heater'));
    ok('photo credits are on the page', (await page.locator('.ty-try-credits').innerText()).includes('CC BY-SA'));
    const rows = await page.evaluate(() => [...document.querySelectorAll('[data-ty-place]')].map((r) => ({ ring: !!r.querySelector('svg.ty-ring'), text: r.innerText })));
    ok('each walk row is the app\'s: its ring, "n of m done", no letter tile', rows.length === 6 && rows.every((r) => r.ring && / of \d+ done/.test(r.text) && !/^[A-Z]\n/.test(r.text)), JSON.stringify(rows.map((r) => r.text.split('\n').join(' / '))));
    const clear = await page.evaluate(() => {
      const body = document.querySelector('[data-ty-scr="walk"] .ty-body'); body.scrollTop = body.scrollHeight;
      const last = [...document.querySelectorAll('[data-ty-place]')].pop().getBoundingClientRect();
      const hint = document.querySelector('[data-ty-hint]').getBoundingClientRect();
      return last.bottom <= hint.top;
    });
    ok('nothing hides under the hint or the Talk button: the last row scrolls clear', clear);
    ok('the side panel\'s example is the burner\'s rust, as the photo shows', (await page.locator('.ty-try-side').innerText()).toLowerCase().includes('rust flakes in the burner'));
    ok('the side panel offers "pull up the photo"', (await page.locator('.ty-try-side').innerText()).toLowerCase().includes('pull up the photo'));
    // Tap around.
    await page.click('[data-ty-place="water heater"]');
    ok('tapping a place opens it', (await page.locator('[data-ty-scr="item"] .ty-bar b').innerText()) === 'Water heater');
    await page.click('[data-ty-rate="inspected"]');
    ok('tapping a condition sets it', await page.locator('[data-ty-rate="inspected"].ty-on').count() === 1);
    await page.click('.ty-photos .ty-add');
    ok('the camera opens on the place', await page.locator('[data-ty-scr="camera"]').isVisible());
    await page.click('.ty-cam .ty-shut button'); await page.waitForTimeout(700);
    ok('the shutter takes the photo, back on the item', await page.locator('[data-ty-scr="item"] [data-ty-taken]').count() === 1);
    await page.click('[data-ty-scr="item"] .ty-bar .ty-back'); await page.click('[data-ty-scr="walk"] .ty-bar .ty-more');
    ok('the report opens from the walk', await page.locator('[data-ty-scr="report"]').isVisible());
    // Close with Esc: back where it was.
    await page.keyboard.press('Escape');
    ok('Esc closes it, and the page is where it was', (await page.locator('.ty-try-veil').count()) === 0 && (await page.evaluate(() => window.scrollY)) === y && (await page.evaluate(() => document.documentElement.style.overflow)) === '');
    ok('the home page\'s story is untouched', (await page.locator('[data-scene]').count()) >= 5);
    await page.evaluate(() => document.querySelector('[data-try]').click());
    await page.waitForSelector('.ty-try-veil');
    await page.mouse.click(30, 450);
    ok('a click outside the phone closes it', (await page.locator('.ty-try-veil').count()) === 0);
    await page.evaluate(() => document.querySelector('[data-try]').click());
    await page.click('.ty-try-x');
    ok('the X closes it', (await page.locator('.ty-try-veil').count()) === 0);
    ok('nothing left the site and no error showed', page.outside.length === 0 && page.errors.length === 0, page.outside.concat(page.errors).join(' | '));
    await ctx.close();
  });

  await group('the demo matches the app (the drift check)', async () => {
    // inspyx-mobile test/fixtures/try_spex_contract.json, built from the app by its try_spex_contract_test.dart.
    const contract = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', 'try_spex_contract.json'), 'utf8'));
    const css = fs.readFileSync(path.join(SITE, 'assets/try/try.css'), 'utf8');
    const token = (name) => ((css.match(new RegExp('--a-' + name + ':(#[0-9A-Fa-f]{6})')) || [])[1] || '').toUpperCase();
    const map = { page: 'page', card: 'card', ink: 'ink', inkSoft: 'soft', inkFaint: 'faint', hairline: 'hair', fill: 'fill', blue: 'blue', blueTint: 'blueT',
      done: 'done', doneTint: 'doneT', needsYou: 'needs', needsYouTint: 'needsT', wrong: 'wrong', wrongTint: 'wrongT' };
    const off = Object.keys(map).filter((k) => token(map[k]) !== contract.colors[k]);
    ok('Look A\'s colours are the app\'s', off.length === 0, off.map((k) => k + ' ' + token(map[k]) + ' vs ' + contract.colors[k]).join(', '));
    const js = fs.readFileSync(path.join(SITE, 'assets/try/try-app.js'), 'utf8');
    ok('the room ring\'s colours are the app\'s (done, blue)', js.includes("fill: '" + contract.colors.done + "'") && js.includes("stroke: '" + contract.colors.blue + "'"));
    const r = relay(); const { ctx, page } = await open(browser, r);
    await page.evaluate(() => document.querySelector('[data-try]').click());
    await page.waitForSelector('.ty-try-veil');
    const kitchen = await page.locator('[data-ty-place="kitchen"] small').innerText();
    await page.evaluate(() => { TrySpex._run('open_place', { stop: 'Kitchen' }); TrySpex._run('record_finding', { title: 'a', report_text: 'b', said: 'a' }); TrySpex._run('open_place', { stop: 'Garage', item: 'Water heater' }); TrySpex._run('record_finding', { title: 'a', report_text: 'b', said: 'a' }); TrySpex._run('record_finding', { title: 'c', report_text: 'd', said: 'c' }); });
    const marks = await page.locator('[data-ty-rate]').allInnerTexts();
    await page.click('[data-ty-scr="item"] .ty-bar .ty-back');
    const kitchen1 = await page.locator('[data-ty-place="kitchen"] small').innerText();
    const heater2 = await page.locator('[data-ty-place="water heater"] small').innerText();
    ok('the item\'s marks are the app\'s', JSON.stringify(marks) === JSON.stringify(contract.item_marks), marks.join(' / '));
    ok('the walk row\'s words are the app\'s', [kitchen, kitchen1, heater2].join('|') === contract.room_progress.join('|'), [kitchen, kitchen1, heater2].join(' | '));
    await ctx.close();
  });

  await group('a visit by voice', async () => {
    const injected = '<img src=x onerror="window.__pwned=1">Rust flakes in the burner';
    const r = relay({ plan: [
      said('Go to the water heater'), call('c1', 'open_place', { stop: 'Garage', item: 'Water heater' }), { wait: 'tool_response' },
      spexSays('Here\u2019s the water heater, in the garage.'), turnDone,
      said('Pull up the photo'), call('c2', 'show_photo', {}), { wait: 'tool_response' },
      call('c3', 'show_photo', { step: 'next' }), { wait: 'tool_response' },
      call('c4', 'show_photo', { close: true }), { wait: 'tool_response' },
      said('Take a photo'), call('c5', 'open_camera', {}), { wait: 'tool_response' },
      call('c6', 'camera', { take: true }), { wait: 'tool_response' }, { sleep: 700 },
      said('Rust flakes in the burner'), call('c7', 'record_finding', { title: injected, report_text: 'Rust flakes and scale in the burner compartment. Have a plumber service the water heater.', said: 'Rust flakes in the burner' }), { wait: 'tool_response' },
      call('c8', 'update_finding', { finding_id: 'F1', severity: 'recommendation' }), { wait: 'tool_response' },
      call('c9', 'open_place', { stop: 'the moon' }), { wait: 'tool_response' },
      call('c10', 'mark_photo', { shape: 'circle', box_2d: [1, 2, 3, 4] }), { wait: 'tool_response' },
      call('c11', 'show_photo', { number: 2 }), { wait: 'tool_response' },
      call('c12', 'show_photo', { close: true }), { wait: 'tool_response' },
      call('c13', 'open_camera', { zoom: 2 }), { wait: 'tool_response' },
      { sleep: 300 }, { relay: { status: 'ended', reason: 'time-limit' } },
    ] });
    const { ctx, page } = await open(browser, r);
    await page.waitForSelector('[data-try]');
    await page.evaluate(() => document.querySelector('[data-try]').click());
    await page.waitForSelector('.ty-try-veil');
    await page.click('[data-ty-talk]');
    await page.waitForSelector('[data-ty-done].ty-show', { timeout: 20000 });
    ok('the page solved the relay\'s challenge and said who it is', r.hellos.length === 1 && r.hellos[0].mode === 'demo' && r.hellos[0].client === 'inspyx-web-demo' && r.hellos[0].pow.number === 5);
    ok('the microphone went up as audio', r.audio > 0, String(r.audio));
    const res = r.responses.map((t) => t.function_responses[0]);
    const rs = (i) => res[i].response;
    ok('Spex took it to the water heater by the app\'s stop and item names', rs(0).on_screen === 'Garage \u203a Water heater' && rs(0).photos.length === 1);
    ok('"pull up the photo" opens the item\'s photo on the viewer, never the camera', rs(1).ok === true && rs(1).showing === 1 && res[1].name === 'show_photo');
    ok('next past its last photo is an honest answer, and close closes it', rs(2).ok === false && /last photo/.test(rs(2).say) && rs(3).ok === true);
    ok('the camera opens, and camera take takes the photo', rs(4).camera === 'up' && rs(5).taken === true);
    ok('the finding is filed in its item, and Spex is told to ask how serious', rs(6).finding_id === 'F1' && rs(6).filed_in === 'Garage \u203a Water heater' && rs(6).missing[0] === 'severity');
    ok('its severity is set as the inspector says', rs(7).ok === true && rs(7).severity === 'recommendation');
    ok('a place the demo doesn\'t have is refused, not shown', rs(8).ok === false);
    ok('an app tool the demo doesn\'t have gets "in the full app", never another tool', rs(9).ok === false && /In the full app/.test(rs(9).say));
    ok('"zoom in" opens nothing: the demo\'s camera has no zoom', rs(12).ok === false && /In the full app/.test(rs(12).say) && res[12].name === 'open_camera');
    ok('the photo taken is the item\'s second', rs(10).showing === 2 && rs(10).photos.length === 2 && rs(11).ok === true);
    const item = await page.locator('[data-ty-scr="item"]').innerText();
    ok('the model\'s words are text, never markup', item.includes('<img src=x') && item.includes('Repair') && !(await page.evaluate(() => window.__pwned)) && (await page.locator('[data-ty-finds] img').count()) === 0);
    ok('a plain photo with its everyday settings opens the camera', await page.evaluate(() => TrySpex._run('open_camera', { zoom: 1, flash: 'auto', size: 'standard', mode: 'photo' }).camera === 'up'));
    ok('the end is "That\u2019s Spex." with the waitlist', (await page.locator('[data-ty-done]').innerText()).includes('Join the waitlist'));
    ok('at the end the mic is off', await page.evaluate(() => window.__stream.getTracks().every((t) => t.readyState === 'ended')));
    ok('nothing left the site and no error showed', page.outside.length === 0 && page.errors.length === 0, page.outside.concat(page.errors).join(' | '));
    await ctx.close();
  });

  await group('a goodbye ends only its own session', async () => {
    const r = relay({ plan: [{ sleep: 60000 }] });
    const { ctx, page } = await open(browser, r);
    await page.evaluate(() => document.querySelector('[data-try]').click());
    await page.waitForSelector('.ty-try-veil');
    await page.click('[data-ty-talk]');
    await page.waitForSelector('[data-ty-spex].ty-on', { timeout: 15000 });
    await page.evaluate(() => TrySpex._run('end_conversation', {}));
    await page.click('[data-ty-live]');              // stopped by hand, then started again at once
    await page.click('[data-ty-talk]');
    await page.waitForSelector('[data-ty-spex].ty-on', { timeout: 15000 });
    await page.waitForTimeout(2000);                // the first goodbye's timer has run
    ok('the new session is still on after the old goodbye\'s timer', await page.locator('[data-ty-spex].ty-on').count() === 1);
    await ctx.close();
  });

  await group('stopping by keyboard', async () => {
    const r = relay({ plan: [{ sleep: 60000 }] });
    const { ctx, page } = await open(browser, r);
    await page.evaluate(() => document.querySelector('[data-try]').click());
    await page.waitForSelector('.ty-try-veil');
    await page.click('[data-ty-talk]');
    await page.waitForSelector('[data-ty-spex].ty-on', { timeout: 15000 });
    await page.focus('[data-ty-live]');
    await page.keyboard.press('Enter');
    await page.waitForTimeout(300);
    ok('Enter on "Tap to stop" stops Spex and the mic', !(await page.locator('[data-ty-spex].ty-on').count()) && await page.evaluate(() => window.__stream.getTracks().every((t) => t.readyState === 'ended')));
    await ctx.close();
  });

  await group('stop and start again quickly', async () => {
    const r = relay({ lateDenyFirst: true, plan: [{ sleep: 60000 }] });
    const { ctx, page } = await open(browser, r);
    await page.evaluate(() => document.querySelector('[data-try]').click());
    await page.waitForSelector('.ty-try-veil');
    await page.click('[data-ty-talk]');
    await page.waitForFunction(() => document.querySelector('[data-ty-spex]').className.includes('ty-wait'));
    await page.waitForTimeout(400);
    await page.click('[data-ty-talk]');            // stop, before the first session is answered
    await page.click('[data-ty-talk]');            // and start again
    await page.waitForSelector('[data-ty-spex].ty-on', { timeout: 15000 });
    await page.waitForTimeout(2000);               // the first session's late "denied" arrives now
    ok('a stopped session\'s late answer never touches the new one', await page.locator('[data-ty-spex].ty-on').count() === 1 && !(await page.locator('[data-ty-busy].ty-show').count()) && r.hellos.length === 2);
    await ctx.close();
  });

  await group('the demo is busy', async () => {
    const r = relay({ deny: 'demo-cap' });
    const { ctx, page } = await open(browser, r);
    await page.evaluate(() => document.querySelector('[data-try]').click());
    await page.waitForSelector('.ty-try-veil');
    await page.click('[data-ty-talk]');
    await page.waitForSelector('[data-ty-busy].ty-show', { timeout: 15000 });
    ok('the day\'s cap reached: the friendly "Spex is busy right now"', (await page.locator('[data-ty-busy]').innerText()).includes('Spex is busy right now'));
    ok('and the phone can still be tapped', await page.locator('[data-ty-place="roof"]').count() === 1);
    await ctx.close();
  });

  await group('no microphone', async () => {
    const r = relay();
    const { ctx, page } = await open(browser, r, { mic: false });
    await page.evaluate(() => { navigator.mediaDevices.getUserMedia = () => Promise.reject(new DOMException('no', 'NotAllowedError')); });
    await page.evaluate(() => document.querySelector('[data-try]').click());
    await page.waitForSelector('.ty-try-veil');
    await page.click('[data-ty-talk]'); await page.waitForTimeout(500);
    ok('the mic refused: it says so, nothing is sent, and the phone still taps', (await page.locator('[data-ty-hint]').innerText()).includes('microphone is off') && r.hellos.length === 0);
    await ctx.close();
  });

  await group('a short desktop window', async () => {
    const r = relay(); const { ctx, page } = await open(browser, r, { width: 1280, height: 600 });
    await page.evaluate(() => document.querySelector('[data-try]').click());
    await page.waitForSelector('.ty-try-veil'); await page.waitForTimeout(700);
    const b = await page.evaluate(() => { const r = document.querySelector('[data-ty-talk]').getBoundingClientRect(); return [Math.round(r.top), Math.round(r.bottom), innerHeight]; });
    ok('"Talk to Spex" is in view on a short window (the phone is scaled to fit)', b[0] >= 0 && b[1] <= b[2], b.join(','));
    await ctx.close();
  });

  await group('closing while the browser asks for the mic', async () => {
    const r = relay(); const { ctx, page } = await open(browser, r, { mic: false });
    await page.evaluate(() => {
      // The visitor allows the mic only after closing the demo.
      navigator.mediaDevices.getUserMedia = () => new Promise((res) => {
        window.__grant = () => { const a = new AudioContext(), d = a.createMediaStreamDestination(); a.createOscillator().connect(d); window.__late = d.stream; res(d.stream); };
      });
    });
    await page.evaluate(() => document.querySelector('[data-try]').click());
    await page.waitForSelector('.ty-try-veil');
    await page.click('[data-ty-talk]');
    await page.keyboard.press('Escape');
    await page.evaluate(() => window.__grant());
    await page.waitForTimeout(400);
    ok('the mic allowed after closing goes off at once', await page.evaluate(() => window.__late.getTracks().every((t) => t.readyState === 'ended')) && r.hellos.length === 0 && page.errors.length === 0, page.errors.join(' | '));
    await ctx.close();
  });

  await group('on a phone', async () => {
    const r = relay(); const { ctx, page } = await open(browser, r, { width: 390, height: 844, phone: true });
    await page.evaluate(() => document.querySelector('[data-try]').click());
    await page.waitForSelector('.ty-try-veil');
    await page.waitForTimeout(700);   // the phone's rise (0.5 s) is over
    const fit = await page.evaluate(() => { const r = document.querySelector('.ty-iph').getBoundingClientRect(); return [Math.round(r.width), document.documentElement.scrollWidth]; });
    ok('no phone in a phone: the demo fills the screen', fit[0] === 390 && fit[1] <= 390, fit.join(','));
    ok('with a clear close button', await page.locator('.ty-try-x').isVisible());
    await ctx.close();
  });

  await browser.close();
  console.log(failed ? '\n' + failed + ' FAILED' : '\nALL PASS');
  process.exit(failed ? 1 : 0);
})();
