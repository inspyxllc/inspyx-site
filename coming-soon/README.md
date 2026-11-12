# coming-soon/ — what inspyx.com serves

Since 2026-11-08 ~02:15Z, inspyx.com is served from this folder, in place of the old
"Inspyx Voice" site (Replit, 34.111.179.208).

- Vercel project: `inspyx-coming-soon` (prj_gzZo96kf3nQclwNHhgVbA4zGXiuK), team moises-avilas-projects.
  Deployed by API upload, not from git: first deploy dpl_DjvxehQCQcNBswFpEmzR6KSa8psh.
  To change the site, edit these files and redeploy them to that project.
- Domains on that project: inspyx.com (serves the site), www.inspyx.com (308 to inspyx.com).
- DNS at Porkbun: A @ and A www changed from 34.111.179.208 to 76.76.21.21. Mail records untouched.
- Deploy every file in this folder together (index.html, the four pages, 404.html, robots.txt,
  sitemap.xml, vercel.json, assets/).

## The home page (index.html)

**Status on 2026-11-12: built on the branch `claude/new-home-page`. It is not live. inspyx.com
still shows the "Pilot coming soon" page until Moises says to publish.**

- Moises approved the new words on these pages that day (the list W1 to W8 in the Drive folder
  "Claude Inspyx Development").
- The guarantee's wording for the pricing page and the Terms (W9 and W10) is drafted for his OK.
  It is not in these files yet.
- The Spex scene's conversation is his direction and Claude's wording. He approved the scene and
  its lines as shown on 2026-11-11 ("Yes, that's well done.").
- He wants the report section to show the web report in place of the three PDF pages, once a web
  report exists. It does not yet: today the app makes a PDF on the phone.
- **The Spex Business scene was rebuilt on 2026-11-12**, at his word: "we don't have a section that
  includes Spex Business yet… something like the email auto scheduler, that schedules in jobs for
  you based on emails you receive or website forms filled out". Its new words (the card's paragraph
  and every line in the film) are Claude's drafts and wait for his OK: see "Words waiting for his
  OK" below.
- The branch can be seen at a private test address: the Vercel project `inspyx-site-test`
  (see "The test address" below).

The new home page follows one job from the first call to the finished report. It was built from
the phone mock-up Moises approved on 2026-11-10 ("the original", kept on the branch
`claude/home-page-mockup`), and on a 390 x 844 phone it draws the same picture as that mock-up.

**How it stands against the mock-up** (`tools/compare_mockup.js`, counting every pixel that differs
at all). When first built, 17 of 18 frames from the first screen down to the form were identical
to the mock-up to the last pixel, and the 18th differed in 8 pixels by 1 step of 255. As visitors
get the page, the three report pictures also differ inside themselves: the page serves them as
WebP where the mock-up carried JPEG (at most 12 steps of 255).

Changed from the mock-up on purpose since then:

- **The footer** no longer links Switching, Reliability and Your data (those pages are not on
  this site), and its email and phone are links. A line under the form states the guarantee's
  condition. The form really sends.
- **The inspector on the roof was redrawn** on 2026-11-11, at Moises's word. In the mock-up his
  whole head was the hair colour, which read as a brown face above tan hands. Now his face is the
  very same skin colour as his hand, his hair shows only at the back of his head under the cap,
  and his sleeve is the navy shirt he wears at the panel.
- **The Spex scene was redrawn** the same day, at his word: "I want the iPhone normal sized. I
  don't need a close-up of this ridiculously undetailed camera app. Secondly, the captions should
  be the inspector and specs talking to each other". He now stands at the panel with the iPhone
  in his hand at its real size, and the scene is a conversation: his words in white captions,
  Spex's answers in black ones. The scene does what Spex says: the camera comes up, the light
  comes on, the flash fires. The scene's stretch of page is 2,400 px, where the others are 1,300.

- **The Spex Business scene was rebuilt** on 2026-11-12, at his word (above). In the mock-up three
  small chips over the tailgate turned a question into "Reply ready" with a Send button. Now the
  scene shows the office running itself while he is on the roof: an email comes in from an agent,
  Spex Business replies with the time and the price, and the job lands on his calendar; then the
  same from the form on his website. The calendar starts with the job Mia booked by phone in the
  scene before, and ends with three, each tagged with the door it came in through: Phone, Email,
  Website. A ring spreads from the tablet as each request lands. The scene's stretch of page is
  2,100 px. The camera stops in a slightly different place over the tailgate, to leave the cards
  room.
