# coming-soon/ — what inspyx.com serves right now

Since 2026-11-08 ~02:15Z, inspyx.com shows this one page ("Pilot coming soon"),
in place of the old "Inspyx Voice" site (Replit, 34.111.179.208).

- Vercel project: `inspyx-coming-soon` (prj_gzZo96kf3nQclwNHhgVbA4zGXiuK), team moises-avilas-projects.
  Deployed by API upload, not from git: first deploy dpl_DjvxehQCQcNBswFpEmzR6KSa8psh.
  To change the page, edit these files and redeploy them to that project.
- Domains on that project: inspyx.com (serves the page), www.inspyx.com (308 to inspyx.com).
- DNS at Porkbun: A @ and A www changed from 34.111.179.208 to 76.76.21.21. Mail records untouched.
- "Apply for the pilot" opens the Google Form "Inspyx Pilot Application" (owned by support@).
- When the full site is ready, move inspyx.com to it and retire this project.
- Since 2026-11-09: Stripe sends inspectors back here from Inspyx's plan pages
  (the billing Edge Function's success_url, return_url and cancel_url default to
  https://inspyx.com/?billing=done, back and canceled). With one of those, the page shows
  that message instead of the pilot pitch (words approved by Moises 2026-11-09):
  done "You're all set. Your Inspyx plan has started. Tap ✓ at the top to go back to the app.",
  back "All done. Tap ✓ at the top to go back to Inspyx.",
  canceled "No charge was made. Tap ✓ at the top to go back to Inspyx."

Since 2026-11-09 (draft, live only once Moises approves the words): the site has
four more pages, served with clean URLs (vercel.json cleanUrls):
/pricing (founding price $69 a month or $649 a year, 30 days free),
/refunds (cancellation and refunds), /terms and /privacy, sharing
assets/page.css. Every page's footer links all four and gives the business
line (888) 772-2919. Stripe's public business details link /terms and /privacy.
Deploy every file in this folder together (index.html, the four pages,
vercel.json, assets/).

## The client's report page (branch claude/web-report, 2026-11-11; not live)

`/r/<22-character key>` shows a client their inspection report as a web page, with the PDF one tap away.
It is the first piece of "the report delivered as a web link" (Drive: "Plan — The Web Report: a Link for
the Client, with the PDF on It (2026-11-11)").

- Files: `report.html`, `assets/report.css`, `assets/report.js`. No build step, no library, and nothing
  loaded from another company.
- `vercel.json` sends `/r/:key` to `report.html` and gives the page its headers: not listed by search
  engines, no referrer, not cached, never framed, and a Content-Security-Policy that allows only this site
  and Inspyx's Supabase project.
- The page asks the `report` Edge Function for the report a key opens and draws the "view" it answers with
  (`inspyx-report-view/1`, made on the server from the same content the PDF is made from, so the two say the
  same thing). The function is written (app repo, `backend/supabase/functions/report`) but **not live yet**:
  until it is, a real-looking key shows "The report couldn't be opened."
- What it can show: the report (open); its cover with a Pay button (locked, not paid yet); the address and
  the PDF alone (plain, for a report the page can't lay out); "This report link doesn't work" (gone);
  "The report couldn't be opened", with Try again (failed).
- Three rules it keeps: a report's words go on the page as text, never as markup; a photo, the PDF and the
  pay page load only from this site, inspyx.com or the Supabase project; nothing about the visit is sent
  anywhere else.

Checking it (self-checks; Playwright with Chromium):

    node tools/report_serve.js --sample <sample folder> &
    node tools/check_report.js <sample folder>

A sample folder holds `report.json` (what the function answers for an open report), `files/` (its photos,
each with a small copy) and `report.pdf`. The sample used so far is made from the app repo's Report B test
fixture; it is **not** in this repo, which is public, and its builder is to live in the app's repo beside
the report function.

Against the report function itself (the app repo's `backend/supabase/functions/report`), given the key of a
link to a published report:

    node tools/report_serve.js &
    node tools/check_report_cloud.js <key> [--cloud http://localhost:4199]

With `--cloud` the function is the one run on this machine by the app repo's `sample/local_cloud.mjs`, after
`sample/publish_sample.mjs` put the sample on it; the page still asks Inspyx's real address under its real
Content-Security-Policy. Without it, the live function is asked.

A private preview for Moises (one file, with the sample beside it, published as the claude.ai artifact
"Web Report Sample"):

    node tools/report_preview.js <sample folder> <out folder>
    node tools/check_preview.js <out folder>

Before the page goes live:

- the report function, its tables and its private file store (app repo), tested with the sample;
- the page's own wording (drafts, under `WORDS` in `report.js`) approved by Moises;
- a new line on `/privacy`, which today says inspections are saved on the iPhone;
- where the site is hosted, settled (Vercel's free plan is for non-commercial use);
- a test in Safari on a real iPhone.
