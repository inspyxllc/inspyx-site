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

**Live on inspyx.com since 2026-11-12, 11:58:20Z.** Moises said "Publish" that day, and the page
took the place of "Pilot coming soon". How it was published, and what was checked, is under
"How it was published" below.

- Moises approved the new words on these pages that day (the list W1 to W8 in the Drive folder
  "Claude Inspyx Development").
- The promise's terms (W9 and W10) are on the pricing page and in the Terms since that day: see
  "Words approved on 2026-11-12" below.
- The Spex scene's conversation is his direction and Claude's wording. He approved the scene and
  its lines as shown on 2026-11-11 ("Yes, that's well done."). On 2026-11-12 the scene moved into
  a dark attic at his word, with two new phrases that he approved the same day.
- **The report section shows the web report as a product shot** (built 2026-11-12 on the branch
  `claude/report-section-web`, and published that day at his word: shown this third draft on his
  private preview and in two pictures, and asked "Publish the redesigned report section to
  inspyx.com?", he answered "Yes, publish it" at 16:29:45Z). His words earlier that day, looking
  at the live page: "I wanted some of those to include the web dash report. And I wanted to include
  some of the special features. Like videos and live photos and things like that. Slow-mo photos
  for the flickering lights." Asked "Show the web report on the home page now, tagged 'Arrives with
  the pilot'?", he answered "Yes, show it" (14:26:55Z).
  - **His second word on it, 15:16:45Z,** as the first draft was about to be published: "I want
    a realistic address, not 1234 Main Street. It doesn't have to be a address, but it has to be
    realistic. ... I want you to also include my signature, because the reports should have, in
    fact, should have my picture and a signature of the, not just of mine, but of the inspector.
    Create whatever signature you think matches my name". He sent his photo with it.
  - **His third word, 15:32:49Z,** as the second draft (three flat screenshots, fanned) was about
    to be published: "I still don't like how literal it is. I mean, can't we make it at least look
    nicer? Some 3D graphics or something cool? And by the way, that honking PDF button up top, and
    the just like blank inspection company. Come on, we can do better than this. Make sure
    everything looks consistent and nice. This is going on my website for people to sign up".
  - **What the section is now: one stage** (`.shot`, at the top of the white sheet), in CSS 3D:
    - a phone that stands at an angle and shows the web report's first screen (the company's mark
      and name, the house, the address, the inspector's card with his picture);
    - three white cards that float in front of it: the photo of one finding (the active leak in
      the attic) marked as a 12-second video; the inspector's signature with his name and license;
      and "Download the PDF";
    - a soft glow behind and a shadow on the floor under the phone.
    The screenshots are no longer laid out as pictures to read: they are parts of one scene.
  - **How it moves.** The phone turns toward the reader as the stage scrolls in, and the cards
    slide in from the sides: `home.js` writes `--p` (0 to 1) on the stage and the stylesheet does
    the rest. With a mouse, the scene leans a little toward the pointer (`--mx`, `--my`); a touch
    screen never does. The cards drift slowly, each at its own pace. With "reduce motion" on, the
    stage is still, in its resting pose.
  - **Three measures that must stay as they are:**
    - On a phone the stage runs from edge to edge and cuts off sideways what stands out
      (`overflow-x:clip`): a card on its way in must never make the page wider than the screen.
    - On a phone the phone stands 88 px above the sheet's top edge, over the film. Not more: the
      film's last card leaves about 104 px ahead of the sheet (`.scene-last`), and a phone standing
      higher covers the card's last line on its way in.
    - On a wide screen the stage stands inside the sheet. Standing out, it covered a corner of the
      film's picture. There too it runs the sheet's full width (into its 40 px side padding): at
      860 px the stage's own cut otherwise shaved the two side cards.
    Between 600 px and the wide layout (a tablet upright, a phone on its side) it is the phone's
    scene, 1.3 times the size.
  - **How the pictures are made:** first `tools/report_sample_touch.js` prepares the sample, then
    `tools/report_pictures.js` takes the pictures from the real report page (branch
    `claude/web-report-bar`: the report page with its quieter top bar) showing it: the first
    screen, the finding's photo, and the signature. The sample is private and is not in this repo.
    - The address is "7314 Willet Marsh Ct.", Tampa, FL 33635. It is invented. On 2026-11-12 the
      Census Bureau's address service knew no such address and no street of that name. (The
      placeholder it replaces, "1234 Main St.", matched a real address in Tampa.)
    - The inspector is Moises himself: his name, his photo on the inspector's card, and his own
      Florida license number, HI18352 (a public record). He sent the photo for this. Only the
      rendered picture is in this repo, not the photo's file.
    - The signature was made for his name in a pen-like hand (the Mac's "Savoye LET", tilted a
      little). It is not his real signature.
    - The company, "Avila Home Inspections", is invented (a web search on 2026-11-12 found no
      Florida business of that name; that is not proof there is none). So are the client "Rachel
      Whitaker", the agent "Dana Okafor", the telephone numbers (555 numbers) and the date. The
      email addresses are taken out.
    - The sample's line "Associations: InterNACHI (CPI)" is taken out (`--no-associations`): with
      a real person as the inspector, the page must not say he belongs to a body he has not told
      us he belongs to.
    - Two things are added to what the report page draws: the number plate of the car in the
      cover photo is blurred, and, on the home page's own card, the video's marks on the finding's
      photo (a "Video" label, a play button, "0:12").
  - **What is ahead of the app,** and why the section carries the tag "Arrives with the pilot":
    no client can open a web report yet (the page is written, its tables are in the database,
    its function is not deployed, and the app cannot publish a report); and the app records
    video and slow motion today, but a report shows a clip only as its still frame. So the
    sentence under the stage promises that clips will play in the web report by the pilot.
  - **Not shown: "live photos".** The app has none in Apple's sense (a photo that moves). He has
    not said yet which kind he means.
  - **The words** were drafted by Claude. He was shown the section with them, and his "Yes,
    publish it" (16:29:45Z) was his answer to the section as a whole; he was not asked about
    them one by one. They are: "Your client opens the report as a web
    page, with the PDF one tap away. A dripping leak plays as video, a flickering light in slow
    motion."; the tag "Arrives with the pilot" in this new place; "From a real Inspyx report,
    with the details anonymized." (it was "Pages from a real Inspyx report, with the details
    anonymized."); on the cards: "Video", "0:12", "Recommendation", "Active leak", "Attic",
    "Inspector of record", "Moises Avila", "License HI18352", "Download the PDF"; and the three
    pictures' descriptions for screen readers. In the sample itself: everything listed above as
    invented.
  - **Asked of him with the publish, not answered yet:** whether the invented company name
    "Avila Home Inspections" stays; whether "Moises Avila" is the spelling he wants (he dictated
    "Moses"); what he means by "live photos".
