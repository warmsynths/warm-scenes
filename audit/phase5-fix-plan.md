# Phase 5 — Prioritized Fix Plan

*(Phase 0 = architecture map, Phase 1 = rendering-quality audit, Phase 2/3 = director/audio-pipeline audit, Phase 4 = export→render pipeline audit)*

## Quick Wins — small changes, outsized impact

1. **Add `OutputPass` + `ACESFilmicToneMapping` to wavefield-screen.ts and cinematic-credits.ts** — the single highest-leverage fix in the whole audit. Diorama already has this; the other two scenes are missing it, so their bloom/grain passes are compositing in the wrong color space. One-line-per-file fix, affects 2 of 3 scenes immediately. *(Phase 1, finding #1)*

2. **Remove the CDN GSAP `<script>` tag from render.js's generated composition** and rely on the app's own bundled GSAP (^3.15.0) instead of the hardcoded CDN copy (3.12.2). Also closes a real render-time network dependency that violates HyperFrames' own "no network at render" rule. *(Phase 4, finding #1)*

3. **Pin `hyperframes` as a real dependency** in `package.json`/lockfile instead of relying on bare `npx hyperframes`. *(Phase 4, finding #2)*

4. **Make `render.js` fail loudly**: set `process.exitCode = 1` (or rethrow) when `npx hyperframes render` errors, and verify `output.mp4` exists afterward before declaring success. Currently the script exits 0 on failure. *(Phase 4, finding #4)*

5. **Wrap the event-markup generation step (`render.js:81-108`) in try/catch** with a clear error message — right now a malformed config throws an unguarded exception *after* the slow Vite build has already run. *(Phase 4, finding #6)*

6. **Re-tune SSAO params** (`kernelRadius`/`maxDistance`) in the diorama to match room scale — currently configured so tight the effect is likely invisible outside close-contact crevices. *(Phase 1, finding #5)*

7. **Enable bloom in the diorama's normal/cosy mode**, not just liminal — it's currently initialized to strength 0 and only turned on for the backrooms variant, despite having warm light sources that would benefit. *(Phase 1, finding #6)*

8. **Make Cinematic Credits fail loudly instead of silently** in both the export button (`main-app.ts`) and `render.js`'s engine branch — right now selecting that scene and clicking Export does nothing, and rendering an unrecognized `engine` value silently produces a blank video. A one-line guard/alert in each spot is enough for now. *(Phase 4, finding #10)*

9. **De-duplicate the mood→camera-offset switch statement** that currently exists identically in both `snapToCamera()` and `updateCameraSequencer()` — extract to one shared helper so editor preview and actual render can't drift apart. Small, contained change. *(Phase 2/3, finding — mood/offset duplication)*

10. **Surface `findGearObject` fuzzy-match failures visibly** (not just `console.warn`) — e.g. flag in the storyboard UI when a macro/micro shot's target doesn't resolve, so silent fallback-to-desk-center shots are caught before export instead of discovered in the rendered video. *(Phase 2/3, finding — fuzzy target matching)*

---

## Structural Issues — need real refactoring

1. **Extract a shared renderer/lighting/post-processing module** used by all three scenes instead of each one independently constructing its own `WebGLRenderer`, camera, lights, and `EffectComposer`. The quick-win tone-mapping fixes (#1 above) are the stopgap; this is the actual fix that prevents future drift and would make it possible to add IBL/grading/DOF once instead of three times. *(Phase 0 architecture finding + Phase 1 overarching theme)*

2. **Replace global (whole-track) adaptive thresholding in `diorama-analyzer.worker.ts` with windowed/segment-based normalization.** Currently transient and mood thresholds are computed once from the entire track's statistics, so dynamic-range tracks (quiet verse/loud chorus) produce unbalanced, clustered storyboards. This is an algorithmic rework, not a tuning tweak. *(Phase 2/3, finding — highest risk in that report)*

3. **Reconcile the `intensity` calculation with the `mood` calculation** — one is normalized to the track's own max/average, the other is an absolute multiplier — so the two fields on the same shot object stop being on inconsistent scales. *(Phase 2/3, finding — intensity/mood scale mismatch)*

4. **Couple `minMacroDuration` to `sensitivity`** instead of a fixed 1.0s constant, so high-sensitivity analysis on busy tracks doesn't collapse to zero macro shots (camera sequencer has no shots to key off, silently freezes at last position). *(Phase 2/3, finding — minMacroDuration)*

5. **Replace fuzzy substring target-matching (`findGearObject`) with an exact-ID contract** — establish a single canonical device-ID source of truth shared by the gear dictionary, export schema, and diorama mesh names, with validation instead of "closest substring wins." This is a contract change across three files, not a local fix. *(Phase 2/3, finding — fuzzy target matching)*

6. **Add real config schema validation** (e.g. zod/ajv) shared between `exportConfig.ts` (so bad state can't be exported) and `render.js` (so bad input is rejected with a clear message before the expensive build runs), replacing the current "just try/catch JSON.parse" approach. *(Phase 4 — "no validation anywhere" theme)*

7. **Replace regex-scraping of `docs/index.html`** for compiled JS/CSS paths with Vite's `manifest.json`. Currently one Vite version bump away from silently producing a scriptless (blank) render. *(Phase 4, finding #9)*

8. **Fix the offline-audio path-guessing hack** (`['../audio.wav', 'audio.wav']` fallback duplicated in two files) — have `render.js` pass an explicit, correct audio path into the composition instead of the app guessing its serving root, so audio-reactive visuals can't silently go inert. *(Phase 4, finding #7)*

---

## Missing Features — don't exist yet, need building

1. **Environment/IBL lighting (HDRI + PMREM)** — zero environment maps anywhere in the codebase, despite the diorama having the most PBR-material variety of the three scenes (metal knobs, brass, chrome) that currently can't show any reflection. Single biggest untapped visual-quality lever for the diorama specifically. *(Phase 1, finding #2)*

2. **Color grading / LUT layer** — no shared grading step exists; each scene's "look" is currently improvised per-scene (tone mapping, grain shader) with nothing unifying the very different looks of the three scenes. *(Phase 1, finding #3)*

3. **Depth of field / bokeh pass** — missing entirely. Needed both for the diorama's narrow-FOV "miniature" effect (currently only half-implemented via FOV alone, with no shallow-focus blur) and to add filmic depth to the credits scene. *(Phase 1, findings #7, #8)*

4. **Vignette pass** — doesn't exist for any scene. *(Phase 1, findings #3, #8)*

5. **Full scene-state export/import** — the exported config only captures audio-director data (shots/cuts/arrays); it doesn't capture active gear selection, custom device positions/rotations, or environment/weather/time-of-day sliders — all of which currently live only in browser `localStorage` and are invisible to the render pipeline. This is the most likely cause of "the render doesn't match what I built in the editor." Needs a genuinely new export/import surface, not a fix to the existing one. *(Phase 4, finding #3)*

6. **Real tempo/beat detection (BPM tracking)** — the current pipeline only does transient/energy-delta detection dressed up as "mood/beat," with no actual tempo estimation. If true beat-synced camera cuts are wanted, this needs to be built from scratch. *(Phase 2/3, opening framing note)*

7. **Anti-repeat / cut-variety logic** for macro-shot target selection — currently unweighted random picks with no memory of the previous shot's target, so consecutive shots can land on the same device back-to-back with no safeguard. *(Phase 2/3, finding — random target assignment)*

8. **Deeper manual camera-override controls** — the existing capture-camera mechanism only overrides *position*, not transition duration/easing or per-shot keyframing (camera is locked static for a shot's full duration once resolved), and micro cuts have no manual-override path at all (macro shots do). *(Phase 2/3, "where to add manual creative control")*

9. **An automated editor→render handoff tool** — right now getting from "click Export" to a runnable render requires manually moving the downloaded JSON into the repo root and manually sourcing/renaming a matching `audio.wav`, with no verification the two match. A small CLI/script that does this handoff automatically (and validates the audio file) doesn't exist yet. *(Phase 4, finding #5)*
