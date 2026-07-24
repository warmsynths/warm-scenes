# Phase 0 — Codebase Architecture Map

## 1. Visual Scene Types

The app is a Lit-based SPA (`src/components/main-app.ts`) with a `<select>` switcher that mounts one of three top-level custom elements at a time:

| Scene | Entry component | Notes |
|---|---|---|
| **Diorama** | `src/components/diorama-screen.ts` → delegates to `src/components/lofi-dashboard.ts` (1444 lines, UI/state/audio-upload shell) → which renders `src/components/lofi-diorama.ts` (3712 lines, the actual Three.js scene: desk, gear, room, "liminal"/backrooms alt-scene, physics, camera) | Largest scene by far. Has device-screen sub-renderers: `src/utils/tracker-screen.ts`, `src/utils/m8-screen.ts`, `src/utils/quantum-cube.ts`, `src/utils/gear-builder.ts`, `src/components/gear-preview.ts` — these paint canvas textures onto in-scene device meshes, not standalone scenes. |
| **Wavefield** (waveform visualizer) | `src/components/wavefield-screen.ts` (1006 lines) | Self-contained Three.js scene with its own audio playback/analysis wiring and script-driven modulation. |
| **Cinematic Credits** (sunset / end-credits scene) | `src/components/cinematic-credits.ts` (1311 lines) | Shader-based sunset gradient sky, silhouette figures (`couple`/`cowboy`/`empty_chairs`, loaded from `src/assets/*silhouette.png`), scrolling credits-roll canvas texture, custom grain shader (`CinematicGrainShader`, inline in this file). |

`main-app.ts` (135 lines) is the only place all three are wired together; the `activeScreen` state controls which one mounts.

## 2. Rendering Setup — Duplicated, Not Shared

There is **no shared renderer/lighting/post-processing module**. Each of the three Three.js scenes independently constructs its own `THREE.WebGLRenderer`, camera, `EffectComposer`, and bloom pass:

- `src/components/lofi-diorama.ts:385-436` — creates `Scene`, `PerspectiveCamera(fov=15)`, `WebGLRenderer({antialias:true, alpha:true})`, enables `shadowMap` (`PCFSoftShadowMap`), sets `toneMapping = ACESFilmicToneMapping` (exposure 1.0), builds its own `EffectComposer` + `RenderPass` + `UnrealBloomPass`.
- `src/components/wavefield-screen.ts:261-278` — separate `Scene`, `PerspectiveCamera(fov=60)`, `WebGLRenderer({antialias:false, alpha:false})`, no shadow map, no explicit tone mapping override, its own `EffectComposer` + `UnrealBloomPass(strength=0.35)`.
- `src/components/cinematic-credits.ts:515-522, 818-840` — separate `Scene`, `PerspectiveCamera(fov=60)`, `WebGLRenderer({canvas, antialias:false})`, its own `EffectComposer` + `UnrealBloomPass` + a locally-defined custom grain `ShaderPass`.

Lighting is also scene-specific and hand-built inline (e.g., diorama's desk `SpotLight`, `DirectionalLight` "window light", `AmbientLight` at `lofi-diorama.ts:466-481`; credits scene has no discrete lights, it's a shader-driven sky/silhouette). The one piece of cross-cutting logic that *is* centralized is theme/material tinting: `src/utils/environment-manager.ts` (`EnvironmentManager.applyTheme`) walks a scene graph and tweens fog/lights/material colors via GSAP — but this is only used by the diorama scene (for its normal ↔ "liminal" backrooms swap), not shared with wavefield or credits.

Net: lighting, shadows, tone mapping, and post-processing are **duplicated per scene file**, with only material/fog theming abstracted into `environment-manager.ts`.

## 3. "Director" / Camera Logic

Two distinct director layers exist:

**a) UI/authoring layer — `src/components/AudioDirector/AudioDirector.ts`** (1044 lines, `<audio-director>` custom element). This is the waveform-editing panel: it wraps `wavesurfer.js`, lets a user place/drag markers or "macro shot"/"micro cut" regions on the timeline, and exposes:
- `MacroShot` (`startTime`, `duration`, `target`, `mood`, `intensity`, optional `cameraPos`/`cameraLookAt`, `transitionType: 'cut'|'smooth'|'whip-pan'`)
- `MicroCut` (`time`, `target`)
- `getState()` — returns either the wave-field script (`{script, density, transientMappings}`) or the diorama storyboard (`{macroShots, microCuts}`) depending on `mode`.

