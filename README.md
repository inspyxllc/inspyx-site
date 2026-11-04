# inspyx-site

The public website of Inspyx — home-inspection software for inspectors — and its privacy policy.

**Live site:** [inspyx.com](https://inspyx.com)

## What this repository is

This is the home of the Inspyx public site: the marketing pages a prospective inspector reads before signing up, and the privacy policy that governs the product. It is a public repository because what it holds is public by design — the site and the policy are meant to be read by anyone.

Inspyx itself is home-inspection software: a fast iPhone app for the inspection, reports clients and agents actually praise, a voice co-inspector (Spex) who takes notes while the inspector works, and an AI agent that handles the inbox and books the next job. The product code lives in the private `inspyx-mobile` repository under the [inspyxllc](https://github.com/inspyxllc) organization — this repository holds the website, not the app.

## Current state

The pilot site files have landed. This is the Inspyx pilot site — ten public pages plus the application-status pages — ported from design **DES-008** (Direction C on the DES-007 pilot architecture), whose design review closed on **2026-11-04** with all findings closed. The counters and cohort strips render from a single `FOUNDING_LEDGER` block in each page, currently at its truthful zero state; the live wiring (application store, founding-seat ledger, deposits) is a later build step.

**Local preview:** the site is fully static — open `index.html` in a browser, or serve the folder with any static server (for example `python3 -m http.server`) and visit `http://localhost:8000/`.

**A note on the status pages:** `status.html`, `status-applied.html`, and `status-held.html` are personal-link **specimens** — they show the layout and wording of the per-applicant status surface with bracketed format values. They are pending the Step 7b authenticated build (controlled access and safe rendering of live data) and are not wired to real applicant data.

## Organization

This repository currently sits in the founder's personal account (`moises5666`). It belongs under the `inspyxllc` organization alongside `inspyx-mobile`, and moving it there is a planned step — GitHub redirects the old address automatically when that happens.

## Who owns this

Inspyx LLC · Florida · [inspyx.com](https://inspyx.com)
