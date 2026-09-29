---
name: promo-video
description: Make a TzDeck promo video rendered from code with real captures of tzdeck.xyz. Use when asked for a TzDeck promo, launch video, trailer, showreel or social clip, or to update or re-cut the existing one.
---

# TzDeck promo video

`studio/` is a working 20-second vertical film: live captures of tzdeck.xyz, a canvas film where `window.seek(t)` paints any frame from `t` alone, a synthesized score, and a Playwright + ffmpeg renderer. Every run starts from a copy of it and changes the picks, the copy, and the cue sheet.

The studio's shape:

- `timeline.js` is the cue sheet, in beats at 120 BPM. `film.js` (picture) and `music.mjs` (score) both read it, so a retime is one edit that moves picture and sound together.
- `docs/shotlist.md` is the current cut: shots, copy, and sound per beat range.
- `film.js` holds the card picks and the hero credit at the top of its assets section.

## Steps

1. **Scaffold.** Copy `studio/` to a work directory outside the repo (default `../tzdeck-promo` beside the checkout), then run `npm install` and `npx playwright install chromium` there. Done when both succeed.

2. **Capture.** Run `npm run capture`. It fetches the logo, opens 8 real packs on the live site, and saves every card to `assets/cards/` with its rarity and details in `assets/cards.json`, plus the home, pack, card-back, rarity and demo-battle screens. Done when `cards.json` holds at least one Legendary; otherwise run `node capture.mjs 12` for more packs.

3. **Pick.** Look at every candidate card image before choosing it. Set `SRC.legendary` (the hero), `FLIP_CARDS` (four varied tiers), `MARQUEE`, and `HERO_CREDIT` (the hero's title and artist) in `film.js`. Choose art that reads as art at phone size, and leave out anything disturbing, blank or broken, or a token rather than an artwork. Done when every pick has been viewed.

4. **Brief.** When the request changes the length, message or beats, rewrite `docs/shotlist.md`, then `timeline.js`, before touching scene code. Done when the shot list and cue sheet agree.

5. **Critique loop.** Render stills with `npm run stills -- 0.3,1.6,2.6,...`: at least one per shot and one inside each transition. Open `out/contact.png` and look at it as a harsh motion director. Score 1-10 on each of hook in the first 2 s, readability at 360 px wide, motion quality, variety (something new every 2-4 s), composition, and brand accuracy. Fix the 3 worst problems and re-render those stills. Log each round's scores and fixes in `docs/review_log.md`. Done when every score is 8 or higher.

6. **Render.** Run `npm run score`, then `npm run render` in the background (about 17 minutes for 20 s at 60 fps with 2 motion-blur subframes), then `npm run finish`. Done when `out/tzdeck-promo.mp4` is 1080x1920 at 60 fps with AAC audio near -14 LUFS (`ffmpeg -i out/tzdeck-promo.mp4 -af ebur128 -f null -`), and you have reviewed `out/contact-final.png` and `out/phone.png` from the encoded file.

7. **Deliver.** Hand over the MP4, contact sheet and poster paths, the hero card's artist credit, and what you would improve next.

## Rules

- Everything on screen is a real capture of tzdeck.xyz or real brand material. Redraw nothing from imagination.
- Brand: surface `#07080f`, accent `#6366f1`, rarity colors only on rarity moments, Oxanium for display type, Inter for small copy. The tokens live in `src/app/globals.css`.
- Rarity copy follows `CONTEXT.md`: a grade from edition size and listed price. Present rarity as a grade, never as worth, price or odds.
- Motion is springs, one per change of target (`track()` in `film.js`). Randomness is seeded (`rng()`), and time comes only from `seek(t)`.
- Captions are at least 48 px on the 1080 px canvas, so they read on a 360 px phone.

## Gotchas

- A screenshot is a rectangle. Capture any rounded or shaped element (cards, the card back, the pack) with `shotAlone()` from `shot-alone.mjs`. It gives true alpha and clips to the element's own border radius, so neither the page background nor the rarity ring's corner arcs land in the corners.
- Canvas silently ignores a `globalAlpha` outside [0, 1] and keeps the previous value. Spring overshoot then makes a fading element snap back to full opacity. Route every alpha through `fade()`.
- A full-page screenshot at 3x takes about 0.7 s, longer than the app's half-second floating damage numbers. A capture timed between hits can still catch one, so `capture-battle.mjs` hides them with the screenshot's own `style` option. Any other transient app decoration the film replaces needs the same treatment.
- On the site, **Open Another Pack** returns to the sealed pack. Capture has to click **Rip it open** again for each pack.
- The studio files are UTF-8 with characters like `·` and `ꜩ`. Windows PowerShell 5.1 reads them as ANSI and garbles them on write, so edit them with Node or the editor tools.
- The Windows `ffmpeg-static` build has no glob input. Stills are numbered `out/stills/%02d.png` for that reason.
- OBJKT and the site rate-limit bursts. Run capture once, not in parallel with other scrapers.
- A full render is slow, so iterate on stills and render once. `npm run fingerprint` hashes 30 frames and the score: two runs must match, and so must a refactor meant to change nothing.
