# Promo video source

The 60-second promo (`public/promo/jobwatch-promo-16x9.mp4` and `-9x16.mp4`) is
rendered from real screenshots of the app, frame by frame, from `stage.html`.
Everything here is free and open source; nothing calls a paid API.

| File | What it does |
| --- | --- |
| `stage.html` | The whole video as an HTML timeline. `?fmt=land` (1920×1080) or `?fmt=port` (1080×1920); `window.seek(t)` draws the frame at `t` seconds. |
| `timeline.json` | When each voice line starts. Scene timings in `stage.html` follow it. |
| `boxes.json` | Where the highlighted buttons sit on each screenshot (fractions of the image). |
| `tts.py` | Voiceover with [Kokoro](https://github.com/thewh1teagle/kokoro-onnx) (Apache-2.0), voice `af_heart`. |
| `music.py` | The music bed, generated in code (no samples, no licences needed). |
| `scripts/promo-shots.mjs` | Screenshots of every screen, desktop and mobile, from the demo account. |
| `scripts/promo-boxes.mjs`, `promo-finder.mjs` | Measure highlight boxes; re-shoot the email finder with the "Jane Doe" example. |
| `scripts/brief-shot2.mjs` | Screenshot of the search-brief email. |
| `scripts/promo-frames.mjs` | Render a few frames for review. |
| `scripts/promo-render.mjs` | Render every frame and encode the MP4 with ffmpeg. |

## Re-rendering

1. Run the app locally on port 3100 (Telegram shows as available when
   `NEXT_PUBLIC_TELEGRAM_BOT_USERNAME` and `TELEGRAM_BOT_TOKEN` are set at build time).
2. `node scripts/promo-shots.mjs shots d,m`, then `node scripts/promo-boxes.mjs boxes.json`
   and `node scripts/promo-finder.mjs shots boxes.json`; write `boxes.js` as
   `window.BOXES = <boxes.json>;` next to `stage.html`.
3. Fonts: save the latin `woff2` files for Bricolage Grotesque, IBM Plex Sans and
   IBM Plex Mono (Google Fonts, OFL) in `fonts/` with a `fonts.css` of `@font-face` rules.
4. Audio: `python tts.py <dir>` writes the voice lines, `python music.py music.wav` the
   music; place the lines at the `timeline.json` times, normalise the voice to −16 LUFS,
   the music to −27 LUFS, and duck the music under the voice (ffmpeg `sidechaincompress`).
5. `node scripts/promo-render.mjs $PWD/stage.html land mix.wav out-16x9.mp4` (and `port`).

Claims in the video match the product: data lives in Supabase's Canadian region
(ca-central-1), Supabase encrypts data in transit and at rest, and the privacy page
says data is never sold and there are no ads.
