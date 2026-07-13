# RFC: Upcoming Visual & Interactive Features

This document outlines upcoming environmental, interactive, and rendering features to enhance the immersive 3D diorama experience in the "Warm Scenes" application.

---

## 1. Context & Objectives
To transition the current 3D diorama from a static or simple scene into a highly interactive, atmospheric space, we propose adding interactive objects, cinematic navigation, and alternate aesthetic modes ("Liminal" and "Upside Down"). 

The goals are:
- **Increase User Engagement:** Make objects in the scene interactive.
- **Improve Visual Presentation:** Add cinematic camera movements.
- **Provide Atmospheric Variety:** Offer distinct environmental themes that completely shift the mood.

---

## 2. Feature Specifications

### Feature 1: Interactive Lamp & Dynamic Lighting
**Concept:** Allow users to interact directly with the light sources in the diorama, creating immediate visual feedback and changes in atmosphere.
* **Implementation Details:**
  * **Interactivity:** Raycast detection on the lamp model. Clicking/tapping the lamp toggles its power.
  * **Visual Effects:** 
    * Smooth transitions between light states (e.g., a warm, amber point light/spotlight fading in/out, possibly with a subtle startup flicker).
    * Synchronized emissive material updates on the lamp bulb/shade.
    * Dynamic shadow updates (enabling/disabling shadows for the toggleable light source).

### Feature 2: Customizable Wall Posters
**Concept:** Add decorative posters to the walls of the diorama to convey specific themes, starting with a custom-generated theme.
* **Implementation Details:**
  * **3D Assets:** Model a thin rectangular frame mesh flat against the wall.
  * **Textures:** Load texture maps representing poster art. The default texture will be a custom Sci-Fi poster ("I Want to Believe" X-Files homage).
  * **Interactivity:** Clicking the poster could smoothly zoom the camera to frame it head-on for closer inspection.

### Feature 3: Cinematic Camera System ("Real Estate Video Style")
**Concept:** Add an automated "fly-through" camera mode that showcases the scene from professional, sweeping angles, similar to real-estate walkthroughs.
* **Implementation Details:**
  * **Path Generation:** Define a series of 3D control points and interpolate them using `THREE.CatmullRomCurve3`.
  * **Camera Controls:** Smoothly transition control from user-driven `OrbitControls` to path-following camera interpolation.
  * **Focus/Targeting:** Keep the camera look-at point focused on key assets (e.g., the center synth table or specific instruments) during the sweep.
  * **UI Integration:** A "Cinematic Mode" play/pause toggle in the interface.

### Feature 4: "Liminal Space" Mode
**Concept:** A toggleable visual mode that recreates the eerie, nostalgic, and vacant feeling of a liminal space.
* **Implementation Details:**
  * **Lighting:** Flat, slightly fluorescent or clinical lighting. Reduction of warm shadows.
  * **Materials & Colors:** Wash out vibrant textures in favor of muted, desaturated, and monochrome tones.
  * **Atmosphere:** Introduce a subtle, low-density height fog (`THREE.FogExp2`) to soften the edges of the room.
  * **Sound/Vibe:** A quiet, low-frequency hum or ambient noise track.

### Feature 5: "Upside Down" Alternate Dimension
**Concept:** A dramatic environmental override that transforms the cozy room into an eerie, decaying alternate dimension inspired by *Stranger Things*.
* **Implementation Details:**
  * **Lighting & Color Grading:** Kill all warm lights; introduce a cold, dark blue and dark gray ambient wash. Keep only a single flickering light source.
  * **Atmospheric Particles:** Implement a particle system (`THREE.Points`) to simulate floating ash, spores, or dust motes drifting through the air.
  * **Mesh Overrides:** Swap or overlay organic, vine-like structures (using procedural curves or noise-deformed tube geometries) creeping along the floor and walls.
  * **Post-Processing:** Apply a noise/grain pass, vignette, and slight chromatic aberration to emphasize the distorted, vintage horror aesthetic.

---

## 3. Technical Implementation Strategy

### Phase 1: Interactive & Decorative Features
* Implement Raycasting in the main rendering loop to detect clicks on the **Lamp** and **Poster**.
* Add the poster mesh and set up material switching/texture loading.

### Phase 2: Camera Paths & Cinematic Mode
* Build a helper class to handle camera path animations using `THREE.CatmullRomCurve3`.
* Coordinate smooth handoffs between `OrbitControls` and custom animations.

### Phase 3: Environment Themes (Liminal & Upside Down)
* Create an `EnvironmentManager` that handles transitioning uniform states, fog values, light intensities, and particle system visibility.
* Use GSAP (GreenSock) or basic lerping to transition colors, light intensities, and positions smoothly over a 2-3 second window.