It dispatches `capture-camera` / `snap-camera` custom events that the diorama scene listens to (handled in `lofi-dashboard.ts:1199-1247` → forwarded into `lofi-diorama.ts`).

**b) Runtime camera state machine — `src/components/lofi-diorama.ts`** (this is where actual camera moves/cuts happen at playback/render time):
- `getCameraState()` (`:3436`) — reads current camera pos/target (used by "Capture Current Camera" button).
- `snapToCamera(markerId)` (`:3440`) — jumps camera to a macro shot's saved `cameraPos`/`cameraLookAt`, or if none saved, computes a mood-based offset (`balanced`/`submerged`/`chaotic`/`ambient`) relative to the shot's target object's world position.
- `updateCameraSequencer()` (`:3474-3615`) — the actual per-frame director loop: picks the active macro shot and any overriding micro cut for the current playback time, decides cut vs. smooth vs. whip-pan transition (`transitionDuration` 400ms whip-pan / 1500ms smooth / instant cut), eases position via cubic lerp, and applies a hard "solid lock" once settled (disables `OrbitControls` while sequencer is active).
- Time source is polymorphic: `isRenderMode` (HyperFrames offline render) uses `renderCurrentTime`; otherwise it uses `audioDirector.getCurrentTime()` (editor mode) or `audioManager.getCurrentTime()` (playback mode).

Wavefield and credits scenes have no comparable camera-cut logic — wavefield only modulates continuous visual params via `activeScript`/`activeModulators` (in `wavefield-screen.ts`), and credits scrolls/pans on its own fixed timers, not audio-director-driven.

## 4. Audio-Analysis → Storyboard Pipeline

Two separate Web Worker analyzers exist under `src/components/AudioDirector/`, both built on `Meyda`:

**`analyzer.worker.ts`** (wave-field mode, 137 lines) — computes per-frame spectral flux in three bands (bass: FFT bins 0-11, mid: 12-45, treble: 46+), finds peaks above a `density`-controlled threshold, and emits `{id, time, type}` markers of type `bass_transient` / `mid_transient` / `treble_transient` (plus manually-added `manual_event`). These map to `ActionConfig` via `AudioDirector.transientMappings` (target/mode/amount), configurable in the UI.

**`diorama-analyzer.worker.ts`** (diorama mode, 293 lines) — the "mood/beat/energy" pipeline:
- Per 512-sample frame: extracts `rms`, `zcr` (zero-crossing rate), `spectralCentroid` via Meyda.
- Computes energy delta between consecutive frames, adaptive median+stddev threshold scaled by a `sensitivity` (1-100) parameter, plus a ZCR threshold to confirm percussive onsets → classifies each frame as transient or steady-state.
- **Macro shots**: contiguous steady-state blocks ≥1.0s become macro shots. Mood is derived from average RMS/spectral centroid vs. global averages: `ambient` (low RMS), `chaotic` (high centroid), `submerged` (low centroid), else `balanced`. `intensity = clamp(avgRms * 3.0, 0, 1)`. Target device is picked by alternating `primaryArray`/`secondaryArray` (device ID lists configured in the diorama UI).
- **Micro cuts**: transient frames (with a hold-off of 0.1-0.3s depending on sensitivity) become micro cuts, round-robining through `primaryArray`.
- Output: `{macroShots: [...], microCuts: [...]}`, posted back to `AudioDirector`/`lofi-dashboard`, which calls `director.setMacroShots()`/`setMicroCuts()` to render timeline regions and store state for export.

**`exporter.ts`** (30 lines) is a small unused-looking/legacy helper alongside these — not central to the current flow (export is done via `exportConfig.ts`, see below).

## 5. Exported Config Schema

Export is triggered from `main-app.ts:handleExportConfig()` and implemented in `src/utils/exportConfig.ts`. `exportDirectorConfig(director, extras?)` calls `director.getState()`, stamps an `engine` field, merges `extras`, and downloads `config.json`.

Two schema shapes, both produced by `AudioDirector.getState()`:

**Wave-field:**
```json
{
  "engine": "wave_field",
  "mode": "wave_field",
  "duration": 123.4,
  "script": [ { "time": 1.23, "config": { "target": "device", "mode": "trigger", "amount": 0 } }, ... ],
  "density": 20,
  "transientMappings": { "bass_transient": {...}, "treble_transient": {...}, "mid_transient": {...}, "manual_event": {...} }
}
```

