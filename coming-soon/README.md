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

**Status on 2026-11-11: built on the branch `claude/new-home-page`. It is not live. inspyx.com
still shows the "Pilot coming soon" page until Moises says to publish.**

- Moises approved the new words on these pages that day (the list W1 to W8 in the Drive folder
  "Claude Inspyx Development").
- The guarantee's wording for the pricing page and the Terms (W9 and W10) is drafted for his OK.
  It is not in these files yet.
- The branch can be seen at a private test address: the Vercel project `inspyx-site-test`
  (see "The test address" below).

The new home page follows one job from the first call to the finished report. It was built from
the phone mock-up Moises approved on 2026-11-10 ("the original", kept on the branch
`claude/home-page-mockup`), and on a 390 x 844 phone it draws the same picture as that mock-up.

Self-check on 2026-11-11 with `tools/compare_mockup.js`, 18 frames from the first screen down to
the form, counting every pixel that differs at all:

- Given the mock-up's own report pictures, 17 frames are identical to the last pixel. The 18th
  differs in 8 pixels, each by 1 step of 255 (the outline of two buttons on the form).
- As visitors get it, the only other difference is inside the three report pictures, in 3 frames:
  the page serves them as WebP, the mock-up carried JPEG (at most 12 steps of 255).

Changed from the mock-up on purpose: the footer no longer links Switching, Reliability and Your
data (those pages are not on this site) and its email and phone are links; a line under the form
states the guarantee's condition; the form really sends.

**The inspector on the roof was redrawn on 2026-11-11, at Moises's word.** In the mock-up his
whole head was the hair colour, which read as a brown face above tan hands. Now his face is the
very same skin colour as his hand, his hair shows only at the back of his head under the cap, and
his sleeve is the navy shirt he wears in the close-up at the panel. Since then, of the 18
comparison frames, 8 are identical to the mock-up to the last pixel, 9 differ only where he is
drawn, and one differs in the same 8 pixels as before.

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
node tools/check_home.js         # 50 self-checks: form, calculator, Stripe messages, keyboard, tap targets, motion off, tablet and wide layouts
node tools/shots.js out 390 844 -- t:1 t:1.9 t:3.97 5650     # pictures at chosen film moments or scroll positions
node tools/make-images.js        # redraws the tab icons and the link-preview picture

# the real page against the mock-up it was built from, frame by frame
git fetch origin claude/home-page-mockup && git show FETCH_HEAD:mockup/preview.html > /tmp/mockup.html
node tools/compare_mockup.js /tmp/mockup.html /tmp/compare                   # as visitors get it
node tools/compare_mockup.js /tmp/mockup.html /tmp/compare --same-pictures   # with the mock-up's own report pictures
```

The checks never send a sign-up: the waitlist call is caught and answered by the test.
`tools/make-images.js` writes `assets/share.png`; save it as `assets/share.jpg` (JPEG, quality 88).

### The test address

The Vercel project `inspyx-site-test` (prj_IJHVH8wbMeOhNA0X2yvwyI68jRHI, same team) builds this
folder from GitHub: every branch gets its own address, and nothing there is inspyx.com. Every
address on it asks for a Vercel sign-in; a share link (good for 23 hours) lets Moises open one on
his iPhone without signing in. It was made on 2026-11-11 for testing in Safari on a real phone.
The form at a test address is the real one and saves to the live waitlist: addresses at
inspyx.com or example.com are marked as tests.

### Before publishing

- The guarantee's wording (W9, W10) is approved and in `pricing.html` and `terms.html`, or the
  guarantee line and its condition are off the home page.
- `privacy.html` says "Last updated" with the day the pages go live.
- The design checklist has been walked through, test by test (the Claude Project "Inspyx",
  `claude/website-design-checklist.md`).
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
