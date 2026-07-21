# Phase 4 — Export → Render → Video Pipeline: Read-Only Failure Audit

Traced path: `main-app.ts` **Export Config** button → `exportConfig.ts` → manually-placed `config.json`/`audio.wav` → `render.js` → generated `docs/hyperframes-temp.html` → `npx hyperframes render` → `output.mp4`.

## Config Schema & Validation

**There is no schema validation anywhere in this pipeline.** `render.js` only wraps the initial `JSON.parse` in try/catch (`:48-59`) — that catches syntax errors only, not shape errors. Nothing checks that a `wave_field` script event has a `.config.target`/`.config.amount`, that a `diorama` macro shot has the fields `updateCameraSequencer` later expects, or that `engine` is one of the two values render.js knows about. The two schemas (current object form vs. legacy bare-array form, distinguished only by `Array.isArray(parsed)`, `:50-55`) carry no version field, so a malformed "new" export and a legitimate "old" export are indistinguishable except by top-level shape guessing.

## Findings, Ranked by Likelihood of Causing an Actual Render Failure

### 1. HIGH — Render-time network dependency + GSAP version mismatch, violating HyperFrames' own determinism contract
The generated composition (`render.js:118`) loads GSAP from a CDN at render time:
```html
<script src="https://cdnjs.cloudflare.com/ajax/libs/gsap/3.12.2/gsap.min.js"></script>
```
This is a hard runtime dependency on internet access inside what's supposed to be a deterministic, seekable render (the HyperFrames contract explicitly bans "network" access at render time as a non-negotiable, silent-failure rule that `lint`/`validate`/`inspect` won't catch). In any sandboxed, offline, or network-restricted render environment, this `<script>` tag fails to load, `window.gsap` is undefined, and the very next inline script (`window.__timelines['main'] = gsap.timeline(...)`, `:135`) throws a `ReferenceError`, breaking page script execution before the app's own module script even runs. Separately, this pins GSAP **3.12.2** via CDN while `package.json` declares `"gsap": "^3.15.0"` (`:14`) bundled into the app itself (used internally by `environment-manager.ts` and elsewhere) — two different GSAP versions/instances coexist on the same rendered page, one of which nothing in the app actually appears to use (no code was found writing tweens into `window.__timelines['main']`).

### 2. HIGH — `hyperframes` itself is an unpinned, un-lockfiled dependency
`hyperframes` does not appear in `package.json` (dependencies or devDependencies) or `package-lock.json` at all, yet `render.js:150` invokes it via `npx hyperframes render ...`. Every invocation resolves whatever version `npx` finds/fetches at that moment — there is no version pin, so the render tool's behavior (feature set, CLI flags, composition-contract enforcement) can silently drift between machines, CI runs, or over time with zero record of what version last worked.

### 3. HIGH — Scene state that isn't in `config.json` renders with silently wrong defaults
The exported config (`exportConfig.ts` / `AudioDirector.getState()`) only carries `macroShots`/`microCuts`/`primaryArray`/`secondaryArray` (diorama) or `script`/`density`/`transientMappings` (wave-field). It captures **none** of: active gear selection, custom device positions/rotations/stand toggles (all persisted only via `localStorage` keys like `lofi_active_gear`, `lofi_pos_<mode>_<name>`, `lofi_rot_<mode>_<name>`, `lofi_stand_<mode>_<name>` — see `lofi-dashboard.ts:76`, `lofi-diorama.ts:663,757,1048,1076,1083,1250,1274,1368`), or weather/time-of-day/celestial-position/rain/lightning sliders (plain in-memory `@state()`, never persisted at all). A fresh browser context spun up by HyperFrames for rendering has none of the editor session's `localStorage`, so gear falls back to the hardcoded default list (`lofi-dashboard.ts:80`) and every device sits at its unmoved default position — the render can look meaningfully different from what was designed and previewed, with no error or warning anywhere in the chain.

### 4. HIGH (for CI/automation) / MEDIUM (interactive) — `render.js` reports success even when the render fails
```js
} catch (err) {
  console.error('Error during HyperFrames rendering:', err.message);
} finally {
  // cleanup...
}
```
(`render.js:154-162`) — there's no `process.exitCode = 1` or rethrow, and nothing checks `fs.existsSync(OUTPUT_PATH)` afterward. `npm run render` exits 0 whether or not `output.mp4` was actually produced. A human watching the terminal will likely see the red error text, but any script, CI job, or automation wrapping this command has no reliable signal that the render failed.

