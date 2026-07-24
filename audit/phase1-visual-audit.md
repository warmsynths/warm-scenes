# Phase 1 — Rendering-Quality Audit: Diorama / Wavefield / Cinematic Credits

Findings ranked by likely visual impact, high → low. Findings 1-3 are shared infrastructure gaps (fix once, benefits multiple/all scenes); the rest are scene-specific.

## Ranked Findings

### 1. [SHARED — Wavefield + Credits] No `OutputPass`, no explicit tone mapping → colors likely wrong on 2 of 3 scenes
`wavefield-screen.ts` and `cinematic-credits.ts` both build an `EffectComposer` (`wavefield-screen.ts:270-280`, `cinematic-credits.ts:818-834`) with a `RenderPass` + `UnrealBloomPass`/`ShaderPass` but **no `OutputPass`**, and neither sets `renderer.toneMapping`. Only `lofi-diorama.ts:401,434` sets `THREE.ACESFilmicToneMapping` + adds `OutputPass`. In modern three.js, `EffectComposer` renders passes in linear space; without a final `OutputPass`, sRGB/color-space conversion and tone mapping never get applied to the composited (bloom/grain-affected) image — the two scenes that rely most on a bloom-heavy, filmic look (the neon wavefield and the sunset scene) are the two missing the pass that makes bloom/color look correct. This is a single fix (`renderer.toneMapping = ACESFilmicToneMapping` + add `OutputPass` as the last composer pass) that would visibly change both scenes.

### 2. [SHARED] No environment/IBL lighting anywhere
Repo-wide search finds zero uses of `RGBELoader`, `PMREMGenerator`, `scene.environment`, or any `.hdr` asset. All PBR materials (`MeshStandardMaterial`, heavily used in the diorama — see below) rely purely on direct lights for specular response; metal/glass-like materials (brass knobs `metalness:0.8`, chrome parts `metalness:0.9-1.0` in `lofi-diorama.ts:1583-1604,1980`) have nothing to reflect and will look flat/matte instead of showing environment highlights. This is the single biggest lever for making the diorama's many metallic gear materials read as premium rather than plasticky, since it's currently the scene investing the most in PBR material variety.

### 3. [SHARED] No color grading / LUT layer anywhere
No LUT, no separate grading pass, no vignette shared utility. Each scene that wants a "look" (diorama's ACES filmic tone mapping, credits' grain shader) does so ad hoc. There is no shared grading step scenes could opt into, so overall visual consistency across scenes (currently very different — diorama photoreal-ish, wavefield flat neon, credits painterly-shader) can't be unified without touching each scene individually.

### 4. [Wavefield-specific] Entirely unlit — zero lights, all `MeshBasicMaterial`
`wavefield-screen.ts` has **no `THREE.Light` of any kind** and every material found (`curtainMaterial`, chassis/pad/screen/knob placeholders at lines 300, 352-372) is `MeshBasicMaterial`. This is presumably intentional for a flat neon/wireframe waveform look, but it means: no shading, no shadows, no depth cues beyond bloom and fog/overlap — the scene is visually the flattest of the three by design. Given it's unlit, tone mapping (finding #1) matters less here than for credits, but the bloom pass is the only thing giving it dimensionality, and bloom strength 0.35 on an unlit, uncalibrated color-space pipeline is likely to look either blown-out or muddy depending on where clamping happens.

### 5. [Diorama-specific] SSAO configured with narrow parameters, may be barely visible
`lofi-diorama.ts:419-423` does add `SSAOPass` (the only scene with AO) but `kernelRadius: 1.2`, `minDistance: 0.002`, `maxDistance: 0.1` — a very tight max-distance for a scene with room-scale geometry (walls at ±20 units, desk/shelf setups spanning many units). AO contribution from that pass is likely only affecting close-contact crevices (under objects) and invisible at the room scale, undercutting the value of having SSAO at all.

### 6. [Diorama-specific] Bloom effectively disabled by default, only enabled in "liminal" mode
`bloomPass` strength is initialized to `0.0` (`lofi-diorama.ts:426-431`, comment confirms "enable in liminal mode"). So the normal/cosy diorama room renders with no bloom despite having warm light sources (desk lamp `SpotLight` intensity 80, bulb `emissiveIntensity: 2.0` at line 1999) that would benefit from glow. Bloom is reserved for the alternate "backrooms" scene.

