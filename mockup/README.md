# Home page mock-up (phone)

The phone mock-up of the new inspyx.com home page, as shown to Moises on 2026-11-10.

It is a mock-up, not the production page:

- The moving scene is drawn in code. It stands in for the real film.
- The waitlist form saves nothing.
- Nothing in this folder is served by the live site.

## See it

Open `mockup/preview.html` in a browser and scroll inside the phone. On a wide screen it shows as a 430 px column.

## What is here

| Path | What it is |
|---|---|
| `home-page/Main.dc.html` | The source. One artboard in the Claude design canvas format: `<x-dc>` markup plus a `Component` class that also draws the film on a `<canvas>`. |
| `home-page/canvas.json` | The canvas index for that artboard. |
| `home-page/uploads/` | Three pages of the anonymized sample report, resized from `assets/report-*.png`. The artboard refers to them as `/_blob/<id>`; `tools/build_standalone.js` holds the id-to-file map. |
| `preview.html` | The built stand-alone page. Generated, so do not edit it by hand. |
| `tools/` | The build script and the checks. |

## Rebuild the preview

```sh
node mockup/tools/build_standalone.js \
  "$PWD/mockup/home-page/Main.dc.html" \
  "$PWD/mockup/home-page/uploads" \
  /tmp/inspyx-home-fragment.html \
  --test "$PWD/mockup/preview.html"
```

The first output is a body-only page (the form a published Claude page takes). `--test` writes the full page you can open directly.

## Checks

These need Node and Playwright's Chromium. Give the Node scripts absolute paths, because they open `file://` pages.

```sh
# Screenshots plus the taps a visitor would make (header button, form, calculator)
node mockup/tools/test_standalone.js "$PWD/mockup/preview.html" /tmp/inspyx-shots 390 700

# Render the artboard source with a small stand-in runtime, at chosen scroll positions
node mockup/tools/mock_harness.js "$PWD/mockup/home-page/Main.dc.html" \
  "$PWD/mockup/home-page/uploads" /tmp/inspyx-harness 390 844 1 -- 0 975 2574 3861 5174 end
```

- `mock_harness.js` options, as environment variables: `REDUCED=1` (reduced motion), `INTERACT=1` (taps the calculator and the form), `PROPS='{"headline":"Office staff in your pocket"}'` or `PROPS='{"motion":false}'` (the two switches).
- `montage.py <out.png> <columns> <cellWidth> <images…>` tiles screenshots into one sheet. It needs Pillow.
- `bench.js <page.html>` times the film's draw call.

## How the film works

- Scroll position becomes a film time `T` from 1 to 5, read from the `[data-scene]` sections.
- The scenes: 1 Mia (the phone in the truck), 2 Spex Business (the tailgate), 3 Spex (the electrical panel, a separate shot), 4 the finished report (dusk).
- Light, camera and the chips drawn over the film are all functions of `T`, in `_draw`.
- The text sits in sticky glass cards in front of one canvas.
- With reduced motion, or the "motion" switch off, each scene shows as a still.

## Known limits

- Checked in headless Chromium from 320 to 430 px wide and 568 to 932 px tall, and at desktop width. Not checked on a real iPhone.
- The production page should use the real film as a picture sequence, keep every word as real text, and save waitlist sign-ups.