- **The Spex Business scene was rebuilt on 2026-11-12**, at his word: "we don't have a section that
  includes Spex Business yet… something like the email auto scheduler, that schedules in jobs for
  you based on emails you receive or website forms filled out". Its new words (the card's paragraph
  and every line in the film) are Claude's wording. He approved them the same day: see "Words
  approved on 2026-11-12" below.
- **Mia's scene became a phone call the same day**, at his word ("Yes, do Mia"), so that all three
  scenes are told the same way: two parties talking, then what came of it. The caller's two
  questions and Mia's two answers are Claude's wording, and he approved them that day too.
- Before a change is published it can be seen at a private address: every pull request gets a
  build of its own on the live Vercel project and on `inspyx-site-test` (see "The test address"
  below).

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
  and his sleeve is the navy shirt he wears in the Spex scene.
- **The Spex scene was redrawn** the same day, at his word: "I want the iPhone normal sized. I
  don't need a close-up of this ridiculously undetailed camera app. Secondly, the captions should
  be the inspector and specs talking to each other". He now stands at the panel with the iPhone
  in his hand at its real size, and the scene is a conversation: his words in white captions,
  Spex's answers in black ones. The scene does what Spex says: the camera comes up, the light
  comes on, the flash fires. The scene's stretch of page is 2,400 px, where the others are 1,300.
- **The inspector at the panel was redrawn** on 2026-11-12, at Moises's word. He saw the live
  page on his iPhone: "the guy's body is abnormally wide and long ... he doesn't look like a
  normal human being". His body was one orange slab, two and three quarter heads wide, that ran
  off the bottom of the screen with no waist and no legs, and his arms were two thin bars. On a
  phone with Safari's bar tucked away the slab was four heads long: on a person that reaches the
  knees. He is now drawn to a man's proportions, counted in heads: shoulders a little over two
  heads wide with his arms, the hem of his vest three heads below the top of his head, his jeans
  and two legs under it, and arms that are thicker above the elbow than below it. His head, his
  hand and the phone are where they were, because the captions' lines end at them. The figure is
  `_shotD` in `home.js`; a figure that is cut off by the bottom of the screen needs its waist
  and legs drawn all the same, because a phone shows more of it once its bars tuck away.