- **The header links Pricing** on wide screens (2026-11-12). On phones it keeps to the logo and
  the button: there is no room for more.

The comparison now leaves the Spex Business scene and the Spex scene out, and compares what
follows them further down the page. Of its 12 frames, 6 are identical to the mock-up to the last
pixel, 5 differ only where the inspector on the roof is drawn, and one differs in the same 8
pixels as before (measured on 2026-11-12 with `--same-pictures`).

- `index.html` holds every word and all the styles. `assets/home.js` draws the film and runs the
  calculator and the form. No libraries, no web fonts, no cookies, no trackers.
- **Phones:** the film fills the screen behind the page (a fixed canvas) and glass cards tell the
  story over it. The page scrolls the normal way. The canvas is as tall as the screen with the
  browser's bars tucked away; the scene is composed for the shorter screen you see first.
- **Wide screens (860 px and up, at least 520 px tall):** the words sit on the left and the film
  plays in a window on the right.
- **Between the two** (tablets held upright, narrow windows): the phone page, footer included, centred on a
  dark ground.
- **The film** is drawn in code. Scrolling sets the film time: 1 at the top of the page, then one
  unit for each scene's stretch of page (`data-scene="1"` to `"4"`). With "reduce motion" on, each
  scene holds still at its start and then at its end.
- **Two scenes have a sequence in them**, and a longer stretch of page for it: the Spex Business
  scene (2,100 px) and the Spex scene (2,400 px). In each, the film's clock runs its usual 1,300 px
  with a pause in the middle, and the sequence plays through the pause (`SEQ_HOLD` in `home.js`
  says where each clock stops). With "reduce motion" on, each piece of a sequence is a still of
  its own.
- **The two requests in the Spex Business scene** are written in `index.html` (the block marked
  `data-desk`, hidden from sight and read by screen readers): each request and reply is a line
  marked `data-who` (`mail`, `form` or `biz`), and each line of the calendar is marked `data-row`
  with its time (`data-when`) and its door (`data-from`). The film draws those very words, so to
  change one, change it there. How the cards are laid out depends on the room under the page's
  own card: with room (a wide window, a tablet, a tall phone) a request and its reply sit one
  above the other over the calendar; on a phone with its browser bars showing, the reply takes
  the request's place; on a small phone, once a job is booked the reply makes way and the
  calendar moves up to show every line. What the scene promises follows Moises's rules for Spex
  Business (interview of 2026-11-09): for a new request it replies with a time and a price from
  the inspector's own price list and books the job; everything else it writes waits for the
  inspector's tap on Send.