### 7. [Diorama-specific] Narrow FOV (15°) camera with no depth-of-field to sell the "miniature/diorama" look
`this.camera = new THREE.PerspectiveCamera(15, aspect, 0.1, 1000)` (`lofi-diorama.ts:390`). A 15° FOV gives strong telephoto/lens-compression, which is one half of the classic "tilt-shift diorama" trick — but there's no depth-of-field / bokeh pass anywhere in the codebase to supply the shallow-focus half of that effect. Without DOF, the compressed FOV alone doesn't read as "miniature," it just reads as a long lens.

### 8. [Credits-specific] Grain pass exists but no vignette or DOF
`cinematic-credits.ts` has a genuinely custom effect (`CinematicGrainShader`, inline lines 11-56) with a luminance-weighted grain and a user-adjustable amount (default 3.5, described in a comment as "heavy 70s grain") — the most bespoke post effect in the codebase. But there's no vignette pass and no DOF; combined with the missing `OutputPass`/tone-mapping (finding #1), the grain is likely the only thing currently doing filmic-look work in this scene.

### 9. [Credits-specific] Fully unlit scene — no lights, shader/emissive-only
No `THREE.Light` anywhere in `cinematic-credits.ts`; the sky is a custom `ShaderMaterial` gradient (line 588) and the silhouette figures use `ShaderMaterial`/`MeshBasicMaterial` (lines 636, 716). This is consistent with a stylized 2.5D silhouette-against-sky composition — not inherently a problem — but it means all "cinematic" quality here rides entirely on the shader gradient + grain + bloom, none of which currently pass through correct tone mapping (finding #1).

### 10. [Diorama-specific] Material and texture usage is the most developed of the three scenes
For context/contrast: the diorama is by far the most PBR-correct scene — `MeshStandardMaterial` used consistently (dozens of instances) with sensible `roughness`/`metalness` pairs per surface type (fabric ~0.9-1.0 roughness/0 metalness, metal knobs/switches 0.8-1.0 metalness/0.1-0.3 roughness, brass 0.8/0.2), texture maps for walls/floor/rugs/album art (`TextureLoader`, `roughnessMap`, `emissiveMap` for device screens), and full shadow casting/receiving on nearly every mesh with 2048×2048 shadow maps and tuned bias per light. This scene would benefit most from IBL (finding #2) precisely because it already has the material variety to show it off; the other two scenes wouldn't gain much from PBR/IBL work since they're intentionally unlit/shader-driven.

### 11. [Minor, shared] Antialiasing and pixel-ratio settings are inconsistent, likely low-impact
Diorama: `antialias: true`. Wavefield: `antialias: false`. Credits: `antialias: false`. All three cap `devicePixelRatio` at 2. Given wavefield/credits are largely flat-shaded or full-screen shader content, lack of MSAA is a minor/low-impact inconsistency rather than a real defect, but worth noting as another place the three scenes diverge in their renderer setup without a shared config.

## Summary Table

| Aspect | Diorama | Wavefield | Credits |
|---|---|---|---|
| Lights | Ambient + Hemisphere + Spot (desk) + Directional (window), full shadow config | **None** | **None** |
| HDRI/IBL | None (gap given material quality) | N/A (unlit) | N/A (unlit) |
| Shadows | Yes, 2048² maps, tuned bias, cast+receive on most meshes | N/A | N/A |
| Materials | `MeshStandardMaterial` throughout, PBR roughness/metalness, textures for walls/floor/screens | `MeshBasicMaterial` only | `ShaderMaterial` (sky/silhouette) + `MeshBasicMaterial` |
| Tone mapping | ACESFilmic + `OutputPass` | **Missing** | **Missing** |
| Bloom | Present but strength 0 by default (liminal-mode only) | Present, strength 0.35 | Present, tuned params |
| SSAO | Present, params likely too tight for scene scale | None | None |
| Vignette | None | None | None |
| DOF | None | None | None |
| Grain | None | None | Custom luminance-weighted grain shader, user-adjustable |
| Camera | 15° FOV static/orbit, no DOF | 60° FOV, static + one lerp-zoom mode | 60° FOV, fully static |
