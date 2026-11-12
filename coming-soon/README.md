# coming-soon/ — what inspyx.com serves

Since 2026-11-08 ~02:15Z, inspyx.com is served from this folder, in place of the old
"Inspyx Voice" site (Replit, 34.111.179.208).

**Since 2026-11-12, about 11:42Z, a push to the `main` branch publishes this folder to
inspyx.com.** Moises approved that change the same day ("Yes, all four"). Before it, pushing to
GitHub changed nothing live.

- Vercel project: `inspyx-coming-soon` (prj_gzZo96kf3nQclwNHhgVbA4zGXiuK), team moises-avilas-projects.
  It is connected to this repo, with `coming-soon` as its root directory and `main` as the branch
  it publishes. Every other branch and every pull request gets a private build of its own on
  that project (a Vercel sign-in or a share link opens it).
- So, to change the site: open a pull request, check its private build, and merge it once Moises
  has said to publish. Never push to `main` directly.
- The way back after a bad publish: put the deployment that was live before it back in its place
  (Vercel keeps them; "Promote" on that deployment), then put the repo right.
- Until 2026-11-12 the project took files uploaded through Vercel's API, not from git. Its first
  deployment was dpl_DjvxehQCQcNBswFpEmzR6KSa8psh and its last one made that way is
  dpl_HkkT16HjoTXs2zqdVSodMsVDN4hP (2026-11-09), the "Pilot coming soon" page with the pricing
  and policy pages.
- Domains on that project: inspyx.com (serves the site), www.inspyx.com (308 to inspyx.com).
- DNS at Porkbun: A @ and A www changed from 34.111.179.208 to 76.76.21.21. Mail records untouched.

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
  and every line in the film) are Claude's wording. He approved them the same day: see "Words
  approved on 2026-11-12" below.
- **Mia's scene became a phone call the same day**, at his word ("Yes, do Mia"), so that all three
  scenes are told the same way: two parties talking, then what came of it. The caller's two
  questions and Mia's two answers are Claude's wording, and he approved them that day too.
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
- **Mia's scene is a phone call** since 2026-11-12, at his word ("Yes, do Mia"). In the mock-up
  three small chips came up over the truck: "Incoming call", "Mia answered", and the job on the
  calendar. Those three are still there, with the call between them: the caller asks what callers
  ask (the price, then a time) and Mia answers, the caller's words in white cards and Mia's in
  black ones, the way the Spex scene shows a conversation. The phone on the dash rings until Mia
  answers, stays lit through the call and dims once the job is booked. The time she books,
  "Tomorrow, 9:00 AM", is the first line of the calendar in the Spex Business scene, marked
  "Phone". The scene's stretch of page is 2,300 px. On a 390 x 844 phone the camera stops exactly
  where it did in the mock-up.

The comparison now leaves all three scenes with a sequence out, from the moment each one's clock
stops, and compares what follows them further down the page. Of its 11 frames (measured on
2026-11-12 with `--same-pictures`):

- 3 are identical to the mock-up to the last pixel;
- 4 differ only where the inspector on the roof is drawn (the camera arriving at the truck, up to
  the moment the phone starts to ring, is among them);
- 3 differ in at most 150 pixels, by at most 10 steps of 255, inside the three tilted report
  pictures. Nothing in the page changed there: the browser draws a tilted picture a touch
  differently once it sits more than about 8,000 px down a page, and Mia's longer stretch pushed
  the pictures past that. The real page against itself shows the very same 150 pixels when only
  Mia's stretch is set back to 1,300 px, and none at 2,100 px or more;
- one differs in the same 8 pixels as before.

- `index.html` holds every word and all the styles. `assets/home.js` draws the film and runs the
  calculator and the form. No libraries, no web fonts, no cookies, no trackers.
- **Phones:** the film fills the screen behind the page (a fixed canvas) and glass cards tell the
  story over it. The page scrolls the normal way. The canvas is as tall as the screen with the
  browser's bars tucked away; the scene is composed for the shorter screen you see first.
- **Behind Safari's bar on an iPhone** (iOS 26): Safari's own bar floats over the bottom of the
  page, and behind it Safari draws only the page that scrolls. A picture pinned to the screen,
  like the film, stops at the bar, so the page's white ground showed there as a strip under the
  street: about 98 px tall with the bar open, 58 px with it tucked away (measured on 2026-11-12 in
  the iOS Simulator, iPhone 17, iOS 26.2; making the film taller did not help). Since then the
  story's own ground (`[data-story]`) takes the colour of the film's last row, set by `home.js`
  as the film is drawn: the street in the light of the hour, the wall in the Spex scene. Everywhere
  else that ground lies hidden behind the film, and on wide screens it is not set.
- **Wide screens (860 px and up, at least 520 px tall):** the words sit on the left and the film
  plays in a window on the right.
- **Between the two** (tablets held upright, narrow windows): the phone page, footer included, centred on a
  dark ground.