- **The Spex scene moved into a dark attic** on 2026-11-12, at Moises's word (live since
  13:47:32Z that day, pull request 11): "it'd send a
  bolder statement to have them like in an attic and have you talk to specs and have them turn
  the flashlight on and the flash on to take photos and basically light up the dark attic".
  Until then he stood at an electrical panel on an outside wall, in daylight.
  - **What happens.** The attic is dark: a little daylight through the vent in the far gable,
    his outline, and his phone's screen. "Spex, open the camera." brings the camera up, still in
    the dark. "Spex, put the flash on, put the light on, and zoom in 4×." brings Spex's light on:
    it opens a patch of the attic and shows a stain under the roof, where a vent pipe goes
    through it, and the phone's camera closes in on it. "Take it." fires the flash, which lights
    the whole attic for an instant. The photo is filed under Attic.
  - **It is true to the app.** The app's camera has a work light and a flash that Spex switches
    (`lib/src/shell/phone_camera.dart` in the app's repo: "Work light and flash."). The light
    belongs to the camera, which is why the camera opens first.
  - **How it is drawn** (`_shotD` in `home.js`). The whole attic is drawn as it looks lit, in
    one-point perspective toward the far gable: every pair of rafters is the far gable's
    triangle again, some number of times nearer. Then the dark is laid over it as one layer:
    even before the light comes on, with a bright patch where the light falls once it is on, and
    almost gone for the instant of the flash. The stain is `_stain`; it is drawn flat and laid on
    the roof's slope, and drawn again, straight on, in the phone's camera view.
  - **The page under the film** on a phone takes the colour of the attic's floor at that moment
    (`_atticGround`): dark, a little lighter once the light is on, bright for the flash.
  - **The words.** Five of the scene's lines are as Moises approved them on 2026-11-11. Two
    phrases are new with the attic: "Spex, open the camera." (it was "Spex, take a photo of that
    breaker.") and "Filed under Attic" (it was "Filed under Electrical"). He approved both, and
    the scene, on 2026-11-12 at 13:41:27Z: see "Words approved on 2026-11-12" below.
  - **Checks.** Three self-checks read the film's own brightness: the attic is dark before the
    light, the light opens a patch that is bright against the half-dark, and the flash lights
    all of it.

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
- **Behind Safari's bars on an iPhone** (iOS 26). Safari floats its own bars over the page and
  colours what shows behind them itself. Measured on 2026-11-12 in the iOS Simulator (iPhone 17,
  iOS 26.2), with test pages in loud colours:
  - behind the bottom of the screen, with Safari's bar open: the page that scrolls. A picture
    pinned to the screen, like the film, stops at the bar (making the film taller did not help);
  - behind the bottom, with the bar tucked away, as it is while you scroll: the `body`'s
    background. A strip pinned to the bottom of the screen changes nothing there, and neither
    does the `html` element's background;
  - behind the top: the background of whatever is pinned to the top edge when the page loads,
    here the film's box as the stylesheet colours it, morning blue. Safari reads that once. A
    colour set later by script, a forced new layout, a nudge of the box and a `theme-color` tag
    were tried, and none changed it. So the top stays morning blue down the whole page, over the
    wall of the Spex scene, the dusk and the black waitlist too. That is known and left as it is.

  Left alone, the bottom was a white strip under the street: about 98 px tall with the bar open
  and 58 px with it tucked away. So on phones `home.js` (`_bars`) keeps two grounds in step with
  the picture: the story's own ground (`[data-story]`) takes the colour of the film's last row,
  the street in the light of the hour or the wall in the Spex scene; and the `body` takes the
  colour of whatever lies at the bottom of the screen: the film's last row, the white sheet, the
  black waitlist, the white footer. Everywhere else those grounds lie hidden, and on wider
  screens nothing is set. The first try, published at 11:58Z that day, set only the story's
  ground and so mended the strip only while Safari's bar was open; the body's ground followed
  the same day.

  **Corrected the same day, after a scroll by finger down the whole live page (14:00Z to 14:15Z):
  the strip does not follow the film.** The page's code does what is written above: a copy of
  the page that reported its own colours while it was scrolled showed the `body` and the story
  dark in the attic, bright for the flash, and white over the sheet. But with Safari's bar at
  the bottom, Safari takes the colour for what shows behind the bar once, early in a visit, and
  keeps it. On the live page the strip stayed the first scene's street grey (84, 80, 80) in the
  attic and under the white sheet; on the copy it stayed (84, 88, 92) in two runs. Tried, and
  none of it made Safari take a new colour: the page's own later changes of the `body`'s
  colour; the bar opening again; the bar tucking away again; a change of one step and back once
  the scroll had come to rest. Only with the page at rest and the bar never yet tucked away did
  a colour set by script show, through the open bar.
  - **What a visitor sees** on an iPhone with Safari's bar at the bottom (the way iOS ships): the
    strip under the bar suits the street scenes, is lighter than the attic's floor, and is grey
    under the white sections. On an iPhone with the bar at the top (Moises's) there is no strip:
    the page runs to the bottom of the screen.
  - **What was wrong in the claim.** That the body's ground makes the strip follow "the white
    sheet, the black waitlist, the white footer" was checked in Chromium, where the self-check
    reads the colour the page sets, and in Safari only in the first scenes, where the colour
    hardly changes. The self-check proves the page's code, not what Safari draws.
  - **Two tests spoiled themselves that day,** both in the same way: the test page changed the
    page. In the morning a probe put a fixed box of its own on the page; in the afternoon a
    reporting page switched `_bars` off. A page for testing this must add nothing and change
    nothing: it may only report (a `fetch` to the test server), and the scroll must be by finger.
  - **Open.** Either find what makes Safari take a new colour, or decide which one colour serves
    the whole page best. Until then `_bars` stays as it is: the colour Safari keeps is the
    street's, which suits most of the film.
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
- **Safari's top bar follows the page (the lid; built 2026-11-12, published at his word).** On an iPhone
  the strip with the clock, the Wi-Fi and the battery takes the colour of what lies under it: the
  sky's blue at the top of the page, the dark of the attic, white over the white sheet, black over
  the waitlist.
  - **His words.** 16:41:27Z: "that white banner up top ... the banner is like a light blue that
    matches the sky ... Is that actually possible, or does it have to be white?" 17:17:45Z: "if this
    is something that each person has to do in the settings of their phone, then it's not worth it.
    This has to be something that comes with the website." 17:27:23Z, with two screenshots: "On
    Google Chrome, it's white, but on Safari, it is light blue. Even though it's not the exact light
    blue, needed to perfectly blend into the background." 17:39:02Z: "when you're in the attic, the
    whole scene turns dark. I would like to know if I can get that thing to switch from light blue
    to dark so that it can basically match the site ... a fully immersive experience". Shown four
    pictures from iOS 27 and asked whether to publish it when Vercel's limit frees: "Yes, publish
    it" (18:08:34Z).
  - **How it works.** A strip (`.lid`, `[data-lid]`) is pinned to the top edge of the screen, 12 px
    deep, full width, over everything. `home.js` gives it the colour of what lies under it: the
    film's top row (read from the film's own picture at most every 160 ms: the middle of five
    points across the row, so that a star is not taken for the sky), then white, black and white by
    the same marks that colour the body for the bottom of the screen. Safari colours its top bar
    from that strip and follows it. Because the strip is the film's own top row, it cannot be seen.
  - **What was measured** (iOS simulator, iPhone 17, 2026-11-12, with parts of the page painted in
    loud colours): on iOS 26.4 the body, the html element, the film's box and a theme-color tag all
    turned dark and the bar stayed blue; with the strip alone it turned dark. On iOS 27.0 a red body
    left the bar as it was, and a green strip made it green, also when the strip was added after
    the page had loaded. The bar takes the new colour a moment after scrolling stops. On iOS 27.0
    the page as built was then seen at four places: the sky, the attic, the white sheet, the
    waitlist. Earlier that day this manual and `home.js` said the top is read once per visit: that
    was true of everything tried then, and the strip had not been tried.
  - **For the first paint,** before the script runs, every other place a browser may read names
    one blue, `--sky` (#94B2CB): the theme-color tag (phones), the html and body grounds (phones)
    and the film's box. It is the film's top row as the page opens; a lighter blue showed as a band
    on his iPhone. A check holds `--sky` to the film's top row.
  - **Limits.** Chrome on an iPhone paints its own bars white for every site: no page can change
    that. The lid is switched on by the script on an iPhone only (`html.lid-on`): nothing else
    reads it. Seen in the simulator (iOS 26.4 and 27.0), not yet on a real iPhone. The self-checks
    hold the page's part (the strip's place and colours); what Safari then does no check can see.
- **The calculator** multiplies the visitor's own numbers. Nothing is sent anywhere. It starts at
  3 inspections a week, 1 hour writing each report, 1 call to voicemail a week and a $400 fee
  (so "3 hours a week" and "$1,600 a month"). Those are Moises's numbers, 2026-11-12 16:41:27Z: "I
  want that set to default three inspections a week, 1 hour writing each report, and one call to
  voicemail a week. Let's have the people raise that themselves so that it's more impactful on
  them how much they're missing out on." Before that it started at 8, 2, 5 and $400 (16 hours,
  $8,800), which were Claude's. The numbers stand twice, in `index.html` and in `home.js`, and a
  check holds the two equal. One hour reads "1 hour a week" (it read "1 hours").
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
  "Inspyx Pilot Application" (owned by support@). The waitlist form takes its place. Since
  2026-11-12 the pricing page's button goes to the waitlist too, and says "Join the waitlist" (see
  "Their new look"), so nothing on the site links the Google Form any more. The form itself is kept.

