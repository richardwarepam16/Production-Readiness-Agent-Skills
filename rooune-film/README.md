# ROOUNE — "You've probably already run past them."

A 19.5-second vertical (1080×1920, 30 fps) brand film, built entirely in code. Every frame and every sound comes from `src/`. There is no stock footage, no AI imagery and no samples.

**Watch:** [`dist/rooune-run-past-them-1080x1920.mp4`](dist/rooune-run-past-them-1080x1920.mp4) · poster: `dist/poster.jpg` · end card: `dist/endcard.jpg`

## The film

| Time | Picture | Sound |
|---|---|---|
| 0.0–2.9 | **01 · Indiranagar, 05:58.** A lone runner, backlit at first light, as street lamps sweep past. The HUD types itself in and a callout locks the pace: **5:42 / KM**. | City air, distant traffic, a koel, one runner's footsteps |
| 2.9–5.1 | **02 · Cubbon Park** and **03 · Ulsoor Lake.** A band-mask reveal expands from the pace line. The pace number stays fixed on screen as a match-cut anchor while its digits roll 5:42 → 5:48 → 5:35. | Each surface has its own footstep: asphalt, park grit, lakeside concrete |
| 5.1–6.6 | Triptych: three runners, same hour, never met. | Their cadences overlap, out of step, over a faint unresolved tone |
| 6.6–7.4 | Each band shrinks into a dot on the city map (scale transition). | Three soft pips, one per runner |
| 7.1–11.0 | Routes draw as lines, with dashed distance callouts (0.9 KM, 1.4 KM). The camera pulls back further and further, and the whole city's routes appear. | A restrained 90 BPM pulse (the footstep cadence), with three voices drifting into phase |
| 11.2 | Everything converges on Cubbon Park. Warm light runs back along every route, and a tag appears: `SAT · 06:00 · CUBBON PARK`. | A chord blooms |
| 11.75–12.67 | The camera dives into the meeting point. Its ring becomes the sun (match cut). | Riser, then a held breath |
| 12.67–16.0 | They run together at sunrise, their strides falling into step. *you've probably already run past them.* | The music breathes: D maj9 pad, felt-piano melody, footsteps locked on the beat |
| 16.0–19.5 | Two route loops draw toward each other and settle into the **OO** of **ROOUNE**. Tagline: *Run with the right people.* | Sonic logo: two bell tones a fifth apart (the two O's) and a soft low thump, then a long tail |

Design rules: an ink/bone palette with one warm accent (`#F0B97F`, the colour of first light), used only for *connected*. Type is Inter Tight (wordmark, pace), Instrument Serif italic (the line) and JetBrains Mono (data). Easing uses custom cubic-béziers. Motion blur is a real shutter: 5–8 sub-frames are accumulated per frame. Film grain and vignette are added on top. The runners are procedurally animated silhouettes. Ground contact is solved so feet never slide, and the footstep sounds are generated from those same foot-strike times.

## Build

```bash
npm install                     # fonts (@fontsource) + playwright
pip install numpy scipy imageio-ffmpeg
./build.sh                      # ~2.5 min on 4 cores
```

- `src/film.js`: the renderer. `renderFrame(n)` is a pure function of time. The `T` object at the top is the whole edit, and `P` is the palette.
- `src/render.mjs`: runs headless Chromium on 4 workers and pipes PNG frames to ffmpeg. `node src/render.mjs stills out/stills 90 200 380` renders single frames.
- `src/audio.py`: sound design synthesised from `out/cues.json` (the film's own footfall and beat cue sheet), mastered to −14 LUFS.

> Brand note: rooune.in could not be reached from the build environment. Messaging ("Run with the right people.", Bengaluru first, the city's running community being "bigger than it looks — it was just scattered") comes from the public site listing. The palette and typefaces are an interpretation. To match the live brand exactly, swap the values in `P` and the `@font-face` rules in `src/film.html`, then run `./build.sh`.