- **The conversation in the Spex scene** is written in `index.html` (the block marked
  `data-talk`, hidden from sight and read by screen readers). The film draws those very words, so
  to change a line, change it there. Spex's answers follow how Spex really runs the camera
  (`backend/spex_relay/relay/spex.py` in the app's repo, read on 2026-11-11 at 7e35c44): it opens
  the camera when asked, sets zoom, light and flash by voice, never takes the photo by itself,
  and says back only what was really set.
- **The calculator** multiplies the visitor's own numbers. Nothing is sent anywhere.
- **The waitlist form** sends the email and the two taps to `join_waitlist()` in Inspyx's own
  database (Supabase), with the project's publishable key. See `../backend/waitlist/schema.sql`.
  That database piece was applied to inspyx-prod on 2026-11-11 (the migration `website_waitlist`),
  on Moises's yes.
  A hidden field catches robots. A copy of the page marked `data-preview` on the form sends nothing.
- **Stripe's return messages.** Since 2026-11-09 Stripe sends inspectors back here from Inspyx's
  plan pages (the billing Edge Function's success_url, return_url and cancel_url default to
  https://inspyx.com/?billing=done, back and canceled). With one of those, the page shows that
  message and nothing else (words approved by Moises 2026-11-09):
  done "You're all set. Your Inspyx plan has started. Tap ✓ at the top to go back to the app.",
  back "All done. Tap ✓ at the top to go back to Inspyx.",
  canceled "No charge was made. Tap ✓ at the top to go back to Inspyx."
- **No longer on the home page:** the "Apply for the pilot" button to the Google Form
  "Inspyx Pilot Application" (owned by support@). The waitlist form takes its place. The pricing
  page still links the Google Form.

### Checking it

From the repo's top folder:

```
node tools/serve.js &            # the site at http://localhost:4173/, with clean URLs like Vercel's
node tools/check_home.js         # 66 self-checks: form, calculator, Stripe messages, keyboard, tap targets, motion off, the Spex Business requests, the Spex conversation, tablet and wide layouts
node tools/shots.js out 390 844 -- t:1 t:1.9 desk:0.4 talk:0.6 5650   # pictures at film moments, points in the Spex Business requests or the Spex conversation, or scroll positions
node tools/shots.js out 390 844 2 --bars=180 -- desk:1      # the same phone with its browser's bars showing: the screen people really see first
node tools/make-images.js        # redraws the tab icons and the link-preview picture

# the real page against the mock-up it was built from, frame by frame
git fetch origin claude/home-page-mockup && git show FETCH_HEAD:mockup/preview.html > /tmp/mockup.html
node tools/compare_mockup.js /tmp/mockup.html /tmp/compare                   # as visitors get it
node tools/compare_mockup.js /tmp/mockup.html /tmp/compare --same-pictures   # with the mock-up's own report pictures
```

The checks never send a sign-up: the waitlist call is caught and answered by the test.
`tools/make-images.js` writes `assets/share.png`; save it as `assets/share.jpg` (JPEG, quality 88).
The tools need Playwright 1.59 (`npm i playwright@1.59.1` in a folder of its own, then
`NODE_PATH=<that folder>/node_modules`).

### Words waiting for his OK

Drafted by Claude on 2026-11-12 for the Spex Business scene. None is approved yet.

- The card's paragraph: "A request comes in by email or through the form on your website. Spex
  Business reads it, books the job on your calendar and writes back with the time and your price."
  (It replaces "Spex Business writes your replies, schedules your jobs and answers questions about
  your business. You read it, tap Send and get back to work.", which he approved on 2026-11-11.)
- In the film: "Email from Dana, an agent" / "Can you inspect 412 Palm Ave on Friday afternoon?";
  "Spex Business replied" / "Friday at 2:00 PM is open. The inspection is $425."; "Your website
  form, from Marcus" / "I need a pre-listing inspection early next week."; "Spex Business replied"
  / "Monday at 10:00 AM is open. The inspection is $375."
- The calendar: "Your calendar", "1 booked" to "3 booked", "Tomorrow, 9:00 AM", "Friday, 2:00 PM",
  "Monday, 10:00 AM", and the tags "Phone", "Email", "Website".
- For screen readers only: the sentences around those lines in the `data-desk` block.

### The test address

The Vercel project `inspyx-site-test` (prj_IJHVH8wbMeOhNA0X2yvwyI68jRHI, same team) builds this
folder from GitHub: every branch gets its own address, and nothing there is inspyx.com. Every
address on it asks for a Vercel sign-in; a share link (good for 23 hours) lets Moises open one on
his iPhone without signing in. It was made on 2026-11-11 for testing in Safari on a real phone.
The form at a test address is the real one and saves to the live waitlist: addresses at
inspyx.com or example.com are marked as tests.

### Before publishing

- The Spex Business scene's words are approved (see "Words waiting for his OK"), or changed to
  the words he gives.
- The guarantee's wording (W9, W10) is approved and in `pricing.html` and `terms.html`, or the
  guarantee line and its condition are off the home page.
- `privacy.html` says "Last updated" with the day the pages go live.
- The design checklist has been walked through, test by test (the Claude Project "Inspyx",
  `claude/website-design-checklist.md`).
- Stripe's card setup sends an inspector back to `/?payments=done`, or `/?payments=again` when
  the setup link ran out (the app's `payments` function). No page answers either yet: neither
  inspyx.com (checked 2026-11-11) nor this page, which answer only `?billing=`. The two messages
  are item 6 of "Wording Waiting for Your OK (2026-11-10)" in Drive and wait for Moises's OK.
  Once approved they go on this page the way the three `?billing=` messages do. The branch the
  other chat named for them, `claude/payments-return`, is not on GitHub.
- Upload every file in this folder together to the Vercel project `inspyx-coming-soon`.

## The other pages

Since 2026-11-09: four more pages, served with clean URLs (vercel.json cleanUrls):
/pricing (founding price $69 a month or $649 a year, 30 days free),
/refunds (cancellation and refunds), /terms and /privacy, sharing
assets/page.css. Every page's footer links all four and gives the business
line (888) 772-2919. Stripe's public business details link /terms and /privacy.

Since 2026-11-11 (on the same branch): each of the four carries the site's icons, a canonical
link and link-preview tags made from its own title and description. Their words are unchanged,
but for one sentence added to the privacy page: what the waitlist keeps (approved by Moises on
2026-11-11, item W8).
`404.html` is the page a wrong address gets. `robots.txt` lets every reader in, and
`sitemap.xml` lists the five pages.