### Checking it

From the repo's top folder:

```
node tools/serve.js &            # the site at http://localhost:4173/, with clean URLs like Vercel's
node tools/check_home.js         # 92 self-checks: the promise and its terms, form, calculator, Stripe messages, keyboard, tap targets, motion off, Mia's phone call, the Spex Business requests, the Spex conversation, the ground under the film, very tall windows, tablet and wide layouts
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
python3 -I tools/undo_checks.py . --first=14          # only the first 14 breaks (the newest part of the page stands first in the list)
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

For the Spex scene in the attic, approved later that day, at 13:41:27Z. He had seen the scene's
five moments in a picture and on his private preview, with the two new phrases named. Asked
"Publish the attic scene, with its two new phrases?", he answered: "Yes, publish it".

- "Spex, open the camera." (his first line; it was "Spex, take a photo of that breaker.")
- "Filed under Attic" (the card at the end; it was "Filed under Electrical"), and the sentence
  for screen readers that goes with it: "Filed under Attic. Photo taken at 4×."
- Not new: "Camera open."; "Spex, put the flash on, put the light on, and zoom in 4×."; "Flash
  on, light on, 4×."; "Take it."; "Got it."; "Photo taken at 4×". He approved those on
  2026-11-11.

### The test address

The Vercel project `inspyx-site-test` (prj_IJHVH8wbMeOhNA0X2yvwyI68jRHI, same team) builds this
folder from GitHub: every branch gets its own address, and nothing there is inspyx.com. Every
address on it asks for a Vercel sign-in; a share link (good for 23 hours) lets Moises open one on
his iPhone without signing in. It was made on 2026-11-11 for testing in Safari on a real phone.
The form at a test address is the real one and saves to the live waitlist: addresses at
inspyx.com or example.com are marked as tests.

### How it was published (2026-11-12)

Moises said "Yes, get it ready" at 10:57:27Z, "Yes, all four" at 11:35:59Z (the promise's
wording, two questions about it, and connecting Vercel to GitHub), and "Publish" at 11:56:24Z.
The times of his words are taken from the session's log; the others from git, GitHub and Vercel.

- **The live project was connected to this repo** at about 11:42Z, in his Chrome: the root
  directory `coming-soon` was saved first, then the repository was connected; the branch it
  publishes was already `main`. The old way, pasting files in through Vercel's connector, could
  not carry this page: it has nine pictures (444 KB), and pictures cannot be pasted. Checked
  before connecting: the live site was main's `coming-soon/` byte for byte (7 files of 7).
  Checked right after: Vercel had started no build, and the live site was still those same 7
  files.
- **The page went live at 11:58:20Z.** `main` was moved forward from 097fb4e to 60fcc68, the
  commit of pull request 5 whose private build had been checked file by file (21 of 21). Vercel's
  production deployment is dpl_Fh6mTwE2S4HPipxiQWNRoHuNsJi2. Checked at 11:58:36Z: inspyx.com
  served all 21 files as they are in the repo, byte for byte; `README.md`, `vercel.json`, `tools/`
  and `backend/` are not served; www and http go to https://inspyx.com/. The self-checks run
  against the live site: 90 pass. The real form on inspyx.com, with an address at example.com:
  "ok", and the row is in the waitlist, marked as a test.
- **A fix for iPhones followed at 12:14:51Z** (pull request 6, commit 2fd63bf, deployment
  dpl_96uJXraTbbQXyeouhuJhDvdNQbY8): see "Behind Safari's bars on an iPhone" above. Checked at
  12:15:02Z: 21 of 21 files, and 92 self-checks pass against the live site. Seen in Safari on the
  live site with the bar tucked away: the street runs to the bottom of the screen. The undo
  checks for the fix, run from 12:13:51Z to 12:22:56Z: 4 changes of 4 caught.
- **How `main` is moved.** By pushing the pull request's checked commit to it
  (`git push origin <commit>:main`), when `main` is that commit's ancestor. GitHub then shows the
  pull request as merged, the commit that goes live is the very one that was checked, and no new
  commit is made. The merge button on github.com is not used: it makes a new commit, which is
  not the one that was checked. Every push to `main` makes a new production deployment, also one
  that changes only this manual; the served files are then the same as before.
- **How a build is checked file by file.** `python3 -I tools/bytecheck.py <commit> <address>
  [cookie jar]` fetches every file of `coming-soon/` from the address and compares it with the
  repo's copy at that commit. Run it on the pull request's private build before `main` is moved
  (the top of the script says how to get past Vercel's sign-in with a share link), and on
  https://inspyx.com afterwards. On a private build the home page carries one extra line of
  Vercel's own, which the tool reports apart; on the live site all 21 files must be the same.
- **The way back.** Vercel keeps every deployment, and putting an earlier one back takes no
  build: "Instant Rollback" (or "Promote") on it, in the project's list of deployments.
  dpl_Fh6mTwE2S4HPipxiQWNRoHuNsJi2 is the page as first published. On 2026-11-12 Vercel listed
  the deployments made from GitHub as rollback candidates, and not the last one made by upload,
  dpl_HkkT16HjoTXs2zqdVSodMsVDN4hP ("Pilot coming soon" with the pricing and policy pages);
  whether "Promote" works on that one was not tried. The sure way back to that page is through
  this repo: a pull request that puts `coming-soon/` back as it was at commit 097fb4e. Either
  way, put the repo right afterwards, so that the next push does not undo the step back.

**Later the same day,** each published the same way (a pull request, Vercel's private build of
it checked file by file, `main` moved to that commit, the live site checked file by file):

- 12:58:27Z, pull request 10 (963a09b): the inspector in the Spex scene redrawn. 92 self-checks
  pass against the live site.
- 12:57:37Z: the protection rule on `main` was repaired through GitHub's API. It now requires
  the check "Vercel – inspyx-coming-soon"; it had required "Vercel", a name no check has carried
  since more than one Vercel project builds this repo. Pushes since are accepted with no
  "Bypassed rule violations" line.
- 13:33:45Z, pull request 12 (b9667ef): the waitlist's notice (the manual and
  `backend/waitlist/schema.sql`; nothing served changed).
- 13:47:32Z, pull request 11 (7a5944c): the Spex scene in the attic, on Moises's "Yes, publish
  it" of 13:41:27Z. Production deployment dpl_72QztidzUdwBPBjetHWbtirBVHfL. Checked: 21 of 21
  files at 13:47:45Z; 95 self-checks pass against the live site (13:48:00Z to 13:52:10Z); the
  scene seen in Safari on a simulated iPhone 17, scrolled by finger, in the dark, lit and
  flash-lit. The way back to the page before the attic: "Instant Rollback" in Vercel to
  dpl_BsxkGQcME28jJAow1ACyC6wUG86w, then put the repo right.

### Still open after publishing

- When a page's words change, its "Last updated" line (the terms and privacy pages have one) and
  its date in `sitemap.xml` are set to the day the change goes live. They say 2026-11-12.
- **Inspyx is told of each new sign-up since 2026-11-12, 13:32Z** (Moises's yes that day: "Yes,
  all three"). After a new, real sign-up the database sends one line about it to a Google Form
  owned by the support account, "Inspyx waitlist: new sign-up", and Google emails the support
  address that the form has a new response (it came 31 seconds after the first test). The line
  gives the number of the sign-up, the two answers tapped, and the page and the ad or link that
  brought them. It never gives the email address, which stays in the database: so /privacy
  needs no new sentence for this, and Claude reads the list out on request. Test rows tell
  nobody. The code is the last part of `backend/waitlist/schema.sql`; the form's address is not
  in this repo, which is public, and is kept in the Supabase project's Vault as
  `waitlist_notice_url` (with that secret removed, no notice is sent and sign-ups go on).
- The page says "We'll email you when the pilot opens." Sending that email is still to be
  arranged: it needs the email service Moises has yet to pick.
- The top of the screen on an iPhone stays morning blue down the whole page (see "Behind Safari's
  bars on an iPhone").
- On an iPhone with Safari's bar at the bottom, the strip under the bar keeps the colour of the
  first scene's street all the way down the page: lighter than the attic's floor, and grey under
  the white sections (the same section, "Corrected the same day").
- The design checklist the website chat kept is a note in the Claude Project "Inspyx"
  (`claude/website-design-checklist.md`). It cannot be read from Claude Code on the Mac. What was
  checked on 2026-11-12 in its place is listed below.
- Stripe's card setup sends an inspector back to `/?payments=done`, or `/?payments=again` when
  the setup link ran out (the app's `payments` function). No message answers either yet: the
  page answers only `?billing=`. The two messages are item 6 of "Wording Waiting for Your OK
  (2026-11-10)" in Drive and wait for Moises's OK. Once approved they go on this page the way the
  three `?billing=` messages do.

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

### Their new look (built 2026-11-12; approved for publishing together with the top banner)

Moises approved the look as a mock-up on 2026-11-12 at 21:07:49Z ("Yes, that's it", to "Is this the look you
want for the pricing and policy pages?"). Shown pictures and a clip of the real pages built from it, and asked
"Publish the new pricing and policy pages together with the banner tomorrow?", he answered "Yes, together"
(2026-11-12 21:25:37Z). This branch stands on the top-banner branch, so one publish carries both, once
Vercel's daily limit has freed.

**What changed, and what did not.**

- The words did not change with the look. Not one sentence or head tag of the five pages (`pricing.html`,
  `refunds.html`, `terms.html`, `privacy.html`, `404.html`) is different, but for one button (next point).
  `tools/page_words.json` holds every sentence, link and head tag, and a self-check compares the served
  pages with it.
- One link changed, and then its words, each on his word. Asked "Should the pricing page's Apply button go
  to the waitlist instead of the Google Form?", Moises answered "Yes, waitlist" (2026-11-12 21:45:08Z): the
  plan's button goes to `/#waitlist`, the waitlist form on the home page. Asked "Should that button now say
  "Join the waitlist", as on the home page?", he answered "Yes, change it" (2026-11-12 22:01:40Z): it says
  "Join the waitlist" (it said "Apply for the pilot"). These are the only words of the five pages that
  differ from before the new look.
