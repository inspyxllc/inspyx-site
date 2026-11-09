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