**Diorama:**
```json
{
  "engine": "diorama",
  "mode": "diorama",
  "duration": 123.4,
  "macroShots": [ { "id": "...", "startTime": 0, "duration": 4.2, "target": "synth_deck", "mood": "chaotic", "intensity": 0.7, "cameraPos": {"x":..,"y":..,"z":..}, "cameraLookAt": {...}, "transitionType": "smooth" }, ... ],
  "microCuts": [ { "id": "...", "time": 5.1, "target": "drum_machine" }, ... ],
  "primaryArray": [...],     // merged in via `extras` from lofi-dashboard's device pick-lists
  "secondaryArray": [...]
}
```
There's also a legacy fallback path in `main-app.ts:73-95` producing a bare array of `{time, type, value}` (used only if no `<audio-director>` element is found), which `render.js` also special-cases (`isLegacy` branch).

Note: the **cinematic-credits scene has no export path at all** — `handleExportConfig` only branches on `'wavefield'` and `'diorama'`; there's no `engine: 'credits'` case anywhere.

## 6. Manual Render Path: `config.json` → Video

`render.js` (root, 165 lines), run via `npm run render`:

1. **Preconditions**: expects `config.json` and `audio.wav` in the repo root (errors out if `config.json` missing).
2. **Build**: `npx vite build --base ./` — builds the Vite/Lit app with a relative base so asset paths resolve when the HTML is opened standalone from `docs/`.
3. **Locate built assets**: parses `docs/index.html` (the build output — `vite.config.ts` outputs to `docs/` for GitHub Pages) with regex to pull the compiled `<script type="module">` src and stylesheet href.
4. **Parse config**: reads `config.json`; if it's a bare array, treats it as legacy wave-field script (`{engine: 'wave_field', script: parsed}`); otherwise uses `config.engine` directly (`'wave_field'` or `'diorama'`).
5. **Determine duration**: shells out to `ffprobe` on `audio.wav` to get exact duration (falls back to `config.duration` or 60s).
6. **Generate event markup** — this is the HyperFrames composition contract:
   - For `wave_field`: each script event becomes `<div class="config-event clip" data-type="..." data-value="..." data-start="...">`.
   - For `diorama`: each macro shot becomes `<div class="macro-shot clip" data-target=".." data-start=".." data-duration=".." data-mood="..">`; each micro cut becomes `<div class="micro-cut clip" data-target=".." data-start="..">`. `primaryArray`/`secondaryArray` are passed as comma-joined `data-primary-array`/`data-secondary-array` attributes on the `<diorama-screen>` element itself (since the live dashboard normally sources these from localStorage, but render mode can't rely on that).
7. **Assemble a temp HTML file** at `docs/hyperframes-temp.html`: a `#composition` div (`data-composition-id="main" data-width="1920" data-height="1080" data-duration="<duration>"`) containing an `<audio>` tag, the generated event `<div class="clip">` markers, and the target screen element (`<wavefield-screen>` or `<diorama-screen data-primary-array=.. data-secondary-array=..>`). Loads GSAP from a CDN and the built app's compiled JS module.
8. **Consumption inside the app**: at runtime, the mounted scene component (`lofi-diorama.ts:2554-2600` for diorama, similarly in `wavefield-screen.ts`) detects render mode by checking `window.__timelines` or presence of `.macro-shot`/`.micro-cut`/`.config-event` elements, parses the `data-*` attributes straight out of the DOM into its internal `macroShots`/`microCuts`/`script` state, and switches its playback clock from live audio time to a `renderCurrentTime` value driven by a `window.addEventListener('hf-seek', ...)` listener — i.e., HyperFrames (the external `npx hyperframes` CLI, not a project dependency in `package.json`) owns frame-by-frame seeking and calls back into the page via `hf-seek` events for deterministic, non-realtime rendering; the diorama additionally loads audio into an offline buffer (`loadOfflineAudio`/`getOfflineAudioData`) so amplitude/frequency data is available without a live `AudioContext` clock.
9. **Render**: shells out to `npx hyperframes render --composition docs/hyperframes-temp.html --output output.mp4`.
10. **Cleanup**: deletes `docs/hyperframes-temp.html` in a `finally` block regardless of success/failure.

Cinematic-credits is never referenced in `render.js` — only `wave_field` and `diorama` engines are handled, so that scene has no automated render path today.