- The home page, opened at a place like that, stands there at once. Its head script marks the page
  (`data-arrive`) while it loads, and the stylesheet turns smooth scrolling off for that moment: gliding to
  the waitlist would first run the whole film past, about a second of it (measured). Once loaded, the page's
  own "Join the waitlist" buttons glide as before.
- The top is the home page's logo. On a wide screen it also has the four pages (the footer's own four
  links, the current one marked). On a phone it keeps to the logo, as the home page does; the footer has
  the four.
- `/pricing`: the opening and the plan stand on the home page's morning sky; beside the plan is the plan
  again as a card with depth. The card repeats the plan's own words (INSPYX, Founding inspector, $69 a
  month, or $649 a year, and save $179) and is hidden from screen readers, so nothing is read twice. Then
  "What your plan includes" as five tiles, "30 days free" as four ticks (ticks, not numbers: the four lines
  are not in time order), the promise as a dark band, billing and cancelling side by side, and Questions.
- `/refunds`, `/terms`, `/privacy`: the title on a short sky, a list of the page's own headings, and the
  text in one card. The list stands beside the text on a wide screen and stays in view; on a phone it stands
  above the text. Each heading has an address made from its words (`/terms#your-plan-and-payments`). If a
  heading is reworded later, keep its `id`: links to it may be out in the world.