- **The film** is drawn in code. Scrolling sets the film time: 1 at the top of the page, then one
  unit for each scene's stretch of page (`data-scene="1"` to `"4"`). With "reduce motion" on, each
  scene holds still at its start and then at its end.
- **Three scenes have a sequence in them**, and a longer stretch of page for it: Mia's scene
  (2,300 px), the Spex Business scene (2,100 px) and the Spex scene (2,400 px). In each, the
  film's clock runs its usual 1,300 px with a pause in the middle, and the sequence plays through
  the pause (`SEQ_HOLD` in `home.js` says where each clock stops). With "reduce motion" on, each
  piece of a sequence is a still of its own. A sequence starts once the page's card has settled.
  On a very tall window (a large monitor at full scale, or one turned upright) the card settles
  late, so there the sequence starts sooner and always keeps 900 px of its own inside its
  stretch. Until 2026-11-12 it ran on past the end of the stretch on windows taller than about
  1,540 px, and was cut off as the next scene came in.
- **The phone call in Mia's scene** is written in `index.html` (the block marked `data-call`,
  hidden from sight and read by screen readers): the caller's lines are marked `data-who="call"`
  and Mia's `data-who="mia"`, and the block itself carries the words of the small cards
  (`data-ring`, `data-answered`, `data-booked`, `data-booked-note`). The film draws those very
  words, so to change one, change it there; `data-booked` must stay the same as the first
  `data-when` of the calendar in the next scene (a self-check says so). The cards hang between
  the eave, where he kneels on the roof, and the roof of the truck. That gap belongs to the
  drawing (the house and the truck sit on two layers that move almost together), so it holds one
  question with its answer and no more, and the cards are sized to it. Where the page's own card
  comes lower than the eave (a phone with its browser bars showing), the truck sits lower on the
  screen to keep the gap; on a small phone there is room for one card at a time, and each takes
  the place of the one before. What the scene promises is what the page's own card says, which
  Moises approved on 2026-11-11: Mia "picks up every call, answers the usual questions and books
  the job on your calendar". The Mia that is built today answers, quotes from the inspector's
  price list, puts the caller through to the inspector and takes messages; it does not book
  (`backend/supabase/functions/mia-webhook/core.ts` in the app's repo, read on 2026-11-12 at
  0edf7a8: "No booking"). By his decision of 2026-11-08, booking comes once Inspyx holds the
  inspector's calendar. The page's tag says "Arrives with the pilot".
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
node tools/check_home.js         # 90 self-checks: the promise and its terms, form, calculator, Stripe messages, keyboard, tap targets, motion off, Mia's phone call, the Spex Business requests, the Spex conversation, the ground under the film, very tall windows, tablet and wide layouts
node tools/shots.js out 390 844 -- t:1 call:0.5 desk:0.4 talk:0.6 5650   # pictures at film moments, points in Mia's phone call, the Spex Business requests or the Spex conversation, or scroll positions
node tools/shots.js out 390 844 2 --bars=180 -- desk:1      # the same phone with its browser's bars showing: the screen people really see first
node tools/make-images.js        # redraws the tab icons and the link-preview picture