### 5. MEDIUM-HIGH — Fully manual, undocumented hand-off from browser to filesystem
"Export Config" (`main-app.ts:63-112`) downloads `config.json` to the browser's default Downloads location via `exportConfigAsJSON` (`exportConfig.ts:9-22`, uses a `Blob`/`<a download>` click). The user must then manually move/rename that file to the repo root as exactly `config.json` (`render.js:5`, hardcoded path, no CLI arg). Separately, `audio.wav` must be manually placed at the repo root under that exact name (`render.js:6`) — there is no automated link between "the audio file loaded into the `<audio-director>` during editing" and this file; nothing verifies it's the same track, the same duration, or even a valid WAV. If the source track used during editing was mp3/ogg (anything the browser's `decodeAudioData` accepts), the user must remember to separately convert and rename it — none of this is surfaced in the UI or documented in-app.

### 6. MEDIUM — Unguarded exception in HTML generation crashes after the expensive build already ran
The `JSON.parse` at step 3 is try/caught, but the event-markup generation in step 4 (`render.js:81-108`, e.g. `evt.config.target` on wave-field events) has **no** surrounding try/catch. A config that's valid JSON but wrong-shaped (e.g. `isLegacy` misdetected, or a hand-edited macro shot missing `target`) throws an uncaught `TypeError` here — *after* `npx vite build` has already run (the slowest step), leaving the user with a bare stack trace and no indication of which field was wrong.

### 7. MEDIUM — Offline audio path-guessing degrades to silently inert audio-reactive visuals
Both `lofi-diorama.ts:2611-2631` and `wavefield-screen.ts:443-448` fetch `audio.wav` independently of the `<audio id="main-audio">` element HyperFrames owns, for their own amplitude/frequency analysis — via a hardcoded two-path guess:
```js
const paths = ['../audio.wav', 'audio.wav'];
```
This assumes the rendered temp HTML is served from exactly `docs/` relative to repo root. If HyperFrames serves the composition from any other root (a copied working directory, a different static-serve base), both fetches 404, the catch is silent (`console.warn` only, `:2630`), and `getOfflineAudioData()` returns all-zero amplitude/bass/freqs (`:2637-2640`) — the video renders successfully but with all audio-reactive gear animation flatlined, with nothing surfaced to the user beyond a console line.

### 8. MEDIUM — Duration resolution silently falls back to a hardcoded 60s
`render.js:63-73`: duration comes from `ffprobe` (an external binary not declared anywhere as a project dependency — assumed present on `PATH`) → falls back to `config.duration` → falls back to a hardcoded `60`. If `ffprobe` is missing (only caught with a `console.warn`) and `config.duration` is absent or `0`, every render silently produces a 60-second video regardless of the actual track length — truncating long tracks or padding short ones with no error, only an easily-missed warning line.

### 9. MEDIUM — Build-output parsing is regex-against-HTML instead of Vite's manifest, and will break silently on any Vite output-format change
`render.js:36-41` locates the built JS/CSS by regex-matching the literal string `<script type="module" crossorigin src="([^"]+)">` and `<link rel="stylesheet" crossorigin href="([^"]+)">` inside the freshly-built `docs/index.html`, rather than reading Vite's `manifest.json`. This currently matches the checked-in `docs/index.html` output format, but is coupled to exact attribute order/presence from the installed Vite version (`^8.1.1` — a caret range, so minor/patch upgrades are auto-applied). If a future Vite version changes attribute order or omits `crossorigin`, the regex silently returns no match, `scriptSrc`/`cssHref` become `''`, and the generated composition HTML ships with **no app script at all** (`render.js:139`: `${scriptSrc ? ... : ''}`) — the render "succeeds" and produces a blank/black video with zero errors.

### 10. LOW-MEDIUM — The Cinematic Credits scene has no render path at all, and fails silently at two separate points
`render.js`'s engine branch only handles `'wave_field'` and `'diorama'` (`:79-108`); there is no `else` — for any other/missing `engine` value, `eventsHtml` and `targetScreen` both stay `''`, producing a composition with just an `<audio>` tag and nothing else (a black video). This is compounded on the export side: `main-app.ts:handleExportConfig()` (`:63-112`) only branches on `activeScreen === 'wavefield'` or `'diorama'` — clicking "Export Config" while the Cinematic Credits scene is active does nothing at all (no `config.json` download, no alert, no console message), so the dead end is invisible from the very first step.