- The page a wrong address gets has the same top and a sky panel.
- Two labels were added that only a screen reader says: "Pages" for the top links and "On this page" for
  the list of headings. Moises was told of both.

**How it is made.**

- `assets/page.css` is the whole look. It says no words; the tiles' badges and the ticks are drawn by it.
- `assets/page.js` is two small movements: the card leans to the pointer (it gives the page two numbers,
  `--mx` and `--my`, and the stylesheet does the rest), and the list of headings marks the section being
  read. A heading the reader chose stays marked until they scroll away, because a short last section can
  never reach the top by itself. With the file missing the pages read the same.
- The card takes its size from its own column (`cqw`), not from the window, so it is never cut off.
- The type is the home page's own (`-apple-system` and its fallbacks). Nothing is fetched from another
  site: a web font would send each visitor's address to its host, which the privacy page does not allow for.
- With motion turned off nothing floats, drifts or leans.
- One file is added to what the site serves: `assets/page.js`. This branch stands on the top-banner branch, which
  takes the hidden `/banner-test` page away, so the count stays 21: the live site's 21, less that page, plus this file.

**Checking it.**

```
node tools/serve.js &
node tools/check_pages.js                       # 72 self-checks, about 20 seconds
python3 -I tools/undo_checks.py . --pages       # breaks the five pages 27 ways, one at a time: each must be caught
node tools/check_home.js                        # the home page's checks: one of them holds the promise's terms on /pricing
```

`check_pages.js` checks, for each page, on a phone and on a wide screen: every word, every link, the
title and link-preview tags; that it loads with no errors and asks no other site for anything; that
nothing scrolls sideways; the top; tap sizes; the type. Then the pricing card (its words, its lean, motion
off) and the policy pages' list of headings (it is the page's own headings, it stays in view, choosing an
entry brings its section up and marks it).

**Changing a word on these pages.** Only with Moises's approval. Change the page, then run
`node tools/check_pages.js --keep` to write the new `tools/page_words.json`, and name his approval and its
date in the commit. A changed word without that fails the checks, which is the point.
One check on the home page (`check_home.js`) looks for the promise's lines in `pricing.html` as they are
written, tags included: `<h2>Faster reports, or three months free</h2>` must stay bare, with no class or id.