# the real page against the mock-up it was built from, frame by frame
git fetch origin claude/home-page-mockup && git show FETCH_HEAD:mockup/preview.html > /tmp/mockup.html
node tools/compare_mockup.js /tmp/mockup.html /tmp/compare                   # as visitors get it
node tools/compare_mockup.js /tmp/mockup.html /tmp/compare --same-pictures   # with the mock-up's own report pictures
```

The checks never send a sign-up: the waitlist call is caught and answered by the test.

**Undo checks** (`tools/undo_checks.py`, since 2026-11-12) test the checks themselves: the script
breaks the page one way at a time (Mia never answers, the calendar tag is changed, a small phone
stacks the cards anyway, and so on), runs the self-checks, and counts the break as caught if a
check fails. A break nobody catches means a check is missing. The work must be committed first.

```
python3 -I tools/undo_checks.py .                     # every break in its list, about 25 minutes
python3 -I tools/undo_checks.py . very tall window    # only the breaks whose name holds these words
python3 -I tools/undo_checks.py . --part=0/2          # half the list; the script's own notes say how to run the other half on a second copy
```
`tools/make-images.js` writes `assets/share.png`; save it as `assets/share.jpg` (JPEG, quality 88).
The tools need Playwright 1.59 (`npm i playwright@1.59.1` in a folder of its own, then
`NODE_PATH=<that folder>/node_modules`).

### Words approved on 2026-11-12

Drafted by Claude on 2026-11-12. Moises approved all of them, as written, at about 10:53Z that
day. Asked "Are the words in both new scenes OK as written?", he answered: "Yes, all". To change
one of them now is to change approved wording, which is his to decide.

For Mia's scene (the phone call):

- "Caller" / "How much for a 2,000-square-foot house?"; "Mia" / "A house that size is $425.";
  "Caller" / "Can you come tomorrow morning?"; "Mia" / "Yes. You're booked for 9:00 AM."
- For screen readers only: the sentences around those lines in the `data-call` block.
- Not new: "Incoming call", "Mia answered", "Tomorrow, 9:00 AM" and "Booked on your calendar"
  were in the mock-up he approved. They are now written in `index.html` and no longer in
  `home.js`.

For the Spex Business scene:

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

And the header's link on wide screens: "Pricing".

**The guarantee, approved the same day at about 11:37Z.** Asked four things at once (the
wording, two questions about it, and how to publish), Moises answered: "Yes, all four".

- W9, the section "Faster reports, or three months free" on the pricing page, and W10, the
  sentence added to section 11 of the Terms, are approved as written (the drafts of 2026-11-11,
  Drive: "Wording Waiting for Your OK — Website, Part 2: the Guarantee"). They are in
  `pricing.html` and `terms.html` since that day. A self-check holds them there word for word for
  as long as the home page makes the promise.
- The promise is measured during the inspector's 30 free days. If their reports are not faster,
  the three free months follow straight after those 30 days, or they walk away having paid
  nothing.
- The 10 pilot inspectors count as set up by Inspyx. Each one's starting report time is written
  down with them when they start: without that, the promise has nothing to be measured against.

### The test address

The Vercel project `inspyx-site-test` (prj_IJHVH8wbMeOhNA0X2yvwyI68jRHI, same team) builds this
folder from GitHub: every branch gets its own address, and nothing there is inspyx.com. Every
address on it asks for a Vercel sign-in; a share link (good for 23 hours) lets Moises open one on
his iPhone without signing in. It was made on 2026-11-11 for testing in Safari on a real phone.
The form at a test address is the real one and saves to the live waitlist: addresses at
inspyx.com or example.com are marked as tests.

### Before publishing

- Moises says to publish. Nothing else puts this page on inspyx.com. On 2026-11-12 he said to get
  it ready ("Yes, get it ready"), which is not the go.
- "Last updated" on `privacy.html` and `terms.html` says the day the pages go live, and
  `sitemap.xml` gives that day for the home page and the pricing, terms and privacy pages. They
  say 2026-11-12, set that day. If the go comes on another day, they are set to that day.
- The design checklist has been walked through, test by test (the Claude Project "Inspyx",
  `claude/website-design-checklist.md`). That note cannot be read from Claude Code on the Mac.
  What was checked there on 2026-11-12 is listed under "Checked on 2026-11-12" below.
- Stripe's card setup sends an inspector back to `/?payments=done`, or `/?payments=again` when
  the setup link ran out (the app's `payments` function). No page answers either yet: neither
  inspyx.com (checked 2026-11-11) nor this page, which answer only `?billing=`. The two messages
  are item 6 of "Wording Waiting for Your OK (2026-11-10)" in Drive and wait for Moises's OK.
  Once approved they go on this page the way the three `?billing=` messages do. The branch the
  other chat named for them, `claude/payments-return`, is not on GitHub. This does not hold the
  page back: today's live page does not answer them either.
- **How it gets published: by merging the pull request into `main`.** The live project was
  connected to this repo on 2026-11-12 at about 11:42Z, in Moises's Chrome, on his yes: the root
  directory `coming-soon` was saved first, then the repository was connected; the branch it
  publishes was already `main`. The old way, pasting files in through Vercel's connector, could
  not carry this page: it has nine pictures (444 KB), and pictures cannot be pasted. Checked
  before connecting: the live site was main's `coming-soon/` byte for byte (7 files of 7).
  Checked right after: Vercel had started no build, and the live site was still those same 7
  files.

### Checked on 2026-11-12, before asking for the go

- **In Safari on an iPhone** (the iOS Simulator on the Mac: iPhone 17, iOS 26.2), the first time
  the two new scenes met real Safari. The first screen and all three scenes draw as built, with
  no error, with Safari's bar open and tucked away, and a scroll by finger drives the film. One
  fault was found and fixed: the white strip behind Safari's bar (see "Behind Safari's bar on an
  iPhone" above). A real iPhone has not been tried that day; its speed is the one thing the
  Simulator cannot show.
- **The real form against the live waitlist.** One sign-up from the page, with an address at
  example.com: the database answered "ok", the page showed "You're on the list.", and the row is
  there, marked as a test, with the two taps, the page and the ad's name. The same address again:
  "ok", no second row, counted as a repeat. The list was empty before; that row is its only one.
- **The build that would go live.** Vercel's test project (`inspyx-site-test`) builds this branch
  on every push. Its build of commit 545c822 serves all 21 files as they are in the repo, byte
  for byte, but for one line Vercel adds to a private build for its own toolbar. A visitor's
  phone downloads 11 KB for the page and 28 KB for the film's code, compressed.
- **Nobody is told when someone joins the waitlist.** The row is kept; no email goes out.
  Claude can read the list for Moises at any time. A message to him on each sign-up needs a way
  to send email, which is not chosen yet.

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