## Signing in on the website (/signin and /account)

Built 2026-11-12 on the branch `claude/web-signin`, after Moises's "Yes, start" (23:04:13Z) to "Start
building the website's sign-in tonight?". **Hidden on purpose**: no page links to it, the sitemap leaves it
out, and both pages ask search engines not to list them.

**Approved to go out hidden.** Asked "Add the hidden sign-in page to tomorrow's publish so you can try it?",
Moises answered "Yes, add it" (2026-11-13 00:11:55Z, the evening of 11-12 his time). So it goes out with the
publish of 2026-11-13 (the top banner, the pricing and policy pages' new look, the pricing button), in the
same single publish, for one purpose: his own first sign-in, on his iPhone. Hidden stays hidden. It is
linked from nowhere until he says where, and its words are still drafts.

**What it does.** An inspector signs in with the email and password of their Inspyx account, the same one
the app uses. There is no way to make an account here (accounts are made by invitation) and no button to
reset a password (the app has none either: both say to contact support). `/account` is the page a signed-in
inspector lands on: it names who is signed in and has "Sign out". It is the first of the signed-in pages,
and the pattern for the next ones.

**The files.**

- `signin.html`, `account.html`: the two pages. They hold every sentence.
- `assets/auth.js`: the sign-in itself. No library: a few calls to the account server, the same ones the
  app makes (`lib/src/auth/auth_client.dart` in the app's repo), but for one (signing out, below). It says
  no words.
- `assets/signin.js`, `assets/account.js`: each page's own small script. They say no words either.
- `assets/app.css`: the look of both, loaded after `page.css`. `assets/page.js` gives the phone its lean.
- `assets/signin-screen.webp` / `.jpg`: the picture on the phone beside the form (see "Before publishing").
- `vercel.json`: one rule of headers for the two pages. `tools/serve.js` sends the same headers locally.
- Eight files are added to what the site serves (the two pages, three scripts, one stylesheet, the picture
  in two formats): 21 becomes 29.

**How signing in works.**

- Signing in is one call, `POST /auth/v1/token?grant_type=password`, with the email and password in its
  body. They are never put in an address, a log or an error, and the password is never kept.
- The browser keeps (`localStorage`, key `inspyx.signin`) the two tokens, when the sign-in ends, and the
  account's id and email. Nothing else.
- A sign-in with less than a minute left is renewed before it is used
  (`POST /auth/v1/token?grant_type=refresh_token`). The server gives each renewal token one use, so one tab
  renews at a time (`navigator.locks`) and the others read what it kept. A renewal the server rejects signs
  the browser out. A renewal that cannot reach the server, or that the server fails on, leaves the sign-in in
  place, and the page says which of the two it was.
- A call is given 30 seconds, as in the app. After that the page says the server could not be reached.
- **Signing out ends this browser's sign-in only** (`POST /auth/v1/logout?scope=local`). Left unsaid, the
  server ends every sign-in the person has, on every device. An inspector who signed out of the website on
  an office computer would then, within the hour, find the app on their phone asking them to sign in again:
  the app keeps the inspection going on the phone, but stops everything that needs the server until they do
  (`reauthRequired` in the app's `lib/src/auth/session_manager.dart`). The browser forgets its sign-in first
  and tells the server second, so a server that cannot be reached never keeps a browser signed in.
- Signing in on the website leaves the phone signed in. The account server's setting "Enforce single session
  per user" is off (looked at in its dashboard on 2026-11-12 at 23:35Z; the two time limits beside it are 0,
  "never"). Were it ever turned on, a sign-in on one device would end the other's.
- The gate: `<html data-gate="in">` marks a page for the signed-in, `data-gate="out"` the sign-in page.
  `auth.js` is loaded in the head, not deferred, so it sends the browser to the right page before anything
  is drawn. It asks again when the sign-in changes in another tab, and when the Back button brings a page
  back (a browser shows such a page as it was left, without loading it again).
- The gate is a courtesy, not the lock. Anyone can read these files. What protects an inspector's data is
  the account server, where every table answers only to a valid sign-in. A signed-in page must get its data
  from the server with the sign-in (`InspyxAuth.current()` gives it), and never carry data in the page.
- To add a signed-in page: `data-gate="in"` on `<html>`, `auth.js` in the head, the page's own script
  deferred, the part that shows the account's data marked `hidden` until the script has a sign-in, and the
  page's address added to the rule in `vercel.json` and to `tools/check_signin.js`.

**The server's rule for the two pages** (`vercel.json`): only this site's own scripts and styles run
(nothing written into a page, nothing from another site), only the account server may be called, the pages
cannot be shown inside another site, no form can post anywhere, no address is passed on when leaving, and
browsers keep no copy. So these pages have no `style="..."` and no `<script>` with code in it. A script may
still move things with `element.style.setProperty`, which the rule allows.

**The look.** The sign-in page is the design Moises approved as a mock-up on 2026-11-12 at 20:14:05Z ("Yes,
that's it"): the form on white and, beside it, a phone with depth on the home page's morning sky, with three
cards. The picture is decoration: it is hidden from screen readers and nothing in it can be tabbed to. It
takes its size from its own width, so nothing is cut off. On a phone the cards go and the phone stands under
the form. With motion turned off nothing floats or leans. The account page stands on the policy pages' look.

**Left out of the approved design until it works.** The mock-up showed three more ways to sign in (Apple,
Google, a passkey) above the form, with "or with your email" between. None of them works yet (Apple waits
on the developer enrollment), so none is on the page: a button that does nothing is worse than no button.
With them gone, "Sign in" is the page's one solid button. The mock-up's line under the heading ("Your
inspections, reports and payments, on any screen.") is left out until the website has those.

**The words wait for Moises.** Every sentence on the two pages is a draft until he approves it. The five
sentences about a sign-in that did not go through are the app's own, word for word, and so is the line
about a forgotten password (the website adds how to reach support). `tools/check_signin.js` holds the list
(`SIGNIN_WORDS`, `ACCOUNT_WORDS`). Once he approves, a change needs his word, named in the commit.

**Checking it.**

```
node tools/serve.js &
node tools/check_signin.js                      # 58 self-checks, about 45 seconds
BROWSER=webkit node tools/check_signin.js       # the same in Safari's engine: 59 (one more, for Safari's Tab key)
node tools/check_rules.js                       # 4 checks: Vercel's own reader accepts vercel.json (see the file's top)
python3 -I tools/undo_checks.py . --signin      # breaks signing in 74 ways, one at a time: each must be caught
```

**The checks never make a real sign-in.** Every call the pages make to the account server is caught and
answered by the test itself, with a made-up address and a made-up password that exist nowhere. Any other
request that tries to leave the site is stopped and counted as a failure. The 74 breaks take about an hour
one after another; `--part=0/3`, `--part=1/3` and `--part=2/3` split the list across three copies of the
repo (the top of `tools/undo_checks.py` says how).

They cover: the page as it opens, on a phone and on a wide screen (no errors, nobody called, the headers,
nothing written into the page, the boxes as password managers expect them, tap sizes, the picture, every
word); a good sign-in (one call, made as the app makes it; the button says "Signing in…" and the form cannot
be sent twice; the password is kept nowhere); each way a sign-in fails, with its own sentence and no other
(a wrong password, no connection, a failing server, too many tries, half an answer, a server that never
answers, a browser that keeps nothing); trying again; an empty form; the gate, both ways; signing out, with
and without a connection, and that it ends this browser's sign-in only; two tabs; renewing; the Back button;
the Tab key; motion; and the files (the same public key and server as the waitlist form, no secret key,
nothing links to the pages, the scripts say no words).

Two things to know when reading a run. Safari's Tab key stops at the boxes only (Option+Tab stops at
everything), so in Safari's engine the round of the Tab key is walked with Option+Tab, and one extra check
walks plain Tab from the email box to the password box. And a picture taken by Playwright in Safari's engine
prints "Refused to apply a stylesheet...": that is Playwright's own style for hiding the text cursor, refused
by the pages' rule, which is the rule working. The page itself prints nothing (probed on 2026-11-12: no
message before a picture is taken, one after).

**Not checked, and known gaps.**

- **Real Safari, and a real iPhone.** The checks pass in Chrome's engine (Chromium 147: 58) and in Safari's
  engine as Playwright ships it (WebKit 26.4: 59), and both draw the page whole, on a phone and on a wide
  screen. That is still not Safari on Moises's iPhone (iOS 27), which is checked by hand.
- **A real sign-in.** Claude never types a password and makes no accounts. The first real sign-in is
  Moises's, with his own account, at a plain inspyx.com address. What could be checked without one: the
  account server lets a page at inspyx.com make each of the three calls. A browser asks the server that
  before a call (an `OPTIONS` request, which carries nothing of an account); asked by hand on 2026-11-13 at
  00:12:56Z for signing in, renewing and signing out, the server answered 200 each time, allowing any site
  and the headers each call sends.
- **A real Back in Safari.** The checks send the browser's "page brought back" signal themselves, because
  the browser they run in always loads the page again.
- **Vercel sending the headers.** Seen on the local server only, which reads the same `vercel.json`.
  Vercel's own route reader (`@vercel/routing-utils` 6.6.1, the library its build runs) accepts the file and
  turns the rule into `^(?:/(signin|account))$`: the two addresses and no other (`tools/check_rules.js`). A
  rule it refused would fail the whole build. The headers on Vercel itself are looked at after the first
  publish: `curl -sI https://inspyx.com/signin`, and `URL=https://inspyx.com/ node tools/check_signin.js`
  runs every check against the live pages (still with no real sign-in: the test answers the calls).
- **The app's own sign-out ends every sign-in the person has**, the website's too: it makes the same call
  without `scope=local`. The website handles that (its next renewal is rejected and the browser goes to the
  sign-in page). Whether the app should sign out the phone alone is a question for the app, not settled here.
- **Every page of inspyx.com can read the kept sign-in** (a browser keeps it for the whole site), so no page
  of the site may ever run a script from somewhere else. Today none does. The rule in `vercel.json` covers
  the two sign-in pages; widening it to the whole site is to do before signed-in pages hold real data (the
  home page has a short script and styles written into it, which the rule would have to allow by name).
- **If `auth.js` does not arrive** (a dropped connection), `/account` shows its top and footer and nothing
  between. Loading the page again fixes it.

**Before any page links to it** (each needs Moises's word, or his hands):

1. His approval of the words.
2. A real screen of the app on the phone in the picture. Today it is the mock-up's "Today" screen, which is
   not built. A device on the site always shows a real, finished screen.
3. His own sign-in at a plain inspyx.com address, on his iPhone and on a computer: sign in, sign out, Back,
   a wrong password. Never a Vercel share link.
4. A decision on where the site links to it.
